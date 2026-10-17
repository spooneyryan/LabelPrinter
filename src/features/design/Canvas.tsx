import { EbDraggable, EbResizeBox, EbResizeHandles } from "@electricblazor/react";
import { memo, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { MergeContext } from "../../model/merge.ts";
import type { LabelDesign, LabelElement, SheetSpec } from "../../model/types.ts";
import { CSS_PX_PER_INCH, snapTo } from "../../model/units.ts";
import { ElementVisual } from "../../render/ElementVisual.tsx";
import { labelRadius } from "../../render/SheetPage.tsx";

/*
 * The label, enlarged, with every element on it draggable and resizable.
 *
 * The canvas draws at a pixels-per-inch scale rather than under a CSS transform. EbDraggable and
 * EbResizeBox measure pointer movement in screen pixels and write their results back as pixels;
 * under a scale() those would no longer be the pixels of the box being moved, and an element
 * would run ahead of the pointer at every zoom but 100%. Drawing at the zoomed size keeps a pixel
 * a pixel, and positions convert to inches only when an edit is committed.
 */

export const FIELD_MIME = "application/x-label-field";

export type Zoom = "fit" | number;

export interface CanvasProps {
    sheet: SheetSpec;
    design: LabelDesign;
    context: MergeContext;
    selectedId: string | null;
    zoom: Zoom;
    /** The snapping grid in inches, or null for free placement. */
    snapStep: number | null;
    onSelect: (id: string | null) => void;
    onMove: (id: string, axis: "x" | "y", value: number) => void;
    onResize: (id: string, axis: "width" | "height", value: number) => void;
    onDropField: (field: string, at: { x: number; y: number }) => void;
    onEditText: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onPpiChange?: (ppi: number) => void;
}

const MIN_PPI = 20;
const MAX_PPI = 1600;
const STAGE_PADDING = 48;

interface CanvasElementProps {
    element: LabelElement;
    ppi: number;
    selected: boolean;
    context: MergeContext;
    snapStep: number | null;
    onSelect: (id: string | null) => void;
    onMove: CanvasProps["onMove"];
    onResize: CanvasProps["onResize"];
    onEditText: CanvasProps["onEditText"];
}

const CanvasElement = memo(function CanvasElement({
    element,
    ppi,
    selected,
    context,
    snapStep,
    onSelect,
    onMove,
    onResize,
    onEditText
}: CanvasElementProps) {
    const toInches = (pixels: number) => {
        const inches = pixels / ppi;
        return snapStep ? snapTo(inches, snapStep) : Number(inches.toFixed(4));
    };

    const keyStep = (snapStep ?? 1 / 32) * ppi;
    const className = [
        "lp-element",
        selected ? "lp-element-selected" : "",
        element.locked ? "lp-element-locked" : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <EbDraggable
            className={className}
            data-element-id={element.id}
            x={element.x * ppi}
            y={element.y * ppi}
            onXChange={(x) => onMove(element.id, "x", toInches(x))}
            onYChange={(y) => onMove(element.id, "y", toInches(y))}
            boundsSelector=".lp-label-surface"
            disabled={element.locked}
            step={keyStep}
            stepLarge={keyStep * 8}
            keyboardLabel={`${element.name}${element.locked ? " (locked)" : ""}. Arrow keys move it, Delete removes it.`}
            onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                onSelect(element.id);
                event.currentTarget.focus({ preventScroll: true });
            }}
            onFocus={() => onSelect(element.id)}
            onDoubleClick={() => onEditText(element.id)}
        >
            <EbResizeBox
                width={element.width * ppi}
                height={element.height * ppi}
                minWidth={4}
                minHeight={2}
                maxWidth={MAX_PPI * 20}
                maxHeight={MAX_PPI * 20}
                handles={EbResizeHandles.All}
                disabled={!selected || element.locked}
                keyboardStep={keyStep}
                onWidthChange={(width) => onResize(element.id, "width", Math.max(0.02, toInches(width)))}
                onHeightChange={(height) => onResize(element.id, "height", Math.max(0.02, toInches(height)))}
            >
                <ElementVisual element={element} context={context} ppi={ppi} editing />
                {selected ? <span className="lp-element-badge">{element.name}</span> : null}
            </EbResizeBox>
        </EbDraggable>
    );
});

export function Canvas({
    sheet,
    design,
    context,
    selectedId,
    zoom,
    snapStep,
    onSelect,
    onMove,
    onResize,
    onDropField,
    onEditText,
    onDelete,
    onDuplicate,
    onPpiChange
}: CanvasProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const [room, setRoom] = useState({ width: 800, height: 500 });
    const [dropping, setDropping] = useState(false);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            setRoom({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const fitPpi = Math.min(
        (room.width - STAGE_PADDING * 2) / sheet.labelWidth,
        (room.height - STAGE_PADDING * 2) / sheet.labelHeight
    );
    const ppi = Math.min(MAX_PPI, Math.max(MIN_PPI, zoom === "fit" ? fitPpi : zoom * CSS_PX_PER_INCH));

    useEffect(() => onPpiChange?.(ppi), [ppi, onPpiChange]);

    // Keyboard focus follows the selection while it is on the canvas: after Ctrl+D the copy is
    // selected, and the arrow keys and Delete must act on it rather than on the original.
    useEffect(() => {
        const canvas = scrollRef.current;
        const active = document.activeElement;
        if (!selectedId || !canvas || !active || !canvas.contains(active) || active.getAttribute("data-element-id") === selectedId) {
            return;
        }

        canvas.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(selectedId)}"]`)?.focus({ preventScroll: true });
    }, [selectedId]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const target = (event.target as Element).closest("[data-element-id]");
        if (!target || (event.target as Element).closest("input, textarea, [role='button']:not([data-element-id])")) {
            return;
        }

        const id = target.getAttribute("data-element-id");
        if (!id) {
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            onDelete(id);
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
            event.preventDefault();
            onDuplicate(id);
        } else if (event.key === "Escape") {
            onSelect(null);
            (target as HTMLElement).blur();
        } else if (event.key.startsWith("Arrow")) {
            // EbDraggable moves the element; this stops the canvas scrolling under it as well.
            event.preventDefault();
        } else if (event.key === "Enter") {
            onEditText(id);
        }
    };

    /*
     * Arrow keys on a focused resize handle. EbDraggable listens for arrows on its whole subtree,
     * so a key meant to resize the box would also move it. This takes those keys first — in the
     * capture phase, before either component sees them — and does the resize itself.
     */
    const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
        const handle = event.target as HTMLElement;
        if (!event.key.startsWith("Arrow") || !handle.classList.contains("eb-resize-box-handle")) {
            return;
        }

        const id = handle.closest("[data-element-id]")?.getAttribute("data-element-id");
        const element = design.elements.find((candidate) => candidate.id === id);
        if (!element) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const step = (snapStep ?? 1 / 32) * (event.shiftKey ? 8 : 1);
        const horizontal = !handle.classList.contains("eb-resize-box-handle-s");
        const vertical = !handle.classList.contains("eb-resize-box-handle-e");
        const round = (value: number) => Math.max(0.02, snapStep ? snapTo(value, snapStep) : Number(value.toFixed(4)));

        if (horizontal && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
            onResize(element.id, "width", round(element.width + (event.key === "ArrowRight" ? step : -step)));
        }

        if (vertical && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            onResize(element.id, "height", round(element.height + (event.key === "ArrowDown" ? step : -step)));
        }
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!(event.target as Element).closest("[data-element-id]")) {
            onSelect(null);
        }
    };

    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes(FIELD_MIME)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropping(true);
        }
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        const field = event.dataTransfer.getData(FIELD_MIME);
        setDropping(false);
        if (!field || !surfaceRef.current) {
            return;
        }

        event.preventDefault();
        const rect = surfaceRef.current.getBoundingClientRect();
        onDropField(field, { x: (event.clientX - rect.left) / ppi, y: (event.clientY - rect.top) / ppi });
    };

    const radius = labelRadius(sheet, ppi);
    const margin = design.safeMargin * ppi;
    const gridPx = snapStep ? snapStep * ppi : 0;
    const showGrid = gridPx >= 8;

    return (
        <div
            ref={scrollRef}
            className="lp-canvas-scroll"
            onPointerDown={onPointerDown}
            onKeyDownCapture={onKeyDownCapture}
            onKeyDown={onKeyDown}
            onDragOver={onDragOver}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
        >
            <div className="lp-canvas-stage">
                <div
                    ref={surfaceRef}
                    className="lp-label-surface"
                    style={{
                        width: sheet.labelWidth * ppi,
                        height: sheet.labelHeight * ppi,
                        borderRadius: radius,
                        outline: dropping ? "2px solid #145be7" : undefined
                    }}
                    aria-label={`Label, ${sheet.labelWidth} by ${sheet.labelHeight} inches`}
                    role="region"
                >
                    {showGrid ? (
                        <div
                            className="lp-label-grid"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, rgba(20,91,231,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,91,231,0.08) 1px, transparent 1px)",
                                backgroundSize: `${gridPx}px ${gridPx}px`
                            }}
                        />
                    ) : null}
                    {margin > 0 ? (
                        <div
                            className="lp-label-guide"
                            style={{
                                left: margin,
                                top: margin,
                                right: margin,
                                bottom: margin,
                                borderRadius: typeof radius === "number" ? Math.max(0, radius - margin) : radius
                            }}
                        />
                    ) : null}
                    {design.elements
                        .filter((element) => !element.hidden)
                        .map((element) => (
                            <CanvasElement
                                key={element.id}
                                element={element}
                                ppi={ppi}
                                selected={element.id === selectedId}
                                context={context}
                                snapStep={snapStep}
                                onSelect={onSelect}
                                onMove={onMove}
                                onResize={onResize}
                                onEditText={onEditText}
                            />
                        ))}
                </div>
            </div>
        </div>
    );
}
