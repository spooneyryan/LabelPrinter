/*
 * Setting a text element: wrapping its lines to the box and, when asked, shrinking the type until
 * they fit.
 *
 * The layout is computed here rather than left to the browser's own wrapping, for two reasons.
 * The designer, the preview and the print are drawn at different scales, and the line breaks must
 * not move between them — computing them once, in inches, and drawing each line as given makes
 * that true by construction. And shrink-to-fit, and the "12 labels overflow" warning, both need to
 * know whether text fits before anything is drawn, for every record rather than the one on screen.
 *
 * Widths come from a measuring function in em (the width at a font size of 1), so this module
 * knows nothing about canvases and can be tested with arithmetic.
 */

export interface FontFace {
    family: string;
    bold: boolean;
    italic: boolean;
}

/** The width of `text` set in `font` at a size of 1 — so the width at size S is S times this. */
export type MeasureText = (text: string, font: FontFace) => number;

export interface TextLayoutRequest {
    /** The merged lines, before wrapping. */
    lines: readonly string[];
    /** The room available, in inches. */
    width: number;
    height: number;
    /** In points. */
    fontSize: number;
    minFontSize: number;
    /** Line spacing as a multiple of the size. */
    lineHeight: number;
    wrap: boolean;
    shrinkToFit: boolean;
    font: FontFace;
}

export interface TextLayout {
    /** The size the text is set at, in points: the requested size unless it was shrunk. */
    fontSize: number;
    /** The lines as drawn, after wrapping. */
    lines: string[];
    /** The distance from one baseline to the next, in inches. */
    lineHeight: number;
    /** The height of all the lines together, in inches. */
    contentHeight: number;
    /** Whether the text is still too big for the box at the size it is set. */
    overflow: boolean;
}

/** Slack for rounding: a line that is over by a thousandth of an inch still fits. */
const TOLERANCE = 0.001;

/** How finely shrink-to-fit searches, in points. A quarter point is invisible on paper. */
const SHRINK_STEP = 0.25;

function wrapParagraph(paragraph: string, limit: number, width: (text: string) => number): string[] {
    if (paragraph.trim() === "") {
        return [paragraph];
    }

    const lines: string[] = [];
    let line = "";
    let pendingSpace = "";

    const breakLongWord = (word: string): string => {
        let rest = word;
        while (rest.length > 1 && width(rest) > limit) {
            const characters = Array.from(rest);
            // The longest prefix that fits, and never less than one character, so a box narrower
            // than a single letter still makes progress instead of looping.
            let low = 1;
            let high = characters.length - 1;
            while (low < high) {
                const middle = Math.ceil((low + high) / 2);
                if (width(characters.slice(0, middle).join("")) <= limit) {
                    low = middle;
                } else {
                    high = middle - 1;
                }
            }

            lines.push(characters.slice(0, low).join(""));
            rest = characters.slice(low).join("");
        }

        return rest;
    };

    for (const piece of paragraph.match(/\s+|\S+/g) ?? []) {
        if (/^\s/.test(piece)) {
            pendingSpace += piece;
            continue;
        }

        // Leading space at the start of a paragraph is indentation, typed on purpose; after a wrap
        // it is just the space the line broke at.
        const atParagraphStart = line === "" && lines.length === 0;
        const candidate = line === "" ? (atParagraphStart ? pendingSpace : "") + piece : line + pendingSpace + piece;
        pendingSpace = "";

        if (width(candidate) <= limit) {
            line = candidate;
            continue;
        }

        if (line !== "") {
            lines.push(line);
            line = "";
        }

        line = width(piece) <= limit ? piece : breakLongWord(atParagraphStart ? candidate : piece);
    }

    lines.push(line);
    return lines;
}

/** Wraps (or not) every line at one font size and reports whether the result fits. */
function layoutAt(request: TextLayoutRequest, fontSize: number, measure: MeasureText): TextLayout {
    const sizeInInches = fontSize / 72;
    const width = (text: string) => measure(text, request.font) * sizeInInches;
    const limit = request.width + TOLERANCE;

    const lines = request.wrap
        ? request.lines.flatMap((line) => wrapParagraph(line, limit, width))
        : [...request.lines];

    const lineHeight = sizeInInches * request.lineHeight;
    const contentHeight = lines.length * lineHeight;
    const tooWide = !request.wrap && lines.some((line) => width(line) > limit);
    const tooTall = contentHeight > request.height + TOLERANCE;

    return { fontSize, lines, lineHeight, contentHeight, overflow: tooWide || tooTall };
}

/** Lays out a text element's merged lines in its box. See the header. */
export function layoutText(request: TextLayoutRequest, measure: MeasureText): TextLayout {
    const requested = layoutAt(request, request.fontSize, measure);
    if (!requested.overflow || !request.shrinkToFit || request.lines.length === 0) {
        return requested;
    }

    const floor = Math.min(request.minFontSize, request.fontSize);
    let low = Math.ceil(floor / SHRINK_STEP);
    let high = Math.floor(request.fontSize / SHRINK_STEP) - 1;
    let best: TextLayout | null = null;

    // Binary search for the largest size that fits. Wrapping makes "fits" very nearly monotonic
    // in size, which is all the search needs: at worst it settles a quarter point small.
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const attempt = layoutAt(request, middle * SHRINK_STEP, measure);
        if (attempt.overflow) {
            high = middle - 1;
        } else {
            best = attempt;
            low = middle + 1;
        }
    }

    return best ?? layoutAt(request, floor, measure);
}
