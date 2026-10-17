import { EbAccordion, EbAccordionItem, EbButton, EbComboBox, EbSelect, EbSwitch, EbTextBox, EbTooltip, useDialogs, useToast } from "@electricblazor/react";
import { EbCoolButton, EbCoolButtonGroup } from "@electricblazor/react/coolbuttons";
import { useRef, type Ref } from "react";
import { ColorField, LengthField, NumberField, ToggleButton } from "../../components/fields.tsx";
import { Icon, type IconName } from "../../components/Icon.tsx";
import type {
    BarcodeElement,
    HorizontalAlign,
    ImageElement,
    ImageFit,
    LabelDesign,
    LabelElement,
    QrElement,
    QrErrorLevel,
    Rotation,
    ShapeElement,
    ShapeKind,
    SheetSpec,
    TextCase,
    TextElement,
    VerticalAlign
} from "../../model/types.ts";
import { formatFriendlyInches } from "../../model/units.ts";
import { FONTS, findFont } from "../../render/fonts.ts";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor.tsx";

/*
 * The selected element's properties, grouped the way a word processor groups them. Every change
 * is an edit with a key, so a run of keystrokes or arrow presses on one property undoes in one
 * step (see the store).
 */

export interface InspectorProps {
    sheet: SheetSpec;
    design: LabelDesign;
    element: LabelElement | null;
    fields: readonly string[];
    onChange: (patch: Partial<LabelElement>, key?: string) => void;
    onDesignChange: (patch: Partial<LabelDesign>, key?: string) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    templateRef: Ref<TemplateEditorHandle>;
}

const TYPE_NAMES: Record<LabelElement["type"], string> = {
    text: "Text",
    image: "Image",
    qr: "QR code",
    barcode: "Barcode",
    shape: "Shape"
};

const TYPE_ICONS: Record<LabelElement["type"], IconName> = {
    text: "text",
    image: "image",
    qr: "qr",
    barcode: "barcode",
    shape: "rectangle"
};

const ROTATIONS: { value: Rotation; label: string }[] = [
    { value: 0, label: "Upright" },
    { value: 90, label: "90° clockwise" },
    { value: 180, label: "Upside down" },
    { value: 270, label: "90° counter-clockwise" }
];

const CASES: { value: TextCase; label: string }[] = [
    { value: "none", label: "As typed" },
    { value: "upper", label: "UPPERCASE" },
    { value: "lower", label: "lowercase" },
    { value: "title", label: "Title Case" }
];

const ERROR_LEVELS: { value: QrErrorLevel; label: string; description: string }[] = [
    { value: "L", label: "Low (7%)", description: "Smallest code" },
    { value: "M", label: "Medium (15%)", description: "The usual choice" },
    { value: "Q", label: "Quartile (25%)", description: "For rough handling" },
    { value: "H", label: "High (30%)", description: "Survives scuffs and a logo on top" }
];

const FITS: { value: ImageFit; label: string }[] = [
    { value: "contain", label: "Fit inside the box" },
    { value: "cover", label: "Fill the box (crop)" },
    { value: "fill", label: "Stretch to the box" }
];

const SHAPES: { value: ShapeKind; label: string }[] = [
    { value: "rectangle", label: "Rectangle" },
    { value: "ellipse", label: "Ellipse" },
    { value: "line", label: "Line" }
];

const TEMPLATE_HELP = "{{Field}} merges a column; {{Field|upper}} shouts it; {{#}} is the row number.";

/** Reads a chosen image file as a data URL, so it lives inside the template. */
function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
        reader.readAsDataURL(file);
    });
}

function AlignmentButtons({ element, sheet, design, onChange }: Pick<InspectorProps, "sheet" | "design" | "onChange"> & { element: LabelElement }) {
    const margin = design.safeMargin;
    const right = sheet.labelWidth - margin - element.width;
    const bottom = sheet.labelHeight - margin - element.height;
    const round = (value: number) => Number(value.toFixed(4));

    const actions: { icon: IconName; label: string; patch: Partial<LabelElement> }[] = [
        { icon: "alignLeft", label: "Align to the left edge", patch: { x: round(margin) } },
        { icon: "alignCenterH", label: "Centre across the label", patch: { x: round((sheet.labelWidth - element.width) / 2) } },
        { icon: "alignRight", label: "Align to the right edge", patch: { x: round(right) } },
        { icon: "alignTop", label: "Align to the top edge", patch: { y: round(margin) } },
        { icon: "alignMiddle", label: "Centre down the label", patch: { y: round((sheet.labelHeight - element.height) / 2) } },
        { icon: "alignBottom", label: "Align to the bottom edge", patch: { y: round(bottom) } },
        {
            icon: "fit",
            label: "Fill the safe area",
            patch: {
                x: round(margin),
                y: round(margin),
                width: round(sheet.labelWidth - 2 * margin),
                height: round(sheet.labelHeight - 2 * margin)
            }
        }
    ];

    return (
        <div className="lp-button-row" role="group" aria-label="Align on the label">
            {actions.map((action) => (
                <EbTooltip key={action.icon} text={action.label}>
                    <EbButton className="lp-compact lp-icon-button" aria-label={action.label} onClick={() => onChange(action.patch)}>
                        <Icon name={action.icon} />
                    </EbButton>
                </EbTooltip>
            ))}
        </div>
    );
}

function FontPicker({ element, onChange }: { element: TextElement; onChange: InspectorProps["onChange"] }) {
    const dialogs = useDialogs();
    const known = findFont(element.fontFamily);
    const options = [
        ...(known ? [] : [{ value: element.fontFamily, label: element.fontFamily, description: "Custom font" }]),
        ...FONTS.map((font) => ({
            value: font.family,
            label: font.family,
            description: font.bundled ? "Bundled — prints the same on any computer" : "System font"
        }))
    ];

    const other = async () => {
        const family = await dialogs.prompt("Type the name of a font installed on this computer, exactly as your other apps list it.", {
            title: "Another font",
            initialValue: known ? "" : element.fontFamily,
            placeholder: "e.g. Futura",
            confirmLabel: "Use font",
            required: true
        });

        if (family?.trim()) {
            onChange({ fontFamily: family.trim() } as Partial<TextElement>);
        }
    };

    return (
        <div className="lp-inline-field">
            <EbComboBox<string>
                label="Font"
                options={options}
                value={element.fontFamily}
                onValueChange={(fontFamily) => fontFamily && onChange({ fontFamily } as Partial<TextElement>)}
                itemTemplate={(option) => (
                    <span className="lp-font-option">
                        <span style={{ fontFamily: `"${option.value}", ${findFont(option.value)?.generic ?? "sans-serif"}` }}>{option.label}</span>
                        <span className="lp-font-option-kind">{findFont(option.value)?.bundled ? "bundled" : ""}</span>
                    </span>
                )}
            />
            <div>
                <button type="button" className="lp-link-button lp-small" onClick={() => void other()}>
                    Another font…
                </button>
            </div>
        </div>
    );
}

function TextSections({ element, fields, onChange, templateRef }: { element: TextElement } & Pick<InspectorProps, "fields" | "onChange" | "templateRef">) {
    const change = (patch: Partial<TextElement>, key?: string) => onChange(patch as Partial<LabelElement>, key);

    return (
        <>
            <EbAccordionItem title="Content" defaultExpanded>
                <TemplateEditor
                    label="Text"
                    value={element.template}
                    onChange={(template) => change({ template }, `${element.id}:template`)}
                    fields={fields}
                    helpText={TEMPLATE_HELP}
                    handleRef={templateRef}
                />
            </EbAccordionItem>
            <EbAccordionItem title="Font" defaultExpanded>
                <div className="lp-card-body">
                    <FontPicker element={element} onChange={onChange} />
                    <div className="lp-field-grid">
                        <NumberField
                            label="Size"
                            suffix="pt"
                            min={1}
                            max={400}
                            step={0.5}
                            value={element.fontSize}
                            onChange={(fontSize) => change({ fontSize }, `${element.id}:fontSize`)}
                        />
                        <div className="lp-inline-field">
                            <span className="lp-label-text">Style</span>
                            <div className="lp-toolbar-group">
                                <ToggleButton className="lp-compact lp-icon-button" aria-label="Bold" pressed={element.bold} onPressedChange={(bold) => change({ bold })}>
                                    <Icon name="bold" />
                                </ToggleButton>
                                <ToggleButton className="lp-compact lp-icon-button" aria-label="Italic" pressed={element.italic} onPressedChange={(italic) => change({ italic })}>
                                    <Icon name="italic" />
                                </ToggleButton>
                                <ToggleButton
                                    className="lp-compact lp-icon-button"
                                    aria-label="Underline"
                                    pressed={element.underline}
                                    onPressedChange={(underline) => change({ underline })}
                                >
                                    <Icon name="underline" />
                                </ToggleButton>
                            </div>
                        </div>
                    </div>
                    <ColorField label="Colour" value={element.color} onChange={(color) => change({ color }, `${element.id}:color`)} />
                </div>
            </EbAccordionItem>
            <EbAccordionItem title="Paragraph" defaultExpanded>
                <div className="lp-card-body">
                    <div className="lp-field-grid">
                        <div className="lp-inline-field">
                            <span className="lp-label-text">Across</span>
                            <EbCoolButtonGroup<HorizontalAlign>
                                className="lp-segmented"
                                ariaLabel="Horizontal alignment"
                                value={element.align}
                                onValueChange={(align) => align && change({ align })}
                            >
                                <EbCoolButton value="left" aria-label="Align left">
                                    <Icon name="textLeft" />
                                </EbCoolButton>
                                <EbCoolButton value="center" aria-label="Centre">
                                    <Icon name="textCenter" />
                                </EbCoolButton>
                                <EbCoolButton value="right" aria-label="Align right">
                                    <Icon name="textRight" />
                                </EbCoolButton>
                            </EbCoolButtonGroup>
                        </div>
                        <div className="lp-inline-field">
                            <span className="lp-label-text">Down</span>
                            <EbCoolButtonGroup<VerticalAlign>
                                className="lp-segmented"
                                ariaLabel="Vertical alignment"
                                value={element.verticalAlign}
                                onValueChange={(verticalAlign) => verticalAlign && change({ verticalAlign })}
                            >
                                <EbCoolButton value="top" aria-label="Top">
                                    <Icon name="vTop" />
                                </EbCoolButton>
                                <EbCoolButton value="middle" aria-label="Middle">
                                    <Icon name="vMiddle" />
                                </EbCoolButton>
                                <EbCoolButton value="bottom" aria-label="Bottom">
                                    <Icon name="vBottom" />
                                </EbCoolButton>
                            </EbCoolButtonGroup>
                        </div>
                        <NumberField
                            label="Line spacing"
                            suffix="×"
                            min={0.6}
                            max={3}
                            step={0.05}
                            value={element.lineHeight}
                            onChange={(lineHeight) => change({ lineHeight }, `${element.id}:lineHeight`)}
                        />
                        <EbSelect<TextCase> label="Case" options={CASES} value={element.textCase} onValueChange={(textCase) => textCase && change({ textCase })} />
                    </div>
                </div>
            </EbAccordionItem>
            <EbAccordionItem title="Fitting" defaultExpanded>
                <div className="lp-card-body">
                    <EbSwitch
                        label="Shrink to fit"
                        helpText="Sets a label's text smaller when a long name or address would not fit"
                        value={element.shrinkToFit}
                        onValueChange={(shrinkToFit) => change({ shrinkToFit })}
                    />
                    {element.shrinkToFit ? (
                        <NumberField
                            label="Smallest size"
                            suffix="pt"
                            min={1}
                            max={element.fontSize}
                            step={0.5}
                            value={element.minFontSize}
                            onChange={(minFontSize) => change({ minFontSize }, `${element.id}:minFontSize`)}
                        />
                    ) : null}
                    <EbSwitch label="Wrap long lines" value={element.wrap} onValueChange={(wrap) => change({ wrap })} />
                    <EbSwitch
                        label="Skip empty lines"
                        helpText="Leaves out a line whose fields are all empty, like a missing Address 2"
                        value={element.removeBlankLines}
                        onValueChange={(removeBlankLines) => change({ removeBlankLines })}
                    />
                </div>
            </EbAccordionItem>
        </>
    );
}

function ImageSections({ element, onChange }: { element: ImageElement; onChange: InspectorProps["onChange"] }) {
    const input = useRef<HTMLInputElement>(null);
    const toast = useToast();
    const change = (patch: Partial<ImageElement>, key?: string) => onChange(patch as Partial<LabelElement>, key);

    const choose = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.showError(`${file.name} is not an image.`);
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            toast.showWarning("That image is over 3 MB. It will work, but templates and autosave get slow; a smaller copy prints just as well.", {
                durationMs: 7000
            });
        }

        try {
            change({ src: await readImage(file), name: file.name.replace(/\.[a-z0-9]+$/i, "") });
        } catch (error) {
            toast.showError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <EbAccordionItem title="Image" defaultExpanded>
            <div className="lp-card-body">
                <input
                    ref={input}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                    hidden
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) {
                            void choose(file);
                        }
                    }}
                />
                <div className="lp-button-row">
                    <EbButton variant={element.src ? "default" : "primary"} onClick={() => input.current?.click()}>
                        <Icon name="upload" /> {element.src ? "Replace image…" : "Choose image…"}
                    </EbButton>
                    {element.src ? <EbButton onClick={() => change({ src: "" })}>Remove</EbButton> : null}
                </div>
                <p className="lp-note">The image is stored in the template, so it travels with it when exported.</p>
                <EbSelect<ImageFit> label="Fit" options={FITS} value={element.fit} onValueChange={(fit) => fit && change({ fit })} />
                <NumberField
                    label="Opacity"
                    suffix="%"
                    min={0}
                    max={100}
                    step={5}
                    integer
                    value={Math.round(element.opacity * 100)}
                    onChange={(percent) => change({ opacity: percent / 100 }, `${element.id}:opacity`)}
                />
            </div>
        </EbAccordionItem>
    );
}

function QrSections({ element, fields, onChange, templateRef }: { element: QrElement } & Pick<InspectorProps, "fields" | "onChange" | "templateRef">) {
    const change = (patch: Partial<QrElement>, key?: string) => onChange(patch as Partial<LabelElement>, key);
    return (
        <EbAccordionItem title="QR code" defaultExpanded>
            <div className="lp-card-body">
                <TemplateEditor
                    label="Content"
                    rows={3}
                    value={element.template}
                    onChange={(template) => change({ template }, `${element.id}:template`)}
                    fields={fields}
                    helpText="A web address, a code, or fields merged per label."
                    handleRef={templateRef}
                />
                <EbSelect<QrErrorLevel>
                    label="Error correction"
                    options={ERROR_LEVELS}
                    value={element.errorLevel}
                    onValueChange={(errorLevel) => errorLevel && change({ errorLevel })}
                    helpText={ERROR_LEVELS.find((level) => level.value === element.errorLevel)?.description}
                />
                <ColorField label="Colour" value={element.color} onChange={(color) => change({ color }, `${element.id}:color`)} />
                <p className="lp-note">Keep it dark on light, and at least ⅝″ across for phones to read it easily.</p>
            </div>
        </EbAccordionItem>
    );
}

function BarcodeSections({ element, fields, onChange, templateRef }: { element: BarcodeElement } & Pick<InspectorProps, "fields" | "onChange" | "templateRef">) {
    const change = (patch: Partial<BarcodeElement>, key?: string) => onChange(patch as Partial<LabelElement>, key);
    return (
        <EbAccordionItem title="Barcode (Code 128)" defaultExpanded>
            <div className="lp-card-body">
                <TemplateEditor
                    label="Value"
                    rows={2}
                    value={element.template}
                    onChange={(template) => change({ template }, `${element.id}:template`)}
                    fields={fields}
                    helpText="Letters, digits and punctuation (ASCII). Long runs of digits pack tightest."
                    handleRef={templateRef}
                />
                <EbSwitch label="Print the value under the bars" value={element.showText} onValueChange={(showText) => change({ showText })} />
                {element.showText ? (
                    <NumberField
                        label="Text size"
                        suffix="pt"
                        min={4}
                        max={36}
                        step={0.5}
                        value={element.textSize}
                        onChange={(textSize) => change({ textSize }, `${element.id}:textSize`)}
                    />
                ) : null}
                <ColorField label="Colour" value={element.color} onChange={(color) => change({ color }, `${element.id}:color`)} />
            </div>
        </EbAccordionItem>
    );
}

function ShapeSections({ element, onChange }: { element: ShapeElement; onChange: InspectorProps["onChange"] }) {
    const change = (patch: Partial<ShapeElement>, key?: string) => onChange(patch as Partial<LabelElement>, key);
    return (
        <EbAccordionItem title="Shape" defaultExpanded>
            <div className="lp-card-body">
                <EbSelect<ShapeKind> label="Kind" options={SHAPES} value={element.shape} onValueChange={(shape) => shape && change({ shape })} />
                <ColorField label="Outline" allowNone value={element.stroke} onChange={(stroke) => change({ stroke }, `${element.id}:stroke`)} />
                <NumberField
                    label="Outline width"
                    suffix="pt"
                    min={0}
                    max={36}
                    step={0.25}
                    value={element.strokeWidth}
                    onChange={(strokeWidth) => change({ strokeWidth }, `${element.id}:strokeWidth`)}
                />
                {element.shape !== "line" ? (
                    <ColorField label="Fill" allowNone value={element.fill} onChange={(fill) => change({ fill }, `${element.id}:fill`)} />
                ) : null}
                {element.shape === "rectangle" ? (
                    <LengthField
                        label="Corner radius"
                        max={5}
                        value={element.cornerRadius}
                        onChange={(cornerRadius) => change({ cornerRadius }, `${element.id}:cornerRadius`)}
                    />
                ) : null}
            </div>
        </EbAccordionItem>
    );
}

export function Inspector({ sheet, design, element, fields, onChange, onDesignChange, onDuplicate, onDelete, templateRef }: InspectorProps) {
    if (!element) {
        return (
            <div className="lp-inspector-empty">
                <h2 className="lp-heading">The label</h2>
                <p className="lp-note">
                    {formatFriendlyInches(sheet.labelHeight)} × {formatFriendlyInches(sheet.labelWidth)} · {design.elements.length} element
                    {design.elements.length === 1 ? "" : "s"}. Click an element to change it, or add one from the left — drag a field
                    onto the label to place it where you drop it.
                </p>
                <LengthField
                    label="Safe margin"
                    helpText="The dashed guide. Printers wander a millimetre or so; content inside it survives."
                    max={Math.min(sheet.labelWidth, sheet.labelHeight) / 2}
                    value={design.safeMargin}
                    onChange={(safeMargin) => onDesignChange({ safeMargin }, "design:safeMargin")}
                />
                <h3 className="lp-heading">Keyboard</h3>
                <div className="lp-shortcuts">
                    <span className="lp-kbd">Arrows</span>
                    <span>Nudge the selected element (Shift: further)</span>
                    <span className="lp-kbd">Delete</span>
                    <span>Remove it</span>
                    <span className="lp-kbd">Ctrl D</span>
                    <span>Duplicate it</span>
                    <span className="lp-kbd">Enter</span>
                    <span>Edit its text</span>
                    <span className="lp-kbd">Ctrl Z</span>
                    <span>Undo (Ctrl Y to redo)</span>
                </div>
            </div>
        );
    }

    const positionKey = `${element.id}:box`;

    return (
        <div className="lp-card-body">
            <div className="lp-inspector-title">
                <Icon name={TYPE_ICONS[element.type]} title={TYPE_NAMES[element.type]} />
                <EbTextBox
                    ariaLabel="Element name"
                    value={element.name}
                    onValueChange={(name) => onChange({ name: name.trim() || TYPE_NAMES[element.type] })}
                />
                <EbTooltip text="Duplicate (Ctrl D)">
                    <EbButton className="lp-compact lp-icon-button" aria-label="Duplicate" onClick={onDuplicate}>
                        <Icon name="copy" />
                    </EbButton>
                </EbTooltip>
                <EbTooltip text="Delete">
                    <EbButton className="lp-compact lp-icon-button" variant="danger" aria-label="Delete" onClick={onDelete}>
                        <Icon name="trash" />
                    </EbButton>
                </EbTooltip>
            </div>

            <EbAccordion allowMultiple>
                <EbAccordionItem title="Position and size" defaultExpanded>
                    <div className="lp-card-body">
                        <div className="lp-field-grid">
                            <LengthField label="Left" min={-50} max={50} value={element.x} onChange={(x) => onChange({ x }, positionKey)} />
                            <LengthField label="Top" min={-50} max={50} value={element.y} onChange={(y) => onChange({ y }, positionKey)} />
                            <LengthField label="Width" min={0.02} max={50} value={element.width} onChange={(width) => onChange({ width }, positionKey)} />
                            <LengthField label="Height" min={0.02} max={50} value={element.height} onChange={(height) => onChange({ height }, positionKey)} />
                        </div>
                        <AlignmentButtons element={element} sheet={sheet} design={design} onChange={(patch) => onChange(patch)} />
                        {element.type !== "shape" ? (
                            <EbSelect<Rotation>
                                label="Rotation"
                                options={ROTATIONS}
                                value={element.rotation}
                                onValueChange={(rotation) => rotation !== null && onChange({ rotation })}
                            />
                        ) : null}
                        <div className="lp-button-row">
                            <ToggleButton className="lp-compact" pressed={element.locked} onPressedChange={(locked) => onChange({ locked })}>
                                <Icon name={element.locked ? "lock" : "unlock"} /> {element.locked ? "Locked" : "Lock in place"}
                            </ToggleButton>
                            <ToggleButton className="lp-compact" pressed={element.hidden} onPressedChange={(hidden) => onChange({ hidden })}>
                                <Icon name={element.hidden ? "eyeOff" : "eye"} /> {element.hidden ? "Hidden" : "Hide"}
                            </ToggleButton>
                        </div>
                    </div>
                </EbAccordionItem>

                {element.type === "text" ? <TextSections element={element} fields={fields} onChange={onChange} templateRef={templateRef} /> : null}
                {element.type === "image" ? <ImageSections element={element} onChange={onChange} /> : null}
                {element.type === "qr" ? <QrSections element={element} fields={fields} onChange={onChange} templateRef={templateRef} /> : null}
                {element.type === "barcode" ? (
                    <BarcodeSections element={element} fields={fields} onChange={onChange} templateRef={templateRef} />
                ) : null}
                {element.type === "shape" ? <ShapeSections element={element} onChange={onChange} /> : null}
            </EbAccordion>
        </div>
    );
}
