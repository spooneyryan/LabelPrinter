/*
 * Spreadsheet number formats, applied to cell values as Excel would display them.
 *
 * An .xlsx stores numbers as numbers and leaves their look to a format code, and for labels the
 * look is the data: a ZIP code of 02134 is stored as 2134 with the format `00000`, a ZIP+4 as
 * 21340000 with `00000-0000`, a phone number as 5551234567 with `(###) ###-####`, a date as a day
 * count with `m/d/yyyy`. Reading the raw values would print "2134" on a Boston envelope.
 *
 * This covers what such columns use — digit placeholders with literals between them, decimals,
 * thousands separators, percentages, scientific notation, dates and times, and conditional
 * sections — rather than the whole format language. Anything it cannot place falls back to the
 * General format, which is never wrong, only plainer.
 */

const BUILT_IN_FORMATS: Record<number, string> = {
    0: "General",
    1: "0",
    2: "0.00",
    3: "#,##0",
    4: "#,##0.00",
    9: "0%",
    10: "0.00%",
    11: "0.00E+00",
    12: "General",
    13: "General",
    14: "m/d/yyyy",
    15: "d-mmm-yy",
    16: "d-mmm",
    17: "mmm-yy",
    18: "h:mm AM/PM",
    19: "h:mm:ss AM/PM",
    20: "h:mm",
    21: "h:mm:ss",
    22: "m/d/yyyy h:mm",
    37: "#,##0 ;(#,##0)",
    38: "#,##0 ;(#,##0)",
    39: "#,##0.00;(#,##0.00)",
    40: "#,##0.00;(#,##0.00)",
    45: "mm:ss",
    46: "[h]:mm:ss",
    47: "mm:ss.0",
    48: "##0.0E+0",
    49: "@"
};

/** The format code for a built-in format id, or `null` for an id Excel leaves to the locale. */
export function builtInFormat(id: number): string | null {
    return BUILT_IN_FORMATS[id] ?? null;
}

/** Excel's General format: the number as it is, without float noise or an exponent for ordinary integers. */
export function formatGeneral(value: number): string {
    if (Number.isInteger(value) && Math.abs(value) < 1e15) {
        return String(value);
    }

    return String(Number(value.toPrecision(15)));
}

/** A format code broken into sections, with literal text kept apart from placeholders. */
interface Part {
    literal: boolean;
    text: string;
}

/** Splits on `;` outside quotes and brackets. */
function splitSections(code: string): string[] {
    const sections: string[] = [];
    let current = "";
    let inQuote = false;
    let inBracket = false;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        if (c === "\\" && !inQuote) {
            current += c + (code[i + 1] ?? "");
            i += 1;
            continue;
        }

        if (c === '"') {
            inQuote = !inQuote;
        } else if (c === "[" && !inQuote) {
            inBracket = true;
        } else if (c === "]" && !inQuote) {
            inBracket = false;
        } else if (c === ";" && !inQuote && !inBracket) {
            sections.push(current);
            current = "";
            continue;
        }

        current += c;
    }

    sections.push(current);
    return sections;
}

const CONDITION = /^\[(<=|>=|<>|<|>|=)(-?\d+(?:\.\d+)?)\]/;

function testCondition(operator: string, limit: number, value: number): boolean {
    switch (operator) {
        case "<":
            return value < limit;
        case "<=":
            return value <= limit;
        case ">":
            return value > limit;
        case ">=":
            return value >= limit;
        case "=":
            return value === limit;
        default:
            return value !== limit;
    }
}

/**
 * Reads a section into parts: quoted text, escaped characters and currency tags become literals;
 * colours, conditions, padding (`_x`) and fill (`*x`) are dropped.
 */
function tokenizeSection(section: string): Part[] {
    const parts: Part[] = [];
    const push = (literal: boolean, text: string) => {
        const last = parts[parts.length - 1];
        if (last && last.literal === literal) {
            last.text += text;
        } else {
            parts.push({ literal, text });
        }
    };

    for (let i = 0; i < section.length; i++) {
        const c = section[i];
        const ahead = section.slice(i, i + 5).toLowerCase();
        if (ahead === "am/pm" || ahead.startsWith("a/p")) {
            // One token, or the slash between AM and PM would read as a literal and split it.
            const length = ahead === "am/pm" ? 5 : 3;
            push(false, section.slice(i, i + length));
            i += length - 1;
        } else if (c === '"') {
            const close = section.indexOf('"', i + 1);
            const end = close === -1 ? section.length : close;
            push(true, section.slice(i + 1, end));
            i = end;
        } else if (c === "\\") {
            push(true, section[i + 1] ?? "");
            i += 1;
        } else if (c === "_") {
            push(true, " ");
            i += 1;
        } else if (c === "*") {
            i += 1;
        } else if (c === "[") {
            const close = section.indexOf("]", i);
            const end = close === -1 ? section.length : close;
            const tag = section.slice(i + 1, end);
            // `[$€-407]` is a currency symbol with a locale; `[h]` is an elapsed-hours token.
            if (tag.startsWith("$")) {
                push(true, tag.slice(1).split("-")[0]);
            } else if (/^(h+|m+|s+)$/i.test(tag)) {
                push(false, `[${tag}]`);
            }

            i = end;
        } else if (/[$\-+/():!^&'~{}<>=\s,]/.test(c) && !/[0#?.,%E]/.test(c)) {
            push(true, c);
        } else {
            push(false, c);
        }
    }

    return parts;
}

const isDateCode = (parts: Part[]) =>
    parts.some((part) => !part.literal && /[ydhms]|am\/pm|a\/p/i.test(part.text.replace(/E[+-]/gi, "")));

/** Applies a format code to a number. */
export function formatNumber(value: number, code: string | null, date1904 = false): string {
    if (code === null || code === "" || /^general$/i.test(code.trim()) || code.trim() === "@") {
        return formatGeneral(value);
    }

    const sections = splitSections(code);
    let section = sections[0];
    let magnitude = value;
    let signHandled = false;

    const condition = CONDITION.exec(sections[0]);
    if (condition) {
        // Conditional sections (`[<=9999999]###-####;(###) ###-####`) pick by test, not by sign.
        const matched = testCondition(condition[1], Number(condition[2]), value);
        section = matched ? sections[0].replace(CONDITION, "") : (sections[1] ?? sections[0]).replace(CONDITION, "");
    } else if (value < 0 && sections.length >= 2 && sections[1].trim() !== "") {
        section = sections[1];
        magnitude = Math.abs(value);
        signHandled = true;
    } else if (value === 0 && sections.length >= 3 && sections[2].trim() !== "") {
        section = sections[2];
    }

    const parts = tokenizeSection(section);
    try {
        if (isDateCode(parts)) {
            return formatDate(magnitude, parts, date1904);
        }

        const text = formatDigits(signHandled ? magnitude : Math.abs(magnitude), parts);
        return magnitude < 0 && !signHandled ? `-${text}` : text;
    } catch {
        return formatGeneral(value);
    }
}

function formatDigits(value: number, parts: Part[]): string {
    const pattern = parts.map((part) => (part.literal ? "" : part.text)).join("");
    if (!/[0#?]/.test(pattern)) {
        // Only literals: a format that shows fixed text.
        return parts.map((part) => part.text).join("");
    }

    const percent = (pattern.match(/%/g) ?? []).length;
    const scaled = value * 100 ** percent;

    if (/E[+-]/i.test(pattern)) {
        const mantissa = pattern.split(/E[+-]/i)[0];
        const decimals = (mantissa.split(".")[1] ?? "").replace(/[^0#?]/g, "").length;
        const [digits, exponent] = scaled.toExponential(decimals).split("e");
        const sign = exponent.startsWith("-") ? "-" : "+";
        return `${digits}E${sign}${exponent.replace(/^[+-]/, "").padStart(2, "0")}`;
    }

    // Placeholders before and after the decimal point, read across literal parts.
    const dot = pattern.indexOf(".");
    const fractionPattern = dot === -1 ? "" : pattern.slice(dot + 1).replace(/[^0#?]/g, "");
    const decimals = fractionPattern.length;
    const minDecimals = (fractionPattern.match(/0/g) ?? []).length;
    const grouped = /[0#?],[0#?]/.test(dot === -1 ? pattern : pattern.slice(0, dot));

    const [whole, fraction = ""] = scaled.toFixed(decimals).split(".");
    let fractionText = fraction;
    while (fractionText.length > minDecimals && fractionText.endsWith("0")) {
        fractionText = fractionText.slice(0, -1);
    }

    if (grouped) {
        const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        // Grouped formats are `#,##0` with literals around them: keep the literals, set the number.
        const leading = parts.findIndex((part) => !part.literal);
        const before = parts.slice(0, leading).map((part) => part.text).join("");
        const after = parts
            .slice(leading + 1)
            .filter((part) => part.literal)
            .map((part) => part.text)
            .join("");
        return `${before}${groupedWhole}${fractionText ? `.${fractionText}` : ""}${"%".repeat(percent)}${after}`;
    }

    return placeDigits(parts, whole === "0" ? "" : whole, fractionText);
}

/**
 * Pours digits into placeholders, right to left through the integer part and left to right
 * through the fraction, keeping every literal where the format put it. Digits beyond the
 * placeholders go in front of the first one, as Excel does.
 */
function placeDigits(parts: Part[], wholeDigits: string, fractionDigits: string): string {
    const slots: { kind: "literal" | "int" | "frac" | "dot"; text: string }[] = [];
    let seenDot = false;

    for (const part of parts) {
        if (part.literal) {
            slots.push({ kind: "literal", text: part.text });
            continue;
        }

        for (const c of part.text) {
            if (c === ".") {
                seenDot = true;
                slots.push({ kind: "dot", text: "." });
            } else if (/[0#?]/.test(c)) {
                slots.push({ kind: seenDot ? "frac" : "int", text: c });
            } else if (c === "%") {
                slots.push({ kind: "literal", text: "%" });
            } else if (c !== ",") {
                slots.push({ kind: "literal", text: c });
            }
        }
    }

    const intSlots = slots.filter((slot) => slot.kind === "int");
    const output = slots.map((slot) => (slot.kind === "literal" ? slot.text : ""));

    let digitIndex = wholeDigits.length - 1;
    for (let s = slots.length - 1; s >= 0; s--) {
        const slot = slots[s];
        if (slot.kind !== "int") {
            continue;
        }

        const isFirst = slot === intSlots[0];
        if (digitIndex >= 0) {
            output[s] = isFirst ? wholeDigits.slice(0, digitIndex + 1) : wholeDigits[digitIndex];
            digitIndex = isFirst ? -1 : digitIndex - 1;
        } else {
            output[s] = slot.text === "0" ? "0" : slot.text === "?" ? " " : "";
        }
    }

    let fractionIndex = 0;
    slots.forEach((slot, s) => {
        if (slot.kind === "frac") {
            output[s] = fractionDigits[fractionIndex] ?? (slot.text === "0" ? "0" : slot.text === "?" ? " " : "");
            fractionIndex += 1;
        } else if (slot.kind === "dot") {
            output[s] = fractionDigits === "" && !slots.some((other) => other.kind === "frac" && other.text === "0") ? "" : ".";
        }
    });

    return output.join("");
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────────

/** A spreadsheet day count as a UTC date: day 0 is 1899-12-30, which absorbs Lotus's leap-year bug. */
export function serialToDate(serial: number, date1904 = false): Date {
    const days = serial + (date1904 ? 1462 : 0);
    return new Date(Math.round((days - 25569) * 86_400_000));
}

const monthName = (date: Date, style: "long" | "short") =>
    new Intl.DateTimeFormat(undefined, { month: style, timeZone: "UTC" }).format(date);
const weekdayName = (date: Date, style: "long" | "short") =>
    new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: "UTC" }).format(date);

function formatDate(serial: number, parts: Part[], date1904: boolean): string {
    const date = serialToDate(serial, date1904);
    const code = parts.map((part) => (part.literal ? "\u0000" + part.text + "\u0000" : part.text)).join("");
    const twelveHour = /am\/pm|a\/p/i.test(code);
    const tokens = code.match(/\u0000[^\u0000]*\u0000|\[h+\]|\[m+\]|\[s+\]|y+|m+|d+|h+|s+|am\/pm|a\/p|\.0+|./gi) ?? [];

    const pad = (n: number, width: number) => String(n).padStart(width, "0");
    const hours = date.getUTCHours();
    const output: string[] = [];

    tokens.forEach((token, index) => {
        const lower = token.toLowerCase();
        if (token.startsWith("\u0000")) {
            output.push(token.slice(1, -1));
        } else if (lower.startsWith("[h")) {
            output.push(String(Math.floor(serial * 24)));
        } else if (lower.startsWith("[m")) {
            output.push(String(Math.floor(serial * 1440)));
        } else if (lower.startsWith("[s")) {
            output.push(String(Math.floor(serial * 86400)));
        } else if (lower[0] === "y") {
            output.push(lower.length <= 2 ? pad(date.getUTCFullYear() % 100, 2) : String(date.getUTCFullYear()));
        } else if (lower[0] === "m" && lower !== "am/pm") {
            // `m` is minutes right after hours or right before seconds, and months otherwise.
            const previous = tokens.slice(0, index).reverse().find((t) => /^[a-z[]/i.test(t) && !t.startsWith("\u0000"));
            const next = tokens.slice(index + 1).find((t) => /^[a-z[]/i.test(t) && !t.startsWith("\u0000"));
            const isMinutes = /^(h|\[h)/i.test(previous ?? "") || /^(s|\[s)/i.test(next ?? "");
            if (isMinutes) {
                output.push(lower.length >= 2 ? pad(date.getUTCMinutes(), 2) : String(date.getUTCMinutes()));
            } else if (lower.length >= 5) {
                output.push(monthName(date, "long").slice(0, 1));
            } else if (lower.length === 4) {
                output.push(monthName(date, "long"));
            } else if (lower.length === 3) {
                output.push(monthName(date, "short"));
            } else {
                output.push(lower.length === 2 ? pad(date.getUTCMonth() + 1, 2) : String(date.getUTCMonth() + 1));
            }
        } else if (lower[0] === "d") {
            if (lower.length >= 4) {
                output.push(weekdayName(date, "long"));
            } else if (lower.length === 3) {
                output.push(weekdayName(date, "short"));
            } else {
                output.push(lower.length === 2 ? pad(date.getUTCDate(), 2) : String(date.getUTCDate()));
            }
        } else if (lower[0] === "h") {
            const shown = twelveHour ? hours % 12 || 12 : hours;
            output.push(lower.length >= 2 ? pad(shown, 2) : String(shown));
        } else if (lower[0] === "s") {
            output.push(lower.length >= 2 ? pad(date.getUTCSeconds(), 2) : String(date.getUTCSeconds()));
        } else if (lower === "am/pm") {
            output.push(hours < 12 ? "AM" : "PM");
        } else if (lower === "a/p") {
            output.push(hours < 12 ? "A" : "P");
        } else if (lower.startsWith(".0")) {
            const fraction = (date.getUTCMilliseconds() / 1000).toFixed(lower.length - 1).slice(1);
            output.push(fraction);
        } else {
            output.push(token);
        }
    });

    return output.join("");
}
