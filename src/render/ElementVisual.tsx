import { memo, useEffect, useMemo, type CSSProperties } from "react";
import { encodeCode128, QUIET_ZONE } from "../codes/code128.ts";
import { encodeQr, type QrCode } from "../codes/qr.ts";
import { Icon } from "../components/Icon.tsx";
import { mergeLines, mergeText, toTitleCase, type MergeContext } from "../model/merge.ts";
import { layoutText, type TextLayout } from "../model/textLayout.ts";
import type {
    BarcodeElement,
    ImageElement,
    LabelElement,
    QrElement,
    ShapeElement,
    TextCase,
    TextElement
} from "../model/types.ts";
import { POINTS_PER_INCH } from "../model/units.ts";
import { fontStack, measureText, requestFont, useFontsVersion } from "./fonts.ts";

/*
 * How each kind of element draws, filling its box. The designer, the preview and the printed page
 * all draw through here, at different scales: `ppi` is screen pixels per label inch, and every
 * length is inches times that, so one component is right at every zoom.
 *
 * `editing` is the designer's mode: an element with nothing to show (an image not chosen yet, a
 * code whose value is empty) draws a placeholder so it can still be found and grabbed, and text
 * that does not fit is flagged. On paper those cases print nothing rather than a placeholder.
 */

export interface ElementVisualProps {
    element: LabelElement;
    context: MergeContext;
    ppi: number;
    editing?: boolean;
}

export function applyCase(lines: string[], textCase: TextCase): string[] {
    switch (textCase) {
        case "upper":
            return lines.map((line) => line.toLocaleUpperCase());
        case "lower":
            return lines.map((line) => line.toLocaleLowerCase());
        case "title":
            return lines.map(toTitleCase);
        default:
            return lines;
    }
}

/** The merged lines of a text element for one record. */
export function textLines(element: TextElement, context: MergeContext): string[] {
    return applyCase(mergeLines(element.template, context, { removeBlankLines: element.removeBlankLines }), element.textCase);
}

/** The box a text element lays out in, in inches: its own box, turned for 90° and 270°. */
export function textBox(element: LabelElement): { width: number; height: number } {
    const turned = element.rotation === 90 || element.rotation === 270;
    return turned ? { width: element.height, height: element.width } : { width: element.width, height: element.height };
}

/** Lays out a text element for one record — the same call the overflow check makes. */
export function layoutTextElement(element: TextElement, lines: readonly string[]): TextLayout {
    const box = textBox(element);
    return layoutText(
        {
            lines,
            width: box.width,
            height: box.height,
            fontSize: element.fontSize,
            minFontSize: element.minFontSize,
            lineHeight: element.lineHeight,
            wrap: element.wrap,
            shrinkToFit: element.shrinkToFit,
            font: { family: element.fontFamily, bold: element.bold, italic: element.italic }
        },
        measureText
    );
}

function TextVisual({ element, context, ppi, editing }: ElementVisualProps & { element: TextElement }) {
    const fontsVersion = useFontsVersion();
    const { fontFamily: family, bold, italic } = element;
    useEffect(() => requestFont({ family, bold, italic }), [family, bold, italic]);

    const lines = useMemo(() => textLines(element, context), [element, context]);
    // fontsVersion is a dependency on purpose: metrics change when a face finishes loading.
    const layout = useMemo(() => layoutTextElement(element, lines), [element, lines, fontsVersion]);

    const lineHeight = layout.lineHeight * ppi;
    const style: CSSProperties = {
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: layout.overflow
            ? "flex-start"
            : element.verticalAlign === "top"
              ? "flex-start"
              : element.verticalAlign === "bottom"
                ? "flex-end"
                : "center",
        overflow: "hidden",
        color: element.color,
        fontFamily: fontStack(element.fontFamily),
        fontSize: `${(layout.fontSize / POINTS_PER_INCH) * ppi}px`,
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? "italic" : "normal",
        textDecoration: element.underline ? "underline" : "none",
        lineHeight: `${lineHeight}px`,
        textAlign: element.align,
        whiteSpace: "pre"
    };

    return (
        <>
            <div style={style}>
                {layout.lines.map((line, index) => (
                    // Line text can repeat, so the index is the identity; lines never reorder.
                    <div key={index} style={{ height: lineHeight, flex: "none" }}>
                        {line === "" ? "​" : line}
                    </div>
                ))}
            </div>
            {editing && layout.overflow ? <span className="lp-overflow-flag" title="This text does not fit its box" /> : null}
        </>
    );
}

function Placeholder({ icon, text, error = false }: { icon: Parameters<typeof Icon>[0]["name"]; text: string; error?: boolean }) {
    return (
        <div className={error ? "lp-visual-placeholder lp-visual-error" : "lp-visual-placeholder"}>
            <Icon name={icon} />
            <span>{text}</span>
        </div>
    );
}

function ImageVisual({ element, editing }: ElementVisualProps & { element: ImageElement }) {
    if (!element.src) {
        return editing ? <Placeholder icon="image" text="Image" /> : null;
    }

    return (
        <img
            src={element.src}
            alt=""
            draggable={false}
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: element.fit,
                opacity: element.opacity,
                pointerEvents: "none"
            }}
        />
    );
}

/** One SVG path for every dark module, each row's runs merged into single rectangles. */
function qrPath(code: QrCode, offset: number): string {
    let path = "";
    code.modules.forEach((row, y) => {
        let x = 0;
        while (x < code.size) {
            if (!row[x]) {
                x += 1;
                continue;
            }

            const start = x;
            while (x < code.size && row[x]) {
                x += 1;
            }

            path += `M${start + offset} ${y + offset}h${x - start}v1h${start - x}z`;
        }
    });

    return path;
}

/** Modules of clear space kept inside the box around a QR code: half the standard's four, for small labels. */
const QR_MARGIN = 2;

function QrVisual({ element, context, editing }: ElementVisualProps & { element: QrElement }) {
    const value = mergeText(element.template, context);
    const result = useMemo(() => {
        if (value === "") {
            return null;
        }

        try {
            const code = encodeQr(value, element.errorLevel);
            return { code, path: qrPath(code, QR_MARGIN) };
        } catch {
            return "too-long" as const;
        }
    }, [value, element.errorLevel]);

    if (result === null) {
        return editing ? <Placeholder icon="qr" text="QR code" /> : null;
    }

    if (result === "too-long") {
        return editing ? <Placeholder icon="alert" text="Too much for a QR code" error /> : null;
    }

    const extent = result.code.size + QR_MARGIN * 2;
    return (
        <svg
            viewBox={`0 0 ${extent} ${extent}`}
            preserveAspectRatio="xMidYMid meet"
            shapeRendering="crispEdges"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            aria-hidden="true"
        >
            <path d={result.path} fill={element.color} />
        </svg>
    );
}

function BarcodeVisual({ element, context, ppi, editing }: ElementVisualProps & { element: BarcodeElement }) {
    const value = mergeText(element.template, context).replace(/\n/g, " ");
    const result = useMemo(() => {
        if (value === "") {
            return null;
        }

        try {
            return encodeCode128(value);
        } catch (error) {
            return error instanceof Error ? error.message : "Can't encode this value";
        }
    }, [value]);

    if (result === null) {
        return editing ? <Placeholder icon="barcode" text="Barcode" /> : null;
    }

    if (typeof result === "string") {
        return editing ? <Placeholder icon="alert" text={result} error /> : null;
    }

    const textHeight = element.showText ? (element.textSize / POINTS_PER_INCH) * 1.25 * ppi : 0;
    const extent = result.modules + QUIET_ZONE * 2;
    let x = QUIET_ZONE;
    const bars: { x: number; width: number }[] = [];
    result.widths.forEach((width, index) => {
        if (index % 2 === 0) {
            bars.push({ x, width });
        }

        x += width;
    });

    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <svg
                viewBox={`0 0 ${extent} 10`}
                preserveAspectRatio="none"
                shapeRendering="crispEdges"
                style={{ flex: "1 1 auto", width: "100%", minHeight: 0 }}
                aria-hidden="true"
            >
                {bars.map((bar, index) => (
                    <rect key={index} x={bar.x} y={0} width={bar.width} height={10} fill={element.color} />
                ))}
            </svg>
            {element.showText ? (
                <div
                    style={{
                        flex: "none",
                        height: textHeight,
                        lineHeight: `${textHeight}px`,
                        fontFamily: fontStack("Arial"),
                        fontSize: `${(element.textSize / POINTS_PER_INCH) * ppi}px`,
                        color: element.color,
                        textAlign: "center",
                        whiteSpace: "pre",
                        overflow: "hidden"
                    }}
                >
                    {value}
                </div>
            ) : null}
        </div>
    );
}

function ShapeVisual({ element, ppi }: ElementVisualProps & { element: ShapeElement }) {
    const width = element.width * ppi;
    const height = element.height * ppi;
    const stroke = element.stroke && element.strokeWidth > 0 ? element.stroke : "none";
    const strokeWidth = stroke === "none" ? 0 : (element.strokeWidth / POINTS_PER_INCH) * ppi;
    const fill = element.fill || "none";
    const inset = strokeWidth / 2;

    let shape;
    if (element.shape === "line") {
        const horizontal = width >= height;
        shape = horizontal ? (
            <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={stroke} strokeWidth={Math.max(strokeWidth, 0.5)} />
        ) : (
            <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={stroke} strokeWidth={Math.max(strokeWidth, 0.5)} />
        );
    } else if (element.shape === "ellipse") {
        shape = (
            <ellipse
                cx={width / 2}
                cy={height / 2}
                rx={Math.max(0, width / 2 - inset)}
                ry={Math.max(0, height / 2 - inset)}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
            />
        );
    } else {
        const radius = Math.min(element.cornerRadius * ppi, width / 2, height / 2);
        shape = (
            <rect
                x={inset}
                y={inset}
                width={Math.max(0, width - strokeWidth)}
                height={Math.max(0, height - strokeWidth)}
                rx={radius}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
            />
        );
    }

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ position: "absolute", inset: 0, overflow: "visible" }}
            aria-hidden="true"
        >
            {shape}
        </svg>
    );
}

/**
 * Draws one element filling its box. Rotation turns the content about the box's centre; a
 * quarter turn swaps the box the content is laid out in, so text runs along the long side.
 */
export const ElementVisual = memo(function ElementVisual(props: ElementVisualProps) {
    const { element, ppi } = props;
    // A shape fills its box whichever way it is turned (a line runs along the box's long side),
    // so shapes do not rotate.
    const rotation = element.type === "shape" ? 0 : element.rotation;
    const turned = rotation === 90 || rotation === 270;
    const innerWidth = (turned ? element.height : element.width) * ppi;
    const innerHeight = (turned ? element.width : element.height) * ppi;

    const style: CSSProperties =
        rotation === 0
            ? { position: "absolute", inset: 0 }
            : {
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: innerWidth,
                  height: innerHeight,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`
              };

    const content = (() => {
        switch (element.type) {
            case "text":
                return <TextVisual {...props} element={element} />;
            case "image":
                return <ImageVisual {...props} element={element} />;
            case "qr":
                return <QrVisual {...props} element={element} />;
            case "barcode":
                return <BarcodeVisual {...props} element={element} />;
            case "shape":
                return <ShapeVisual {...props} element={element} />;
        }
    })();

    return <div style={style}>{content}</div>;
});
