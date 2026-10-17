/*
 * Reading and writing lengths. The model is inches throughout (see types.ts); this is the one
 * place a length becomes text or text becomes a length.
 *
 * Label measurements are published as fractions — 2-5/8", 1-1/3", 3/16" — so the parser takes
 * them the way people type them off the box, alongside decimals and metric. Whatever unit the
 * field shows, an explicit suffix wins: typing "66.7mm" into an inch field means 66.7 mm.
 */

export type LengthUnit = "in" | "mm";

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
/** CSS pixels per inch, fixed by the CSS spec — which is why printing in px is exact. */
export const CSS_PX_PER_INCH = 96;

const GLYPH_FRACTIONS: Record<string, number> = {
    "½": 1 / 2,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "¼": 1 / 4,
    "¾": 3 / 4,
    "⅕": 1 / 5,
    "⅖": 2 / 5,
    "⅗": 3 / 5,
    "⅘": 4 / 5,
    "⅙": 1 / 6,
    "⅚": 5 / 6,
    "⅛": 1 / 8,
    "⅜": 3 / 8,
    "⅝": 5 / 8,
    "⅞": 7 / 8
};

const FRACTION_GLYPHS: Record<string, string> = {
    "1/2": "½",
    "1/3": "⅓",
    "2/3": "⅔",
    "1/4": "¼",
    "3/4": "¾",
    "1/6": "⅙",
    "5/6": "⅚",
    "1/8": "⅛",
    "3/8": "⅜",
    "5/8": "⅝",
    "7/8": "⅞"
};

/** Unit suffixes, longest first so "inches" is not read as "in" followed by junk. */
const UNIT_SUFFIXES: [RegExp, number][] = [
    [/(inches|inch|in|"|″|”)$/, 1],
    [/mm$/, 1 / MM_PER_INCH],
    [/cm$/, 10 / MM_PER_INCH],
    [/(pt|pts)$/, 1 / POINTS_PER_INCH]
];

/** Reads a plain number, allowing a decimal comma when the text has no point in it. */
function parsePlainNumber(text: string): number | null {
    const normalized = text.includes(".") ? text : text.replace(",", ".");
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) {
        return null;
    }

    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}

/** Reads `5/8`, returning null for anything else (or a zero denominator). */
function parseSimpleFraction(text: string): number | null {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
    if (!match) {
        return null;
    }

    const denominator = Number(match[2]);
    return denominator === 0 ? null : Number(match[1]) / denominator;
}

/**
 * Reads a magnitude with no sign and no unit: `2.625`, `2 5/8`, `2-5/8`, `5/8`, `2⅝`, `⅝`.
 */
function parseMagnitude(text: string): number | null {
    const glyph = Object.keys(GLYPH_FRACTIONS).find((candidate) => text.endsWith(candidate));
    if (glyph) {
        const whole = text.slice(0, -glyph.length).trim().replace(/[-\s]+$/, "");
        const wholeValue = whole === "" ? 0 : parsePlainNumber(whole);
        return wholeValue === null ? null : wholeValue + GLYPH_FRACTIONS[glyph];
    }

    const fraction = parseSimpleFraction(text);
    if (fraction !== null) {
        return fraction;
    }

    // A whole number, then a fraction, separated by a space or a hyphen: "2 5/8", "2-5/8".
    const mixed = /^(\d+)(?:\s+|\s*-\s*)(\d+\s*\/\s*\d+)$/.exec(text);
    if (mixed) {
        const part = parseSimpleFraction(mixed[2]);
        return part === null ? null : Number(mixed[1]) + part;
    }

    return parsePlainNumber(text);
}

/**
 * Parses a length typed by a person into inches, or `null` when the text is not one.
 *
 * @param defaultUnit what a bare number means — the unit the field is showing.
 */
export function parseLength(text: string, defaultUnit: LengthUnit = "in"): number | null {
    let body = text.trim().toLowerCase();
    if (body === "") {
        return null;
    }

    let factor = defaultUnit === "mm" ? 1 / MM_PER_INCH : 1;
    for (const [pattern, unitFactor] of UNIT_SUFFIXES) {
        if (pattern.test(body)) {
            body = body.replace(pattern, "").trim();
            factor = unitFactor;
            break;
        }
    }

    let sign = 1;
    if (body.startsWith("-") || body.startsWith("+")) {
        sign = body.startsWith("-") ? -1 : 1;
        body = body.slice(1).trim();
    }

    const magnitude = parseMagnitude(body);
    return magnitude === null ? null : sign * magnitude * factor;
}

/** Rounds to a fixed number of decimals and drops the trailing zeros: `2.6250` → `"2.625"`. */
export function formatDecimal(value: number, maxDecimals: number): string {
    const rounded = Number(value.toFixed(maxDecimals));
    // `Object.is(-0)` would print "-0" after rounding a tiny negative offset to zero.
    return String(rounded === 0 ? 0 : rounded);
}

/** A length in the given unit, for an input box: no unit suffix, at most 4 decimals of an inch. */
export function formatLength(inches: number, unit: LengthUnit = "in"): string {
    return unit === "mm" ? formatDecimal(inches * MM_PER_INCH, 2) : formatDecimal(inches, 4);
}

/** A length with its unit, for running text: `"0.12 in"`, `"3.05 mm"`. */
export function describeLength(inches: number, unit: LengthUnit = "in"): string {
    return unit === "mm" ? `${formatDecimal(inches * MM_PER_INCH, 1)} mm` : `${formatDecimal(inches, 3)} in`;
}

/**
 * A length as label packaging prints it: `2⅝″`, `1⅓″`, `3 7/16″`. Falls back to a decimal when
 * the value is not close to a fraction with a denominator stock is actually cut to.
 */
export function formatFriendlyInches(inches: number): string {
    const tolerance = 0.0015;
    const negative = inches < 0;
    const value = Math.abs(inches);
    let whole = Math.floor(value + tolerance);
    const remainder = value - whole;

    for (const denominator of [2, 3, 4, 6, 8, 16, 32]) {
        const numerator = Math.round(remainder * denominator);
        if (Math.abs(remainder - numerator / denominator) > tolerance) {
            continue;
        }

        let text: string;
        if (numerator === 0) {
            text = String(whole);
        } else if (numerator === denominator) {
            whole += 1;
            text = String(whole);
        } else {
            const divisor = greatestCommonDivisor(numerator, denominator);
            const fraction = `${numerator / divisor}/${denominator / divisor}`;
            const glyph = FRACTION_GLYPHS[fraction];
            text = whole === 0 ? (glyph ?? fraction) : glyph ? `${whole}${glyph}` : `${whole} ${fraction}`;
        }

        return `${negative ? "-" : ""}${text}″`;
    }

    return `${negative ? "-" : ""}${formatDecimal(value, 3)}″`;
}

function greatestCommonDivisor(a: number, b: number): number {
    return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** Rounds to the nearest multiple of `step` (no-op for a non-positive step), trimming float noise. */
export function snapTo(value: number, step: number): number {
    if (!(step > 0)) {
        return value;
    }

    return Number((Math.round(value / step) * step).toFixed(6));
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
