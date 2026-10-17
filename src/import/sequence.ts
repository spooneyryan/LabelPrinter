import type { DataTable } from "../model/types.ts";

/*
 * Numbered labels without a spreadsheet: asset tags, raffle tickets, sample tubes. The numbers
 * become a one-column table, so they merge, copy and barcode exactly like imported data — and the
 * literal text around them ("INV-{{Number}}") belongs in the label, where it can be styled.
 */

export interface SequenceOptions {
    start: number;
    count: number;
    step: number;
    /** Zero-pads every number to at least this many digits; 0 for no padding. */
    digits: number;
}

export const MAX_SEQUENCE = 10_000;

export function sequenceTable(options: SequenceOptions): DataTable {
    const count = Math.min(MAX_SEQUENCE, Math.max(0, Math.floor(options.count)));
    const step = Number.isFinite(options.step) && options.step !== 0 ? options.step : 1;
    const digits = Math.max(0, Math.min(20, Math.floor(options.digits)));
    const decimals = Math.max(decimalPlaces(options.start), decimalPlaces(step));

    const rows = Array.from({ length: count }, (_, index) => {
        const value = options.start + index * step;
        const negative = value < 0;
        const magnitude = Math.abs(value).toFixed(decimals);
        const [whole, fraction] = magnitude.split(".");
        const padded = whole.padStart(digits, "0") + (fraction ? `.${fraction}` : "");
        return [negative ? `-${padded}` : padded];
    });

    return { source: count > 0 ? `Numbers ${rows[0][0]}–${rows[count - 1][0]}` : "Numbers", fields: ["Number"], rows };
}

function decimalPlaces(value: number): number {
    const text = String(value);
    const dot = text.indexOf(".");
    return dot === -1 || text.includes("e") ? 0 : Math.min(6, text.length - dot - 1);
}
