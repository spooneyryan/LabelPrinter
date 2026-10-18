import { DEFAULT_PRESET_ID, findPreset, sheetFromPreset } from "./presets.ts";
import type {
    BarcodeElement,
    Calibration,
    ElementType,
    ImageElement,
    LabelDesign,
    LabelElement,
    LabelTemplate,
    PrintOptions,
    QrElement,
    Session,
    ShapeElement,
    SheetSpec,
    TextElement
} from "./types.ts";

/*
 * The starting points: a new session, and each kind of element as it is first dropped on a label.
 */

let idCounter = 0;

/** A short id unique within the session; ids only have to tell a design's elements apart. */
export function newId(prefix = "el"): string {
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export const DEFAULT_FONT = "Arial";

export function defaultSheet(): SheetSpec {
    const preset = findPreset(DEFAULT_PRESET_ID);
    if (!preset) {
        throw new Error(`The default preset ${DEFAULT_PRESET_ID} is missing.`);
    }

    return sheetFromPreset(preset);
}

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

const base = (type: ElementType, name: string, box: Box) => ({
    id: newId(type),
    name,
    ...box,
    rotation: 0 as const,
    hidden: false,
    locked: false
});

export function createTextElement(box: Box, template = "Text", name = "Text"): TextElement {
    return {
        ...base("text", name, box),
        type: "text",
        template,
        fontFamily: DEFAULT_FONT,
        fontSize: 11,
        bold: false,
        italic: false,
        underline: false,
        color: "#000000",
        align: "left",
        verticalAlign: "middle",
        lineHeight: 1.15,
        textCase: "none",
        wrap: true,
        shrinkToFit: true,
        minFontSize: 6,
        removeBlankLines: true
    };
}

export function createImageElement(box: Box, src = ""): ImageElement {
    return { ...base("image", "Image", box), type: "image", src, fit: "contain", opacity: 1 };
}

export function createQrElement(box: Box, template = "{{#}}"): QrElement {
    return { ...base("qr", "QR code", box), type: "qr", template, errorLevel: "M", color: "#000000" };
}

export function createBarcodeElement(box: Box, template = "{{#}}"): BarcodeElement {
    return {
        ...base("barcode", "Barcode", box),
        type: "barcode",
        template,
        color: "#000000",
        showText: true,
        textSize: 8
    };
}

export function createShapeElement(box: Box, shape: ShapeElement["shape"] = "rectangle"): ShapeElement {
    const names = { rectangle: "Rectangle", ellipse: "Ellipse", line: "Line" } as const;
    return {
        ...base("shape", names[shape], box),
        type: "shape",
        shape,
        stroke: "#000000",
        strokeWidth: shape === "line" ? 1 : 0.75,
        fill: "",
        cornerRadius: 0
    };
}

/**
 * A copy of an element with a fresh id, nudged so it does not sit exactly on the original. A copy
 * of a copy is still "Logo copy", not "Logo copy copy".
 */
export function duplicateElement(element: LabelElement, offset = 0.0625): LabelElement {
    return {
        ...element,
        id: newId(element.type),
        name: `${element.name.replace(/ copy$/, "")} copy`,
        x: element.x + offset,
        y: element.y + offset
    };
}

/** The design a new session starts with: an address block filling the label's safe area. */
export function defaultDesign(sheet: SheetSpec, template: string): LabelDesign {
    const safeMargin = defaultSafeMargin(sheet);
    return {
        safeMargin,
        elements: [
            createTextElement(
                {
                    x: safeMargin,
                    y: safeMargin,
                    width: Math.max(0.1, sheet.labelWidth - 2 * safeMargin),
                    height: Math.max(0.1, sheet.labelHeight - 2 * safeMargin)
                },
                template,
                "Address"
            )
        ]
    };
}

/** A sixteenth of an inch on small labels, an eighth on large ones. */
export function defaultSafeMargin(sheet: Pick<SheetSpec, "labelWidth" | "labelHeight">): number {
    return Math.min(sheet.labelWidth, sheet.labelHeight) >= 2 ? 0.125 : 0.0625;
}

export const STARTER_TEMPLATE = "{{First Name}} {{Last Name}}\n{{Address}}\n{{City}}, {{State}} {{ZIP}}";

export function defaultTemplate(): LabelTemplate {
    const sheet = defaultSheet();
    return { version: 1, name: "Untitled labels", sheet, design: defaultDesign(sheet, STARTER_TEMPLATE) };
}

export function defaultPrintOptions(): PrintOptions {
    return {
        copies: 1,
        collate: false,
        fillOrder: "across",
        usedSlots: [],
        sheetsWithoutData: 1,
        outlines: false
    };
}

export function defaultCalibration(): Calibration {
    return { offsetX: 0, offsetY: 0, scaleX: 100, scaleY: 100 };
}

/** Whether a calibration moves or stretches anything. */
export function isCalibrated(calibration: Calibration): boolean {
    return calibration.offsetX !== 0 || calibration.offsetY !== 0 || calibration.scaleX !== 100 || calibration.scaleY !== 100;
}

export function defaultSession(): Session {
    return { version: 1, template: defaultTemplate(), data: null, excluded: [], print: defaultPrintOptions() };
}
