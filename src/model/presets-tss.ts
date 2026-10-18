import type { SheetPreset } from "./presets.ts";
import { shapeCategory } from "./sheet.ts";
import type { LabelShape, SheetSpec } from "./types.ts";
import { MM_PER_INCH } from "./units.ts";

/*
 * The Shipping Store's laser and inkjet label templates (theshippingstore.com), exactly as their
 * own online Label Designer defines them: each layout's sheet geometry in millimetres, copied as
 * published in October 2026, so every line can be checked against the designer's header ("S001 ·
 * 25.4 × 25.4 mm · 63 per sheet"). All of them are US Letter. The code is what the product page
 * tells you to use: "use template S001".
 *
 * Shapes: rectangles and squares keep their corner radius; circles and ovals draw as ellipses.
 * Two layouts are custom die-cuts: R006 is a 2″ × 5″ rectangle with rounded corners, kept as one,
 * and R042A is a tabbed shape, which is drawn — and test-printed — as its bounding box.
 *
 * To refresh: https://tss-labeling-v2.vercel.app/catalog lists the codes, and each
 * /design/<code> page embeds a `geometry` record with these fields.
 */

interface TssLayout {
    code: string;
    /** The maker's product name, kept for searching ("clear", "kraft"). */
    name: string;
    shape: "rect" | "circle" | "oval" | "custom";
    // Millimetres, as published.
    labelW: number;
    labelH: number;
    cols: number;
    rows: number;
    top: number;
    left: number;
    gapX: number;
    gapY: number;
    radius: number;
}

export const TSS_LAYOUTS: readonly TssLayout[] = [
    { code: "C001", name: "3/4\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 19.05, labelH: 19.05, cols: 9, rows: 12, top: 16.65, left: 15.805, gapX: 1.589, gapY: 1.59, radius: 0 },
    { code: "C001FA", name: "1 1/2\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 38.1, labelH: 38.1, cols: 4, rows: 5, top: 19.05, left: 12.7, gapX: 12.7, gapY: 12.7, radius: 0 },
    { code: "C002", name: "1\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 25.4, labelH: 25.4, cols: 7, rows: 9, top: 12.7, left: 9.525, gapX: 3.175, gapY: 3.175, radius: 0 },
    { code: "C003", name: "1 1/2\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 38.1, labelH: 38.1, cols: 5, rows: 6, top: 17.463, left: 6.35, gapX: 3.175, gapY: 3.175, radius: 0 },
    { code: "C004", name: "2\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 50.8, labelH: 50.8, cols: 4, rows: 5, top: 9.715, left: 3.969, gapX: 1.528, gapY: 1.54, radius: 0 },
    { code: "C004A", name: "2\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 50.8, labelH: 50.8, cols: 3, rows: 4, top: 15.875, left: 15.875, gapX: 15.875, gapY: 14.811, radius: 0 },
    { code: "C005", name: "2 1/2\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 62.306, labelH: 62.306, cols: 3, rows: 4, top: 13.649, left: 8.005, gapX: 6.485, gapY: 0.958, radius: 0 },
    { code: "C006", name: "3\" Circle Laser & Inkjet Labels", shape: "circle", labelW: 76.2, labelH: 76.2, cols: 2, rows: 3, top: 12.7, left: 19.05, gapX: 25.4, gapY: 12.7, radius: 0 },
    { code: "R001", name: "1\" x 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 25.4, labelH: 12.7, cols: 8, rows: 20, top: 12.565, left: 6.237, gapX: 0, gapY: 0, radius: 0 },
    { code: "R002", name: "1 3/4\" x 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 44.45, labelH: 12.7, cols: 4, rows: 20, top: 12.7, left: 8.326, gapX: 7.149, gapY: 0, radius: 2 },
    { code: "R003", name: "1 3/4\" x 2/3\" Laser & Inkjet Labels", shape: "rect", labelW: 44.45, labelH: 16.916, cols: 4, rows: 15, top: 12.83, left: 7.811, gapX: 7.493, gapY: 0, radius: 2.5 },
    { code: "R004", name: "1 1/2\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 38.453, labelH: 25.753, cols: 5, rows: 10, top: 10.8, left: 11.705, gapX: 0, gapY: 0, radius: 0 },
    { code: "R005", name: "2\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 50.8, labelH: 25.4, cols: 4, rows: 10, top: 12.565, left: 6.237, gapX: 0, gapY: 0, radius: 0 },
    { code: "R006", name: "2\" x 5\" Laser & Inkjet Labels", shape: "custom", labelW: 50.8, labelH: 127, cols: 4, rows: 2, top: 12.565, left: 6.357, gapX: 0, gapY: 0, radius: 4.538 },
    { code: "R007", name: "2 5/8\" x 1\" Clear Glossy Laser & Inkjet Labels", shape: "rect", labelW: 65.875, labelH: 25.4, cols: 3, rows: 10, top: 12.589, left: 5.168, gapX: 4.128, gapY: 0, radius: 3.175 },
    { code: "R008", name: "2 1/2\" x 1 9/16\" Laser & Inkjet Labels", shape: "rect", labelW: 63.5, labelH: 39.688, cols: 3, rows: 6, top: 12.512, left: 9.525, gapX: 3.175, gapY: 3.25, radius: 1.588 },
    { code: "R009", name: "2 5/8\" x 2\" Laser & Inkjet Labels", shape: "rect", labelW: 66.675, labelH: 50.8, cols: 3, rows: 5, top: 12.589, left: 4.921, gapX: 3.175, gapY: 0, radius: 3.175 },
    { code: "R010", name: "3\" x 1 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 38.1, cols: 2, rows: 7, top: 6.239, left: 25.435, gapX: 12.7, gapY: 0, radius: 0 },
    { code: "R011", name: "3\" x 2\" Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 50.8, cols: 2, rows: 5, top: 6.239, left: 30.321, gapX: 3.175, gapY: 3.175, radius: 3.175 },
    { code: "R012", name: "3 7/16\" x 2/3\" Laser & Inkjet Labels", shape: "rect", labelW: 87.313, labelH: 16.908, cols: 2, rows: 15, top: 12.779, left: 13.652, gapX: 14.287, gapY: 0, radius: 2.5 },
    { code: "R013", name: "3 3/8\" x 2 1/3\" Laser & Inkjet Labels", shape: "rect", labelW: 85.725, labelH: 59.258, cols: 2, rows: 4, top: 13.942, left: 17.621, gapX: 9.525, gapY: 4.753, radius: 0 },
    { code: "R014", name: "3 3/4\" x 3\" Laser & Inkjet Labels", shape: "rect", labelW: 95.25, labelH: 76.2, cols: 2, rows: 3, top: 15.875, left: 9.525, gapX: 6.35, gapY: 9.525, radius: 2.381 },
    { code: "R015", name: "3 1/3\" x 4\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 84.667, cols: 2, rows: 3, top: 12.7, left: 3.962, gapX: 4.775, gapY: 0, radius: 3 },
    { code: "R016", name: "3 1/2\" x 5\" Laser & Inkjet Labels", shape: "rect", labelW: 88.9, labelH: 127, cols: 2, rows: 2, top: 12.589, left: 12.594, gapX: 13.229, gapY: 0, radius: 2.5 },
    { code: "R017", name: "4\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 25.4, cols: 2, rows: 10, top: 12.7, left: 4.365, gapX: 3.969, gapY: 0, radius: 2.5 },
    { code: "R018", name: "4\" x 1 1/3\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 33.866, cols: 2, rows: 7, top: 21.058, left: 4.127, gapX: 4.763, gapY: 0, radius: 2.5 },
    { code: "R019", name: "4\" x 2\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 50.8, cols: 2, rows: 5, top: 12.589, left: 4.73, gapX: 3.556, gapY: 0, radius: 3.175 },
    { code: "R01F01A", name: "1.5\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 38.1, labelH: 25.4, cols: 5, rows: 10, top: 12.7, left: 6.35, gapX: 3.175, gapY: 0, radius: 2.381 },
    { code: "R020", name: "4\" x 2 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 63.5, cols: 2, rows: 4, top: 12.53, left: 4.656, gapX: 3.704, gapY: 0, radius: 2.769 },
    { code: "R021", name: "4\" x 3\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 76.2, cols: 2, rows: 3, top: 25.289, left: 4.917, gapX: 3.183, gapY: 0, radius: 3.187 },
    { code: "R022", name: "4\" x 5\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 127, cols: 2, rows: 2, top: 12.589, left: 4.127, gapX: 4.763, gapY: 0, radius: 3.174 },
    { code: "R023", name: "4 1/4\" x 5 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 107.95, labelH: 139.7, cols: 2, rows: 2, top: 0, left: 0, gapX: 0, gapY: 0, radius: 0 },
    { code: "R024", name: "8\" x 2\" Laser & Inkjet Labels", shape: "rect", labelW: 203.2, labelH: 50.8, cols: 1, rows: 5, top: 12.7, left: 6.35, gapX: 0, gapY: 0, radius: 0 },
    { code: "R025", name: "8 1/2\" x 5 1/2\" Laser & Inkjet Labels", shape: "rect", labelW: 215.9, labelH: 139.7, cols: 1, rows: 2, top: 0, left: 0, gapX: 0, gapY: 0, radius: 0 },
    { code: "R026", name: "8 1/2\" x 11\" Laser & Inkjet Labels", shape: "rect", labelW: 215.9, labelH: 279.4, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0, radius: 0 },
    { code: "R027", name: "2\" x 3.5\" Rectangle Laser & Inkjet Labels", shape: "rect", labelW: 88.9, labelH: 50.8, cols: 2, rows: 4, top: 19.05, left: 12.7, gapX: 12.7, gapY: 12.7, radius: 0 },
    { code: "R029", name: "1.5\" x 2.75\" Laser & Inkjet Labels", shape: "rect", labelW: 69.85, labelH: 38.1, cols: 2, rows: 5, top: 15.875, left: 25.4, gapX: 25.4, gapY: 14.296, radius: 2.388 },
    { code: "R02F03F", name: "2-1/3\" X 3-3/8\" Laser & Inkjet Labels", shape: "rect", labelW: 85.725, labelH: 59.182, cols: 2, rows: 4, top: 14.859, left: 17.463, gapX: 9.525, gapY: 4.318, radius: 6.35 },
    { code: "R030", name: "3\" x 7\" Laser & Inkjet Labels", shape: "rect", labelW: 177.8, labelH: 76.2, cols: 1, rows: 3, top: 19.05, left: 19.05, gapX: 0, gapY: 6.35, radius: 3.175 },
    { code: "R031", name: "3\" x 5\" Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 127, cols: 2, rows: 2, top: 11.113, left: 30.163, gapX: 3.175, gapY: 3.175, radius: 0 },
    { code: "R032", name: "1.75\" x 0.5\" Clear Laser & Inkjet Labels", shape: "rect", labelW: 44.45, labelH: 12.7, cols: 4, rows: 20, top: 12.7, left: 7.62, gapX: 7.62, gapY: 0, radius: 1.27 },
    { code: "R033L", name: "4\" x 1.5\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 38.1, cols: 2, rows: 6, top: 25.224, left: 4.351, gapX: 4.41, gapY: 0, radius: 2.387 },
    { code: "R034L", name: "4\" x 1.75\" Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 44.45, cols: 2, rows: 6, top: 6.35, left: 6.35, gapX: 0, gapY: 0, radius: 3.175 },
    { code: "R035L", name: "8\" x 5\" Laser & Inkjet Labels", shape: "rect", labelW: 203.2, labelH: 127, cols: 1, rows: 2, top: 6.35, left: 6.35, gapX: 0, gapY: 12.7, radius: 3.175 },
    { code: "R036L", name: "1\" x 0.375\" Laser & Inkjet Labels", shape: "rect", labelW: 25.4, labelH: 9.525, cols: 7, rows: 22, top: 8.788, left: 11.43, gapX: 2.54, gapY: 2.489, radius: 1.588 },
    { code: "R037L", name: "1.5\" x 0.5\" Laser & Inkjet Labels", shape: "rect", labelW: 38.1, labelH: 12.7, cols: 5, rows: 20, top: 12.435, left: 12.7, gapX: 0, gapY: 0, radius: 0 },
    { code: "R038L", name: "1.75\" x 1.25\" Laser & Inkjet Labels", shape: "rect", labelW: 44.45, labelH: 31.75, cols: 4, rows: 8, top: 12.73, left: 11.912, gapX: 4.763, gapY: 0, radius: 3.175 },
    { code: "R039A", name: "1 1/2\" x 3 3/4\" Laser & Inkjet Labels", shape: "rect", labelW: 95.25, labelH: 38.1, cols: 2, rows: 5, top: 15.875, left: 9.525, gapX: 6.35, gapY: 14.296, radius: 2.54 },
    { code: "R040A", name: "2\" x 6\" Laser & Inkjet Labels", shape: "rect", labelW: 152.4, labelH: 50.8, cols: 1, rows: 4, top: 19.05, left: 31.75, gapX: 0, gapY: 12.7, radius: 3.175 },
    { code: "R041L", name: "2.25\" x 0.75\" Laser & Inkjet Labels", shape: "rect", labelW: 57.15, labelH: 19.05, cols: 3, rows: 10, top: 15.875, left: 9.525, gapX: 12.7, gapY: 6.35, radius: 1.588 },
    { code: "R042A", name: "2 3/16\" x 2 1/8\" Laser & Inkjet Labels", shape: "custom", labelW: 55.626, labelH: 54.102, cols: 3, rows: 4, top: 17.336, left: 12.294, gapX: 12.24, gapY: 9.398, radius: 0 },
    { code: "R043L", name: "3\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 25.4, cols: 2, rows: 9, top: 12.7, left: 30.163, gapX: 3.175, gapY: 3.175, radius: 3.175 },
    { code: "R044A", name: "5\" x 7\" Laser & Inkjet Labels", shape: "rect", labelW: 177.8, labelH: 127, cols: 1, rows: 2, top: 10.795, left: 19.05, gapX: 0, gapY: 3.81, radius: 1.588 },
    { code: "S001", name: "1\" x 1\" Square Laser & Inkjet Labels", shape: "rect", labelW: 25.4, labelH: 25.4, cols: 7, rows: 9, top: 12.565, left: 9.412, gapX: 3.175, gapY: 3.175, radius: 2.469 },
    { code: "S001A", name: "1\" x 1\" Laser & Inkjet Labels", shape: "rect", labelW: 25.4, labelH: 25.4, cols: 6, rows: 8, top: 15.875, left: 15.875, gapX: 6.35, gapY: 6.35, radius: 0.787 },
    { code: "S002", name: "2\" x 2\" Square Laser & Inkjet Labels", shape: "rect", labelW: 50.8, labelH: 50.8, cols: 4, rows: 5, top: 6.35, left: 6.35, gapX: 0, gapY: 3.175, radius: 1.588 },
    { code: "S002A", name: "2\" x 2\" Square Laser & Inkjet Labels", shape: "rect", labelW: 50.8, labelH: 50.8, cols: 3, rows: 4, top: 15.875, left: 15.875, gapX: 15.875, gapY: 14.811, radius: 0 },
    { code: "S003", name: "2 1/2\" x 2 1/2\" Square Laser & Inkjet Labels", shape: "rect", labelW: 63.5, labelH: 63.5, cols: 3, rows: 4, top: 6.35, left: 9.525, gapX: 3.175, gapY: 4.233, radius: 3.175 },
    { code: "S003A", name: "3\" x 3\" Square Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 76.2, cols: 2, rows: 3, top: 15.875, left: 15.875, gapX: 31.75, gapY: 9.525, radius: 0.787 },
    { code: "S004", name: "3\" x 3\" Square Laser & Inkjet Labels", shape: "rect", labelW: 76.2, labelH: 76.2, cols: 2, rows: 3, top: 22.114, left: 30.321, gapX: 3.175, gapY: 3.175, radius: 0 },
    { code: "S004A", name: "4\" x 4\" Square Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 101.6, cols: 2, rows: 2, top: 34.925, left: 6.35, gapX: 0, gapY: 6.35, radius: 0 },
    { code: "S005", name: "4\" x 4\" Square Laser & Inkjet Labels", shape: "rect", labelW: 101.6, labelH: 101.6, cols: 2, rows: 2, top: 34.925, left: 6.35, gapX: 0, gapY: 6.35, radius: 0 },
    { code: "S006U", name: "5\" x 5\" Laser & Inkjet Labels", shape: "rect", labelW: 127.353, labelH: 127.353, cols: 1, rows: 2, top: 11.289, left: 44.45, gapX: 0, gapY: 2.822, radius: 0 },
    { code: "V001", name: "3.33\" x 2\" Oval Laser & Inkjet Labels", shape: "oval", labelW: 84.667, labelH: 50.8, cols: 2, rows: 4, top: 25.4, left: 19.05, gapX: 8.449, gapY: 8.461, radius: 0 },
    { code: "V002", name: "1.125\" x 2.25\" Oval Laser & Inkjet Labels", shape: "oval", labelW: 57.15, labelH: 28.575, cols: 3, rows: 7, top: 15.875, left: 11.113, gapX: 11.113, gapY: 7.938, radius: 0 },
    { code: "V003L", name: "1.5\" x 0.75\" Oval Laser & Inkjet Labels", shape: "oval", labelW: 38.1, labelH: 19.05, cols: 5, rows: 11, top: 12.744, left: 9.593, gapX: 1.587, gapY: 4.445, radius: 0 },
    { code: "V004A", name: "1 1/2\" x 2 1/2\" Oval Laser & Inkjet Labels", shape: "oval", labelW: 63.5, labelH: 38.1, cols: 3, rows: 6, top: 15.999, left: 9.384, gapX: 3.307, gapY: 3.757, radius: 0 }
];

/** Millimetres to inches, to five places: well under what any field shows or any printer resolves. */
const inches = (mm: number) => Number((mm / MM_PER_INCH).toFixed(5));

function toPreset(layout: TssLayout): SheetPreset {
    const shape: LabelShape =
        layout.shape === "circle" || layout.shape === "oval" ? "ellipse" : layout.radius > 0 ? "rounded" : "rectangle";

    const sheet: Omit<SheetSpec, "presetId" | "name"> = {
        pageWidth: 8.5,
        pageHeight: 11,
        labelWidth: inches(layout.labelW),
        labelHeight: inches(layout.labelH),
        columns: layout.cols,
        rows: layout.rows,
        marginTop: inches(layout.top),
        marginLeft: inches(layout.left),
        gapX: inches(layout.gapX),
        gapY: inches(layout.gapY),
        shape,
        cornerRadius: shape === "rounded" ? inches(layout.radius) : 0
    };

    return {
        id: `tss-${layout.code.toLowerCase()}`,
        brand: "The Shipping Store",
        code: layout.code,
        kind: shapeCategory(sheet),
        compatible: [],
        sheet,
        keywords: layout.name,
        note:
            layout.shape === "custom" && shape === "rectangle"
                ? "A custom die-cut shape: drawn and test-printed as its bounding box."
                : undefined
    };
}

export const TSS_PRESETS: readonly SheetPreset[] = TSS_LAYOUTS.map(toPreset);
