import type { DataTable } from "../model/types.ts";

/*
 * Every importer ends here: a grid of cells in, a tidy table out. Whatever the source, the merge
 * then sees the same thing — unique non-empty field names, rows exactly as wide as the header,
 * cells without stray surrounding spaces, and no rows that are nothing but blanks (the trailing
 * empty rows every spreadsheet export seems to carry).
 */

/** `Column 1`, `Column 2`, … for data without a header row. */
export function columnName(index: number): string {
    return `Column ${index + 1}`;
}

/**
 * Field names made usable: trimmed, blanks named by position, and repeats numbered — a second
 * "Phone" becomes "Phone (2)" — so every placeholder names exactly one column.
 */
export function uniqueFieldNames(names: readonly string[]): string[] {
    const used = new Set<string>();

    return names.map((raw, index) => {
        const base = raw.replace(/\s+/g, " ").trim() || columnName(index);
        let name = base;
        for (let copy = 2; used.has(name.toLowerCase()); copy++) {
            name = `${base} (${copy})`;
        }

        used.add(name.toLowerCase());
        return name;
    });
}

/**
 * Builds a table from raw rows.
 *
 * @param hasHeader whether the first non-blank row names the fields.
 */
export function tableFromRows(rows: readonly (readonly string[])[], hasHeader: boolean, source: string): DataTable {
    const content = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
    const width = content.reduce((widest, row) => Math.max(widest, row.length), 0);

    const header = hasHeader && content.length > 0 ? content[0] : [];
    const body = hasHeader ? content.slice(1) : content;
    const fields = uniqueFieldNames(Array.from({ length: width }, (_, index) => header[index] ?? ""));

    return {
        source,
        fields,
        rows: body.map((row) => fields.map((_, index) => (row[index] ?? "").trim()))
    };
}
