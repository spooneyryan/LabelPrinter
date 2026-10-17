import { EbButton, EbSelect, EbTooltip } from "@electricblazor/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ToggleButton, useUnit } from "../../components/fields.tsx";
import { Icon } from "../../components/Icon.tsx";
import { includedRows } from "../../model/dataOps.ts";
import { duplicateElement } from "../../model/defaults.ts";
import { buildFieldIndex, placeholderContext, ROW_NUMBER_FIELD, type MergeContext } from "../../model/merge.ts";
import type { LabelElement } from "../../model/types.ts";
import { formatFriendlyInches, MM_PER_INCH } from "../../model/units.ts";
import { contextForItem, useProblemScan } from "../../render/job.ts";
import { useEditor, useStore } from "../../state/store.tsx";
import { Canvas, type Zoom } from "./Canvas.tsx";
import { createElement, type InsertKind } from "./insert.ts";
import { Inspector } from "./Inspector.tsx";
import { FieldPanel, InsertPanel, LayersPanel } from "./Panels.tsx";
import type { TemplateEditorHandle } from "./TemplateEditor.tsx";

/*
 * Step 3: the label itself. One label is designed and every record is merged into it; the
 * toolbar steps through the records to see how each one comes out, and the status bar names the
 * ones that will not fit before anyone wastes a sheet finding out.
 */

export interface DesignUi {
    selectedId: string | null;
    previewIndex: number;
    zoom: Zoom;
    snap: boolean;
    showFieldNames: boolean;
}

export const DEFAULT_DESIGN_UI: DesignUi = { selectedId: null, previewIndex: 0, zoom: "fit", snap: true, showFieldNames: false };

const ZOOMS: { value: Zoom; label: string }[] = [
    { value: "fit", label: "Fit" },
    { value: 0.5, label: "50%" },
    { value: 1, label: "100%" },
    { value: 1.5, label: "150%" },
    { value: 2, label: "200%" },
    { value: 3, label: "300%" },
    { value: 4, label: "400%" },
    { value: 6, label: "600%" }
];

const TEMPLATED: ReadonlySet<LabelElement["type"]> = new Set(["text", "qr", "barcode"]);

export function DesignStep({ ui, onUiChange }: { ui: DesignUi; onUiChange: (patch: Partial<DesignUi>) => void }) {
    const { state } = useStore();
    const editor = useEditor();
    const unit = useUnit();
    const templateRef = useRef<TemplateEditorHandle>(null);
    const [ppi, setPpi] = useState(96);

    const { sheet, design } = state.template;
    const { data, excluded } = state;
    const fields = data?.fields ?? [];
    const rows = useMemo(() => (data ? includedRows(data, excluded) : null), [data, excluded]);
    const fieldIndex = useMemo(() => buildFieldIndex(data?.fields ?? []), [data?.fields]);

    const recordCount = rows?.length ?? 0;
    const previewIndex = Math.min(ui.previewIndex, Math.max(0, recordCount - 1));
    const previewRow = rows && rows.length > 0 ? rows[previewIndex] : null;

    const context: MergeContext = useMemo(() => {
        if (!data || ui.showFieldNames || previewRow === null) {
            return placeholderContext(fieldIndex);
        }

        return contextForItem(data, fieldIndex, previewRow, previewIndex);
    }, [data, fieldIndex, previewRow, previewIndex, ui.showFieldNames]);

    // The problem scan reads every record, so it trails the edits rather than holding them up.
    const problems = useProblemScan(design, data, rows);

    const selected = design.elements.find((element) => element.id === ui.selectedId) ?? null;

    const select = useCallback((id: string | null) => onUiChange({ selectedId: id }), [onUiChange]);

    const onMove = useCallback(
        (id: string, axis: "x" | "y", value: number) => editor.editElement(id, { [axis]: value } as Partial<LabelElement>, `${id}:move`),
        [editor]
    );

    const onResize = useCallback(
        (id: string, axis: "width" | "height", value: number) =>
            editor.editElement(id, { [axis]: value } as Partial<LabelElement>, `${id}:resize`),
        [editor]
    );

    const addElement = useCallback(
        (element: LabelElement) => {
            editor.editDesign((current) => ({ ...current, elements: [...current.elements, element] }));
            onUiChange({ selectedId: element.id });
        },
        [editor, onUiChange]
    );

    const insert = (kind: InsertKind) => addElement(createElement(kind, sheet, design, fields));

    const deleteElement = useCallback(
        (id: string) => {
            editor.editDesign((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }));
            onUiChange({ selectedId: null });
        },
        [editor, onUiChange]
    );

    const duplicate = useCallback(
        (id: string) => {
            const source = design.elements.find((element) => element.id === id);
            if (source) {
                addElement(duplicateElement(source));
            }
        },
        [design.elements, addElement]
    );

    const insertField = (field: string) => {
        const token = `{{${field}}}`;
        if (selected && TEMPLATED.has(selected.type) && templateRef.current) {
            templateRef.current.insert(token);
            return;
        }

        addElement(createElement("text", sheet, design, fields, undefined, token));
    };

    const dropField = useCallback(
        (field: string, at: { x: number; y: number }) => addElement(createElement("text", sheet, design, fields, at, `{{${field}}}`)),
        [sheet, design, fields, addElement]
    );

    const editText = useCallback(
        (id: string) => {
            onUiChange({ selectedId: id });
            requestAnimationFrame(() => templateRef.current?.focus());
        },
        [onUiChange]
    );

    const showNextProblem = () => {
        if (!rows || problems.overflowRows.length + problems.codeRows.length === 0) {
            return;
        }

        const problemRows = [...new Set([...problems.overflowRows, ...problems.codeRows])].filter((row) => row >= 0).sort((a, b) => a - b);
        const next = problemRows.find((row) => row > (previewRow ?? -1)) ?? problemRows[0];
        const index = rows.indexOf(next);
        if (index >= 0) {
            onUiChange({ previewIndex: index, showFieldNames: false });
        }
    };

    const problemCount = new Set([...problems.overflowRows, ...problems.codeRows]).size;
    const sizeText =
        unit === "mm"
            ? `${(sheet.labelWidth * MM_PER_INCH).toFixed(1)} × ${(sheet.labelHeight * MM_PER_INCH).toFixed(1)} mm`
            : `${formatFriendlyInches(sheet.labelWidth)} × ${formatFriendlyInches(sheet.labelHeight)}`;

    return (
        <div className="lp-step lp-design-step">
            <aside className="lp-sidebar lp-sidebar-left" aria-label="Add to the label">
                <InsertPanel onInsert={insert} />
                <FieldPanel fields={fields} hasData={data !== null} onInsertField={insertField} />
                <LayersPanel
                    elements={design.elements}
                    selectedId={ui.selectedId}
                    onSelect={select}
                    onReorder={(elements) => editor.editDesign((current) => ({ ...current, elements }))}
                    onToggle={(id, patch) => editor.editElement(id, patch)}
                />
            </aside>

            <div className="lp-canvas-column">
                <div className="lp-canvas-toolbar" role="toolbar" aria-label="Preview">
                    <div className="lp-toolbar-group" role="group" aria-label="Record">
                        <EbButton
                            className="lp-compact lp-icon-button"
                            aria-label="Previous record"
                            disabled={!data || recordCount === 0 || previewIndex === 0}
                            onClick={() => onUiChange({ previewIndex: previewIndex - 1, showFieldNames: false })}
                        >
                            <Icon name="chevronLeft" />
                        </EbButton>
                        <span className="lp-record-label" aria-live="polite">
                            {!data
                                ? "No data loaded"
                                : recordCount === 0
                                  ? "No records included"
                                  : ui.showFieldNames
                                    ? "Field names"
                                    : `Record ${previewIndex + 1} of ${recordCount}`}
                        </span>
                        <EbButton
                            className="lp-compact lp-icon-button"
                            aria-label="Next record"
                            disabled={!data || recordCount === 0 || previewIndex >= recordCount - 1}
                            onClick={() => onUiChange({ previewIndex: previewIndex + 1, showFieldNames: false })}
                        >
                            <Icon name="chevronRight" />
                        </EbButton>
                        {data ? (
                            <ToggleButton
                                className="lp-compact"
                                pressed={ui.showFieldNames}
                                onPressedChange={(showFieldNames) => onUiChange({ showFieldNames })}
                            >
                                <Icon name="field" /> Field names
                            </ToggleButton>
                        ) : null}
                    </div>
                    <span className="lp-toolbar-divider" />
                    <div className="lp-toolbar-group">
                        <EbSelect<Zoom>
                            className="lp-zoom-select"
                            ariaLabel="Zoom"
                            options={ZOOMS}
                            value={ui.zoom}
                            onValueChange={(zoom) => zoom !== null && onUiChange({ zoom })}
                        />
                        <EbTooltip text={unit === "mm" ? "Snap to a 1 mm grid" : "Snap to a 1/16″ grid"}>
                            <ToggleButton
                                className="lp-compact"
                                pressed={ui.snap}
                                onPressedChange={(snap) => onUiChange({ snap })}
                                aria-label="Snap to grid"
                            >
                                <Icon name="sheet" /> Snap
                            </ToggleButton>
                        </EbTooltip>
                    </div>
                </div>

                <Canvas
                    sheet={sheet}
                    design={design}
                    context={context}
                    selectedId={ui.selectedId}
                    zoom={ui.zoom}
                    snapStep={ui.snap ? (unit === "mm" ? 1 / MM_PER_INCH : 1 / 16) : null}
                    onSelect={select}
                    onMove={onMove}
                    onResize={onResize}
                    onDropField={dropField}
                    onEditText={editText}
                    onDelete={deleteElement}
                    onDuplicate={duplicate}
                    onPpiChange={setPpi}
                />

                <div className="lp-canvas-status">
                    <span>
                        {sheet.name} · {sizeText} · {Math.round((ppi / 96) * 100)}%
                    </span>
                    {problemCount > 0 ? (
                        <span className="lp-status-warning">
                            <Icon name="alert" />{" "}
                            {data
                                ? `${problemCount} record${problemCount === 1 ? "" : "s"} won't print cleanly${problems.truncated ? " (first 5,000 checked)" : ""}`
                                : "The label has text that doesn't fit or a code that can't be made"}
                            {data ? (
                                <>
                                    {" "}
                                    <button type="button" className="lp-link-button" onClick={showNextProblem}>
                                        Show {problemCount === 1 ? "it" : "the next"}
                                    </button>
                                </>
                            ) : null}
                        </span>
                    ) : data && recordCount > 0 ? (
                        <span>All {recordCount} records fit.</span>
                    ) : null}
                    {fields.length === 0 && design.elements.some((element) => "template" in element && element.template.includes(`{{${ROW_NUMBER_FIELD}}}`)) ? (
                        <span>Without data, {"{{#}}"} numbers the labels 1, 2, 3…</span>
                    ) : null}
                </div>
            </div>

            <aside className="lp-sidebar lp-sidebar-right" aria-label="Properties">
                <Inspector
                    key={selected?.id ?? "label"}
                    sheet={sheet}
                    design={design}
                    element={selected}
                    fields={fields}
                    onChange={(patch, key) => selected && editor.editElement(selected.id, patch, key)}
                    onDesignChange={(patch, key) => editor.editDesign((current) => ({ ...current, ...patch }), key)}
                    onDuplicate={() => selected && duplicate(selected.id)}
                    onDelete={() => selected && deleteElement(selected.id)}
                    templateRef={templateRef}
                />
            </aside>
        </div>
    );
}
