import type { PresetKind, SheetPreset } from "./presets.ts";
import type { LabelShape, SheetSpec } from "./types.ts";
import { MM_PER_INCH } from "./units.ts";

/*
 * A4 stock (210 × 297 mm), the page nearly everywhere outside North America: the most used Avery
 * UK and Avery Zweckform sheets, and Herma's. Researched October 2026; millimetres, as published.
 *
 * Avery publishes only each label's size and count as text. The margins and gaps here come from
 * Herma's die templates ("Stanzvorlage" PDFs, herma.com/…/Stanzvorlagen/<article>_SV.pdf), which
 * match Avery's published sizes to the hundredth and list the Herma articles cut on the same die;
 * where Herma has no match, from Label Planet's template pages for the equivalent sheet
 * (labelplanet.co.uk), which round to a tenth. Every layout adds up to the page within 0.02 mm.
 *
 * Nobody publishes the corner radius, so rounded labels get the usual 1.5 mm.
 */

interface Layout {
    brand: "Avery" | "Avery Zweckform" | "Herma";
    code: string;
    kind: PresetKind;
    name: string;
    shape: LabelShape;
    w: number;
    h: number;
    cols: number;
    rows: number;
    top: number;
    left: number;
    gapX: number;
    gapY: number;
    /** The maker's own products cut to the same layout (inkjet versions and so on). */
    compatible?: string[];
    /** Other makers' sheets on the same die, as they publish it. */
    equivalents?: string[];
    /** Same label size and count, margins not confirmed to match. */
    similar?: string[];
    /** Where the margins came from when it wasn't a Herma die. */
    source?: string;
}

const LAYOUTS: readonly Layout[] = [
    { brand: "Avery", code: "L7160", kind: "Address", name: "Address Labels 63.5 x 38.1 mm", shape: "rounded", w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.15, left: 7.21, gapX: 2.54, gapY: 0, compatible: ["J8160", "LR7160", "MP7160"], equivalents: ["Herma 4677", "Herma 8632"], similar: ["Label Planet LP21/63"] },
    { brand: "Avery", code: "L7163", kind: "Address", name: "Address and Parcel Labels 99.1 x 38.1 mm", shape: "rounded", w: 99.06, h: 38.1, cols: 2, rows: 7, top: 15.15, left: 4.67, gapX: 2.54, gapY: 0, compatible: ["J8163"], equivalents: ["Herma 4678", "Herma 5076", "Herma 8635"], similar: ["Label Planet LP14/99"] },
    { brand: "Avery", code: "L7162", kind: "Address", name: "Address Labels 99.1 x 33.9 mm", shape: "rounded", w: 99.06, h: 33.87, cols: 2, rows: 8, top: 13.02, left: 4.67, gapX: 2.54, gapY: 0, compatible: ["J8162"], equivalents: ["Herma 4267", "Herma 5075"], similar: ["Label Planet LP16/99"] },
    { brand: "Avery", code: "L7173", kind: "Shipping", name: "Shipping Labels 99.1 x 57 mm", shape: "rounded", w: 99.06, h: 57, cols: 2, rows: 5, top: 6, left: 4.67, gapX: 2.54, gapY: 0, compatible: ["J8173"], equivalents: ["Herma 4268"], similar: ["Label Planet LP10/99"] },
    { brand: "Avery", code: "L7165", kind: "Shipping", name: "Parcel Labels 99.1 x 67.7 mm", shape: "rounded", w: 99.06, h: 67.73, cols: 2, rows: 4, top: 13.03, left: 4.67, gapX: 2.54, gapY: 0, compatible: ["J8165"], equivalents: ["Herma 4269", "Herma 5077"], similar: ["Label Planet LP8/99"] },
    { brand: "Avery", code: "L7161", kind: "Address", name: "Address Labels 63.5 x 46.6 mm", shape: "rounded", w: 63.5, h: 46.56, cols: 3, rows: 6, top: 8.82, left: 7.21, gapX: 2.54, gapY: 0, compatible: ["J8161"], equivalents: ["Herma 4265"], similar: ["Label Planet LP18/63"] },
    { brand: "Avery", code: "L7651", kind: "Address", name: "Mini Labels 38.1 x 21.2 mm", shape: "rounded", w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.75, gapX: 2.5, gapY: 0, compatible: ["J8651"], similar: ["Label Planet LP65/38"], source: "Label Planet LP65/38" },
    { brand: "Avery", code: "L7159", kind: "Address", name: "Address Labels 63.5 x 33.9 mm", shape: "rounded", w: 63.5, h: 33.9, cols: 3, rows: 8, top: 12.9, left: 7.25, gapX: 2.5, gapY: 0, compatible: ["J8159"], similar: ["Label Planet LP24/63"], source: "Label Planet LP24/63" },
    { brand: "Avery", code: "L7167", kind: "Full and half sheet", name: "Shipping Labels 199.6 x 289.1 mm", shape: "rounded", w: 199.6, h: 289.1, cols: 1, rows: 1, top: 3.95, left: 5.2, gapX: 0, gapY: 0, compatible: ["J8167", "LR7167"], equivalents: ["Herma 4252"], similar: ["Label Planet LP1/199"] },
    { brand: "Avery", code: "L7168", kind: "Shipping", name: "Shipping Labels 199.6 x 143.5 mm", shape: "rounded", w: 199.6, h: 143.5, cols: 1, rows: 2, top: 5, left: 5.2, gapX: 0, gapY: 0, compatible: ["J8168"], equivalents: ["Herma 4249"], similar: ["Label Planet LP2/199"] },
    { brand: "Avery", code: "L7169", kind: "Shipping", name: "Parcel Labels 99.1 x 139 mm", shape: "rounded", w: 99.1, h: 139, cols: 2, rows: 2, top: 9.5, left: 4.65, gapX: 2.5, gapY: 0, compatible: ["J8169"], similar: ["Label Planet LP4/99", "Herma 4250"], source: "Label Planet LP4/99" },
    { brand: "Avery", code: "L7166", kind: "Shipping", name: "Parcel Labels 99.1 x 93.1 mm", shape: "rounded", w: 99.1, h: 93.1, cols: 2, rows: 3, top: 8.85, left: 4.65, gapX: 2.5, gapY: 0, similar: ["Label Planet LP6/99"], source: "Label Planet LP6/99" },
    { brand: "Avery", code: "L7171", kind: "File folder", name: "Lever Arch File Labels 200 x 60 mm", shape: "rounded", w: 200, h: 60, cols: 1, rows: 4, top: 28.5, left: 5, gapX: 0, gapY: 0, similar: ["Label Planet LP4/200"], source: "Label Planet LP4/200" },
    { brand: "Avery", code: "L7780", kind: "Round", name: "Round Labels 40 mm", shape: "ellipse", w: 40, h: 40, cols: 4, rows: 6, top: 13.5, left: 16, gapX: 6, gapY: 6, equivalents: ["Herma 4476", "Herma 5066"], similar: ["Label Planet LP24/40R"] },
    { brand: "Avery", code: "L7630", kind: "Round", name: "Round Labels 63.5 mm", shape: "ellipse", w: 63.5, h: 63.5, cols: 3, rows: 4, top: 14.75, left: 5.25, gapX: 4.5, gapY: 4.5, similar: ["Label Planet LP12/64R"], source: "Label Planet LP12/64R" },
    { brand: "Avery", code: "L7654", kind: "Rectangle", name: "Mini Labels 45.7 x 25.4 mm", shape: "rounded", w: 45.7, h: 25.4, cols: 4, rows: 10, top: 21.5, left: 9.7, gapX: 2.6, gapY: 0, similar: ["Label Planet LP40/45"], source: "Label Planet LP40/45" },
    { brand: "Avery", code: "L7164", kind: "Rectangle", name: "Labels 63.5 x 72 mm", shape: "rounded", w: 63.5, h: 72, cols: 3, rows: 4, top: 4.5, left: 7.21, gapX: 2.54, gapY: 0, equivalents: ["Herma 4266"], similar: ["Label Planet LP12/63"] },
    { brand: "Avery", code: "L7656", kind: "Return address", name: "Mini Labels 46 x 11.1 mm", shape: "rounded", w: 46, h: 11.1, cols: 4, rows: 21, top: 15.95, left: 5.95, gapX: 4.7, gapY: 1.6, similar: ["Label Planet LP84/46"], source: "Label Planet LP84/46" },
    { brand: "Avery Zweckform", code: "3475", kind: "Address", name: "Universal-Etiketten 70 x 36 mm", shape: "rectangle", w: 70, h: 36, cols: 3, rows: 8, top: 4.5, left: 0, gapX: 0, gapY: 0, compatible: ["3490", "6602"], equivalents: ["Herma 4360", "Herma 4414", "Herma 4453", "Herma 4633", "Herma 8638"], similar: ["Label Planet LP24/70SS"] },
    { brand: "Avery Zweckform", code: "3652", kind: "Address", name: "Etiketten 70 x 42.3 mm", shape: "rectangle", w: 70, h: 42.43, cols: 3, rows: 7, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4616", "Herma 4668", "Herma 5054", "Herma 8634"], similar: ["Label Planet LP21/70"] },
    { brand: "Avery Zweckform", code: "3651", kind: "Rectangle", name: "Etiketten 52.5 x 29.7 mm", shape: "rectangle", w: 52.5, h: 29.7, cols: 4, rows: 10, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4610", "Herma 4461"] },
    { brand: "Avery Zweckform", code: "3425", kind: "Shipping", name: "Etiketten 105 x 57 mm", shape: "rectangle", w: 105, h: 57, cols: 2, rows: 5, top: 6, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4425"] },
    { brand: "Avery Zweckform", code: "3424", kind: "Shipping", name: "Etiketten 105 x 48 mm", shape: "rectangle", w: 105, h: 48, cols: 2, rows: 6, top: 4.5, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4457", "Herma 4363", "Herma 4417", "Herma 4635"] },
    { brand: "Avery Zweckform", code: "3483", kind: "Shipping", name: "Etiketten 105 x 148 mm (A6)", shape: "rectangle", w: 105, h: 148.5, cols: 2, rows: 2, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4676", "Herma 4627", "Herma 5063", "Herma 4396", "Herma 4397", "Herma 4398", "Herma 4399", "Herma 4229", "Herma 8630"], similar: ["Label Planet LP4/105"] },
    { brand: "Avery Zweckform", code: "3427", kind: "Shipping", name: "Etiketten 105 x 74 mm (A7)", shape: "rectangle", w: 105, h: 74.25, cols: 2, rows: 4, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4626", "Herma 4470", "Herma 5062", "Herma 8645"], similar: ["Label Planet LP8/105"] },
    { brand: "Avery Zweckform", code: "3478", kind: "Full and half sheet", name: "Etiketten 210 x 297 mm", shape: "rectangle", w: 210, h: 297, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4631", "Herma 4428", "Herma 5065", "Herma 4401", "Herma 4402", "Herma 4403", "Herma 4404", "Herma 4421", "Herma 4422", "Herma 4423", "Herma 4424", "Herma 4230", "Herma 8637"], similar: ["Label Planet LP1/210"] },
    { brand: "Herma", code: "4464", kind: "Address", name: "Premium Etiketten 70 x 37 mm", shape: "rectangle", w: 70, h: 37.125, cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["Herma 4615", "Herma 4390", "Herma 4406", "Herma 4407", "Herma 4408", "Herma 4409", "Herma 4466", "Herma 4467", "Herma 4468", "Herma 4469", "Herma 8644"], similar: ["Avery Zweckform 3474", "Label Planet LP24/70"] }
];

/** Millimetres to inches, to five places, as for The Shipping Store's layouts. */
const inches = (mm: number) => Number((mm / MM_PER_INCH).toFixed(5));

const BRAND_IDS: Record<Layout["brand"], string> = { Avery: "avery", "Avery Zweckform": "zweckform", Herma: "herma" };

function toPreset(layout: Layout): SheetPreset {
    const sheet: Omit<SheetSpec, "presetId" | "name"> = {
        pageWidth: 210 / MM_PER_INCH,
        pageHeight: 297 / MM_PER_INCH,
        labelWidth: inches(layout.w),
        labelHeight: inches(layout.h),
        columns: layout.cols,
        rows: layout.rows,
        marginTop: inches(layout.top),
        marginLeft: inches(layout.left),
        gapX: inches(layout.gapX),
        gapY: inches(layout.gapY),
        shape: layout.shape,
        cornerRadius: layout.shape === "rounded" ? inches(1.5) : 0
    };

    return {
        id: `${BRAND_IDS[layout.brand]}-${layout.code.toLowerCase()}`,
        brand: layout.brand,
        code: layout.code,
        kind: layout.kind,
        compatible: layout.compatible ?? [],
        equivalents: layout.equivalents,
        similar: layout.similar,
        sheet,
        keywords: layout.name,
        note: layout.source ? `Margins from ${layout.source}, which cuts the same size; run a test sheet.` : undefined
    };
}

export const A4_PRESETS: readonly SheetPreset[] = LAYOUTS.map(toPreset);
