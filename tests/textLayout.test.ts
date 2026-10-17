import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { layoutText, type MeasureText, type TextLayoutRequest } from "../src/model/textLayout.ts";

// Every character is half an em wide: at 72pt (one inch) a character is half an inch.
const measure: MeasureText = (text) => text.length * 0.5;

const request = (overrides: Partial<TextLayoutRequest>): TextLayoutRequest => ({
    lines: [],
    width: 3,
    height: 3,
    fontSize: 72,
    minFontSize: 6,
    lineHeight: 1,
    wrap: true,
    shrinkToFit: false,
    font: { family: "Test", bold: false, italic: false },
    ...overrides
});

describe("wrapping", () => {
    test("breaks at spaces and drops the space it broke at", () => {
        // Six characters fit on a 3-inch line at 72pt.
        const layout = layoutText(request({ lines: ["aaa bbb ccc"] }), measure);
        assert.deepEqual(layout.lines, ["aaa", "bbb", "ccc"]);
        assert.equal(layout.overflow, false);
    });

    test("keeps words together when they fit", () => {
        const layout = layoutText(request({ lines: ["ab cd efghij"] }), measure);
        assert.deepEqual(layout.lines, ["ab cd", "efghij"]);
    });

    test("breaks a word longer than the line", () => {
        const layout = layoutText(request({ lines: ["abcdefghijklmn"] }), measure);
        assert.deepEqual(layout.lines, ["abcdef", "ghijkl", "mn"]);
    });

    test("keeps empty lines as lines", () => {
        const layout = layoutText(request({ lines: ["a", "", "b"] }), measure);
        assert.deepEqual(layout.lines, ["a", "", "b"]);
        assert.equal(layout.contentHeight, 3);
    });

    test("keeps leading indentation", () => {
        assert.deepEqual(layoutText(request({ lines: ["  ab"] }), measure).lines, ["  ab"]);
    });

    test("without wrapping, a long line overflows", () => {
        const layout = layoutText(request({ lines: ["abcdefghij"], wrap: false }), measure);
        assert.deepEqual(layout.lines, ["abcdefghij"]);
        assert.equal(layout.overflow, true);
    });
});

describe("fitting", () => {
    test("too many lines overflow at the requested size", () => {
        const layout = layoutText(request({ lines: ["a", "b", "c", "d"] }), measure);
        assert.equal(layout.overflow, true);
        assert.equal(layout.fontSize, 72);
    });

    test("shrink-to-fit finds the largest size that fits", () => {
        const layout = layoutText(request({ lines: ["a", "b", "c", "d"], shrinkToFit: true }), measure);
        assert.equal(layout.overflow, false);
        assert.equal(layout.fontSize, 54); // four one-em lines in three inches
        assert.ok(layout.contentHeight <= 3 + 1e-9);
    });

    test("shrink-to-fit stops at the minimum and reports overflow", () => {
        const layout = layoutText(request({ lines: Array(100).fill("x"), shrinkToFit: true, minFontSize: 12 }), measure);
        assert.equal(layout.fontSize, 12);
        assert.equal(layout.overflow, true);
    });

    test("text that fits is never shrunk", () => {
        const layout = layoutText(request({ lines: ["ab"], shrinkToFit: true }), measure);
        assert.equal(layout.fontSize, 72);
    });

    test("line height scales the content height", () => {
        const layout = layoutText(request({ lines: ["a", "b"], lineHeight: 1.25, fontSize: 36 }), measure);
        assert.equal(layout.lineHeight, 0.625);
        assert.equal(layout.contentHeight, 1.25);
    });
});
