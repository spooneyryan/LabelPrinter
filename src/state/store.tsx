import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { defaultSession } from "../model/defaults.ts";
import type { ImportSource } from "../import/importFile.ts";
import type {
    DataTable,
    LabelDesign,
    LabelElement,
    LabelTemplate,
    PrintOptions,
    Session,
    SheetSpec
} from "../model/types.ts";

/*
 * The app's state, in one reducer.
 *
 * The template — the sheet and the design — has an undo history; the data and the job settings
 * do not, the way a word processor undoes typing but not opening a file. Rapid edits of one
 * thing coalesce into one undo step: every frame of a resize, every keystroke in a text box, each
 * nudge of an arrow key arrive as separate edits with the same key, and only the first opens a
 * new step.
 */

export interface AppState {
    template: LabelTemplate;
    past: LabelTemplate[];
    future: LabelTemplate[];
    lastEdit: { key: string; time: number } | null;
    data: DataTable | null;
    excluded: ReadonlySet<number>;
    print: PrintOptions;
    /** What the data was imported from, so import options can re-read it. Not saved. */
    source: ImportSource | null;
    sourceDetails: string | null;
}

export type Action =
    | { type: "load"; session: Session }
    | { type: "edit"; update: (template: LabelTemplate) => LabelTemplate; key?: string; time: number }
    | { type: "undo" }
    | { type: "redo" }
    | { type: "setData"; data: DataTable | null; source: ImportSource | null; details: string | null }
    | { type: "editData"; update: (data: DataTable) => DataTable; excluded?: ReadonlySet<number> }
    | { type: "setExcluded"; excluded: ReadonlySet<number> }
    | { type: "setPrint"; update: Partial<PrintOptions> };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export function initialState(session: Session = defaultSession()): AppState {
    return {
        template: session.template,
        past: [],
        future: [],
        lastEdit: null,
        data: session.data,
        excluded: new Set(session.excluded),
        print: session.print,
        source: null,
        sourceDetails: null
    };
}

export function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case "load":
            return initialState(action.session);

        case "edit": {
            const next = action.update(state.template);
            if (next === state.template) {
                return state;
            }

            const coalesce =
                action.key !== undefined &&
                state.lastEdit?.key === action.key &&
                action.time - state.lastEdit.time < COALESCE_MS;

            return {
                ...state,
                template: next,
                past: coalesce ? state.past : [...state.past, state.template].slice(-HISTORY_LIMIT),
                future: [],
                lastEdit: action.key === undefined ? null : { key: action.key, time: action.time }
            };
        }

        case "undo": {
            const previous = state.past.at(-1);
            if (!previous) {
                return state;
            }

            return {
                ...state,
                template: previous,
                past: state.past.slice(0, -1),
                future: [state.template, ...state.future],
                lastEdit: null
            };
        }

        case "redo": {
            const [next, ...rest] = state.future;
            if (!next) {
                return state;
            }

            return { ...state, template: next, past: [...state.past, state.template], future: rest, lastEdit: null };
        }

        // New data clears the exclusions (they were row numbers in the old data) but not the job
        // settings: used positions belong to the sheet in the printer, not to the data.
        case "setData":
            return {
                ...state,
                data: action.data,
                excluded: new Set(),
                source: action.source,
                sourceDetails: action.details
            };

        case "editData":
            return state.data
                ? { ...state, data: action.update(state.data), excluded: action.excluded ?? state.excluded }
                : state;

        case "setExcluded":
            return { ...state, excluded: action.excluded };

        case "setPrint":
            return { ...state, print: { ...state.print, ...action.update } };
    }
}

interface StoreValue {
    state: AppState;
    dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ initial, children }: { initial: Session; children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initial, initialState);
    const value = useMemo(() => ({ state, dispatch }), [state]);
    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
    const value = useContext(StoreContext);
    if (!value) {
        throw new Error("useStore must be used inside a StoreProvider.");
    }

    return value;
}

/** The element with the patch applied, or the element itself when the patch changes nothing. */
function applyPatch(element: LabelElement, patch: Partial<LabelElement>): LabelElement {
    const keys = Object.keys(patch) as (keyof LabelElement)[];
    return keys.every((key) => Object.is(element[key], patch[key])) ? element : ({ ...element, ...patch } as LabelElement);
}

/** The edits the UI makes, bound to the store. Referentially stable. */
export interface Editor {
    edit(update: (template: LabelTemplate) => LabelTemplate, key?: string): void;
    editSheet(update: (sheet: SheetSpec) => SheetSpec, key?: string): void;
    editDesign(update: (design: LabelDesign) => LabelDesign, key?: string): void;
    /** Applies a patch to one element. */
    editElement(id: string, patch: Partial<LabelElement> | ((element: LabelElement) => LabelElement), key?: string): void;
    undo(): void;
    redo(): void;
}

export function useEditor(): Editor {
    const { dispatch } = useStore();

    return useMemo(() => {
        const edit = (update: (template: LabelTemplate) => LabelTemplate, key?: string) =>
            dispatch({ type: "edit", update, key, time: Date.now() });
        const editDesign = (update: (design: LabelDesign) => LabelDesign, key?: string) =>
            edit((template) => {
                const design = update(template.design);
                return design === template.design ? template : { ...template, design };
            }, key);

        return {
            edit,
            editSheet: (update, key) =>
                edit((template) => {
                    const sheet = update(template.sheet);
                    return sheet === template.sheet ? template : { ...template, sheet };
                }, key),
            editDesign,
            editElement: (id, patch, key) =>
                editDesign((design) => {
                    let changed = false;
                    const elements = design.elements.map((element) => {
                        if (element.id !== id) {
                            return element;
                        }

                        const next = typeof patch === "function" ? patch(element) : applyPatch(element, patch);
                        changed = next !== element;
                        return next;
                    });

                    // A click on the canvas commits the position the element already had; that
                    // must not become an undo step or wake the autosave.
                    return changed ? { ...design, elements } : design;
                }, key),
            undo: () => dispatch({ type: "undo" }),
            redo: () => dispatch({ type: "redo" })
        };
    }, [dispatch]);
}

/** The session as autosaved: everything but the history and the import source. */
export function sessionOf(state: Pick<AppState, "template" | "data" | "excluded" | "print">): Session {
    return {
        version: 1,
        template: state.template,
        data: state.data,
        excluded: [...state.excluded].sort((a, b) => a - b),
        print: state.print
    };
}
