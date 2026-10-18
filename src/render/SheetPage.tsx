import { memo, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MergeContext } from "../model/merge.ts";
import type { PlacedLabel } from "../model/paginate.ts";
import { cellOrigin, labelsPerSheet, slotCell, testInset, trailingMargins } from "../model/sheet.ts";
import type { Calibration, FillOrder, LabelDesign, SheetSpec } from "../model/types.ts";
import { CSS_PX_PER_INCH, formatDecimal, formatFriendlyInches, MM_PER_INCH } from "../model/units.ts";
import { ElementVisual } from "./ElementVisual.tsx";

/*
 * A page of labels, drawn at any scale. The print root draws pages at CSS's 96 px to the inch,
 * which the browser prints at exactly an inch; the preview draws the same pages smaller. Every
 * label clips its content to its own outline, so nothing set too big can print onto its neighbour.
 */

export function labelRadius(sheet: SheetSpec, ppi: number): string | number {
    if (sheet.shape === "ellipse") {
        return "50%";
    }

    return sheet.shape === "rounded" ? sheet.cornerRadius * ppi : 0;
}

/** Every visible element of a design, positioned and drawn for one record. */
export const LabelContent = memo(function LabelContent({
    design,
    context,
    ppi
}: {
    design: LabelDesign;
    context: MergeContext;
    ppi: number;
}) {
    return (
        <>
            {design.elements
                .filter((element) => !element.hidden)
                .map((element) => (
                    <div
                        key={element.id}
                        className="lp-element-static"
                        style={{
                            left: element.x * ppi,
                            top: element.y * ppi,
                            width: element.width * ppi,
                            height: element.height * ppi
                        }}
                    >
                        <ElementVisual element={element} context={context} ppi={ppi} />
                    </div>
                ))}
        </>
    );
});

export interface SheetPageProps {
    sheet: SheetSpec;
    design: LabelDesign;
    labels: readonly PlacedLabel[];
    contextFor: (label: PlacedLabel) => MergeContext;
    ppi: number;
    fillOrder: FillOrder;
    outlines: boolean;
    /**
     * For the preview: draw every position, the used ones hatched and the empty ones dashed, so
     * the page reads as the sheet it will be printed on.
     */
    usedSlots?: ReadonlySet<number> | null;
    /** For printing: the printer's correction. */
    calibration?: Calibration | null;
}

export function calibrationTransform(calibration: Calibration | null | undefined, ppi: number): string | undefined {
    if (!calibration) {
        return undefined;
    }

    const { offsetX, offsetY, scaleX, scaleY } = calibration;
    if (offsetX === 0 && offsetY === 0 && scaleX === 100 && scaleY === 100) {
        return undefined;
    }

    return `translate(${offsetX * ppi}px, ${offsetY * ppi}px) scale(${scaleX / 100}, ${scaleY / 100})`;
}

export function SheetPage({ sheet, design, labels, contextFor, ppi, fillOrder, outlines, usedSlots, calibration }: SheetPageProps) {
    const radius = labelRadius(sheet, ppi);
    const filled = new Set(labels.map((label) => label.slot));

    const slotStyle = (slot: number): CSSProperties => {
        const { column, row } = slotCell(sheet, slot, fillOrder);
        const { x, y } = cellOrigin(sheet, column, row);
        return {
            left: x * ppi,
            top: y * ppi,
            width: sheet.labelWidth * ppi,
            height: sheet.labelHeight * ppi,
            borderRadius: radius
        };
    };

    const emptySlots =
        usedSlots === undefined || usedSlots === null
            ? []
            : Array.from({ length: labelsPerSheet(sheet) }, (_, slot) => slot).filter((slot) => !filled.has(slot));

    return (
        <div className="lp-page" style={{ width: sheet.pageWidth * ppi, height: sheet.pageHeight * ppi }}>
            <div className="lp-page-content" style={{ transform: calibrationTransform(calibration, ppi) }}>
                {emptySlots.map((slot) => (
                    <div
                        key={`empty-${slot}`}
                        className={usedSlots?.has(slot) ? "lp-sheet-label lp-sheet-label-used" : "lp-sheet-label lp-sheet-label-empty"}
                        style={slotStyle(slot)}
                    />
                ))}
                {labels.map((label) => (
                    <div
                        key={label.slot}
                        className={outlines ? "lp-sheet-label lp-sheet-label-outline" : "lp-sheet-label"}
                        style={slotStyle(label.slot)}
                    >
                        <LabelContent design={design} context={contextFor(label)} ppi={ppi} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * The test sheet: a numbered box drawn just inside every label (see `testInset`). Printed on the
 * label stock — or on plain paper held against a sheet of it in front of a window — every box
 * should sit inside its label with the same gap all round. A box touching or crossing an edge
 * means a measurement (or the printer) is off; which gap is wider says which way, and boxes that
 * drift further off down or across the page point at a gap or pitch rather than a margin.
 *
 * The boxes follow the label's shape, rounded corners and ovals included, so the gap stays even
 * the whole way round. A line of explanation goes in the top or bottom margin when there is room.
 */
export function TestPage({ sheet, ppi, calibration }: { sheet: SheetSpec; ppi: number; calibration?: Calibration | null }) {
    const inset = testInset(sheet);
    const radius =
        sheet.shape === "ellipse" ? "50%" : sheet.shape === "rounded" ? Math.max(0, sheet.cornerRadius - inset) * ppi : 0;
    const numberSize = Math.max(5, Math.min(0.09, (sheet.labelHeight - 2 * inset) * 0.3) * ppi);
    const insetText = `${formatFriendlyInches(inset)} (${formatDecimal(inset * MM_PER_INCH, 1)} mm)`;

    // The caption needs a margin about a third of an inch deep, and sits in the middle of it, away
    // from the edge most printers cannot reach.
    const { bottom } = trailingMargins(sheet);
    const captionTop =
        sheet.marginTop >= 0.3 ? sheet.marginTop / 2 : bottom >= 0.3 ? sheet.pageHeight - bottom / 2 : null;

    return (
        <div className="lp-page" style={{ width: sheet.pageWidth * ppi, height: sheet.pageHeight * ppi }}>
            <div className="lp-page-content" style={{ transform: calibrationTransform(calibration, ppi) }}>
                {captionTop !== null ? (
                    <div
                        className="lp-test-caption"
                        style={{ top: captionTop * ppi, fontSize: 0.1 * ppi, transform: "translateY(-50%)" }}
                    >
                        Test sheet for {sheet.name}: every box is {insetText} inside its label, so each should show an even gap all
                        round.
                    </div>
                ) : null}
                {Array.from({ length: labelsPerSheet(sheet) }, (_, slot) => {
                    const { column, row } = slotCell(sheet, slot, "across");
                    const { x, y } = cellOrigin(sheet, column, row);
                    return (
                        <div
                            key={slot}
                            className="lp-test-box"
                            style={{
                                left: (x + inset) * ppi,
                                top: (y + inset) * ppi,
                                width: Math.max(0, sheet.labelWidth - 2 * inset) * ppi,
                                height: Math.max(0, sheet.labelHeight - 2 * inset) * ppi,
                                borderRadius: radius
                            }}
                        >
                            <span className="lp-test-mark" style={{ fontSize: numberSize }}>
                                {slot + 1}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export interface PrintRootProps {
    sheet: SheetSpec;
    children: ReactNode;
}

/**
 * The pages to print, rendered into a root of their own beside the app. It is hidden on screen
 * and is the only thing shown in print media (see print.css). The @page rule is written for the
 * current stock, with no margin, so the browser cannot move the page under the labels.
 */
export function PrintRoot({ sheet, children }: PrintRootProps) {
    return createPortal(
        <div className="lp-print-root">
            <style>{`@page { size: ${sheet.pageWidth}in ${sheet.pageHeight}in; margin: 0; }`}</style>
            {children}
        </div>,
        document.body
    );
}

export const PRINT_PPI = CSS_PX_PER_INCH;
