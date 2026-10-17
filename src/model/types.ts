/*
 * The document model. Two units run through all of it:
 *
 *   lengths    inches, everywhere: the page, the labels, every element's box. Label stock is sold
 *              and specified in inches (Avery's templates are 1/32" and 1/3" fractions), and CSS
 *              prints inches exactly, so nothing is converted until something is drawn.
 *   type size  points (1/72 in), because that is what every font menu speaks.
 *
 * Everything here is plain data — no classes, no Dates, no Maps — so a template is JSON as it
 * stands and the same object can be autosaved, exported, and loaded back unchanged.
 */

/** The outline of every label on a sheet: drawn in the designer and when printing outlines. */
export type LabelShape = "rectangle" | "rounded" | "ellipse";

/**
 * One kind of label stock: a page with a regular grid of identical labels on it. The grid is
 * described the way the sheets themselves are measured — the first label's offset from the page
 * corner, then the gaps between neighbours.
 */
export interface SheetSpec {
    /** The preset the measurements came from, or `"custom"` once any of them is edited. */
    presetId: string;
    /** What the stock is called, shown wherever the sheet is named. */
    name: string;
    pageWidth: number;
    pageHeight: number;
    labelWidth: number;
    labelHeight: number;
    columns: number;
    rows: number;
    /** From the top of the page to the top of the first row. */
    marginTop: number;
    /** From the left of the page to the left of the first column. */
    marginLeft: number;
    /** The space between two neighbouring labels in a row. */
    gapX: number;
    /** The space between two neighbouring rows. */
    gapY: number;
    shape: LabelShape;
    /** The corner radius of a `"rounded"` label. */
    cornerRadius: number;
}

export type ElementType = "text" | "image" | "qr" | "barcode" | "shape";

/** Elements turn in quarter turns only: a label is read square to its edges. */
export type Rotation = 0 | 90 | 180 | 270;

/** What every element on a label has: a name, a box in label coordinates, and its flags. */
interface ElementBase {
    id: string;
    /** Shown in the layers list. */
    name: string;
    /** From the label's left edge to the element's box, before rotation. */
    x: number;
    /** From the label's top edge to the element's box, before rotation. */
    y: number;
    width: number;
    height: number;
    /**
     * Turns the content inside the box. The box itself stays where it is, so a 90° text element
     * runs bottom-to-top along the box's height.
     */
    rotation: Rotation;
    hidden: boolean;
    /** A locked element cannot be moved or resized on the canvas (the inspector still edits it). */
    locked: boolean;
}

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type TextCase = "none" | "upper" | "lower" | "title";

/** A block of text with merge fields in it — the element mail merge is mostly about. */
export interface TextElement extends ElementBase {
    type: "text";
    /** Literal text and `{{Field}}` placeholders; a newline starts a new line on the label. */
    template: string;
    fontFamily: string;
    /** The size the text is set at, in points. Shrink-to-fit may set it smaller on a given label. */
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
    align: HorizontalAlign;
    verticalAlign: VerticalAlign;
    /** Line spacing as a multiple of the font size. */
    lineHeight: number;
    textCase: TextCase;
    /** Whether a line longer than the box wraps onto the next one. */
    wrap: boolean;
    /** Whether a label whose text does not fit is set smaller, down to {@link minFontSize}. */
    shrinkToFit: boolean;
    minFontSize: number;
    /**
     * Whether a line whose every field is empty is left out, so a record without an "Address 2"
     * closes up instead of printing a gap. Lines with no fields at all are always kept.
     */
    removeBlankLines: boolean;
}

export type ImageFit = "contain" | "cover" | "fill";

/** A picture placed on every label — a logo, an icon. Stored inline as a data URL. */
export interface ImageElement extends ElementBase {
    type: "image";
    /** A `data:` URL, or empty for a placeholder that prints nothing. */
    src: string;
    fit: ImageFit;
    /** 0–1. */
    opacity: number;
}

export type QrErrorLevel = "L" | "M" | "Q" | "H";

/** A QR code whose content is merged per label, like a text element's. */
export interface QrElement extends ElementBase {
    type: "qr";
    template: string;
    errorLevel: QrErrorLevel;
    color: string;
}

/** A Code 128 barcode whose value is merged per label. */
export interface BarcodeElement extends ElementBase {
    type: "barcode";
    template: string;
    color: string;
    /** Whether the encoded value is printed under the bars. */
    showText: boolean;
    /** The size of that text, in points. */
    textSize: number;
}

export type ShapeKind = "rectangle" | "ellipse" | "line";

/** A box, oval or rule: borders, dividers, colour bands. */
export interface ShapeElement extends ElementBase {
    type: "shape";
    shape: ShapeKind;
    /** Empty for no outline. */
    stroke: string;
    /** In points. */
    strokeWidth: number;
    /** Empty for no fill. Ignored by lines. */
    fill: string;
    /** Rounds a rectangle's corners. */
    cornerRadius: number;
}

export type LabelElement = TextElement | ImageElement | QrElement | BarcodeElement | ShapeElement;

/** The contents of one label. Every label on a sheet is this design with a different record merged in. */
export interface LabelDesign {
    /** Back to front: the last element draws on top. */
    elements: LabelElement[];
    /**
     * An inset from the label's edge shown as a guide in the designer. Printers drift by a
     * millimetre or so, and this is the room content should leave for it.
     */
    safeMargin: number;
}

/** What a saved template holds: the stock and the layout, never the data merged into them. */
export interface LabelTemplate {
    version: 1;
    name: string;
    sheet: SheetSpec;
    design: LabelDesign;
}

/** The records being merged: a header of field names and rows of text, one cell per field. */
export interface DataTable {
    /** Where the rows came from, for display: a file name, "Pasted data", "Sample addresses". */
    source: string;
    fields: string[];
    /** Every row has exactly `fields.length` cells. */
    rows: string[][];
}

/** The order labels are used up on a sheet. */
export type FillOrder = "across" | "down";

/** How a job turns records into labels. Saved with the session, not with a template. */
export interface PrintOptions {
    /** Labels printed for each record. */
    copies: number;
    /**
     * With several copies, whether each record's copies sit together (`false`: A A B B) or the
     * whole set repeats (`true`: A B A B).
     */
    collate: boolean;
    fillOrder: FillOrder;
    /**
     * Positions on the first sheet that are already used, as slot indexes in fill order. A sheet
     * that went through the printer before goes back in with those positions skipped.
     */
    usedSlots: number[];
    /** How many full sheets to print when there is no data, every label the same. */
    sheetsWithoutData: number;
    /** Draws every label's outline: for test prints on plain paper, held up against the stock. */
    outlines: boolean;
}

/**
 * How far this printer is off. Printers place the page a little differently, so this belongs to
 * the browser (it is kept in localStorage) rather than to any template.
 */
export interface Calibration {
    /** Moves everything right, in inches. Negative moves it left. */
    offsetX: number;
    /** Moves everything down, in inches. Negative moves it up. */
    offsetY: number;
    /** Stretches across the page, in percent, for a printer that prints slightly small. */
    scaleX: number;
    /** Stretches down the page, in percent: the fix for labels that drift further off each row. */
    scaleY: number;
}

/** Everything the app autosaves: the open template, the data, and the job settings. */
export interface Session {
    version: 1;
    template: LabelTemplate;
    data: DataTable | null;
    /** Rows left out of the merge, by index into `data.rows`. */
    excluded: number[];
    print: PrintOptions;
}
