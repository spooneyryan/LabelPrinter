import { EbButton, EbCard, EbSelect, EbTextBox, useToast } from "@electricblazor/react";
import { useMemo, useState } from "react";
import { LengthField, NumberField, useUnit } from "../../components/fields.tsx";
import { Icon } from "../../components/Icon.tsx";
import { fitDesignToLabel, labelSizeChanged } from "../../model/fit.ts";
import {
    matchesSearch,
    PRESET_BRANDS,
    presetShape,
    presetSummary,
    presetTitle,
    SHEET_PRESETS,
    sheetFromPreset
} from "../../model/presets.ts";
import {
    centerGrid,
    labelsPerSheet,
    sameLayout,
    spreadGrid,
    testInset,
    trailingMargins,
    validateSheet,
    type ShapeCategory
} from "../../model/sheet.ts";
import type { LabelShape, SheetSpec } from "../../model/types.ts";
import { describeLength, formatFriendlyInches } from "../../model/units.ts";
import { useEditor, useStore } from "../../state/store.tsx";
import { CornerDetail, describeMeasure, MeasureLegend, SheetDiagram, SheetThumb } from "./SheetDiagram.tsx";

/*
 * Step 1: the label stock. Pick a product, or measure a sheet and type it in; the diagram redraws
 * as the numbers change, and anything that cannot be printed says why. Changing the label size
 * carries the design across (see fit.ts) — one undo puts it back.
 */

const ALL_MAKERS = "All makers";
const ANY_SHAPE = "Any shape";
const SHAPE_FILTERS: readonly (typeof ANY_SHAPE | ShapeCategory)[] = [ANY_SHAPE, "Rectangle", "Square", "Round", "Oval"];

const SHAPES: { value: LabelShape; label: string }[] = [
    { value: "rounded", label: "Rounded corners" },
    { value: "rectangle", label: "Square corners" },
    { value: "ellipse", label: "Round or oval" }
];

/** A field label carrying the letter that marks it on the corner detail. */
function tagged(text: string, letter: string) {
    return (
        <span className="lp-tagged-label">
            {text}
            <span className="lp-legend-tag lp-legend-tag-small" aria-hidden="true">
                {letter}
            </span>
        </span>
    );
}

export interface SheetStepProps {
    /** Prints the test sheet for the current measurements. */
    onPrintTest: () => void;
    /** Whether a printer calibration is set, which the test sheet applies like any print. */
    calibrated: boolean;
}

export function SheetStep({ onPrintTest, calibrated }: SheetStepProps) {
    const { state } = useStore();
    const editor = useEditor();
    const toast = useToast();
    const unit = useUnit();
    const sheet = state.template.sheet;
    const [search, setSearch] = useState("");
    const [maker, setMaker] = useState(ALL_MAKERS);
    const [shape, setShape] = useState<(typeof SHAPE_FILTERS)[number]>(ANY_SHAPE);

    const presets = useMemo(
        () =>
            SHEET_PRESETS.filter(
                (preset) =>
                    (maker === ALL_MAKERS || preset.brand === maker) &&
                    (shape === ANY_SHAPE || presetShape(preset) === shape) &&
                    matchesSearch(preset, search)
            ),
        [maker, shape, search]
    );

    const issues = validateSheet(sheet, unit);
    const hasErrors = issues.some((issue) => issue.severity === "error");
    const errorFor = (field: keyof SheetSpec) =>
        issues.find((issue) => issue.field === field && issue.severity === "error")?.message ?? null;

    /** Applies a new sheet, carrying the design over when the label size changed. */
    const applySheet = (next: SheetSpec, key?: string, announce = false) => {
        // Picking the stock already in use is not an edit, and must not cost an undo step.
        if (next.presetId === sheet.presetId && next.name === sheet.name && sameLayout(next, sheet)) {
            return;
        }

        const resized = labelSizeChanged(sheet, next) && state.template.design.elements.length > 0;
        editor.edit(
            (template) => ({
                ...template,
                sheet: next,
                design: fitDesignToLabel(template.design, template.sheet, next)
            }),
            key
        );

        if (resized && announce) {
            toast.showInfo(
                `The design was scaled to fit ${formatFriendlyInches(next.labelHeight)} × ${formatFriendlyInches(next.labelWidth)} labels. Undo (Ctrl+Z) to keep the old layout.`,
                { title: next.name, durationMs: 6000 }
            );
        }
    };

    /** Edits measurements; the sheet becomes "custom" unless the numbers land on a preset again. */
    const editMeasurements = (patch: Partial<SheetSpec>, key: string) => {
        const next = { ...sheet, ...patch };
        const match = SHEET_PRESETS.find((preset) => sameLayout(preset.sheet, next));
        if (match) {
            applySheet({ ...next, presetId: match.id, name: sheet.presetId === match.id ? sheet.name : presetTitle(match) }, key);
        } else {
            const name = sheet.presetId === "custom" ? sheet.name : `Custom (from ${sheet.name})`;
            applySheet({ ...next, presetId: "custom", name }, key);
        }
    };

    const { right, bottom } = trailingMargins(sheet);

    return (
        <div className="lp-step lp-sheet-step">
            <EbCard title="Label stock" className="lp-column">
                <div className="lp-card-body">
                    <EbTextBox
                        type="search"
                        label="Find a product"
                        placeholder="Code or size: 5160, S001, 1 x 1"
                        helpText="Search by product or template code, or by label size"
                        value={search}
                        onValueChange={setSearch}
                        immediate
                    />
                    <div className="lp-preset-filters" role="group" aria-label="Maker">
                        {[ALL_MAKERS, ...PRESET_BRANDS].map((option) => (
                            <EbButton
                                key={option}
                                className="lp-chip lp-toggle"
                                aria-pressed={maker === option}
                                onClick={() => setMaker(option)}
                            >
                                {option}
                            </EbButton>
                        ))}
                    </div>
                    <div className="lp-preset-filters" role="group" aria-label="Label shape">
                        {SHAPE_FILTERS.map((option) => (
                            <EbButton
                                key={option}
                                className="lp-chip lp-toggle"
                                aria-pressed={shape === option}
                                onClick={() => setShape(option)}
                            >
                                {option}
                            </EbButton>
                        ))}
                    </div>
                    <span className="lp-muted lp-small" aria-live="polite">
                        {presets.length === SHEET_PRESETS.length ? `${presets.length} sheets` : `${presets.length} of ${SHEET_PRESETS.length} sheets`}
                    </span>
                    <div className="lp-preset-list">
                        {presets.length === 0 ? (
                            <p className="lp-note">
                                No sheet matches. Measure yours and enter it under Measurements — most stock is described by
                                the label size, the count across and down, and the top and left margins.
                            </p>
                        ) : null}
                        {presets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="lp-preset"
                                aria-pressed={sheet.presetId === preset.id}
                                onClick={() => applySheet(sheetFromPreset(preset), undefined, true)}
                            >
                                <SheetThumb sheet={preset.sheet} />
                                <span>
                                    <span className="lp-preset-title">{presetTitle(preset)}</span>
                                    <br />
                                    <span className="lp-preset-summary">{presetSummary(preset)}</span>
                                    {preset.compatible.length > 0 ? (
                                        <>
                                            <br />
                                            <span className="lp-preset-summary">Also {preset.compatible.join(", ")}</span>
                                        </>
                                    ) : null}
                                    {preset.note ? (
                                        <>
                                            <br />
                                            <span className="lp-preset-summary">{preset.note}</span>
                                        </>
                                    ) : null}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </EbCard>

            <EbCard title={sheet.name} className="lp-diagram-card">
                <div className="lp-card-body">
                    <div className="lp-diagrams">
                        <figure style={{ margin: 0 }}>
                            <SheetDiagram sheet={sheet} unit={unit} />
                            <figcaption className="lp-diagram-caption">The whole sheet</figcaption>
                        </figure>
                        <figure style={{ margin: 0 }}>
                            <CornerDetail sheet={sheet} />
                            <figcaption className="lp-diagram-caption">Top-left corner, enlarged</figcaption>
                            <MeasureLegend sheet={sheet} unit={unit} />
                        </figure>
                    </div>
                    <div className="lp-sheet-summary">
                        <span>
                            <strong>{labelsPerSheet(sheet)}</strong> labels per sheet ({sheet.columns} across × {sheet.rows} down)
                        </span>
                        <span>
                            Right margin <strong>{describeLength(Math.max(0, right), unit)}</strong>
                        </span>
                        <span>
                            Bottom margin <strong>{describeLength(Math.max(0, bottom), unit)}</strong>
                        </span>
                    </div>
                    <div className="lp-test-row">
                        <EbButton onClick={onPrintTest} disabled={hasErrors}>
                            <Icon name="printer" /> Test
                        </EbButton>
                        <p className="lp-note">
                            {hasErrors ? (
                                <>Fix the measurements first; the problems are listed under Measurements.</>
                            ) : (
                                <>
                                    Prints a box {describeMeasure(testInset(sheet), unit)} inside every label. Print it on a sheet of these
                                    labels, or on plain paper held against one in front of a window: if the measurements are right, every
                                    box sits inside its label with an even gap all round.
                                    {calibrated ? " This printer's calibration from the Print step is applied." : ""}
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </EbCard>

            <EbCard title="Measurements" className="lp-column">
                <div className="lp-card-body">
                    <EbTextBox
                        label="Name"
                        value={sheet.name}
                        onValueChange={(name) => editor.editSheet((current) => ({ ...current, name: name.trim() || current.name }))}
                    />
                    <p className="lp-note">
                        Page: US Letter, {formatFriendlyInches(sheet.pageWidth)} × {formatFriendlyInches(sheet.pageHeight)}. Lengths take
                        decimals, fractions like 2 5/8, or millimetres like 66.7mm.
                    </p>
                    <div className="lp-field-grid">
                        <LengthField
                            label={tagged("Label width", "C")}
                            value={sheet.labelWidth}
                            min={0.05}
                            max={sheet.pageWidth}
                            onChange={(labelWidth) => editMeasurements({ labelWidth }, "sheet:labelWidth")}
                            errorText={errorFor("labelWidth")}
                        />
                        <LengthField
                            label={tagged("Label height", "D")}
                            value={sheet.labelHeight}
                            min={0.05}
                            max={sheet.pageHeight}
                            onChange={(labelHeight) => editMeasurements({ labelHeight }, "sheet:labelHeight")}
                            errorText={errorFor("labelHeight")}
                        />
                        <NumberField
                            label="Across"
                            integer
                            min={1}
                            max={50}
                            value={sheet.columns}
                            suffix="cols"
                            onChange={(columns) => editMeasurements({ columns }, "sheet:columns")}
                            errorText={errorFor("columns")}
                        />
                        <NumberField
                            label="Down"
                            integer
                            min={1}
                            max={100}
                            value={sheet.rows}
                            suffix="rows"
                            onChange={(rows) => editMeasurements({ rows }, "sheet:rows")}
                            errorText={errorFor("rows")}
                        />
                        <LengthField
                            label={tagged("Top margin", "A")}
                            value={sheet.marginTop}
                            max={sheet.pageHeight}
                            onChange={(marginTop) => editMeasurements({ marginTop }, "sheet:marginTop")}
                            errorText={errorFor("marginTop")}
                        />
                        <LengthField
                            label={tagged("Left margin", "B")}
                            value={sheet.marginLeft}
                            max={sheet.pageWidth}
                            onChange={(marginLeft) => editMeasurements({ marginLeft }, "sheet:marginLeft")}
                            errorText={errorFor("marginLeft")}
                        />
                        <LengthField
                            label={tagged("Gap across", "E")}
                            helpText="Between labels in a row"
                            value={sheet.gapX}
                            max={sheet.pageWidth}
                            onChange={(gapX) => editMeasurements({ gapX }, "sheet:gapX")}
                            errorText={errorFor("gapX")}
                        />
                        <LengthField
                            label={tagged("Gap down", "F")}
                            helpText="Between rows"
                            value={sheet.gapY}
                            max={sheet.pageHeight}
                            onChange={(gapY) => editMeasurements({ gapY }, "sheet:gapY")}
                            errorText={errorFor("gapY")}
                        />
                        <EbSelect<LabelShape>
                            label="Shape"
                            options={SHAPES}
                            value={sheet.shape}
                            onValueChange={(shape) => shape && editMeasurements({ shape }, "sheet:shape")}
                        />
                        {sheet.shape === "rounded" ? (
                            <LengthField
                                label="Corner radius"
                                value={sheet.cornerRadius}
                                max={2}
                                onChange={(cornerRadius) => editMeasurements({ cornerRadius }, "sheet:cornerRadius")}
                            />
                        ) : null}
                    </div>
                    <div className="lp-button-row">
                        <EbButton onClick={() => editMeasurements(centerGrid(sheet), "sheet:center")}>
                            <Icon name="alignCenterH" /> Center on page
                        </EbButton>
                        <EbButton onClick={() => editMeasurements(spreadGrid(sheet), "sheet:spread")}>
                            <Icon name="fit" /> Even out gaps
                        </EbButton>
                    </div>
                    <p className="lp-note">
                        <strong>Even out gaps</strong> works out the gaps from the margins, assuming the sheet is cut the same on both
                        sides — handy when all you have is a ruler and the label size.
                    </p>
                    {issues.map((issue, index) => (
                        <div key={index} className={`lp-issue lp-issue-${issue.severity}`} role="alert">
                            <Icon name="alert" />
                            <span>{issue.message}</span>
                        </div>
                    ))}
                </div>
            </EbCard>
        </div>
    );
}
