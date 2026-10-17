import type { ReactNode } from "react";
import { cellOrigin } from "../../model/sheet.ts";
import type { SheetSpec } from "../../model/types.ts";
import { formatDecimal, formatFriendlyInches, MM_PER_INCH, type LengthUnit } from "../../model/units.ts";

/*
 * The sheet drawn to scale, twice: the whole page, to recognise the stock, and its top-left corner
 * enlarged, with each measurement marked by a letter. Labels are small next to a page, so marks
 * drawn on the whole page would be specks; the corner shows what "top margin" or "gap across"
 * means at a size you can compare with the ruler in your hand.
 */

export const describeMeasure = (inches: number, unit: LengthUnit) =>
    unit === "mm" ? `${formatDecimal(inches * MM_PER_INCH, 1)} mm` : formatFriendlyInches(inches);

function labelShape(sheet: SheetSpec, x: number, y: number, key: string, strokeWidth: number): ReactNode {
    if (sheet.shape === "ellipse") {
        return (
            <ellipse
                key={key}
                className="lp-diagram-label"
                cx={x + sheet.labelWidth / 2}
                cy={y + sheet.labelHeight / 2}
                rx={sheet.labelWidth / 2}
                ry={sheet.labelHeight / 2}
                strokeWidth={strokeWidth}
            />
        );
    }

    return (
        <rect
            key={key}
            className="lp-diagram-label"
            x={x}
            y={y}
            width={sheet.labelWidth}
            height={sheet.labelHeight}
            rx={sheet.shape === "rounded" ? sheet.cornerRadius : 0}
            strokeWidth={strokeWidth}
        />
    );
}

function allLabels(sheet: SheetSpec, strokeWidth: number): ReactNode[] {
    const shapes: ReactNode[] = [];
    for (let row = 0; row < sheet.rows; row++) {
        for (let column = 0; column < sheet.columns; column++) {
            const { x, y } = cellOrigin(sheet, column, row);
            shapes.push(labelShape(sheet, x, y, `${column}-${row}`, strokeWidth));
        }
    }

    return shapes;
}

/** The whole page, with its size along two edges. */
export function SheetDiagram({ sheet, unit }: { sheet: SheetSpec; unit: LengthUnit }) {
    const pad = 0.9;
    const text = 0.42;

    return (
        <svg
            className="lp-diagram"
            viewBox={`${-pad} ${-pad} ${sheet.pageWidth + pad * 2} ${sheet.pageHeight + pad * 2}`}
            role="img"
            aria-label={`${sheet.name}: ${sheet.columns} by ${sheet.rows} labels on a ${describeMeasure(sheet.pageWidth, unit)} by ${describeMeasure(sheet.pageHeight, unit)} page`}
        >
            <rect className="lp-diagram-shadow" x={0.08} y={0.1} width={sheet.pageWidth} height={sheet.pageHeight} />
            <rect className="lp-diagram-page" x={0} y={0} width={sheet.pageWidth} height={sheet.pageHeight} strokeWidth={0.03} />
            {allLabels(sheet, 0.025)}
            <text className="lp-diagram-dimension-text" x={sheet.pageWidth / 2} y={-0.3} fontSize={text} textAnchor="middle">
                {describeMeasure(sheet.pageWidth, unit)}
            </text>
            <text
                className="lp-diagram-dimension-text"
                x={sheet.pageWidth + 0.3}
                y={sheet.pageHeight / 2}
                fontSize={text}
                textAnchor="middle"
                transform={`rotate(90 ${sheet.pageWidth + 0.3} ${sheet.pageHeight / 2})`}
            >
                {describeMeasure(sheet.pageHeight, unit)}
            </text>
        </svg>
    );
}

export interface Measure {
    letter: string;
    name: string;
    value: number;
}

/** The measurements the corner detail marks, in the order of their letters. */
export function cornerMeasures(sheet: SheetSpec): Measure[] {
    const measures: Measure[] = [
        { letter: "A", name: "Top margin", value: sheet.marginTop },
        { letter: "B", name: "Left margin", value: sheet.marginLeft },
        { letter: "C", name: "Label width", value: sheet.labelWidth },
        { letter: "D", name: "Label height", value: sheet.labelHeight }
    ];

    if (sheet.columns > 1) {
        measures.push({ letter: "E", name: "Gap across", value: sheet.gapX });
    }

    if (sheet.rows > 1) {
        measures.push({ letter: "F", name: "Gap down", value: sheet.gapY });
    }

    return measures;
}

/** The page's top-left corner, enlarged: the first labels and every measurement, lettered. */
export function CornerDetail({ sheet }: { sheet: SheetSpec }) {
    // The first label, its gaps, and a sliver of the next label each way: enough to show every
    // measurement while keeping the first label large.
    const width = Math.min(
        sheet.pageWidth,
        sheet.marginLeft + sheet.labelWidth + (sheet.columns > 1 ? sheet.gapX + Math.min(0.5, sheet.labelWidth * 0.3) : 0.15)
    );
    const height = Math.min(
        sheet.pageHeight,
        sheet.marginTop + sheet.labelHeight + (sheet.rows > 1 ? sheet.gapY + Math.min(0.5, sheet.labelHeight * 0.3) : 0.15)
    );

    const extent = Math.max(width, height);
    const pad = extent * 0.06;
    const stroke = extent * 0.004;
    const tag = extent * 0.045;
    const tick = extent * 0.012;

    const first = cellOrigin(sheet, 0, 0);
    const right = first.x + sheet.labelWidth;
    const bottom = first.y + sheet.labelHeight;
    const next = cellOrigin(sheet, 1, 1);

    const marks: { letter: string; x1: number; y1: number; x2: number; y2: number }[] = [
        { letter: "A", x1: first.x + sheet.labelWidth * 0.5, y1: 0, x2: first.x + sheet.labelWidth * 0.5, y2: first.y },
        { letter: "B", x1: 0, y1: first.y + sheet.labelHeight * 0.5, x2: first.x, y2: first.y + sheet.labelHeight * 0.5 },
        { letter: "C", x1: first.x, y1: first.y + sheet.labelHeight * 0.25, x2: right, y2: first.y + sheet.labelHeight * 0.25 },
        { letter: "D", x1: first.x + sheet.labelWidth * 0.2, y1: first.y, x2: first.x + sheet.labelWidth * 0.2, y2: bottom }
    ];

    if (sheet.columns > 1) {
        marks.push({ letter: "E", x1: right, y1: first.y + sheet.labelHeight * 0.75, x2: next.x, y2: first.y + sheet.labelHeight * 0.75 });
    }

    if (sheet.rows > 1) {
        marks.push({ letter: "F", x1: first.x + sheet.labelWidth * 0.75, y1: bottom, x2: first.x + sheet.labelWidth * 0.75, y2: next.y });
    }

    const labels: ReactNode[] = [];
    for (let row = 0; row < Math.min(3, sheet.rows); row++) {
        for (let column = 0; column < Math.min(3, sheet.columns); column++) {
            const { x, y } = cellOrigin(sheet, column, row);
            labels.push(labelShape(sheet, x, y, `${column}-${row}`, stroke));
        }
    }

    return (
        <svg
            className="lp-diagram"
            viewBox={`${-pad} ${-pad} ${width + pad} ${height + pad}`}
            role="img"
            aria-label="The top-left corner of the sheet, enlarged, with the measurements A to F marked"
        >
            <defs>
                <clipPath id="lp-corner-clip">
                    <rect x={0} y={0} width={width} height={height} />
                </clipPath>
            </defs>
            <rect className="lp-diagram-page" x={0} y={0} width={width + pad} height={height + pad} strokeWidth={0} />
            <g clipPath="url(#lp-corner-clip)">{labels}</g>
            {/* The page's own top and left edges. */}
            <path className="lp-diagram-edge" d={`M0 ${height}V0H${width}`} strokeWidth={stroke * 2} />

            {marks.map((mark) => {
                const horizontal = mark.y1 === mark.y2;
                const length = horizontal ? Math.abs(mark.x2 - mark.x1) : Math.abs(mark.y2 - mark.y1);
                const midX = (mark.x1 + mark.x2) / 2;
                const midY = (mark.y1 + mark.y2) / 2;
                return (
                    <g key={mark.letter}>
                        {length > extent * 0.002 ? (
                            <>
                                <line className="lp-diagram-dimension" x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} strokeWidth={stroke} />
                                {horizontal ? (
                                    <>
                                        <line className="lp-diagram-dimension" x1={mark.x1} y1={mark.y1 - tick} x2={mark.x1} y2={mark.y1 + tick} strokeWidth={stroke} />
                                        <line className="lp-diagram-dimension" x1={mark.x2} y1={mark.y2 - tick} x2={mark.x2} y2={mark.y2 + tick} strokeWidth={stroke} />
                                    </>
                                ) : (
                                    <>
                                        <line className="lp-diagram-dimension" x1={mark.x1 - tick} y1={mark.y1} x2={mark.x1 + tick} y2={mark.y1} strokeWidth={stroke} />
                                        <line className="lp-diagram-dimension" x1={mark.x2 - tick} y1={mark.y2} x2={mark.x2 + tick} y2={mark.y2} strokeWidth={stroke} />
                                    </>
                                )}
                            </>
                        ) : null}
                        <circle className="lp-diagram-tag" cx={midX} cy={midY} r={tag * 0.62} strokeWidth={stroke} />
                        <text className="lp-diagram-tag-text" x={midX} y={midY + tag * 0.33} fontSize={tag} textAnchor="middle">
                            {mark.letter}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/** The legend for the corner detail's letters, with the current values. */
export function MeasureLegend({ sheet, unit }: { sheet: SheetSpec; unit: LengthUnit }) {
    return (
        <dl className="lp-legend">
            {cornerMeasures(sheet).map((measure) => (
                <div key={measure.letter} className="lp-legend-row">
                    <dt>
                        <span className="lp-legend-tag" aria-hidden="true">
                            {measure.letter}
                        </span>
                        {measure.name}
                    </dt>
                    <dd>{describeMeasure(measure.value, unit)}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A small picture of a sheet for the preset list. */
export function SheetThumb({ sheet }: { sheet: Omit<SheetSpec, "presetId" | "name"> }) {
    const full: SheetSpec = { ...sheet, presetId: "", name: "", cornerRadius: sheet.shape === "rounded" ? 0.1 : 0 };
    return (
        <svg className="lp-preset-thumb" viewBox={`0 0 ${sheet.pageWidth} ${sheet.pageHeight}`} aria-hidden="true">
            <rect className="lp-diagram-page" x={0} y={0} width={sheet.pageWidth} height={sheet.pageHeight} strokeWidth={0.12} />
            {allLabels(full, 0.1)}
        </svg>
    );
}
