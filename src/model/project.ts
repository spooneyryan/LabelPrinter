import {
    createBarcodeElement,
    createImageElement,
    createQrElement,
    createShapeElement,
    createTextElement,
    defaultPrintOptions,
    defaultSheet,
    newId
} from "./defaults.ts";
import type {
    Calibration,
    DataTable,
    LabelDesign,
    LabelElement,
    LabelTemplate,
    PrintOptions,
    Rotation,
    Session,
    SheetSpec
} from "./types.ts";

/*
 * Reading templates and sessions back in. A template file can come from anywhere — another
 * machine, an older version of this app, a hand edit — so nothing loaded is trusted to have the
 * right shape: every field is read with a type check and a fallback, unknown element types are
 * dropped, and numbers are held to sane ranges. A damaged file loads as much of itself as it can
 * rather than throwing halfway through, and an unusable one is rejected whole.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function num(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
    return Math.round(num(value, fallback, min, max));
}

function str(value: unknown, fallback: string, maxLength = 100_000): string {
    return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
    return options.includes(value as T) ? (value as T) : fallback;
}

/** Colours are kept to the hex forms the pickers write, so nothing else reaches a style attribute. */
function color(value: unknown, fallback: string): string {
    return typeof value === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

/** As {@link color}, where empty means "none". */
function optionalColor(value: unknown, fallback: string): string {
    return value === "" ? "" : color(value, fallback);
}

/** Images must be inline raster or SVG data: a loaded template never makes the page fetch anything. */
function imageSource(value: unknown): string {
    return typeof value === "string" && /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp);base64,[a-z0-9+/=\s]+$/i.test(value)
        ? value
        : "";
}

const MAX_LENGTH = 100;

export function sanitizeSheet(value: unknown): SheetSpec {
    const fallback = defaultSheet();
    if (!isObject(value)) {
        return fallback;
    }

    return {
        presetId: str(value.presetId, "custom", 100),
        name: str(value.name, "Custom sheet", 200),
        pageWidth: num(value.pageWidth, fallback.pageWidth, 1, MAX_LENGTH),
        pageHeight: num(value.pageHeight, fallback.pageHeight, 1, MAX_LENGTH),
        labelWidth: num(value.labelWidth, fallback.labelWidth, 0.05, MAX_LENGTH),
        labelHeight: num(value.labelHeight, fallback.labelHeight, 0.05, MAX_LENGTH),
        columns: int(value.columns, fallback.columns, 1, 100),
        rows: int(value.rows, fallback.rows, 1, 200),
        marginTop: num(value.marginTop, fallback.marginTop, 0, MAX_LENGTH),
        marginLeft: num(value.marginLeft, fallback.marginLeft, 0, MAX_LENGTH),
        gapX: num(value.gapX, fallback.gapX, 0, MAX_LENGTH),
        gapY: num(value.gapY, fallback.gapY, 0, MAX_LENGTH),
        shape: oneOf(value.shape, ["rectangle", "rounded", "ellipse"] as const, fallback.shape),
        cornerRadius: num(value.cornerRadius, fallback.cornerRadius, 0, MAX_LENGTH)
    };
}

function sanitizeElement(value: unknown): LabelElement | null {
    if (!isObject(value)) {
        return null;
    }

    const box = {
        x: num(value.x, 0, -MAX_LENGTH, MAX_LENGTH),
        y: num(value.y, 0, -MAX_LENGTH, MAX_LENGTH),
        width: num(value.width, 1, 0.01, MAX_LENGTH),
        height: num(value.height, 0.5, 0.01, MAX_LENGTH)
    };

    const common = {
        id: str(value.id, "", 100) || newId(),
        rotation: oneOf<Rotation>(value.rotation, [0, 90, 180, 270], 0),
        hidden: bool(value.hidden, false),
        locked: bool(value.locked, false)
    };

    switch (value.type) {
        case "text": {
            const fallback = createTextElement(box);
            return {
                ...fallback,
                ...common,
                name: str(value.name, fallback.name, 200),
                template: str(value.template, ""),
                fontFamily: str(value.fontFamily, fallback.fontFamily, 200),
                fontSize: num(value.fontSize, fallback.fontSize, 1, 400),
                bold: bool(value.bold, false),
                italic: bool(value.italic, false),
                underline: bool(value.underline, false),
                color: color(value.color, fallback.color),
                align: oneOf(value.align, ["left", "center", "right"] as const, fallback.align),
                verticalAlign: oneOf(value.verticalAlign, ["top", "middle", "bottom"] as const, fallback.verticalAlign),
                lineHeight: num(value.lineHeight, fallback.lineHeight, 0.5, 4),
                textCase: oneOf(value.textCase, ["none", "upper", "lower", "title"] as const, "none"),
                wrap: bool(value.wrap, fallback.wrap),
                shrinkToFit: bool(value.shrinkToFit, fallback.shrinkToFit),
                minFontSize: num(value.minFontSize, fallback.minFontSize, 1, 400),
                removeBlankLines: bool(value.removeBlankLines, fallback.removeBlankLines)
            };
        }
        case "image": {
            const fallback = createImageElement(box);
            return {
                ...fallback,
                ...common,
                name: str(value.name, fallback.name, 200),
                src: imageSource(value.src),
                fit: oneOf(value.fit, ["contain", "cover", "fill"] as const, fallback.fit),
                opacity: num(value.opacity, 1, 0, 1)
            };
        }
        case "qr": {
            const fallback = createQrElement(box);
            return {
                ...fallback,
                ...common,
                name: str(value.name, fallback.name, 200),
                template: str(value.template, ""),
                errorLevel: oneOf(value.errorLevel, ["L", "M", "Q", "H"] as const, fallback.errorLevel),
                color: color(value.color, fallback.color)
            };
        }
        case "barcode": {
            const fallback = createBarcodeElement(box);
            return {
                ...fallback,
                ...common,
                name: str(value.name, fallback.name, 200),
                template: str(value.template, ""),
                color: color(value.color, fallback.color),
                showText: bool(value.showText, fallback.showText),
                textSize: num(value.textSize, fallback.textSize, 1, 72)
            };
        }
        case "shape": {
            const shape = oneOf(value.shape, ["rectangle", "ellipse", "line"] as const, "rectangle");
            const fallback = createShapeElement(box, shape);
            return {
                ...fallback,
                ...common,
                name: str(value.name, fallback.name, 200),
                stroke: optionalColor(value.stroke, fallback.stroke),
                strokeWidth: num(value.strokeWidth, fallback.strokeWidth, 0, 72),
                fill: optionalColor(value.fill, fallback.fill),
                cornerRadius: num(value.cornerRadius, 0, 0, MAX_LENGTH)
            };
        }
        default:
            return null;
    }
}

export function sanitizeDesign(value: unknown): LabelDesign {
    const source = isObject(value) ? value : {};
    const elements = Array.isArray(source.elements) ? source.elements : [];
    const seen = new Set<string>();

    return {
        safeMargin: num(source.safeMargin, 0.0625, 0, 2),
        elements: elements
            .map(sanitizeElement)
            .filter((element): element is LabelElement => element !== null)
            // Duplicate ids would make two elements select, drag and delete as one.
            .map((element) => {
                const unique = seen.has(element.id) ? { ...element, id: newId(element.type) } : element;
                seen.add(unique.id);
                return unique;
            })
    };
}

/** Reads a template, or `null` when the value is not one at all. */
export function sanitizeTemplate(value: unknown): LabelTemplate | null {
    if (!isObject(value) || !isObject(value.sheet) || !isObject(value.design)) {
        return null;
    }

    return {
        version: 1,
        name: str(value.name, "Untitled labels", 200),
        sheet: sanitizeSheet(value.sheet),
        design: sanitizeDesign(value.design)
    };
}

export function sanitizeTable(value: unknown): DataTable | null {
    if (!isObject(value) || !Array.isArray(value.fields) || !Array.isArray(value.rows)) {
        return null;
    }

    const fields = value.fields.map((field, index) => (typeof field === "string" ? field : `Column ${index + 1}`));
    const rows = value.rows
        .filter(Array.isArray)
        .map((row: unknown[]) => fields.map((_, index) => (row[index] === undefined || row[index] === null ? "" : String(row[index]))));

    return { source: str(value.source, "Data", 500), fields, rows };
}

export function sanitizePrintOptions(value: unknown): PrintOptions {
    const fallback = defaultPrintOptions();
    if (!isObject(value)) {
        return fallback;
    }

    const usedSlots = Array.isArray(value.usedSlots)
        ? [...new Set(value.usedSlots.filter((slot): slot is number => Number.isInteger(slot) && slot >= 0 && slot < 20_000))]
        : [];

    return {
        copies: int(value.copies, 1, 1, 1000),
        collate: bool(value.collate, false),
        fillOrder: oneOf(value.fillOrder, ["across", "down"] as const, "across"),
        usedSlots,
        sheetsWithoutData: int(value.sheetsWithoutData, 1, 1, 500),
        outlines: bool(value.outlines, false)
    };
}

export function sanitizeCalibration(value: unknown): Calibration {
    const source = isObject(value) ? value : {};
    return {
        offsetX: num(source.offsetX, 0, -2, 2),
        offsetY: num(source.offsetY, 0, -2, 2),
        scaleX: num(source.scaleX, 100, 90, 110),
        scaleY: num(source.scaleY, 100, 90, 110)
    };
}

/** Reads an autosaved session, or `null` when there is none worth restoring. */
export function sanitizeSession(value: unknown): Session | null {
    if (!isObject(value)) {
        return null;
    }

    const template = sanitizeTemplate(value.template);
    if (!template) {
        return null;
    }

    const data = sanitizeTable(value.data);
    const rowCount = data?.rows.length ?? 0;
    const excluded = Array.isArray(value.excluded)
        ? [...new Set(value.excluded.filter((row): row is number => Number.isInteger(row) && row >= 0 && row < rowCount))]
        : [];

    return { version: 1, template, data, excluded, print: sanitizePrintOptions(value.print) };
}
