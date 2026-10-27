import {
    EbButton,
    EbDialogHost,
    EbPopover,
    EbRadioGroup,
    EbSaveMenu,
    EbTabbedCard,
    EbTextBox,
    EbThemeSwitcher,
    EbToastHost,
    EbTooltip,
    OverlayStackProvider,
    useDialogs,
    useToast,
    type TabItem
} from "@electricblazor/react";
import { BrowserFileSaveStore } from "@electricblazor/react/save";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { UnitContext } from "./components/fields.tsx";
import { Icon } from "./components/Icon.tsx";
import { DataStep } from "./features/data/DataStep.tsx";
import { DEFAULT_DESIGN_UI, DesignStep, type DesignUi } from "./features/design/DesignStep.tsx";
import { PrintStep } from "./features/print/PrintStep.tsx";
import { SheetStep } from "./features/sheet/SheetStep.tsx";
import { defaultSession, isCalibrated } from "./model/defaults.ts";
import { ProjectMenu } from "./features/project/ProjectMenu.tsx";
import { readLabelFile, sanitizeTemplate, toProjectFile } from "./model/project.ts";
import type { Calibration, LabelTemplate, Session } from "./model/types.ts";
import type { LengthUnit } from "./model/units.ts";
import { useJob } from "./render/job.ts";
import { PRINT_PPI, PrintRoot, SheetPage, TestPage } from "./render/SheetPage.tsx";
import {
    listProjects,
    loadCalibration,
    loadProject,
    loadSession,
    loadTheme,
    loadUnit,
    namingTemplateStore,
    saveCalibration,
    saveProject,
    saveTheme,
    saveUnit,
    useAutosave,
    type SaveStatus
} from "./state/persistence.ts";
import { sessionOf, StoreProvider, useEditor, useStore } from "./state/store.tsx";

/*
 * The shell: a header with the template's name and its file actions, and the four steps as tabs —
 * sheet, data, design, print — which can be visited in any order. The print root lives here
 * rather than in the Print step, so Ctrl+P (or the browser's own Print menu) prints the job from
 * any step.
 */

type StepId = "sheet" | "data" | "design" | "print";

interface PrintRequest {
    kind: "job" | "test";
    /** False when the browser started the print itself (its menu), which must not be started twice. */
    callPrint: boolean;
}

const fileStore = new BrowserFileSaveStore();

/** The keys EbTabbedCard moves between tabs with. */
const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/*
 * EbTabbedCard listens for its tab keys on its whole root, panel included, and acts on them from
 * anywhere inside: an arrow pressed in a text box was cancelled and switched steps instead of
 * moving the caret, as was an arrow nudging an element on the canvas. Keys pressed inside a step
 * are the step's, so they stop at its edge; the tab strip itself still answers its own arrows.
 * React events bubble through portals by component tree, so this covers the dialogs and popovers
 * a step opens as well.
 */
const keepKeysInStep = (event: ReactKeyboardEvent) => {
    if (TAB_KEYS.has(event.key)) {
        event.stopPropagation();
    }
};

const UNITS: { value: LengthUnit; label: string }[] = [
    { value: "in", label: "Inches" },
    { value: "mm", label: "Millimetres" }
];

function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return true;
    }

    return target.tagName === "INPUT" && !["checkbox", "radio", "button", "range", "color", "file"].includes((target as HTMLInputElement).type);
}

function Workspace({ initialStep }: { initialStep: StepId }) {
    const { state, dispatch } = useStore();
    const editor = useEditor();
    const toast = useToast();
    const dialogs = useDialogs();

    const [step, setStep] = useState<StepId>(initialStep);
    const [unit, setUnit] = useState<LengthUnit>(loadUnit);
    const [theme, setTheme] = useState(loadTheme);
    const [calibration, setCalibration] = useState<Calibration>(loadCalibration);
    const [designUi, setDesignUi] = useState<DesignUi>(DEFAULT_DESIGN_UI);
    const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [settingsOpen, setSettingsOpen] = useState(false);
    /** The name the open project was last saved or opened as, so Save doesn't ask to replace it. */
    const [savedAs, setSavedAs] = useState<string | null>(null);
    /** Ctrl+S, kept current so the window's key handler always saves the latest session. */
    const saveShortcut = useRef<() => void>(() => undefined);
    const settingsAnchor = useRef<HTMLButtonElement>(null);
    const printing = useRef(false);
    printing.current = printRequest !== null;

    const { template, data, excluded, print } = state;
    const session = useMemo(() => sessionOf({ template, data, excluded, print }), [template, data, excluded, print]);
    useAutosave(session, setSaveStatus);
    const job = useJob(state);

    const savedTemplates = useMemo(
        () =>
            namingTemplateStore((name) => {
                editor.edit((current) => (current.name === name ? current : { ...current, name }));
                toast.showSuccess(`Saved the template as “${name}”.`);
            }),
        [editor, toast]
    );

    useEffect(() => {
        document.documentElement.setAttribute("data-eb-theme", theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => saveUnit(unit), [unit]);
    useEffect(() => saveCalibration(calibration), [calibration]);

    const onDesignUiChange = useCallback((patch: Partial<DesignUi>) => setDesignUi((current) => ({ ...current, ...patch })), []);

    const startPrint = useCallback((kind: PrintRequest["kind"]) => setPrintRequest({ kind, callPrint: true }), []);

    // Our own print: wait for the pages to be ready to draw, then open the dialog.
    useEffect(() => {
        if (!printRequest?.callPrint) {
            return;
        }

        let cancelled = false;
        void (async () => {
            await document.fonts.ready;
            const images = [...document.querySelectorAll<HTMLImageElement>(".lp-print-root img")];
            await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (!cancelled) {
                window.print();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [printRequest]);

    // The browser's print (its menu, or a shortcut we did not catch): render the job synchronously
    // so the snapshot it is about to take includes it.
    useEffect(() => {
        const before = () => {
            if (!printing.current) {
                flushSync(() => setPrintRequest({ kind: "job", callPrint: false }));
            }
        };
        const after = () => setPrintRequest(null);
        window.addEventListener("beforeprint", before);
        window.addEventListener("afterprint", after);
        return () => {
            window.removeEventListener("beforeprint", before);
            window.removeEventListener("afterprint", after);
        };
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) {
                return;
            }

            const key = event.key.toLowerCase();
            if (key === "p") {
                event.preventDefault();
                startPrint("job");
                return;
            }

            if (key === "s" && !event.shiftKey) {
                event.preventDefault();
                saveShortcut.current();
                return;
            }

            // In a text box the browser's own undo is the right one.
            if (isTyping(event.target)) {
                return;
            }

            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                editor.undo();
            } else if ((key === "z" && event.shiftKey) || key === "y") {
                event.preventDefault();
                editor.redo();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [editor, startPrint]);

    const applyTemplate = (value: unknown, origin: string) => {
        const loaded = sanitizeTemplate(value);
        if (!loaded) {
            toast.showError(`${origin} is not a label template.`);
            return;
        }

        editor.edit(() => loaded);
        setDesignUi(DEFAULT_DESIGN_UI);
        toast.showSuccess(`Opened “${loaded.name}”. Undo (Ctrl+Z) to go back.`);
    };

    const fileName = (suffix = "") => `${template.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "labels"}${suffix}`;
    const failed = (title: string) => (error: unknown) =>
        toast.showError(error instanceof Error ? error.message : String(error), { title });

    /** Saves the project in this browser, asking first before it replaces a different one. */
    const saveProjectAs = async (name: string) => {
        if (name !== savedAs) {
            const existing = await listProjects().catch(() => []);
            if (
                existing.some((entry) => entry.key === name) &&
                !(await dialogs.confirm(`A project called “${name}” is already saved. Replace it?`, {
                    title: "Save project",
                    confirmLabel: "Replace"
                }))
            ) {
                return;
            }
        }

        if (name !== template.name) {
            editor.edit((current) => ({ ...current, name }));
        }

        await saveProject({ ...session, template: { ...session.template, name } });
        setSavedAs(name);
        toast.showSuccess(`Saved the project “${name}” in this browser.`);
    };

    const saveCurrentProject = () => void saveProjectAs(template.name).catch(failed("Couldn't save the project"));
    saveShortcut.current = saveCurrentProject;

    const promptSaveAs = async () => {
        const name = await dialogs.prompt("Name the project. It keeps the sheet, the design, the data and the print settings.", {
            title: "Save project as",
            initialValue: template.name,
            required: true,
            confirmLabel: "Save"
        });

        if (name?.trim()) {
            await saveProjectAs(name.trim()).catch(failed("Couldn't save the project"));
        }
    };

    /** Replaces everything with a project, after asking: opening one can't be undone. */
    const openSession = async (opened: Session, name: string) => {
        const confirmed = await dialogs.confirm(
            `Open “${name}”? It replaces the open label, data and print settings, which can't be undone — save them first to keep them.`,
            { title: "Open project", confirmLabel: "Open" }
        );

        if (confirmed) {
            dispatch({ type: "load", session: opened });
            setDesignUi(DEFAULT_DESIGN_UI);
            setSavedAs(opened.template.name);
            toast.showSuccess(`Opened the project “${name}”.`);
        }
    };

    const openSavedProject = async (name: string) => {
        const opened = await loadProject(name).catch(() => null);
        if (opened) {
            await openSession(opened, name);
        } else {
            toast.showError(`The saved project “${name}” couldn't be read.`);
        }
    };

    const openFile = async () => {
        const value = await fileStore.load<unknown>("");
        if (value === null) {
            return;
        }

        const opened = readLabelFile(value);
        if (opened?.kind === "project") {
            await openSession(opened.session, opened.session.template.name);
        } else if (opened?.kind === "template") {
            applyTemplate(opened.template, "That file");
        } else {
            toast.showError("That file is not a label project or template.");
        }
    };

    const startOver = async () => {
        const confirmed = await dialogs.confirm(
            "Start a new label? The current design and data will be cleared. Save the project first to keep it.",
            { title: "Start over", confirmLabel: "Start over", confirmVariant: "danger" }
        );

        if (confirmed) {
            dispatch({ type: "load", session: defaultSession() });
            setDesignUi(DEFAULT_DESIGN_UI);
            setSavedAs(null);
            setStep("sheet");
        }
    };

    const calibrated = isCalibrated(calibration);
    const includedCount = data ? data.rows.length - excluded.size : 0;
    const steps: TabItem<StepId>[] = [
        { value: "sheet", label: "1  Sheet", badge: template.sheet.presetId === "custom" ? "custom" : template.sheet.name.replace(/^Avery /, "") },
        {
            value: "data",
            label: "2  Data",
            badge: data ? String(includedCount) : undefined,
            accessibleLabel: data ? `Data, ${includedCount} records` : "Data"
        },
        { value: "design", label: "3  Design" },
        {
            value: "print",
            label: "4  Print",
            badge: job.pages.length > 0 ? `${job.pages.length} sheet${job.pages.length === 1 ? "" : "s"}` : undefined
        }
    ];

    const saveText = { idle: "", saving: "Saving…", saved: "Saved in this browser", failed: "Couldn't save — storage may be full" }[saveStatus];

    return (
        <UnitContext.Provider value={unit}>
            <div className="lp-app">
                <header className="lp-header">
                    <div className="lp-brand">
                        <img className="lp-brand-mark" src="/favicon.svg" alt="" />
                        Label Printer
                    </div>
                    <EbTextBox
                        className="lp-title-field"
                        ariaLabel="Template name"
                        value={template.name}
                        onValueChange={(name) => editor.edit((current) => ({ ...current, name: name.trim() || "Untitled labels" }))}
                    />
                    <span className="lp-save-state" aria-live="polite">
                        {saveText}
                    </span>
                    <span className="lp-header-spacer" />
                    <div className="lp-header-actions lp-compact">
                        <EbTooltip text="Undo (Ctrl+Z)">
                            <EbButton className="lp-icon-button" aria-label="Undo" disabled={state.past.length === 0} onClick={editor.undo}>
                                <Icon name="undo" />
                            </EbButton>
                        </EbTooltip>
                        <EbTooltip text="Redo (Ctrl+Y)">
                            <EbButton className="lp-icon-button" aria-label="Redo" disabled={state.future.length === 0} onClick={editor.redo}>
                                <Icon name="redo" />
                            </EbButton>
                        </EbTooltip>
                        <EbSaveMenu<LabelTemplate>
                            saveLabel="Templates"
                            store={savedTemplates}
                            value={template}
                            onValueChange={(value) => value && applyTemplate(value, "That saved template")}
                        />
                        <ProjectMenu
                            name={template.name}
                            onSave={saveCurrentProject}
                            onSaveAs={() => void promptSaveAs()}
                            onSaveFile={() => void fileStore.save(fileName(), toProjectFile(session)).catch(failed("Couldn't save the file"))}
                            onOpenFile={() => void openFile().catch(failed("Couldn't open the file"))}
                            onSaveTemplateFile={() => void fileStore.save(fileName(" template"), template).catch(failed("Couldn't save the file"))}
                            onOpenProject={(name) => void openSavedProject(name)}
                        />
                        <EbButton onClick={() => void startOver()}>
                            <Icon name="file" /> New
                        </EbButton>
                        <EbButton
                            ref={settingsAnchor}
                            className="lp-icon-button"
                            aria-label="Settings"
                            aria-expanded={settingsOpen}
                            onClick={() => setSettingsOpen((open) => !open)}
                        >
                            <Icon name="settings" />
                        </EbButton>
                        <EbPopover visible={settingsOpen} onVisibleChange={setSettingsOpen} anchorRef={settingsAnchor} placement="bottom" align="end">
                            <div className="lp-settings">
                                <EbThemeSwitcher value={theme} onValueChange={setTheme} applyToDocument={false} label="Skin" />
                                <EbRadioGroup<LengthUnit>
                                    label="Measure in"
                                    horizontal
                                    options={UNITS}
                                    value={unit}
                                    onValueChange={setUnit}
                                />
                                <p className="lp-note">
                                    Everything is kept in this browser: the open label, saved projects and templates, and the
                                    printer calibration. Save a project to a file to move it to another computer.
                                </p>
                            </div>
                        </EbPopover>
                    </div>
                </header>

                <EbTabbedCard<StepId>
                    className="lp-steps"
                    panelClass="lp-step-panel"
                    appearance="bare"
                    ariaLabel="Steps"
                    items={steps}
                    value={step}
                    onValueChange={setStep}
                    panelContent={(value) => (
                        <div className="lp-step-keys" onKeyDown={keepKeysInStep}>
                            <ErrorBoundary resetKey={value}>
                                {value === "sheet" ? <SheetStep onPrintTest={() => startPrint("test")} calibrated={calibrated} /> : null}
                                {value === "data" ? <DataStep onShowDesign={() => setStep("design")} /> : null}
                                {value === "design" ? <DesignStep ui={designUi} onUiChange={onDesignUiChange} /> : null}
                                {value === "print" ? (
                                    <PrintStep
                                        job={job}
                                        calibration={calibration}
                                        onCalibrationChange={setCalibration}
                                        onPrint={() => startPrint("job")}
                                        onPrintTest={() => startPrint("test")}
                                        onShowDesign={() => setStep("design")}
                                    />
                                ) : null}
                            </ErrorBoundary>
                        </div>
                    )}
                />
            </div>

            {printRequest ? (
                <PrintRoot sheet={template.sheet}>
                    {printRequest.kind === "test" ? (
                        <TestPage sheet={template.sheet} ppi={PRINT_PPI} calibration={calibration} />
                    ) : (
                        job.pages.map((page, index) => (
                            <SheetPage
                                key={index}
                                sheet={template.sheet}
                                design={template.design}
                                labels={page.labels}
                                contextFor={job.contextFor}
                                ppi={PRINT_PPI}
                                fillOrder={print.fillOrder}
                                outlines={print.outlines}
                                calibration={calibration}
                            />
                        ))
                    )}
                </PrintRoot>
            ) : null}
        </UnitContext.Provider>
    );
}

export function App() {
    const [session, setSession] = useState<{ value: Session; restored: boolean } | null>(null);

    useEffect(() => {
        let alive = true;
        void loadSession().then((restored) => {
            if (alive) {
                setSession({ value: restored ?? defaultSession(), restored: restored !== null });
            }
        });

        return () => {
            alive = false;
        };
    }, []);

    if (!session) {
        return <div className="lp-loading">Opening your labels…</div>;
    }

    return (
        <OverlayStackProvider>
            <StoreProvider initial={session.value}>
                <Workspace initialStep={session.restored && session.value.data ? "design" : "sheet"} />
            </StoreProvider>
            <EbToastHost position="bottom-right" showCountdown />
            <EbDialogHost />
        </OverlayStackProvider>
    );
}
