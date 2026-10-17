import { EbButton, EbCard, EbDialog, EbSelect, EbSwitch, EbTextBox, useDialogs, useToast } from "@electricblazor/react";
import { BrowserFileSaveStore } from "@electricblazor/react/save";
import { useRef, useState, type DragEvent } from "react";
import { NumberField } from "../../components/fields.tsx";
import { Icon } from "../../components/Icon.tsx";
import { toDelimited } from "../../import/csv.ts";
import { ENCODING_OPTIONS, type TextEncodingChoice } from "../../import/decode.ts";
import {
    ACCEPTED_FILES,
    DELIMITER_CHOICES,
    pastedSource,
    readSource,
    sourceTable,
    type ImportSource
} from "../../import/importFile.ts";
import { MAX_SEQUENCE, sequenceTable } from "../../import/sequence.ts";
import { addRow, deleteField, deleteRows, insertField, renameField, setCell } from "../../model/dataOps.ts";
import { buildFieldIndex, renameField as renameInTemplate, suggestAddressBlock, templateFields } from "../../model/merge.ts";
import { sampleAddresses } from "../../model/sample.ts";
import type { DataTable, LabelElement } from "../../model/types.ts";
import { useEditor, useStore } from "../../state/store.tsx";
import { DataGrid } from "./DataGrid.tsx";

/*
 * Step 2: the records to merge. They come from a file (CSV and its relatives, Excel, JSON,
 * vCard), from cells pasted out of a spreadsheet, from a number sequence, or are typed in. Either
 * way they land in a table that can be corrected and trimmed before printing.
 *
 * A design built before the data arrived usually names fields the data spells differently. When
 * that happens the step offers to rebuild the address block from the real columns rather than
 * leaving the labels printing blanks.
 */

const fileStore = new BrowserFileSaveStore();

function templatesOf(elements: readonly LabelElement[]): string[] {
    return elements.flatMap((element) => ("template" in element ? [element.template] : []));
}

export function DataStep({ onShowDesign }: { onShowDesign: () => void }) {
    const { state, dispatch } = useStore();
    const editor = useEditor();
    const toast = useToast();
    const dialogs = useDialogs();
    const fileInput = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const [sequenceOpen, setSequenceOpen] = useState(false);
    const [sequence, setSequence] = useState({ start: 1, count: 30, step: 1, digits: 4 });

    const { data, excluded, source, sourceDetails } = state;

    /** Offers to rebuild the address block when the design names fields the new data lacks. */
    const reconcileDesign = async (table: DataTable) => {
        const index = buildFieldIndex(table.fields);
        const used = templatesOf(state.template.design.elements).flatMap(templateFields);
        const missing = [...new Set(used.filter((field) => index.resolve(field) === undefined))];
        const target = state.template.design.elements.find(
            (element) => element.type === "text" && templateFields(element.template).length > 0
        );

        if (missing.length === 0 || !target || table.fields.length === 0) {
            return;
        }

        const rebuild = await dialogs.confirm(
            `The design uses ${missing.length === 1 ? "a field" : "fields"} this data doesn't have: ${missing.map((field) => `“${field}”`).join(", ")}. Build a new address block from its columns instead?`,
            { title: "Match the design to the data", confirmLabel: "Rebuild address block", cancelLabel: "Keep my design" }
        );

        if (rebuild) {
            editor.editElement(target.id, { template: suggestAddressBlock(table.fields) } as Partial<LabelElement>);
            toast.showSuccess("The address block now uses your columns. Fine-tune it on the Design step.", { durationMs: 5000 });
        }
    };

    const confirmReplace = async () =>
        !data ||
        (await dialogs.confirm(`Replace the ${data.rows.length} records from “${data.source}”?`, {
            title: "Replace data",
            confirmLabel: "Replace"
        }));

    const loadTable = async (table: DataTable, importSource: ImportSource | null, details: string | null, skipConfirm = false) => {
        if (!skipConfirm && !(await confirmReplace())) {
            return;
        }

        dispatch({ type: "setData", data: table, source: importSource, details });
        if (table.rows.length === 0) {
            toast.showWarning(`“${table.source}” has a header but no records under it.`);
        } else {
            toast.showSuccess(`${table.rows.length} record${table.rows.length === 1 ? "" : "s"} loaded from ${table.source}.`);
        }

        await reconcileDesign(table);
    };

    const openFile = async (file: File) => {
        if (!(await confirmReplace())) {
            return;
        }

        try {
            const importSource = await readSource(file.name, new Uint8Array(await file.arrayBuffer()));
            const { table, details } = sourceTable(importSource);
            await loadTable(table, importSource, details, true);
        } catch (error) {
            toast.showError(error instanceof Error ? error.message : String(error), { title: `Couldn't read ${file.name}`, durationMs: 8000 });
        }
    };

    /** Re-reads the source with changed options: delimiter, encoding, sheet, header row. */
    const reread = (next: ImportSource) => {
        try {
            const { table, details } = sourceTable(next);
            dispatch({ type: "setData", data: table, source: next, details });
        } catch (error) {
            toast.showError(error instanceof Error ? error.message : String(error));
        }
    };

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            void openFile(file);
        }
    };

    const dragProps = {
        onDragOver: (event: DragEvent) => {
            if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDragging(true);
            }
        },
        onDragLeave: (event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
            }
        },
        onDrop
    };

    const exportCsv = async () => {
        if (!data) {
            return;
        }

        const name = data.source.replace(/\.[a-z0-9]+$/i, "") || "records";
        await fileStore.saveText(name.endsWith(".csv") ? name : `${name}.csv`, toDelimited([data.fields, ...data.rows]), "text/csv", ".csv");
    };

    const clearData = async () => {
        if (
            data &&
            (await dialogs.confirm(`Remove the ${data.rows.length} records? The design stays as it is.`, {
                title: "Clear data",
                confirmLabel: "Clear",
                confirmVariant: "danger"
            }))
        ) {
            dispatch({ type: "setData", data: null, source: null, details: null });
        }
    };

    const startBlank = async () => {
        await loadTable(
            { source: "New table", fields: ["Name", "Address", "City", "State", "ZIP"], rows: [["", "", "", "", ""]] },
            null,
            null
        );
    };

    const sourceActions = (
        <div className="lp-button-row">
            <EbButton variant="primary" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" /> Open a file…
            </EbButton>
            <EbButton onClick={() => setPasteOpen(true)}>
                <Icon name="clipboard" /> Paste cells…
            </EbButton>
            <EbButton onClick={() => setSequenceOpen(true)}>
                <Icon name="numbers" /> Numbers…
            </EbButton>
            <EbButton onClick={() => void loadTable(sampleAddresses(), null, "Twelve made-up addresses")}>
                <Icon name="sparkle" /> Sample addresses
            </EbButton>
            <EbButton onClick={() => void startBlank()}>
                <Icon name="table" /> Blank table
            </EbButton>
        </div>
    );

    const dialogsMarkup = (
        <>
            <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_FILES}
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                        void openFile(file);
                    }
                }}
            />
            <EbDialog
                visible={pasteOpen}
                onVisibleChange={setPasteOpen}
                title="Paste cells"
                initialFocusSelector="textarea"
                footerContent={
                    <div className="lp-button-row">
                        <EbButton onClick={() => setPasteOpen(false)}>Cancel</EbButton>
                        <EbButton
                            variant="primary"
                            disabled={pasteText.trim() === ""}
                            onClick={() => {
                                setPasteOpen(false);
                                const importSource = pastedSource(pasteText);
                                const { table, details } = sourceTable(importSource);
                                void loadTable(table, importSource, details);
                                setPasteText("");
                            }}
                        >
                            Use these records
                        </EbButton>
                    </div>
                }
            >
                <div className="lp-card-body" style={{ width: "min(640px, 80vw)" }}>
                    <p className="lp-note">
                        Copy the cells in Excel, Google Sheets or Numbers — header row included — and paste them here. Comma- and
                        semicolon-separated text works too.
                    </p>
                    <EbTextBox
                        className="lp-paste-area"
                        multiline
                        rows={12}
                        ariaLabel="Pasted records"
                        placeholder={"First Name\tLast Name\tAddress\nAda\tLovelace\t12 St James's Sq"}
                        value={pasteText}
                        onValueChange={setPasteText}
                        immediate
                    />
                </div>
            </EbDialog>
            <EbDialog
                visible={sequenceOpen}
                onVisibleChange={setSequenceOpen}
                title="Numbered labels"
                footerContent={
                    <div className="lp-button-row">
                        <EbButton onClick={() => setSequenceOpen(false)}>Cancel</EbButton>
                        <EbButton
                            variant="primary"
                            onClick={() => {
                                setSequenceOpen(false);
                                const table = sequenceTable(sequence);
                                void loadTable(table, null, `${table.rows.length} numbers`);
                            }}
                        >
                            Make {Math.min(MAX_SEQUENCE, sequence.count)} numbers
                        </EbButton>
                    </div>
                }
            >
                <div className="lp-card-body" style={{ width: "min(420px, 80vw)" }}>
                    <p className="lp-note">
                        Makes one record per number in a column called Number. Put text around it on the label —
                        “INV-{"{{Number}}"}” — or feed it to a barcode.
                    </p>
                    <div className="lp-field-grid">
                        <NumberField label="First number" value={sequence.start} onChange={(start) => setSequence({ ...sequence, start })} />
                        <NumberField
                            label="How many"
                            integer
                            min={1}
                            max={MAX_SEQUENCE}
                            value={sequence.count}
                            onChange={(count) => setSequence({ ...sequence, count })}
                        />
                        <NumberField label="Step" value={sequence.step} onChange={(step) => setSequence({ ...sequence, step })} />
                        <NumberField
                            label="Digits"
                            helpText="Pads with zeros: 4 gives 0001"
                            integer
                            min={0}
                            max={20}
                            value={sequence.digits}
                            onChange={(digits) => setSequence({ ...sequence, digits })}
                        />
                    </div>
                    <p className="lp-note">
                        First: <strong>{sequenceTable({ ...sequence, count: 1 }).rows[0]?.[0]}</strong> · last:{" "}
                        <strong>{sequenceTable(sequence).rows.at(-1)?.[0]}</strong>
                    </p>
                </div>
            </EbDialog>
        </>
    );

    if (!data) {
        return (
            <div className="lp-step" {...dragProps}>
                <div className={dragging ? "lp-dropzone lp-dropzone-active" : "lp-dropzone"}>
                    <Icon name="table" className="lp-dropzone-icon" />
                    <h2>Add the records to print</h2>
                    <p className="lp-note">
                        Drop a file here, or choose where the records come from. Each record becomes one label (or several — set
                        copies on the Print step). Nothing leaves this browser.
                    </p>
                    <div className="lp-formats" aria-label="Supported formats">
                        {["CSV", "Tab-separated", "Excel .xlsx", "JSON", "vCard contacts", "Pasted cells"].map((format) => (
                            <span key={format} className="lp-format">
                                {format}
                            </span>
                        ))}
                    </div>
                    {sourceActions}
                    <p className="lp-note">
                        Printing the same label on every position — return addresses, say — needs no data at all:{" "}
                        <button type="button" className="lp-link-button" onClick={onShowDesign}>
                            go straight to the design
                        </button>
                        .
                    </p>
                </div>
                {dialogsMarkup}
            </div>
        );
    }

    const delimitedSource = source?.format === "delimited" ? source : null;
    const workbookSource = source?.format === "xlsx" ? source : null;

    const renameColumn = (column: number, name: string) => {
        const previous = data.fields[column];
        const result = renameField(data, column, name);
        dispatch({ type: "editData", update: () => result.table });
        // Placeholders follow the column, so the design keeps printing it.
        editor.editDesign((design) => ({
            ...design,
            elements: design.elements.map((element) =>
                "template" in element ? { ...element, template: renameInTemplate(element.template, previous, result.name) } : element
            )
        }));
    };

    return (
        <div className="lp-step lp-data-step" {...dragProps}>
            <div className="lp-column lp-scroll">
                <EbCard title="Records">
                    <div className="lp-card-body">
                        <div className="lp-stat-row">
                            <span className="lp-muted">Source</span>
                            <strong title={data.source}>{data.source}</strong>
                        </div>
                        {sourceDetails ? <p className="lp-note">{sourceDetails}</p> : null}
                        <div className="lp-stat-row">
                            <span className="lp-muted">Records</span>
                            <strong>{data.rows.length}</strong>
                        </div>
                        <div className="lp-stat-row">
                            <span className="lp-muted">Included in the merge</span>
                            <strong>{data.rows.length - excluded.size}</strong>
                        </div>
                        <div className="lp-stat-row">
                            <span className="lp-muted">Fields</span>
                            <strong>{data.fields.length}</strong>
                        </div>
                        <div className="lp-button-row">
                            <EbButton variant="primary" onClick={onShowDesign}>
                                Design the label <Icon name="chevronRight" />
                            </EbButton>
                        </div>
                    </div>
                </EbCard>

                {delimitedSource || workbookSource ? (
                    <EbCard title="Import options">
                        <div className="lp-card-body">
                            {delimitedSource ? (
                                <>
                                    <EbSelect<string>
                                        label="Separator"
                                        options={DELIMITER_CHOICES}
                                        value={delimitedSource.delimiter}
                                        onValueChange={(delimiter) => delimiter && reread({ ...delimitedSource, delimiter })}
                                    />
                                    <EbSelect<TextEncodingChoice>
                                        label="Text encoding"
                                        helpText="Change it if accented letters look garbled"
                                        options={ENCODING_OPTIONS}
                                        value={delimitedSource.encoding}
                                        onValueChange={(encoding) => encoding && reread({ ...delimitedSource, encoding })}
                                    />
                                </>
                            ) : null}
                            {workbookSource && workbookSource.sheets.length > 1 ? (
                                <EbSelect<number>
                                    label="Worksheet"
                                    options={workbookSource.sheets.map((sheet, index) => ({ value: index, label: sheet.name }))}
                                    value={workbookSource.sheetIndex}
                                    onValueChange={(sheetIndex) => sheetIndex !== null && reread({ ...workbookSource, sheetIndex })}
                                />
                            ) : null}
                            <EbSwitch
                                label="First row holds the field names"
                                value={(delimitedSource ?? workbookSource)!.hasHeader}
                                onValueChange={(hasHeader) => reread({ ...(delimitedSource ?? workbookSource)!, hasHeader })}
                            />
                        </div>
                    </EbCard>
                ) : null}

                <EbCard title="Get records">
                    <div className="lp-card-body">
                        {sourceActions}
                        <div className="lp-button-row">
                            <EbButton onClick={() => void exportCsv()}>
                                <Icon name="download" /> Save as CSV…
                            </EbButton>
                            <EbButton variant="danger" onClick={() => void clearData()}>
                                <Icon name="trash" /> Clear
                            </EbButton>
                        </div>
                    </div>
                </EbCard>
            </div>

            <div className={dragging ? "lp-column lp-dropzone-active" : "lp-column"} style={{ minHeight: 0 }}>
                <DataGrid
                    table={data}
                    excluded={excluded}
                    onExcludedChange={(next) => dispatch({ type: "setExcluded", excluded: next })}
                    onCellChange={(row, column, value) => dispatch({ type: "editData", update: (table) => setCell(table, row, column, value) })}
                    onAddRow={() => dispatch({ type: "editData", update: addRow })}
                    onDeleteRow={(row) => {
                        const result = deleteRows(data, new Set([row]), excluded);
                        dispatch({ type: "editData", update: () => result.table, excluded: result.excluded });
                    }}
                    onRenameField={renameColumn}
                    onInsertField={(column) =>
                        dispatch({ type: "editData", update: (table) => insertField(table, column, `Column ${table.fields.length + 1}`) })
                    }
                    onDeleteField={(column) => dispatch({ type: "editData", update: (table) => deleteField(table, column) })}
                />
            </div>
            {dialogsMarkup}
        </div>
    );
}
