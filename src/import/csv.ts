/*
 * Delimited text: CSV, tab-separated, and the semicolon CSV that Excel writes in locales with a
 * decimal comma.
 *
 * The reader follows RFC 4180 — quoted fields may hold the delimiter, line breaks, and doubled
 * quotes — and is lenient where real files are not quite RFC: a quote in the middle of an unquoted
 * field is just a character, spaces before an opening quote are ignored, and any of CRLF, LF or a
 * bare CR ends a row.
 */

export interface DelimiterOption {
    value: string;
    label: string;
}

export const DELIMITERS: readonly DelimiterOption[] = [
    { value: ",", label: "Comma" },
    { value: "\t", label: "Tab" },
    { value: ";", label: "Semicolon" },
    { value: "|", label: "Pipe" }
];

/** Splits delimited text into rows of cells. */
export function parseDelimited(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let quoted = false;
    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const length = text.length;

    const endField = () => {
        row.push(field);
        field = "";
        quoted = false;
    };

    while (i < length) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }

                inQuotes = false;
            } else {
                field += c;
            }

            i += 1;
            continue;
        }

        if (c === '"' && !quoted && field.trim() === "") {
            inQuotes = true;
            quoted = true;
            field = "";
        } else if (c === delimiter) {
            endField();
        } else if (c === "\n" || c === "\r") {
            endField();
            rows.push(row);
            row = [];
            if (c === "\r" && text[i + 1] === "\n") {
                i += 1;
            }
        } else {
            field += c;
        }

        i += 1;
    }

    // The last row has no line break after it in most files; a final break leaves nothing behind.
    if (field !== "" || quoted || row.length > 0) {
        endField();
        rows.push(row);
    }

    return rows;
}

/**
 * Guesses the delimiter from the start of the text: the candidate that splits the most lines into
 * the same number of fields (more than one). Ties go to the order of {@link DELIMITERS} after tab,
 * since a tab almost never appears in a cell by accident.
 */
export function detectDelimiter(text: string): string {
    const sample = sampleLines(text, 50);
    const preference = ["\t", ",", ";", "|"];
    let best = { delimiter: ",", consistency: 0, width: 1 };

    for (const delimiter of preference) {
        const widths = parseDelimited(sample, delimiter).map((row) => row.length);
        if (widths.length === 0) {
            continue;
        }

        const counts = new Map<number, number>();
        widths.forEach((width) => counts.set(width, (counts.get(width) ?? 0) + 1));
        const [width, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
        if (width < 2) {
            continue;
        }

        const consistency = count / widths.length;
        if (consistency > best.consistency + 1e-9 || (Math.abs(consistency - best.consistency) < 1e-9 && width > best.width)) {
            best = { delimiter, consistency, width };
        }
    }

    return best.delimiter;
}

/**
 * The first `count` complete lines, cut at a line break outside quotes so a sampled quoted field
 * is never left open (which would make the sample one enormous field).
 */
function sampleLines(text: string, count: number): string {
    let lines = 0;
    let inQuotes = false;
    const limit = Math.min(text.length, 256 * 1024);

    for (let i = 0; i < limit; i++) {
        const c = text[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if (!inQuotes && c === "\n") {
            lines += 1;
            if (lines >= count) {
                return text.slice(0, i);
            }
        }
    }

    return text.slice(0, limit);
}

/** Writes rows as RFC 4180 CSV, quoting only the cells that need it. */
export function toDelimited(rows: readonly (readonly string[])[], delimiter = ","): string {
    const needsQuotes = (cell: string) =>
        cell.includes(delimiter) || /["\r\n]/.test(cell) || cell !== cell.trim();

    return rows
        .map((row) => row.map((cell) => (needsQuotes(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(delimiter))
        .join("\r\n");
}
