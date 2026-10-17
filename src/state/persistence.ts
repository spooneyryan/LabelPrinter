import { IndexedDbSaveStore, type SaveEntry, type SaveStore } from "@electricblazor/react/save";
import { useEffect, useRef } from "react";
import { defaultCalibration } from "../model/defaults.ts";
import { sanitizeCalibration, sanitizeSession } from "../model/project.ts";
import type { Calibration, Session } from "../model/types.ts";
import type { LengthUnit } from "../model/units.ts";

/*
 * Where things are kept, all in this browser:
 *
 *   the session    IndexedDB, autosaved — the open template, the data and the job. Data can be
 *                  thousands of rows, past what localStorage holds.
 *   templates      IndexedDB, saved by name through EbSaveMenu.
 *   preferences    localStorage — the skin, the units, and the printer calibration, which belongs
 *                  to this machine's printer rather than to any one template.
 *
 * Nothing is sent anywhere. Where IndexedDB is unavailable (some private windows), a store backed
 * by localStorage under its own prefix stands in.
 */

const DATABASE = "LabelPrinter";
const SESSION_KEY = "current";
const PREFIX = "LabelPrinter.";

/** A SaveStore over localStorage, namespaced so the session and the templates do not share keys. */
class PrefixedLocalStore implements SaveStore {
    private readonly prefix: string;

    constructor(name: string) {
        this.prefix = `${PREFIX}${name}/`;
    }

    async save<T>(key: string, value: T): Promise<void> {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }

    async load<T>(key: string): Promise<T | null> {
        const json = localStorage.getItem(this.prefix + key);
        return json ? (JSON.parse(json) as T) : null;
    }

    async delete(key: string): Promise<void> {
        localStorage.removeItem(this.prefix + key);
    }

    async list(): Promise<SaveEntry[]> {
        const entries: SaveEntry[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.prefix)) {
                entries.push({ key: key.slice(this.prefix.length), lastModifiedUtc: null });
            }
        }

        return entries.sort((a, b) => a.key.localeCompare(b.key));
    }
}

function createStore(storeName: string): SaveStore {
    const indexedDb = new IndexedDbSaveStore({ databaseName: DATABASE, storeName });
    return indexedDb.isSupported() ? indexedDb : new PrefixedLocalStore(storeName);
}

export const sessionStore = createStore("session");
export const templateStore = createStore("templates");

/**
 * The template store as EbSaveMenu sees it. The menu saves its value under whatever name is typed
 * into Save As, and hands back only the value on load — so this writes that name into the
 * template as it is saved, and reports it, so the open template takes the name it was saved as.
 */
export function namingTemplateStore(onSaved: (name: string) => void): SaveStore {
    return {
        async save<T>(key: string, value: T, signal?: AbortSignal): Promise<void> {
            const named = typeof value === "object" && value !== null ? { ...value, name: key } : value;
            await templateStore.save(key, named, signal);
            onSaved(key);
        },
        load: <T,>(key: string, signal?: AbortSignal) => templateStore.load<T>(key, signal),
        delete: (key: string, signal?: AbortSignal) => templateStore.delete(key, signal),
        list: (signal?: AbortSignal) => templateStore.list(signal)
    };
}

export async function loadSession(): Promise<Session | null> {
    try {
        return sanitizeSession(await sessionStore.load<unknown>(SESSION_KEY));
    } catch {
        return null;
    }
}

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Saves the session a moment after it stops changing, and straight away when the page is hidden
 * — closing the tab mid-edit should not lose the last few seconds.
 */
export function useAutosave(session: Session, onStatus: (status: SaveStatus) => void): void {
    const latest = useRef(session);
    latest.current = session;
    const first = useRef(true);

    useEffect(() => {
        // The session just loaded is already saved; writing it back would only bump its time.
        if (first.current) {
            first.current = false;
            return;
        }

        onStatus("saving");
        const timer = setTimeout(() => {
            sessionStore.save(SESSION_KEY, session).then(
                () => onStatus("saved"),
                () => onStatus("failed")
            );
        }, 500);

        return () => clearTimeout(timer);
    }, [session, onStatus]);

    useEffect(() => {
        const flush = () => {
            if (document.visibilityState === "hidden") {
                void sessionStore.save(SESSION_KEY, latest.current).catch(() => undefined);
            }
        };

        document.addEventListener("visibilitychange", flush);
        return () => document.removeEventListener("visibilitychange", flush);
    }, []);
}

// ── Preferences ─────────────────────────────────────────────────────────────────────────────────

function readPreference(name: string): string | null {
    try {
        return localStorage.getItem(PREFIX + name);
    } catch {
        return null;
    }
}

function writePreference(name: string, value: string): void {
    try {
        localStorage.setItem(PREFIX + name, value);
    } catch {
        // Storage blocked or full: the preference simply lasts for this visit.
    }
}

export function loadTheme(): string {
    return readPreference("theme") ?? "electric";
}

export function saveTheme(theme: string): void {
    writePreference("theme", theme);
}

export function loadUnit(): LengthUnit {
    return readPreference("unit") === "mm" ? "mm" : "in";
}

export function saveUnit(unit: LengthUnit): void {
    writePreference("unit", unit);
}

export function loadCalibration(): Calibration {
    const json = readPreference("calibration");
    if (!json) {
        return defaultCalibration();
    }

    try {
        return sanitizeCalibration(JSON.parse(json));
    } catch {
        return defaultCalibration();
    }
}

export function saveCalibration(calibration: Calibration): void {
    writePreference("calibration", JSON.stringify(calibration));
}
