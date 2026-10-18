import { shapeCategory, type ShapeCategory } from "./sheet.ts";
import { TSS_PRESETS } from "./presets-tss.ts";
import type { SheetSpec } from "./types.ts";
import { formatFriendlyInches, parseLength } from "./units.ts";

/*
 * Label stock for US Letter (8½ × 11) sheets, measured from the manufacturers' published
 * templates. The numbers are the sheet's own: the first label's offset from the page corner and
 * the gaps between neighbours (template specs quote "pitch", which is label size plus gap).
 *
 * "Compatible" lists the other product codes cut to the same layout — the same die, a different
 * finish — so searching for any of them finds the sheet.
 *
 * Two makers so far: Avery, below, and The Shipping Store, in presets-tss.ts.
 */

/** What a sheet is for (Avery sells by use) or, failing that, its shape (The Shipping Store). */
export type PresetKind =
    | "Address"
    | "Shipping"
    | "Return address"
    | "File folder"
    | "Business card"
    | "Name badge"
    | "Full and half sheet"
    | ShapeCategory;

export interface SheetPreset {
    id: string;
    brand: string;
    /** The maker's template or product code: "5160", "S001". */
    code: string;
    kind: PresetKind;
    compatible: readonly string[];
    sheet: Omit<SheetSpec, "presetId" | "name">;
    /** More words to find it by: the maker's own product name. */
    keywords?: string;
    /** Something to know before using it, shown with the preset. */
    note?: string;
}

const LETTER = { pageWidth: 8.5, pageHeight: 11 } as const;

/** The usual die-cut corner: just enough rounding to clear the cut. */
const ROUNDED = { shape: "rounded", cornerRadius: 0.0625 } as const;
const SQUARE = { shape: "rectangle", cornerRadius: 0 } as const;

const AVERY_PRESETS: readonly SheetPreset[] = [
    {
        id: "avery-5160",
        brand: "Avery",
        code: "5160",
        kind: "Address",
        compatible: ["5260", "5960", "8160", "8460", "18160"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 2.625,
            labelHeight: 1,
            columns: 3,
            rows: 10,
            marginTop: 0.5,
            marginLeft: 0.1875,
            gapX: 0.125,
            gapY: 0
        }
    },
    {
        id: "avery-5161",
        brand: "Avery",
        code: "5161",
        kind: "Address",
        compatible: ["5261", "5961", "8161"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 4,
            labelHeight: 1,
            columns: 2,
            rows: 10,
            marginTop: 0.5,
            marginLeft: 0.15625,
            gapX: 0.1875,
            gapY: 0
        }
    },
    {
        id: "avery-5162",
        brand: "Avery",
        code: "5162",
        kind: "Address",
        compatible: ["5262", "8162"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 4,
            labelHeight: 4 / 3,
            columns: 2,
            rows: 7,
            marginTop: 5 / 6,
            marginLeft: 0.15625,
            gapX: 0.1875,
            gapY: 0
        }
    },
    {
        id: "avery-5159",
        brand: "Avery",
        code: "5159",
        kind: "Address",
        compatible: [],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 4,
            labelHeight: 1.5,
            columns: 2,
            rows: 7,
            marginTop: 0.25,
            marginLeft: 0.15625,
            gapX: 0.1875,
            gapY: 0
        }
    },
    {
        id: "avery-5163",
        brand: "Avery",
        code: "5163",
        kind: "Shipping",
        compatible: ["5263", "5963", "8163", "8463", "18163"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 4,
            labelHeight: 2,
            columns: 2,
            rows: 5,
            marginTop: 0.5,
            marginLeft: 0.15625,
            gapX: 0.1875,
            gapY: 0
        }
    },
    {
        id: "avery-5164",
        brand: "Avery",
        code: "5164",
        kind: "Shipping",
        compatible: ["5264", "8164"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 4,
            labelHeight: 10 / 3,
            columns: 2,
            rows: 3,
            marginTop: 0.5,
            marginLeft: 0.15625,
            gapX: 0.1875,
            gapY: 0
        }
    },
    {
        id: "avery-5168",
        brand: "Avery",
        code: "5168",
        kind: "Shipping",
        compatible: ["8168"],
        sheet: {
            ...LETTER,
            ...SQUARE,
            labelWidth: 3.5,
            labelHeight: 5,
            columns: 2,
            rows: 2,
            marginTop: 0.5,
            marginLeft: 0.5,
            gapX: 0.5,
            gapY: 0
        }
    },
    {
        id: "avery-5167",
        brand: "Avery",
        code: "5167",
        kind: "Return address",
        compatible: ["5267", "8167"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 1.75,
            labelHeight: 0.5,
            columns: 4,
            rows: 20,
            marginTop: 0.5,
            marginLeft: 0.28125,
            gapX: 0.3125,
            gapY: 0
        }
    },
    {
        id: "avery-5195",
        brand: "Avery",
        code: "5195",
        kind: "Return address",
        compatible: ["8195"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 1.75,
            labelHeight: 2 / 3,
            columns: 4,
            rows: 15,
            marginTop: 0.5,
            marginLeft: 0.28125,
            gapX: 0.3125,
            gapY: 0
        }
    },
    {
        id: "avery-5366",
        brand: "Avery",
        code: "5366",
        kind: "File folder",
        compatible: ["5266", "8366"],
        sheet: {
            ...LETTER,
            ...ROUNDED,
            labelWidth: 3.4375,
            labelHeight: 2 / 3,
            columns: 2,
            rows: 15,
            marginTop: 0.5,
            marginLeft: 0.53125,
            gapX: 0.5625,
            gapY: 0
        }
    },
    {
        id: "avery-5371",
        brand: "Avery",
        code: "5371",
        kind: "Business card",
        compatible: ["8371"],
        sheet: {
            ...LETTER,
            ...SQUARE,
            labelWidth: 3.5,
            labelHeight: 2,
            columns: 2,
            rows: 5,
            marginTop: 0.5,
            marginLeft: 0.75,
            gapX: 0,
            gapY: 0
        }
    },
    {
        id: "avery-5395",
        brand: "Avery",
        code: "5395",
        kind: "Name badge",
        compatible: ["8395"],
        sheet: {
            ...LETTER,
            shape: "rounded",
            cornerRadius: 0.1875,
            labelWidth: 3.375,
            labelHeight: 7 / 3,
            columns: 2,
            rows: 4,
            marginTop: 0.59,
            marginLeft: 0.6875,
            gapX: 0.375,
            gapY: 0.5 - 1 / 3
        }
    },
    {
        id: "avery-5126",
        brand: "Avery",
        code: "5126",
        kind: "Full and half sheet",
        compatible: ["8126"],
        sheet: {
            ...LETTER,
            ...SQUARE,
            labelWidth: 8.5,
            labelHeight: 5.5,
            columns: 1,
            rows: 2,
            marginTop: 0,
            marginLeft: 0,
            gapX: 0,
            gapY: 0
        }
    },
    {
        id: "avery-5165",
        brand: "Avery",
        code: "5165",
        kind: "Full and half sheet",
        compatible: ["8165"],
        sheet: {
            ...LETTER,
            ...SQUARE,
            labelWidth: 8.5,
            labelHeight: 11,
            columns: 1,
            rows: 1,
            marginTop: 0,
            marginLeft: 0,
            gapX: 0,
            gapY: 0
        }
    }
];

/** Every preset: Avery first, then The Shipping Store, each in code order. */
export const SHEET_PRESETS: readonly SheetPreset[] = [...AVERY_PRESETS, ...TSS_PRESETS];

/** The makers with presets, in list order. */
export const PRESET_BRANDS: readonly string[] = [...new Set(SHEET_PRESETS.map((preset) => preset.brand))];

export const DEFAULT_PRESET_ID = "avery-5160";

export function findPreset(id: string): SheetPreset | undefined {
    return SHEET_PRESETS.find((preset) => preset.id === id);
}

/**
 * Reads a search for a label size — `1x1`, `1" x 1"`, `2 5/8 × 1`, `66.7mm x 25.4mm` — into its
 * two sides in inches, or `null` when the text is not a size.
 */
export function parseSizeQuery(text: string): { a: number; b: number } | null {
    const sides = text.trim().split(/\s*[x×*]\s*/i);
    if (sides.length !== 2) {
        return null;
    }

    const a = parseLength(sides[0]);
    const b = parseLength(sides[1]);
    return a !== null && b !== null && a > 0 && b > 0 ? { a, b } : null;
}

/**
 * How far a label may be from the size searched for and still match. Makers name labels by their
 * nominal size: The Shipping Store's "2 5/8 × 1" (R007) is cut at 2.59″, and its "2½″ circle"
 * (C005) at 2.45″.
 */
const SIZE_TOLERANCE = 0.06;

/**
 * Whether a preset matches a search: a size query matches labels of that size either way round;
 * anything else matches the maker, code, compatible codes, kind, summary or product name.
 */
export function matchesSearch(preset: SheetPreset, search: string): boolean {
    const text = search.trim().toLowerCase();
    if (text === "") {
        return true;
    }

    const size = parseSizeQuery(text);
    if (size) {
        const { labelWidth: w, labelHeight: h } = preset.sheet;
        const near = (x: number, y: number) => Math.abs(x - y) <= SIZE_TOLERANCE;
        return (near(w, size.a) && near(h, size.b)) || (near(w, size.b) && near(h, size.a));
    }

    return [presetTitle(preset), preset.code, preset.kind, ...preset.compatible, presetSummary(preset), preset.keywords ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(text);
}

/** The shape a preset's labels are, for filtering: rectangle, square, round or oval. */
export function presetShape(preset: SheetPreset): ShapeCategory {
    return shapeCategory(preset.sheet);
}

/** `"Avery 5160"`. */
export function presetTitle(preset: SheetPreset): string {
    return `${preset.brand} ${preset.code}`;
}

/** `"Address · 1″ × 2⅝″ · 30 per sheet"` — height first, as the packaging writes it. */
export function presetSummary(preset: SheetPreset): string {
    const { labelWidth, labelHeight, columns, rows } = preset.sheet;
    const count = columns * rows;
    return `${preset.kind} · ${formatFriendlyInches(labelHeight)} × ${formatFriendlyInches(labelWidth)} · ${count} per sheet`;
}

/** The sheet a preset describes, named after it. */
export function sheetFromPreset(preset: SheetPreset): SheetSpec {
    return { presetId: preset.id, name: presetTitle(preset), ...preset.sheet };
}
