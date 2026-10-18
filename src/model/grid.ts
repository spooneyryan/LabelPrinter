import { MM_PER_INCH, type LengthUnit } from "./units.ts";

/*
 * The designer's snapping grid. Elements snap to its step, and the canvas draws it: a line at every
 * step where those are far enough apart to see, and a stronger line every major step, so a fine
 * grid still reads at a glance and some of it shows at any zoom.
 */

export interface SnapGrid {
    /** Inches between the positions an element snaps to; an arrow key moves it this far. */
    step: number;
    /** Inches between the stronger lines, a whole number of steps; Shift+arrow moves this far. */
    major: number;
    /** The step as the toolbar names it. */
    label: string;
}

/** The grid for each unit: 1/32″ with a stronger line every ¼″, or 0.5 mm with one every 5 mm. */
export const SNAP_GRIDS: Record<LengthUnit, SnapGrid> = {
    in: { step: 1 / 32, major: 1 / 4, label: "1/32″" },
    mm: { step: 0.5 / MM_PER_INCH, major: 5 / MM_PER_INCH, label: "0.5 mm" }
};

/** Lines closer together than this many screen pixels are left out: they would only grey the label. */
export const MIN_GRID_GAP_PX = 8;

const EPSILON = 1e-6;

/**
 * The lines to draw at `ppi` screen pixels per inch, as their spacing in inches. The minor lines
 * come every few steps: the fewest that leave them MIN_GRID_GAP_PX apart and divide the major step,
 * so they always meet the major lines (in millimetres 0.5, 1, then 2.5 — never 2). Either is null
 * when its lines would be too close together.
 */
export function gridLines(grid: SnapGrid, ppi: number): { minor: number | null; major: number | null } {
    if (grid.major * ppi < MIN_GRID_GAP_PX) {
        return { minor: null, major: null };
    }

    const steps = Math.round(grid.major / grid.step);
    for (let every = 1; every < steps; every++) {
        if (steps % every === 0 && every * grid.step * ppi >= MIN_GRID_GAP_PX) {
            return { minor: every * grid.step, major: grid.major };
        }
    }

    return { minor: null, major: grid.major };
}

/**
 * Where lines `spacing` apart fall across a length, in inches from its start: none on either edge,
 * and none on a multiple of `except`, where a major line is drawn instead.
 */
export function linePositions(length: number, spacing: number, except: number | null = null): number[] {
    const positions: number[] = [];
    for (let index = 1; index * spacing < length - EPSILON; index++) {
        const at = index * spacing;
        if (except === null || Math.abs(at / except - Math.round(at / except)) > EPSILON) {
            positions.push(at);
        }
    }

    return positions;
}
