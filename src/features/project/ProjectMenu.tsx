import { EbButton, EbPopover, useDialogs } from "@electricblazor/react";
import type { SaveEntry } from "@electricblazor/react/save";
import { useRef, useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { listProjects, projectStore } from "../../state/persistence.ts";

/*
 * The Project menu: saving the whole job — sheet, design, data, excluded rows and print settings —
 * in this browser by name or to a file, and opening it again. The actions themselves belong to the
 * workspace, which owns the session; this lists the saved projects and lays the actions out.
 */

export interface ProjectMenuProps {
    /** The name a plain Save uses: the open label's. */
    name: string;
    onSave: () => void;
    onSaveAs: () => void;
    onSaveFile: () => void;
    onOpenFile: () => void;
    onSaveTemplateFile: () => void;
    onOpenProject: (name: string) => void;
}

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function savedWhen(entry: SaveEntry): string | null {
    if (!entry.lastModifiedUtc) {
        return null;
    }

    const date = new Date(entry.lastModifiedUtc);
    return Number.isNaN(date.getTime()) ? null : DATE.format(date);
}

export function ProjectMenu({ name, onSave, onSaveAs, onSaveFile, onOpenFile, onSaveTemplateFile, onOpenProject }: ProjectMenuProps) {
    const dialogs = useDialogs();
    const anchor = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [projects, setProjects] = useState<SaveEntry[] | null>(null);

    const refresh = async () => {
        try {
            setProjects(await listProjects());
        } catch {
            setProjects([]);
        }
    };

    const setVisible = (visible: boolean) => {
        setOpen(visible);
        if (visible) {
            void refresh();
        }
    };

    /** Closes the menu, then runs the action: a dialog or a file picker must not open under it. */
    const run = (action: () => void) => () => {
        setOpen(false);
        action();
    };

    const remove = async (key: string) => {
        const confirmed = await dialogs.confirm(`Delete the saved project “${key}”? This can't be undone.`, {
            title: "Delete project",
            confirmLabel: "Delete",
            confirmVariant: "danger"
        });

        if (confirmed) {
            await projectStore.delete(key);
            await refresh();
        }
    };

    return (
        <>
            <EbButton ref={anchor} aria-expanded={open} aria-haspopup="menu" onClick={() => setVisible(!open)}>
                <Icon name="file" /> Project <Icon name="chevronDown" />
            </EbButton>
            <EbPopover visible={open} onVisibleChange={setVisible} anchorRef={anchor} placement="bottom" align="end">
                <div className="lp-project-menu">
                    <div className="lp-project-actions">
                        <button type="button" className="lp-menu-item" onClick={run(onSave)}>
                            <Icon name="check" />
                            <span>
                                Save <span className="lp-muted">as “{name}”</span>
                            </span>
                            <span className="lp-kbd">Ctrl S</span>
                        </button>
                        <button type="button" className="lp-menu-item" onClick={run(onSaveAs)}>
                            <Icon name="copy" />
                            <span>Save as…</span>
                        </button>
                        <button type="button" className="lp-menu-item" onClick={run(onSaveFile)}>
                            <Icon name="download" />
                            <span>Save to a file…</span>
                        </button>
                        <button type="button" className="lp-menu-item" onClick={run(onOpenFile)}>
                            <Icon name="upload" />
                            <span>Open a file…</span>
                        </button>
                        <button type="button" className="lp-menu-item" onClick={run(onSaveTemplateFile)}>
                            <Icon name="sheet" />
                            <span>
                                Save the label as a template file… <span className="lp-muted">(no data)</span>
                            </span>
                        </button>
                    </div>
                    <h3 className="lp-project-heading">Saved in this browser</h3>
                    {projects === null ? (
                        <p className="lp-note lp-small">Loading…</p>
                    ) : projects.length === 0 ? (
                        <p className="lp-note lp-small">No saved projects yet. Save keeps the sheet, the design, the data and the print settings together.</p>
                    ) : (
                        <ul className="lp-project-list">
                            {projects.map((entry) => (
                                <li key={entry.key}>
                                    <button type="button" className="lp-project-open" onClick={run(() => onOpenProject(entry.key))}>
                                        <span className="lp-project-name">{entry.key}</span>
                                        {savedWhen(entry) ? <span className="lp-muted lp-small">{savedWhen(entry)}</span> : null}
                                    </button>
                                    <button
                                        type="button"
                                        className="lp-layer-toggle"
                                        aria-label={`Delete ${entry.key}`}
                                        onClick={() => void remove(entry.key)}
                                    >
                                        <Icon name="trash" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </EbPopover>
        </>
    );
}
