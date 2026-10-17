import type { DataTable } from "../model/types.ts";
import { DELIMITERS, detectDelimiter, parseDelimited } from "./csv.ts";
import { decodeText, ENCODING_OPTIONS, type TextEncodingChoice } from "./decode.ts";
import { tableFromJson } from "./json.ts";
import { tableFromRows } from "./table.ts";
import { tableFromVCards } from "./vcard.ts";
import { readXlsx, type WorkbookSheet } from "./xlsx.ts";

/*
 * Every way data arrives, behind one shape. An import is kept as its *source* — the bytes, or the
 * parsed workbook — and the table is derived from it, so changing the delimiter, the encoding,
 * the sheet, or whether the first row is a header re-reads the original instead of guessing
 * backwards from a table already built the wrong way.
 */

export interface DelimitedSource {
    format: "delimited";
    name: string;
    bytes: Uint8Array;
    encoding: TextEncodingChoice;
    /** A character, or "auto" to detect it. */
    delimiter: string;
    hasHeader: boolean;
}

export interface WorkbookSource {
    format: "xlsx";
    name: string;
    sheets: WorkbookSheet[];
    sheetIndex: number;
    hasHeader: boolean;
}

export interface TextSource {
    format: "json" | "vcard";
    name: string;
    text: string;
}

export type ImportSource = DelimitedSource | WorkbookSource | TextSource;

export interface ImportResult {
    table: DataTable;
    /** How the source was read, for the import panel: "Comma-separated · UTF-8". */
    details: string;
}

const extension = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

const startsWithBytes = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** What the file picker should offer. */
export const ACCEPTED_FILES = ".csv,.tsv,.tab,.txt,.xlsx,.xlsm,.json,.vcf,.vcard,text/csv,text/plain,application/json,text/vcard";

/** Identifies a file's format, by extension and then by content, and reads it into a source. */
export async function readSource(name: string, bytes: Uint8Array): Promise<ImportSource> {
    const type = extension(name);

    if (type === "xls") {
        throw new Error("This is the old binary Excel format (.xls). Open it in Excel and save it as .xlsx or .csv.");
    }

    if (["numbers", "ods", "pages", "docx", "pdf"].includes(type)) {
        throw new Error(`.${type} files can't be read. Export the data as CSV or .xlsx and open that instead.`);
    }

    const isZip = startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
    if (type === "xlsx" || type === "xlsm" || isZip) {
        return { format: "xlsx", name, sheets: await readXlsx(bytes), sheetIndex: 0, hasHeader: true };
    }

    const { text } = decodeText(bytes);
    const head = text.trimStart().slice(0, 64);

    if (type === "vcf" || type === "vcard" || /^BEGIN:VCARD/i.test(head)) {
        return { format: "vcard", name, text };
    }

    if (type === "json" || (!["csv", "tsv", "tab"].includes(type) && /^[[{]/.test(head))) {
        return { format: "json", name, text };
    }

    const source: DelimitedSource = { format: "delimited", name, bytes, encoding: "auto", delimiter: "auto", hasHeader: true };
    const rows = parseDelimited(text, detectDelimiter(text)).slice(0, 2);
    return { ...source, hasHeader: guessHeader(rows) };
}

/** A source for text pasted straight in, which is tab-separated when it was copied from a spreadsheet. */
export function pastedSource(text: string): DelimitedSource {
    const bytes = new TextEncoder().encode(text);
    const rows = parseDelimited(text, detectDelimiter(text)).slice(0, 2);
    return { format: "delimited", name: "Pasted data", bytes, encoding: "utf-8", delimiter: "auto", hasHeader: guessHeader(rows) };
}

/**
 * Whether the first row looks like field names rather than a record: every cell filled, none of
 * them a number, and no two the same. A headerless list usually trips the "number" test on its
 * ZIP codes or house numbers; the switch in the import panel settles the cases this misses.
 */
export function guessHeader(rows: readonly (readonly string[])[]): boolean {
    const first = rows[0];
    if (!first || first.length === 0) {
        return true;
    }

    const cells = first.map((cell) => cell.trim());
    const allNamed = cells.every((cell) => cell !== "" && !/^[-+$]?[\d.,\s()%-]+$/.test(cell));
    return allNamed && new Set(cells.map((cell) => cell.toLowerCase())).size === cells.length;
}

const delimiterLabel = (delimiter: string) =>
    ({ ",": "Comma-separated", "\t": "Tab-separated", ";": "Semicolon-separated", "|": "Pipe-separated" })[delimiter] ??
    `Separated by “${delimiter}”`;

/** Builds the table a source describes. */
export function sourceTable(source: ImportSource): ImportResult {
    switch (source.format) {
        case "delimited": {
            const { text, encoding } = decodeText(source.bytes, source.encoding);
            const delimiter = source.delimiter === "auto" ? detectDelimiter(text) : source.delimiter;
            const encodingLabel = ENCODING_OPTIONS.find((option) => option.value === encoding)?.label ?? encoding;
            return {
                table: tableFromRows(parseDelimited(text, delimiter), source.hasHeader, source.name),
                details: `${delimiterLabel(delimiter)} · ${encodingLabel}`
            };
        }
        case "xlsx": {
            const sheet = source.sheets[Math.min(source.sheetIndex, source.sheets.length - 1)];
            const name = source.sheets.length > 1 ? `${source.name} (${sheet.name})` : source.name;
            return {
                table: tableFromRows(sheet.rows, source.hasHeader, name),
                details: `Excel workbook · sheet “${sheet.name}”`
            };
        }
        case "json":
            return { table: tableFromJson(source.text, source.name), details: "JSON" };
        case "vcard": {
            const table = tableFromVCards(source.text, source.name);
            return { table, details: `vCard · ${table.rows.length} contact${table.rows.length === 1 ? "" : "s"}` };
        }
    }
}

/** The delimiter choices for the import panel, with automatic detection first. */
export const DELIMITER_CHOICES = [{ value: "auto", label: "Detect automatically" }, ...DELIMITERS];
