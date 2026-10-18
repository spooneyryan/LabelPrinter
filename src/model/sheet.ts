import type { FillOrder, SheetSpec } from "./types.ts";
import { describeLength, MM_PER_INCH, type LengthUnit } from "./units.ts";

/*
 * Sheet geometry: where each label sits on the page, and whether a set of measurements describes a
 * sheet that can exist at all.
 *
 * Positions are numbered in "slots" — 0 to labelsPerSheet - 1 in the order labels are used up.
 * Across fills each row left to right before moving down, as reading order does; down fills each
 * column top to bottom first. The slot number is what the first-sheet "used positions" refer to,
 * so they stay meaningful when the order changes only if the picker re-reads them in that order,
 * which it does.
 */

/** Anything closer than this is the same length: a thousandth of an inch is below any printer. */
const EPSILON = 0.001;

export interface PageSize {
    id: "letter" | "a4";
    name: string;
    /** Inches. */
    width: number;
    height: number;
}

/** The page sizes label stock comes on: US Letter in North America, A4 nearly everywhere else. */
export const PAGE_SIZES: readonly PageSize[] = [
    { id: "letter", name: "US Letter", width: 8.5, height: 11 },
    { id: "a4", name: "A4", width: 210 / MM_PER_INCH, height: 297 / MM_PER_INCH }
];

/** The standard page a sheet is, or null for a page of some other size. */
export function pageSizeOf(sheet: Pick<SheetSpec, "pageWidth" | "pageHeight">): PageSize | null {
    return (
        PAGE_SIZES.find(
            (page) => Math.abs(page.width - sheet.pageWidth) < EPSILON * 10 && Math.abs(page.height - sheet.pageHeight) < EPSILON * 10
        ) ?? null
    );
}

export function labelsPerSheet(sheet: SheetSpec): number {
    return Math.max(0, sheet.columns) * Math.max(0, sheet.rows);
}

/** The column and row of a slot, for the given fill order. */
export function slotCell(sheet: SheetSpec, slot: number, order: FillOrder): { column: number; row: number } {
    return order === "down"
        ? { column: Math.floor(slot / sheet.rows), row: slot % sheet.rows }
        : { column: slot % sheet.columns, row: Math.floor(slot / sheet.columns) };
}

/** The slot at a column and row, for the given fill order. The inverse of {@link slotCell}. */
export function cellSlot(sheet: SheetSpec, column: number, row: number, order: FillOrder): number {
    return order === "down" ? column * sheet.rows + row : row * sheet.columns + column;
}

/** The top-left corner of the label at a column and row, from the page's top-left corner. */
export function cellOrigin(sheet: SheetSpec, column: number, row: number): { x: number; y: number } {
    return {
        x: sheet.marginLeft + column * (sheet.labelWidth + sheet.gapX),
        y: sheet.marginTop + row * (sheet.labelHeight + sheet.gapY)
    };
}

/** The size of the whole grid of labels, gaps included. */
export function gridSize(sheet: SheetSpec): { width: number; height: number } {
    return {
        width: sheet.columns * sheet.labelWidth + Math.max(0, sheet.columns - 1) * sheet.gapX,
        height: sheet.rows * sheet.labelHeight + Math.max(0, sheet.rows - 1) * sheet.gapY
    };
}

/** The margins left over on the right and bottom of the page once the grid is placed. */
export function trailingMargins(sheet: SheetSpec): { right: number; bottom: number } {
    const grid = gridSize(sheet);
    return {
        right: sheet.pageWidth - sheet.marginLeft - grid.width,
        bottom: sheet.pageHeight - sheet.marginTop - grid.height
    };
}

export interface SheetIssue {
    severity: "error" | "warning";
    message: string;
    /** The measurement the issue is about, so its field can show it. */
    field?: keyof SheetSpec;
}

/**
 * Everything wrong with a sheet. Errors make it unprintable (labels off the page, overlapping, or
 * of no size); warnings are legal but probably a typo.
 */
export function validateSheet(sheet: SheetSpec, unit: LengthUnit = "in"): SheetIssue[] {
    const issues: SheetIssue[] = [];
    const error = (message: string, field?: keyof SheetSpec) => issues.push({ severity: "error", message, field });

    if (!(sheet.labelWidth > 0)) {
        error("Label width must be more than zero.", "labelWidth");
    }

    if (!(sheet.labelHeight > 0)) {
        error("Label height must be more than zero.", "labelHeight");
    }

    if (!Number.isInteger(sheet.columns) || sheet.columns < 1) {
        error("There must be at least one column, in whole labels.", "columns");
    }

    if (!Number.isInteger(sheet.rows) || sheet.rows < 1) {
        error("There must be at least one row, in whole labels.", "rows");
    }

    if (sheet.marginTop < -EPSILON) {
        error("The top margin can't be negative.", "marginTop");
    }

    if (sheet.marginLeft < -EPSILON) {
        error("The left margin can't be negative.", "marginLeft");
    }

    if (sheet.gapX < -EPSILON) {
        error("Labels in a row would overlap: the horizontal gap can't be negative.", "gapX");
    }

    if (sheet.gapY < -EPSILON) {
        error("Rows would overlap: the vertical gap can't be negative.", "gapY");
    }

    if (issues.length > 0) {
        // Overflow arithmetic on a sheet with no size or a negative count is noise on top of the
        // real problem.
        return issues;
    }

    const { right, bottom } = trailingMargins(sheet);
    if (right < -EPSILON) {
        error(`The last column runs ${describeLength(-right, unit)} past the right edge of the page.`, "columns");
    }

    if (bottom < -EPSILON) {
        error(`The last row runs ${describeLength(-bottom, unit)} past the bottom of the page.`, "rows");
    }

    if (sheet.shape === "rounded" && sheet.cornerRadius > Math.min(sheet.labelWidth, sheet.labelHeight) / 2 + EPSILON) {
        issues.push({
            severity: "warning",
            message: "The corner radius is more than half the label, so the corners meet.",
            field: "cornerRadius"
        });
    }

    return issues;
}

/** The same sheet with its margins set to center the grid on the page. */
export function centerGrid(sheet: SheetSpec): SheetSpec {
    const grid = gridSize(sheet);
    return {
        ...sheet,
        marginLeft: roundLength((sheet.pageWidth - grid.width) / 2),
        marginTop: roundLength((sheet.pageHeight - grid.height) / 2)
    };
}

/**
 * The same sheet with its gaps set so the right and bottom margins equal the left and top ones —
 * how most stock is cut, and the quickest way to a custom sheet from three measurements: the label
 * size, the first margin, and the count.
 */
export function spreadGrid(sheet: SheetSpec): SheetSpec {
    const gap = (page: number, margin: number, size: number, count: number) =>
        count > 1 ? roundLength(Math.max(0, (page - 2 * margin - count * size) / (count - 1))) : 0;

    return {
        ...sheet,
        gapX: gap(sheet.pageWidth, sheet.marginLeft, sheet.labelWidth, sheet.columns),
        gapY: gap(sheet.pageHeight, sheet.marginTop, sheet.labelHeight, sheet.rows)
    };
}

/**
 * How far inside each label the test sheet draws its box: a sixteenth of an inch, or a tenth of
 * the label on stock too small to spare that. Far enough in to show a gap on every side, close
 * enough to the edge that a measurement out by a millimetre pushes a box over it.
 */
export function testInset(sheet: Pick<SheetSpec, "labelWidth" | "labelHeight">): number {
    return Math.min(1 / 16, Math.min(sheet.labelWidth, sheet.labelHeight) * 0.1);
}

/** Whether two sheets put labels in the same places, ignoring their names. */
export function sameLayout(a: Omit<SheetSpec, "presetId" | "name">, b: Omit<SheetSpec, "presetId" | "name">): boolean {
    const keys: (keyof Omit<SheetSpec, "presetId" | "name" | "shape">)[] = [
        "pageWidth",
        "pageHeight",
        "labelWidth",
        "labelHeight",
        "columns",
        "rows",
        "marginTop",
        "marginLeft",
        "gapX",
        "gapY",
        "cornerRadius"
    ];

    return a.shape === b.shape && keys.every((key) => Math.abs(a[key] - b[key]) < EPSILON);
}

export type ShapeCategory = "Rectangle" | "Square" | "Round" | "Oval";

/** What shape a sheet's labels are, as a person would say it: a square is a rectangle with equal sides. */
export function shapeCategory(sheet: Pick<SheetSpec, "shape" | "labelWidth" | "labelHeight">): ShapeCategory {
    const equalSides = Math.abs(sheet.labelWidth - sheet.labelHeight) < 0.005;
    if (sheet.shape === "ellipse") {
        return equalSides ? "Round" : "Oval";
    }

    return equalSides ? "Square" : "Rectangle";
}

/** Lengths computed from other lengths are kept to a ten-thousandth, which is what the fields show. */
function roundLength(value: number): number {
    return Number(value.toFixed(4));
}
