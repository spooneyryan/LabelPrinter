import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { gridLines, linePositions, SNAP_GRIDS } from "../src/model/grid.ts";
import { MM_PER_INCH } from "../src/model/units.ts";

const assertClose = (actual: number | null, expected: number) =>
    assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

describe("snapping grid", () => {
    test("snaps to 1/32″, or 0.5 mm, with the major lines a whole number of steps apart", () => {
        assert.equal(SNAP_GRIDS.in.step, 1 / 32);
        assertClose(SNAP_GRIDS.mm.step * MM_PER_INCH, 0.5);
        for (const grid of Object.values(SNAP_GRIDS)) {
            const steps = grid.major / grid.step;
            assertClose(steps, Math.round(steps));
        }
    });

    test("draws every step when the lines are far enough apart", () => {
        // A 1″ label fitted to the canvas: about 400 px to the inch, so 32nds are 12.5 px apart.
        assert.deepEqual(gridLines(SNAP_GRIDS.in, 400), { minor: 1 / 32, major: 1 / 4 });
    });

    test("thins the minor lines to a spacing that still meets the major lines", () => {
        // A 4 × 2″ label fitted: 32nds would be 5.7 px apart, 16ths 11.4.
        assert.deepEqual(gridLines(SNAP_GRIDS.in, 183), { minor: 1 / 16, major: 1 / 4 });

        // At 100%, 0.5 mm is 1.9 px and 1 mm 3.8; 2 mm would miss the 5 mm lines, so 2.5 mm.
        const { minor, major } = gridLines(SNAP_GRIDS.mm, 96);
        assertClose(minor! * MM_PER_INCH, 2.5);
        assertClose(major! * MM_PER_INCH, 5);
    });

    test("keeps only the major lines, then none, as the label shrinks on screen", () => {
        // A full sheet fitted: ⅛″ is 5.75 px, ¼″ 11.5.
        assert.deepEqual(gridLines(SNAP_GRIDS.in, 46), { minor: null, major: 1 / 4 });
        assert.deepEqual(gridLines(SNAP_GRIDS.in, 20), { minor: null, major: null });
    });

    test("places lines inside the label, not on its edges or on the major lines", () => {
        assert.equal(linePositions(1, 1 / 32).length, 31);
        assert.deepEqual(linePositions(1, 1 / 4), [0.25, 0.5, 0.75]);

        const minor = linePositions(1, 1 / 32, 1 / 4);
        assert.equal(minor.length, 28);
        assert.ok(!minor.includes(0.25) && !minor.includes(0.5) && !minor.includes(0.75));

        // Millimetres aren't exact in binary, and the major lines are still found among the minor ones.
        const lines = gridLines(SNAP_GRIDS.mm, 96);
        assert.equal(linePositions(1, lines.minor!, lines.major).length, 5);
        assert.equal(linePositions(1, lines.major!).length, 5);
    });
});
