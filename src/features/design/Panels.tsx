import { EbButton, EbSortableList } from "@electricblazor/react";
import type { DragEvent } from "react";
import { Icon, type IconName } from "../../components/Icon.tsx";
import { ROW_NUMBER_FIELD } from "../../model/merge.ts";
import type { LabelElement } from "../../model/types.ts";
import { FIELD_MIME } from "./Canvas.tsx";
import type { InsertKind } from "./insert.ts";

/*
 * The designer's left-hand panels: things to add, the data's fields, and the layers.
 */

const INSERTS: { kind: InsertKind; label: string; icon: IconName }[] = [
    { kind: "address", label: "Address block", icon: "address" },
    { kind: "text", label: "Text", icon: "text" },
    { kind: "image", label: "Image", icon: "image" },
    { kind: "qr", label: "QR code", icon: "qr" },
    { kind: "barcode", label: "Barcode", icon: "barcode" },
    { kind: "rectangle", label: "Rectangle", icon: "rectangle" },
    { kind: "ellipse", label: "Ellipse", icon: "ellipse" },
    { kind: "line", label: "Line", icon: "line" }
];

export function InsertPanel({ onInsert }: { onInsert: (kind: InsertKind) => void }) {
    return (
        <section className="lp-sidebar-section" aria-labelledby="lp-insert-heading">
            <h3 id="lp-insert-heading">Add</h3>
            <div className="lp-insert-grid">
                {INSERTS.map((insert) => (
                    <EbButton key={insert.kind} onClick={() => onInsert(insert.kind)}>
                        <Icon name={insert.icon} /> {insert.label}
                    </EbButton>
                ))}
            </div>
        </section>
    );
}

export function FieldPanel({
    fields,
    hasData,
    onInsertField
}: {
    fields: readonly string[];
    hasData: boolean;
    onInsertField: (field: string) => void;
}) {
    const startDrag = (field: string) => (event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.setData(FIELD_MIME, field);
        // Dropped into a text box instead of the label, a field arrives as its placeholder.
        event.dataTransfer.setData("text/plain", `{{${field}}}`);
        event.dataTransfer.effectAllowed = "copy";
    };

    return (
        <section className="lp-sidebar-section" aria-labelledby="lp-fields-heading">
            <h3 id="lp-fields-heading">Fields</h3>
            <p className="lp-note lp-small">
                {hasData
                    ? "Click to insert into the selected text, or drag onto the label."
                    : "Load records on the Data step to list their fields here."}
            </p>
            <div className="lp-field-list">
                {fields.map((field) => (
                    <button
                        key={field}
                        type="button"
                        className="lp-field-chip"
                        draggable
                        title={`{{${field}}}`}
                        onDragStart={startDrag(field)}
                        onClick={() => onInsertField(field)}
                    >
                        {field}
                    </button>
                ))}
                <button
                    type="button"
                    className="lp-field-chip lp-field-chip-special"
                    draggable
                    title="{{#}} — the record's row number, or the label's number without data"
                    onDragStart={startDrag(ROW_NUMBER_FIELD)}
                    onClick={() => onInsertField(ROW_NUMBER_FIELD)}
                >
                    <Icon name="hash" /> Row number
                </button>
            </div>
        </section>
    );
}

const LAYER_ICONS: Record<LabelElement["type"], IconName> = {
    text: "text",
    image: "image",
    qr: "qr",
    barcode: "barcode",
    shape: "rectangle"
};

export function LayersPanel({
    elements,
    selectedId,
    onSelect,
    onReorder,
    onToggle
}: {
    elements: readonly LabelElement[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onReorder: (elements: LabelElement[]) => void;
    onToggle: (id: string, patch: Partial<LabelElement>) => void;
}) {
    // Top of the list is the front of the label: the reverse of drawing order.
    const items = [...elements].reverse();

    return (
        <section className="lp-sidebar-section" aria-labelledby="lp-layers-heading">
            <h3 id="lp-layers-heading">Layers</h3>
            {items.length === 0 ? <p className="lp-note lp-small">Nothing on the label yet.</p> : null}
            <EbSortableList<LabelElement>
                items={items}
                itemKey={(element) => element.id}
                handleSelector=".lp-layer-grip"
                onItemsReordered={(reordered) => onReorder([...reordered].reverse())}
                itemTemplate={(element) => {
                    const classes = ["lp-layer", element.id === selectedId ? "lp-layer-selected" : "", element.hidden ? "lp-layer-hidden" : ""];
                    return (
                        <div className={classes.filter(Boolean).join(" ")}>
                            <span className="lp-layer-grip" aria-hidden="true">
                                <Icon name="grip" />
                            </span>
                            <Icon name={LAYER_ICONS[element.type]} />
                            <button type="button" className="lp-layer-name" onClick={() => onSelect(element.id)} aria-current={element.id === selectedId}>
                                {element.name}
                            </button>
                            <button
                                type="button"
                                className="lp-layer-toggle"
                                aria-label={element.hidden ? `Show ${element.name}` : `Hide ${element.name}`}
                                aria-pressed={element.hidden}
                                onClick={() => onToggle(element.id, { hidden: !element.hidden })}
                            >
                                <Icon name={element.hidden ? "eyeOff" : "eye"} />
                            </button>
                            <button
                                type="button"
                                className="lp-layer-toggle"
                                aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`}
                                aria-pressed={element.locked}
                                onClick={() => onToggle(element.id, { locked: !element.locked })}
                            >
                                <Icon name={element.locked ? "lock" : "unlock"} />
                            </button>
                        </div>
                    );
                }}
            />
        </section>
    );
}
