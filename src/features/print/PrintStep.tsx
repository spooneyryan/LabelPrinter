import { EbButton, EbCard, EbRadioGroup, EbSwitch } from "@electricblazor/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { LengthField, NumberField } from "../../components/fields.tsx";
import { Icon } from "../../components/Icon.tsx";
import { defaultCalibration } from "../../model/defaults.ts";
import { freeSlots } from "../../model/paginate.ts";
import { cellSlot, labelsPerSheet } from "../../model/sheet.ts";
import type { Calibration, FillOrder } from "../../model/types.ts";
import { useProblemScan, type Job } from "../../render/job.ts";
import { SheetPage } from "../../render/SheetPage.tsx";
import { useStore } from "../../state/store.tsx";

/*
 * Step 4: what goes through the printer. The settings that belong to this job — copies, which
 * positions on a partly used sheet to skip, the order labels are used in — sit beside a preview
 * of each page exactly as it will print, and the calibration for this printer below them.
 */

const FILL_ORDERS: { value: FillOrder; label: string; description: string }[] = [
    { value: "across", label: "Across, then down", description: "Row by row, like reading" },
    { value: "down", label: "Down, then across", description: "Column by column" }
];

export interface PrintStepProps {
    job: Job;
    calibration: Calibration;
    onCalibrationChange: (calibration: Calibration) => void;
    onPrint: () => void;
    onPrintTest: () => void;
    onShowDesign: () => void;
}

/** The first sheet's positions, laid out like the sheet, to mark the ones already peeled off. */
function SlotMap({ onToggle }: { onToggle: (slot: number, range: boolean) => void }) {
    const { state } = useStore();
    const { sheet } = state.template;
    const used = new Set(state.print.usedSlots);
    const order = state.print.fillOrder;
    const cells = [];

    for (let row = 0; row < sheet.rows; row++) {
        for (let column = 0; column < sheet.columns; column++) {
            const slot = cellSlot(sheet, column, row, order);
            cells.push(
                <button
                    key={slot}
                    type="button"
                    className="lp-slot"
                    aria-pressed={used.has(slot)}
                    aria-label={`Position ${slot + 1}, row ${row + 1}, column ${column + 1}${used.has(slot) ? ", already used" : ""}`}
                    title={`Position ${slot + 1}`}
                    onClick={(event: MouseEvent) => onToggle(slot, event.shiftKey)}
                    style={{ aspectRatio: `${sheet.labelWidth} / ${sheet.labelHeight}` }}
                >
                    {slot + 1}
                </button>
            );
        }
    }

    const columnWidth = Math.max(16, Math.min(56, 240 / sheet.columns));
    return (
        <div className="lp-slot-map" style={{ gridTemplateColumns: `repeat(${sheet.columns}, ${columnWidth}px)` }} role="group" aria-label="Positions on the first sheet">
            {cells}
        </div>
    );
}

export function PrintStep({ job, calibration, onCalibrationChange, onPrint, onPrintTest, onShowDesign }: PrintStepProps) {
    const { state, dispatch } = useStore();
    const { sheet, design } = state.template;
    const { print, data } = state;
    const [pageIndex, setPageIndex] = useState(0);
    const stageRef = useRef<HTMLDivElement>(null);
    const [room, setRoom] = useState({ width: 600, height: 700 });

    useEffect(() => {
        const element = stageRef.current;
        if (!element) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => setRoom({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const problems = useProblemScan(design, data, job.rows);
    const problemCount = new Set([...problems.overflowRows, ...problems.codeRows]).size;

    const pages = job.pages;
    const current = Math.min(pageIndex, Math.max(0, pages.length - 1));
    const page = pages[current];
    const ppi = Math.max(20, Math.min((room.width - 32) / sheet.pageWidth, (room.height - 32) / sheet.pageHeight));
    const usedSet = useMemo(() => new Set(print.usedSlots), [print.usedSlots]);

    const perSheet = labelsPerSheet(sheet);
    const free = freeSlots(sheet, print.usedSlots).length;
    const setPrint = (update: Partial<typeof print>) => dispatch({ type: "setPrint", update });

    const toggleSlot = (slot: number, range: boolean) => {
        const used = new Set(print.usedSlots);
        if (range) {
            // Shift-click: everything before this position is used, and this is where printing starts.
            used.clear();
            for (let previous = 0; previous < slot; previous++) {
                used.add(previous);
            }
        } else if (used.has(slot)) {
            used.delete(slot);
        } else {
            used.add(slot);
        }

        if (used.size >= perSheet) {
            return;
        }

        setPrint({ usedSlots: [...used].sort((a, b) => a - b) });
    };

    const calibrated =
        calibration.offsetX !== 0 || calibration.offsetY !== 0 || calibration.scaleX !== 100 || calibration.scaleY !== 100;

    return (
        <div className="lp-step lp-print-step">
            <div className="lp-column lp-scroll">
                <EbCard title="Print job">
                    <div className="lp-card-body">
                        <dl className="lp-dl">
                            <dt>Stock</dt>
                            <dd>{sheet.name}</dd>
                            {data ? (
                                <>
                                    <dt>Records</dt>
                                    <dd>
                                        {job.rows?.length ?? 0} of {data.rows.length}
                                    </dd>
                                </>
                            ) : null}
                            <dt>Labels</dt>
                            <dd>{job.queue.length}</dd>
                            <dt>Sheets</dt>
                            <dd>{pages.length}</dd>
                        </dl>
                        {data ? (
                            <>
                                <NumberField
                                    label="Copies of each label"
                                    integer
                                    min={1}
                                    max={1000}
                                    value={print.copies}
                                    onChange={(copies) => setPrint({ copies })}
                                />
                                {print.copies > 1 ? (
                                    <EbSwitch
                                        label="Repeat the whole set"
                                        helpText={print.collate ? "A B C, A B C" : "Off: each record's copies together, A A B B C C"}
                                        value={print.collate}
                                        onValueChange={(collate) => setPrint({ collate })}
                                    />
                                ) : null}
                            </>
                        ) : (
                            <>
                                <p className="lp-note">No data is loaded, so every position gets the same label.</p>
                                <NumberField
                                    label="Sheets to print"
                                    integer
                                    min={1}
                                    max={500}
                                    value={print.sheetsWithoutData}
                                    onChange={(sheetsWithoutData) => setPrint({ sheetsWithoutData })}
                                />
                            </>
                        )}
                        <EbRadioGroup<FillOrder>
                            label="Fill order"
                            options={FILL_ORDERS}
                            value={print.fillOrder}
                            onValueChange={(fillOrder) => setPrint({ fillOrder, usedSlots: [] })}
                        />
                        <EbSwitch
                            label="Print label outlines"
                            helpText="For a test run on plain paper, held up to a sheet of labels"
                            value={print.outlines}
                            onValueChange={(outlines) => setPrint({ outlines })}
                        />
                    </div>
                </EbCard>

                <EbCard title="Partly used sheet">
                    <div className="lp-card-body">
                        <p className="lp-note">
                            Click the positions already peeled off the first sheet and the job skips them. Shift-click a position to start
                            printing there.
                        </p>
                        <SlotMap onToggle={toggleSlot} />
                        <div className="lp-stat-row">
                            <span className="lp-muted">
                                {print.usedSlots.length} used · {free} free on the first sheet
                            </span>
                            {print.usedSlots.length > 0 ? (
                                <button type="button" className="lp-link-button lp-small" onClick={() => setPrint({ usedSlots: [] })}>
                                    Clear
                                </button>
                            ) : null}
                        </div>
                    </div>
                </EbCard>

                <EbCard title="Printer calibration" collapsible defaultCollapsed={!calibrated}>
                    <div className="lp-card-body">
                        <p className="lp-note">
                            If every label prints off by the same amount, print the alignment test on plain paper, hold it against a sheet
                            of labels, and move the page by the difference. This is saved for this browser, not the template.
                        </p>
                        <div className="lp-field-grid">
                            <LengthField
                                label="Move right"
                                helpText="Negative moves left"
                                min={-2}
                                max={2}
                                value={calibration.offsetX}
                                onChange={(offsetX) => onCalibrationChange({ ...calibration, offsetX })}
                            />
                            <LengthField
                                label="Move down"
                                helpText="Negative moves up"
                                min={-2}
                                max={2}
                                value={calibration.offsetY}
                                onChange={(offsetY) => onCalibrationChange({ ...calibration, offsetY })}
                            />
                            <NumberField
                                label="Stretch across"
                                suffix="%"
                                min={90}
                                max={110}
                                step={0.1}
                                value={calibration.scaleX}
                                onChange={(scaleX) => onCalibrationChange({ ...calibration, scaleX })}
                            />
                            <NumberField
                                label="Stretch down"
                                helpText="Fixes labels that drift further off row by row"
                                suffix="%"
                                min={90}
                                max={110}
                                step={0.1}
                                value={calibration.scaleY}
                                onChange={(scaleY) => onCalibrationChange({ ...calibration, scaleY })}
                            />
                        </div>
                        <div className="lp-button-row">
                            <EbButton onClick={onPrintTest}>
                                <Icon name="calibrate" /> Print alignment test
                            </EbButton>
                            {calibrated ? <EbButton onClick={() => onCalibrationChange(defaultCalibration())}>Reset</EbButton> : null}
                        </div>
                    </div>
                </EbCard>
            </div>

            <div className="lp-preview-column">
                <div className="lp-preview-toolbar">
                    <div className="lp-toolbar-group">
                        <EbButton className="lp-compact lp-icon-button" aria-label="Previous page" disabled={current === 0} onClick={() => setPageIndex(current - 1)}>
                            <Icon name="chevronLeft" />
                        </EbButton>
                        <span className="lp-record-label" aria-live="polite">
                            {pages.length === 0 ? "Nothing to print" : `Sheet ${current + 1} of ${pages.length}`}
                        </span>
                        <EbButton
                            className="lp-compact lp-icon-button"
                            aria-label="Next page"
                            disabled={current >= pages.length - 1}
                            onClick={() => setPageIndex(current + 1)}
                        >
                            <Icon name="chevronRight" />
                        </EbButton>
                    </div>
                    <EbButton variant="primary" className="lp-print-button" style={{ width: "auto" }} disabled={pages.length === 0} onClick={onPrint}>
                        <Icon name="printer" /> Print {pages.length} sheet{pages.length === 1 ? "" : "s"}…
                    </EbButton>
                </div>

                {problemCount > 0 ? (
                    <div className="lp-issue lp-issue-warning" role="status">
                        <Icon name="alert" />
                        <span>
                            {data
                                ? `${problemCount} record${problemCount === 1 ? "" : "s"} won't print cleanly: text that doesn't fit even at its smallest size, or a value its code can't hold.`
                                : "The label has text that doesn't fit, or a code that can't hold its value."}{" "}
                            <button type="button" className="lp-link-button" onClick={onShowDesign}>
                                Review on the Design step
                            </button>
                        </span>
                    </div>
                ) : null}

                <div className="lp-preview-stage" ref={stageRef}>
                    {page ? (
                        <SheetPage
                            sheet={sheet}
                            design={design}
                            labels={page.labels}
                            contextFor={job.contextFor}
                            ppi={ppi}
                            fillOrder={print.fillOrder}
                            outlines={print.outlines}
                            usedSlots={current === 0 ? usedSet : new Set()}
                        />
                    ) : (
                        <p className="lp-note">There is nothing to print: every record is excluded.</p>
                    )}
                </div>

                <ul className="lp-tips">
                    <li>
                        In the print dialog choose <strong>Scale: 100%</strong> (or “Actual size”) and turn <strong>Headers and footers</strong>{" "}
                        off. Margins are already set to none.
                    </li>
                    <li>Print one sheet on plain paper first and hold it against the labels in front of a window.</li>
                    <li>Feed label sheets the way your printer's manual says — usually face up in the tray, top edge first.</li>
                </ul>
            </div>
        </div>
    );
}
