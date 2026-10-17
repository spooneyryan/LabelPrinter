import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findPreset, presetSummary, SHEET_PRESETS, sheetFromPreset } from "../src/model/presets.ts";
import {
    cellOrigin,
    cellSlot,
    centerGrid,
    gridSize,
    labelsPerSheet,
    sameLayout,
    slotCell,
    spreadGrid,
    trailingMargins,
    validateSheet
} from "../src/model/sheet.ts";

const avery5160 = () => sheetFromPreset(findPreset("avery-5160")!);

describe("presets", () => {
    for (const preset of SHEET_PRESETS) {
        test(`${preset.brand} ${preset.code} fits its page with no errors`, () => {
            const sheet = sheetFromPreset(preset);
            assert.deepEqual(
                validateSheet(sheet).filter((issue) => issue.severity === "error"),
                []
            );

            // Stock is cut symmetrically, so the leftover margins should match within a 32nd.
            const { right, bottom } = trailingMargins(sheet);
            assert.ok(Math.abs(right - sheet.marginLeft) < 1 / 32, `${preset.code}: right ${right} vs left ${sheet.marginLeft}`);
            assert.ok(bottom >= -0.001, `${preset.code}: bottom ${bottom}`);
        });
    }

    test("ids are unique", () => {
        assert.equal(new Set(SHEET_PRESETS.map((preset) => preset.id)).size, SHEET_PRESETS.length);
    });

    test("the summary reads like the packaging", () => {
        assert.equal(presetSummary(findPreset("avery-5160")!), "Address · 1″ × 2⅝″ · 30 per sheet");
    });
});

describe("geometry", () => {
    test("5160 is three across and ten down", () => {
        const sheet = avery5160();
        assert.equal(labelsPerSheet(sheet), 30);
        assert.deepEqual(cellOrigin(sheet, 0, 0), { x: 0.1875, y: 0.5 });
        assert.deepEqual(cellOrigin(sheet, 2, 9), { x: 0.1875 + 2 * 2.75, y: 9.5 });
        assert.deepEqual(gridSize(sheet), { width: 8.125, height: 10 });
    });

    test("slots run across rows or down columns", () => {
        const sheet = avery5160();
        assert.deepEqual(slotCell(sheet, 4, "across"), { column: 1, row: 1 });
        assert.deepEqual(slotCell(sheet, 4, "down"), { column: 0, row: 4 });
        assert.deepEqual(slotCell(sheet, 12, "down"), { column: 1, row: 2 });

        for (const order of ["across", "down"] as const) {
            for (let slot = 0; slot < 30; slot++) {
                const { column, row } = slotCell(sheet, slot, order);
                assert.equal(cellSlot(sheet, column, row, order), slot);
            }
        }
    });
});

describe("validateSheet", () => {
    test("reports labels running off the page, by how much", () => {
        const issues = validateSheet({ ...avery5160(), columns: 4 });
        assert.equal(issues.length, 1);
        assert.equal(issues[0].field, "columns");
        assert.match(issues[0].message, /2\.563 in past the right edge/);
    });

    test("reports impossible measurements before overflow", () => {
        const fields = validateSheet({ ...avery5160(), labelWidth: 0, rows: 0 }).map((issue) => issue.field);
        assert.deepEqual(fields, ["labelWidth", "rows"]);
    });

    test("warns about corners that meet", () => {
        const issues = validateSheet({ ...avery5160(), cornerRadius: 0.75 });
        assert.equal(issues[0].severity, "warning");
    });
});

describe("layout helpers", () => {
    test("centerGrid balances the margins", () => {
        const sheet = centerGrid({ ...avery5160(), marginLeft: 0, marginTop: 0 });
        assert.equal(sheet.marginLeft, 0.1875);
        assert.equal(sheet.marginTop, 0.5);
    });

    test("spreadGrid works out the gaps from the first margins", () => {
        const sheet = spreadGrid({ ...avery5160(), gapX: 0, gapY: 0.3 });
        assert.equal(sheet.gapX, 0.125);
        assert.equal(sheet.gapY, 0);
    });

    test("sameLayout ignores names but not measurements", () => {
        const a = avery5160();
        const renamed = { ...a, name: "Mine", presetId: "custom" };
        assert.ok(sameLayout(a, renamed));
        assert.ok(!sameLayout(a, { ...a, gapX: 0.13 }));
    });
});
