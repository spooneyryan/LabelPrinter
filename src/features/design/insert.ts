import {
    createBarcodeElement,
    createImageElement,
    createQrElement,
    createShapeElement,
    createTextElement,
    STARTER_TEMPLATE
} from "../../model/defaults.ts";
import { fieldLines, suggestAddressBlock } from "../../model/merge.ts";
import type { LabelDesign, LabelElement, SheetSpec } from "../../model/types.ts";

/*
 * Where a new element lands: sized to the label it is going onto, inside its safe area, so a
 * barcode dropped on a return-address label is not bigger than the label.
 */

export type InsertKind = "text" | "address" | "fields" | "image" | "qr" | "barcode" | "rectangle" | "ellipse" | "line";

const round = (value: number) => Number(value.toFixed(4));

function safeArea(sheet: SheetSpec, design: LabelDesign) {
    const margin = Math.min(design.safeMargin, sheet.labelWidth / 4, sheet.labelHeight / 4);
    return {
        x: margin,
        y: margin,
        width: Math.max(0.05, sheet.labelWidth - 2 * margin),
        height: Math.max(0.05, sheet.labelHeight - 2 * margin)
    };
}

/** A box of the given size centred on a point, kept inside the safe area where it fits. */
function boxAt(area: ReturnType<typeof safeArea>, width: number, height: number, cx: number, cy: number) {
    const x = Math.min(Math.max(cx - width / 2, area.x), area.x + Math.max(0, area.width - width));
    const y = Math.min(Math.max(cy - height / 2, area.y), area.y + Math.max(0, area.height - height));
    return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function createElement(
    kind: InsertKind,
    sheet: SheetSpec,
    design: LabelDesign,
    fields: readonly string[],
    /** Where to centre it, in label inches; the label's centre when omitted. */
    at?: { x: number; y: number },
    template?: string
): LabelElement {
    const area = safeArea(sheet, design);
    const cx = at?.x ?? area.x + area.width / 2;
    const cy = at?.y ?? area.y + area.height / 2;
    const short = Math.min(area.width, area.height);

    switch (kind) {
        case "text": {
            const height = Math.min(area.height, Math.max(0.25, area.height * 0.3));
            return createTextElement(boxAt(area, area.width * 0.7, height, cx, cy), template ?? "Text");
        }
        case "address":
            return createTextElement(
                { x: area.x, y: area.y, width: round(area.width), height: round(area.height) },
                template ?? (fields.length > 0 ? suggestAddressBlock(fields) : STARTER_TEMPLATE),
                "Address"
            );
        case "fields":
            // Every column, one per line, filling the safe area: a starting point to cut down.
            return createTextElement(
                { x: area.x, y: area.y, width: round(area.width), height: round(area.height) },
                template ?? fieldLines(fields),
                "Fields"
            );
        case "image":
            return createImageElement(boxAt(area, short * 0.8, short * 0.8, at?.x ?? area.x + short * 0.4, cy));
        case "qr":
            return createQrElement(boxAt(area, short, short, at?.x ?? area.x + area.width - short / 2, cy), template);
        case "barcode": {
            const height = Math.min(area.height, Math.max(0.35, Math.min(0.6, area.height * 0.45)));
            return createBarcodeElement(boxAt(area, area.width * 0.8, height, cx, at?.y ?? area.y + area.height - height / 2), template);
        }
        case "rectangle":
        case "ellipse":
            return createShapeElement({ x: area.x, y: area.y, width: round(area.width), height: round(area.height) }, kind);
        case "line":
            return createShapeElement(boxAt(area, area.width, 0.04, cx, cy), "line");
    }
}
