import { defaultSafeMargin } from "./defaults.ts";
import type { LabelDesign, SheetSpec } from "./types.ts";

/*
 * Carrying a design over to a different label size. The old safe area — the label inset by its
 * safe margin — is mapped onto the new one, so an address block that filled a 1″ × 2⅝″ label
 * fills a 2″ × 4″ one the same way, edges and all, instead of huddling in its top-left corner.
 * Type scales with the smaller of the two stretches, so text grows no more than the label lets it.
 */

type LabelSize = Pick<SheetSpec, "labelWidth" | "labelHeight">;

const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const roundToHalf = (value: number) => Math.round(value * 2) / 2;

export function labelSizeChanged(from: LabelSize, to: LabelSize): boolean {
    return Math.abs(from.labelWidth - to.labelWidth) > 0.0005 || Math.abs(from.labelHeight - to.labelHeight) > 0.0005;
}

export function fitDesignToLabel(design: LabelDesign, from: LabelSize, to: LabelSize): LabelDesign {
    if (!labelSizeChanged(from, to)) {
        return design;
    }

    // A margin the user never changed follows the new label; one they chose is kept.
    const fromMargin = design.safeMargin;
    const toMargin = Math.abs(fromMargin - defaultSafeMargin(from)) < 1e-6 ? defaultSafeMargin(to) : fromMargin;

    const span = (size: number, margin: number) => Math.max(0.01, size - 2 * margin);
    const sx = span(to.labelWidth, toMargin) / span(from.labelWidth, fromMargin);
    const sy = span(to.labelHeight, toMargin) / span(from.labelHeight, fromMargin);
    const type = Math.min(sx, sy);

    return {
        safeMargin: toMargin,
        elements: design.elements.map((element) => {
            // Codes and pictures keep their proportions — a stretched QR code is still square
            // inside a box that is not — so they scale by the smaller stretch, about their centre.
            const uniform = element.type === "qr" || element.type === "image";
            const width = Math.max(0.02, element.width * (uniform ? type : sx));
            const height = Math.max(0.02, element.height * (uniform ? type : sy));
            const centerX = toMargin + (element.x + element.width / 2 - fromMargin) * sx;
            const centerY = toMargin + (element.y + element.height / 2 - fromMargin) * sy;
            const box = {
                x: round(centerX - width / 2),
                y: round(centerY - height / 2),
                width: round(width),
                height: round(height)
            };

            switch (element.type) {
                case "text":
                    return {
                        ...element,
                        ...box,
                        fontSize: Math.min(300, Math.max(4, roundToHalf(element.fontSize * type))),
                        minFontSize: Math.min(300, Math.max(4, roundToHalf(element.minFontSize * type)))
                    };
                case "barcode":
                    return { ...element, ...box, textSize: Math.min(72, Math.max(4, roundToHalf(element.textSize * type))) };
                default:
                    return { ...element, ...box };
            }
        })
    };
}
