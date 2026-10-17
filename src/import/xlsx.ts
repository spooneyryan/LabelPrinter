import { builtInFormat, formatGeneral, formatNumber } from "./numberFormat.ts";
import { attribute, descend, elements, parseXml, textOf, type XmlElement } from "./xml.ts";
import { ZipArchive } from "./zip.ts";

/*
 * Excel workbooks (.xlsx — Office Open XML; the old binary .xls is not supported).
 *
 * A workbook is a ZIP of XML parts found through relationship files: the package points at the
 * workbook, the workbook lists its sheets and points at the shared-string table and the styles.
 * Every cell is read as Excel would display it — strings from the shared table, numbers through
 * their number format (see numberFormat.ts for why that matters on a label), booleans as
 * TRUE/FALSE, and formulas as their cached results.
 */

export interface WorkbookSheet {
    name: string;
    rows: string[][];
}

/** Rows and columns beyond these are not read: no mailing list is that big, a runaway range is. */
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 500;

function relationships(xml: string | null, base: string): Map<string, { type: string; target: string }> {
    const map = new Map<string, { type: string; target: string }>();
    if (!xml) {
        return map;
    }

    for (const relationship of elements(parseXml(xml), "Relationship")) {
        const id = attribute(relationship, "Id");
        const target = attribute(relationship, "Target");
        if (id && target && attribute(relationship, "TargetMode") !== "External") {
            map.set(id, { type: attribute(relationship, "Type") ?? "", target: resolvePath(base, target) });
        }
    }

    return map;
}

/** Resolves a relationship target against the folder of the part that declared it. */
function resolvePath(base: string, target: string): string {
    if (target.startsWith("/")) {
        return target.slice(1);
    }

    const segments = base.split("/").filter(Boolean);
    for (const segment of target.split("/")) {
        if (segment === "..") {
            segments.pop();
        } else if (segment !== ".") {
            segments.push(segment);
        }
    }

    return segments.join("/");
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
const relsPathOf = (path: string) => `${folderOf(path)}_rels/${path.slice(path.lastIndexOf("/") + 1)}.rels`;

/** `A1` → column 0, `AB12` → column 27. */
export function columnIndex(reference: string): number {
    let index = 0;
    for (const c of reference.toUpperCase()) {
        if (c < "A" || c > "Z") {
            break;
        }

        index = index * 26 + (c.charCodeAt(0) - 64);
    }

    return index - 1;
}

/** The text of a shared or inline string: its runs, without phonetic guides. */
function stringItemText(item: XmlElement): string {
    return item.children
        .map((child) => {
            if (typeof child === "string") {
                return "";
            }

            if (child.local === "t") {
                return textOf(child);
            }

            if (child.local === "r") {
                const run = descend(child, "t");
                return run ? textOf(run) : "";
            }

            return "";
        })
        .join("");
}

interface Styles {
    /** The format code for each cell style index. */
    formats: (string | null)[];
}

function readStyles(xml: string | null): Styles {
    if (!xml) {
        return { formats: [] };
    }

    const root = parseXml(xml);
    const custom = new Map<number, string>();
    const numFmts = descend(root, "numFmts");
    for (const numFmt of numFmts ? elements(numFmts, "numFmt") : []) {
        custom.set(Number(attribute(numFmt, "numFmtId")), attribute(numFmt, "formatCode") ?? "General");
    }

    const cellXfs = descend(root, "cellXfs");
    const formats = (cellXfs ? elements(cellXfs, "xf") : []).map((xf) => {
        const id = Number(attribute(xf, "numFmtId") ?? 0);
        return custom.get(id) ?? builtInFormat(id);
    });

    return { formats };
}

function cellText(cell: XmlElement, sharedStrings: string[], styles: Styles, date1904: boolean): string {
    const type = attribute(cell, "t") ?? "n";
    const valueElement = descend(cell, "v");
    const raw = valueElement ? textOf(valueElement) : "";

    switch (type) {
        case "s":
            return sharedStrings[Number(raw)] ?? "";
        case "inlineStr": {
            const inline = descend(cell, "is");
            return inline ? stringItemText(inline) : "";
        }
        case "str":
        case "e":
            return raw;
        case "b":
            return raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
        case "d":
            // ISO 8601 date cells (rare; Excel itself writes day counts).
            return raw.replace(/T00:00:00(\.000)?Z?$/, "");
        default: {
            if (raw.trim() === "") {
                return "";
            }

            const value = Number(raw);
            if (!Number.isFinite(value)) {
                return raw;
            }

            const styleIndex = Number(attribute(cell, "s") ?? 0);
            const format = styles.formats[styleIndex] ?? null;
            return format === null ? formatGeneral(value) : formatNumber(value, format, date1904);
        }
    }
}

function readWorksheet(xml: string, sharedStrings: string[], styles: Styles, date1904: boolean): string[][] {
    const sheetData = descend(parseXml(xml), "sheetData");
    if (!sheetData) {
        return [];
    }

    const rows: string[][] = [];
    let nextRow = 0;

    for (const row of elements(sheetData, "row")) {
        const declared = Number(attribute(row, "r"));
        const rowIndex = Number.isInteger(declared) && declared > 0 ? declared - 1 : nextRow;
        nextRow = rowIndex + 1;
        if (rowIndex >= MAX_ROWS) {
            break;
        }

        const cells: string[] = [];
        let nextColumn = 0;
        for (const cell of elements(row, "c")) {
            const reference = attribute(cell, "r");
            const column = reference ? columnIndex(reference) : nextColumn;
            nextColumn = column + 1;
            if (column < 0 || column >= MAX_COLUMNS) {
                continue;
            }

            const text = cellText(cell, sharedStrings, styles, date1904);
            while (cells.length < column) {
                cells.push("");
            }

            cells[column] = text;
        }

        // Rows may be skipped (an empty row has no element); keep them as empty rows so the
        // table's row numbers match the spreadsheet's while the importer drops the blanks.
        while (rows.length < rowIndex) {
            rows.push([]);
        }

        rows[rowIndex] = cells;
    }

    return rows;
}

/** Reads every worksheet of an .xlsx file. Chart sheets and dialog sheets are skipped. */
export async function readXlsx(bytes: Uint8Array): Promise<WorkbookSheet[]> {
    const zip = ZipArchive.open(bytes);

    const packageRels = relationships(await zip.readText("_rels/.rels"), "");
    const workbookPath =
        [...packageRels.values()].find((rel) => rel.type.endsWith("/officeDocument"))?.target ?? "xl/workbook.xml";

    const workbookXml = await zip.readText(workbookPath);
    if (!workbookXml) {
        throw new Error("This file has no workbook in it. Is it an Excel .xlsx file?");
    }

    const workbook = parseXml(workbookXml);
    const date1904 = ["1", "true"].includes(attribute(descend(workbook, "workbookPr") ?? workbook, "date1904") ?? "");
    const workbookRels = relationships(await zip.readText(relsPathOf(workbookPath)), folderOf(workbookPath));

    const partOfType = (suffix: string) => [...workbookRels.values()].find((rel) => rel.type.endsWith(suffix))?.target;

    const sharedStringsPath = partOfType("/sharedStrings");
    const sharedStringsXml = sharedStringsPath ? await zip.readText(sharedStringsPath) : null;
    const sharedStrings = sharedStringsXml ? elements(parseXml(sharedStringsXml), "si").map(stringItemText) : [];

    const stylesPath = partOfType("/styles");
    const styles = readStyles(stylesPath ? await zip.readText(stylesPath) : null);

    const sheetsElement = descend(workbook, "sheets");
    const sheets: WorkbookSheet[] = [];

    for (const sheet of sheetsElement ? elements(sheetsElement, "sheet") : []) {
        const relationship = workbookRels.get(attribute(sheet, "id") ?? "");
        if (!relationship || !relationship.type.endsWith("/worksheet")) {
            continue;
        }

        const xml = await zip.readText(relationship.target);
        if (xml) {
            sheets.push({
                name: attribute(sheet, "name") ?? `Sheet ${sheets.length + 1}`,
                rows: readWorksheet(xml, sharedStrings, styles, date1904)
            });
        }
    }

    if (sheets.length === 0) {
        throw new Error("This workbook has no worksheets with cells in them.");
    }

    return sheets;
}
