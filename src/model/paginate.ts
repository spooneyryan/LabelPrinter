import { labelsPerSheet } from "./sheet.ts";
import type { PrintOptions, SheetSpec } from "./types.ts";

/*
 * Turning a job into pages: which record goes on which label of which sheet.
 *
 * The queue is the records in order with their copies expanded. Pages then take labels from the
 * queue in fill order, skipping the first sheet's used positions, until the queue runs out. A job
 * with no data prints whole sheets of the same label, so its queue is just "the label" as many
 * times as those sheets hold.
 */

/** One label to print: the row it is merged from, or `null` for a job with no data. */
export type QueueItem = number | null;

/** One label position filled on a page. */
export interface PlacedLabel {
    /** The position on the sheet, in fill order. */
    slot: number;
    item: QueueItem;
    /** The label's place in the whole job, 0-based. */
    sequence: number;
}

export interface Page {
    labels: PlacedLabel[];
}

/**
 * The labels of a job in print order.
 *
 * @param rows the row indexes being merged, in order — the data minus the excluded rows.
 */
export function buildQueue(rows: readonly number[] | null, options: Pick<PrintOptions, "copies" | "collate">): QueueItem[] {
    const copies = Math.max(1, Math.floor(options.copies));
    const items: readonly QueueItem[] = rows ?? [null];
    const queue: QueueItem[] = [];

    if (options.collate) {
        for (let copy = 0; copy < copies; copy++) {
            queue.push(...items);
        }
    } else {
        for (const item of items) {
            for (let copy = 0; copy < copies; copy++) {
                queue.push(item);
            }
        }
    }

    return queue;
}

/** The positions of the first sheet that are free, in fill order. */
export function freeSlots(sheet: SheetSpec, usedSlots: readonly number[]): number[] {
    const used = new Set(usedSlots);
    const slots: number[] = [];
    for (let slot = 0; slot < labelsPerSheet(sheet); slot++) {
        if (!used.has(slot)) {
            slots.push(slot);
        }
    }

    return slots;
}

/**
 * Lays a queue out over pages.
 *
 * Only the first sheet has used positions; every later sheet is fresh. A first sheet with every
 * position used is a sheet that prints nothing, so it is skipped rather than fed through blank.
 */
export function paginate(sheet: SheetSpec, queue: readonly QueueItem[], usedSlots: readonly number[]): Page[] {
    const perSheet = labelsPerSheet(sheet);
    if (perSheet === 0 || queue.length === 0) {
        return [];
    }

    const firstPageSlots = freeSlots(sheet, usedSlots);
    const allSlots = freeSlots(sheet, []);
    const pages: Page[] = [];
    let sequence = 0;
    let pageIndex = 0;

    while (sequence < queue.length) {
        const slots = pageIndex === 0 ? firstPageSlots : allSlots;
        pageIndex += 1;
        if (slots.length === 0) {
            continue;
        }

        const labels: PlacedLabel[] = [];
        for (const slot of slots) {
            if (sequence >= queue.length) {
                break;
            }

            labels.push({ slot, item: queue[sequence], sequence });
            sequence += 1;
        }

        pages.push({ labels });
    }

    return pages;
}

/** The queue for a job: the included rows with copies, or whole sheets of one label without data. */
export function jobQueue(
    sheet: SheetSpec,
    includedRows: readonly number[] | null,
    options: Pick<PrintOptions, "copies" | "collate" | "usedSlots" | "sheetsWithoutData">
): QueueItem[] {
    if (includedRows !== null) {
        return buildQueue(includedRows, options);
    }

    // Without data the job is a number of sheets rather than a number of copies: every free
    // position gets the label, the first sheet's used positions excepted as in any other job.
    const sheets = Math.max(1, Math.floor(options.sheetsWithoutData));
    const perSheet = labelsPerSheet(sheet);
    const count = Math.max(0, freeSlots(sheet, options.usedSlots).length + (sheets - 1) * perSheet);
    return Array.from({ length: count }, () => null);
}
