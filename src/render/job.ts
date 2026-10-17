import { useEffect, useMemo, useState } from "react";
import { encodeCode128 } from "../codes/code128.ts";
import { encodeQr } from "../codes/qr.ts";
import { includedRows } from "../model/dataOps.ts";
import { buildFieldIndex, mergeText, type FieldIndex, type MergeContext } from "../model/merge.ts";
import { jobQueue, paginate, type Page, type PlacedLabel, type QueueItem } from "../model/paginate.ts";
import type { DataTable, LabelDesign, PrintOptions, SheetSpec } from "../model/types.ts";
import type { AppState } from "../state/store.tsx";
import { layoutTextElement, textLines } from "./ElementVisual.tsx";
import { useFontsVersion } from "./fonts.ts";

/*
 * A print job, worked out from the state: the queue of labels, the pages they fall on, and the
 * record each label merges. Shared by the preview, the print root and the job summary, so all
 * three agree about what will come out of the printer.
 */

export interface Job {
    rows: number[] | null;
    queue: QueueItem[];
    pages: Page[];
    fields: FieldIndex;
    contextFor(label: PlacedLabel): MergeContext;
}

const NO_RECORD: readonly string[] = [];
const NO_FIELDS = buildFieldIndex([]);

export function contextForItem(data: DataTable | null, fields: FieldIndex, item: QueueItem, sequence: number): MergeContext {
    if (item === null || !data) {
        // A job without data merges an empty record: fields print as nothing, and {{#}} counts
        // the labels, which is how a sheet of numbered tickets is made.
        return { record: NO_RECORD, fields: NO_FIELDS, rowNumber: sequence + 1 };
    }

    return { record: data.rows[item] ?? NO_RECORD, fields, rowNumber: item + 1 };
}

export function buildJob(sheet: SheetSpec, data: DataTable | null, excluded: ReadonlySet<number>, print: PrintOptions): Job {
    const rows = data ? includedRows(data, excluded) : null;
    const queue = jobQueue(sheet, rows, print);
    const pages = paginate(sheet, queue, print.usedSlots);
    const fields = buildFieldIndex(data?.fields ?? []);
    return {
        rows,
        queue,
        pages,
        fields,
        contextFor: (label) => contextForItem(data, fields, label.item, label.sequence)
    };
}

export function useJob(state: AppState): Job {
    const { template, data, excluded, print } = state;
    return useMemo(() => buildJob(template.sheet, data, excluded, print), [template.sheet, data, excluded, print]);
}

export interface JobProblems {
    /** Rows whose text does not fit at the smallest allowed size, by row index. */
    overflowRows: number[];
    /** Rows whose QR code or barcode value cannot be encoded. */
    codeRows: number[];
    /** Whether the scan stopped early on a very long list. */
    truncated: boolean;
}

const SCAN_LIMIT = 5000;

/**
 * Finds the records that will not print properly: text too big for its box even after shrinking,
 * and codes that cannot hold their value. Run over every included record — not just the one on
 * screen — so the warning names labels nobody has looked at yet.
 */
export function scanProblems(design: LabelDesign, data: DataTable | null, rows: readonly number[] | null): JobProblems {
    const overflowRows: number[] = [];
    const codeRows: number[] = [];
    const visible = design.elements.filter((element) => !element.hidden);
    const fields = buildFieldIndex(data?.fields ?? []);
    const candidates = rows ?? [null];
    const scanned = candidates.slice(0, SCAN_LIMIT);
    const encodable = new Map<string, boolean>();

    const canEncode = (kind: string, value: string, encode: () => void) => {
        const key = `${kind}\u0000${value}`;
        let ok = encodable.get(key);
        if (ok === undefined) {
            try {
                encode();
                ok = true;
            } catch {
                ok = false;
            }

            encodable.set(key, ok);
        }

        return ok;
    };

    scanned.forEach((row, index) => {
        const context = contextForItem(data, fields, row, index);
        let overflow = false;
        let badCode = false;

        for (const element of visible) {
            if (element.type === "text" && !overflow) {
                overflow = layoutTextElement(element, textLines(element, context)).overflow;
            } else if (element.type === "qr" && !badCode) {
                const value = mergeText(element.template, context);
                badCode = value !== "" && !canEncode(`qr${element.errorLevel}`, value, () => encodeQr(value, element.errorLevel));
            } else if (element.type === "barcode" && !badCode) {
                const value = mergeText(element.template, context).replace(/\n/g, " ");
                badCode = value !== "" && !canEncode("code128", value, () => encodeCode128(value));
            }
        }

        if (row !== null && overflow) {
            overflowRows.push(row);
        }

        if (row !== null && badCode) {
            codeRows.push(row);
        }

        // Without data there is one label design and so one answer, recorded against row -1.
        if (row === null && overflow) {
            overflowRows.push(-1);
        }

        if (row === null && badCode) {
            codeRows.push(-1);
        }
    });

    return { overflowRows, codeRows, truncated: candidates.length > SCAN_LIMIT };
}

const NO_PROBLEMS: JobProblems = { overflowRows: [], codeRows: [], truncated: false };

/**
 * {@link scanProblems}, run a moment after the design or data stops changing. A drag or a resize
 * edits the design every frame, and laying out every record's text on each of those frames would
 * make the canvas stutter on a long list; the answer only matters once the edit settles. A font
 * finishing loading changes the measurements, so it re-runs the scan too.
 */
export function useProblemScan(design: LabelDesign, data: DataTable | null, rows: readonly number[] | null): JobProblems {
    const fontsVersion = useFontsVersion();
    const [problems, setProblems] = useState<JobProblems>(NO_PROBLEMS);

    useEffect(() => {
        const timer = setTimeout(() => setProblems(scanProblems(design, data, rows)), 250);
        return () => clearTimeout(timer);
    }, [design, data, rows, fontsVersion]);

    return problems;
}
