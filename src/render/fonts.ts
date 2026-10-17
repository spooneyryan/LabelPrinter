import { useSyncExternalStore } from "react";
import type { FontFace, MeasureText } from "../model/textLayout.ts";

/*
 * Fonts, and measuring text in them.
 *
 * The bundled faces ship with the suite's theme.css, from this origin, so a label set in one of
 * them prints the same on every machine. System fonts print with whatever the computer has, which
 * is why they are labelled as such in the picker.
 *
 * Measuring uses a canvas, which shapes text with the same engine the page draws it with. Web
 * fonts arrive asynchronously, and a measurement taken before one loads is a measurement of its
 * fallback — so loading a font clears the cache and bumps a version every text layout depends on,
 * and every label re-lays itself out with the real metrics.
 */

export type GenericFamily = "sans-serif" | "serif" | "monospace" | "cursive";

export interface FontChoice {
    family: string;
    generic: GenericFamily;
    bundled: boolean;
}

export const FONTS: readonly FontChoice[] = [
    { family: "Arial", generic: "sans-serif", bundled: false },
    { family: "Helvetica", generic: "sans-serif", bundled: false },
    { family: "Verdana", generic: "sans-serif", bundled: false },
    { family: "Tahoma", generic: "sans-serif", bundled: false },
    { family: "Trebuchet MS", generic: "sans-serif", bundled: false },
    { family: "Segoe UI", generic: "sans-serif", bundled: false },
    { family: "Calibri", generic: "sans-serif", bundled: false },
    { family: "Times New Roman", generic: "serif", bundled: false },
    { family: "Georgia", generic: "serif", bundled: false },
    { family: "Garamond", generic: "serif", bundled: false },
    { family: "Palatino Linotype", generic: "serif", bundled: false },
    { family: "Cambria", generic: "serif", bundled: false },
    { family: "Courier New", generic: "monospace", bundled: false },
    { family: "Consolas", generic: "monospace", bundled: false },
    { family: "Brush Script MT", generic: "cursive", bundled: false },
    { family: "DM Sans", generic: "sans-serif", bundled: true },
    { family: "Inter Tight", generic: "sans-serif", bundled: true },
    { family: "Manrope", generic: "sans-serif", bundled: true },
    { family: "Instrument Sans", generic: "sans-serif", bundled: true },
    { family: "Space Grotesk", generic: "sans-serif", bundled: true },
    { family: "DM Serif Display", generic: "serif", bundled: true },
    { family: "IBM Plex Mono", generic: "monospace", bundled: true }
];

export function findFont(family: string): FontChoice | undefined {
    return FONTS.find((font) => font.family.toLowerCase() === family.toLowerCase());
}

/** A CSS font-family value: the family, quoted, then its generic fallback. */
export function fontStack(family: string): string {
    const generic = findFont(family)?.generic ?? "sans-serif";
    return `"${family.replace(/["\\]/g, "")}", ${generic}`;
}

/** A CSS `font` shorthand for a face at a pixel size, for the canvas. */
export function fontShorthand(font: FontFace, sizePx: number): string {
    return `${font.italic ? "italic " : ""}${font.bold ? "700" : "400"} ${sizePx}px ${fontStack(font.family)}`;
}

// ── Load tracking ───────────────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, number>();
const requested = new Set<string>();

function fontsChanged() {
    cache.clear();
    version += 1;
    listeners.forEach((listener) => listener());
}

if (typeof document !== "undefined" && "fonts" in document) {
    document.fonts.addEventListener("loadingdone", fontsChanged);
    void document.fonts.ready.then(fontsChanged);
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** A number that changes whenever a font finishes loading; text layouts list it as a dependency. */
export function useFontsVersion(): number {
    return useSyncExternalStore(subscribe, () => version, () => version);
}

/**
 * Asks the browser for a bundled face in the weights and styles in use. A face that is only ever
 * measured on a canvas is never requested by the page on its own, so it has to be asked for.
 */
export function requestFont(font: FontFace): void {
    if (typeof document === "undefined" || !("fonts" in document) || !findFont(font.family)?.bundled) {
        return;
    }

    const key = fontShorthand(font, 16);
    if (requested.has(key)) {
        return;
    }

    requested.add(key);
    void document.fonts.load(key).then(fontsChanged, () => undefined);
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────────────

let context: CanvasRenderingContext2D | null = null;

/** Text widths in em, measured at 100px for precision and cached per face and string. */
export const measureText: MeasureText = (text, font) => {
    const key = `${font.family}|${font.bold ? 1 : 0}${font.italic ? 1 : 0}|${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    context ??= document.createElement("canvas").getContext("2d");
    if (!context) {
        return text.length * 0.5;
    }

    context.font = fontShorthand(font, 100);
    const width = context.measureText(text).width / 100;

    if (cache.size > 50_000) {
        cache.clear();
    }

    cache.set(key, width);
    return width;
};
