import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findPreset, matchesSearch, parseSizeQuery, presetShape, presetSummary, presetTitle, SHEET_PRESETS } from "../src/model/presets.ts";
import { TSS_LAYOUTS } from "../src/model/presets-tss.ts";

const ids = (search: string) => SHEET_PRESETS.filter((preset) => matchesSearch(preset, search)).map((preset) => preset.id);

describe("The Shipping Store templates", () => {
    test("all 67 layouts are presets", () => {
        assert.equal(TSS_LAYOUTS.length, 67);
        assert.equal(SHEET_PRESETS.filter((preset) => preset.brand === "The Shipping Store").length, 67);
    });

    test("S001 is the 1″ square, 7 × 9, converted from the published millimetres", () => {
        const preset = findPreset("tss-s001");
        assert.ok(preset);
        assert.equal(presetTitle(preset), "The Shipping Store S001");
        assert.equal(presetSummary(preset), "Square · 1″ × 1″ · 63 per sheet");
        assert.deepEqual(preset.sheet, {
            pageWidth: 8.5,
            pageHeight: 11,
            labelWidth: 1,
            labelHeight: 1,
            columns: 7,
            rows: 9,
            marginTop: 0.49469, // 12.565 mm
            marginLeft: 0.37055, // 9.412 mm
            gapX: 0.125,
            gapY: 0.125,
            shape: "rounded",
            cornerRadius: 0.0972 // 2.469 mm
        });
    });

    test("circles and ovals draw as ellipses; square corners stay square", () => {
        assert.equal(findPreset("tss-c002")!.sheet.shape, "ellipse");
        assert.equal(findPreset("tss-v001")!.sheet.shape, "ellipse");
        assert.equal(findPreset("tss-r001")!.sheet.shape, "rectangle");
        assert.equal(findPreset("tss-r007")!.sheet.shape, "rounded");
    });

    test("the custom die-cuts: R006 keeps its rounded corners, R042A says it is approximate", () => {
        assert.equal(findPreset("tss-r006")!.sheet.shape, "rounded");
        assert.equal(findPreset("tss-r006")!.note, undefined);
        assert.match(findPreset("tss-r042a")!.note ?? "", /bounding box/);
    });

    test("shapes are named the way people say them", () => {
        assert.equal(presetShape(findPreset("tss-s001")!), "Square");
        assert.equal(presetShape(findPreset("tss-c002")!), "Round");
        assert.equal(presetShape(findPreset("tss-v001")!), "Oval");
        assert.equal(presetShape(findPreset("tss-r007")!), "Rectangle");
        assert.equal(presetShape(findPreset("avery-5160")!), "Rectangle");
    });
});

describe("searching", () => {
    test("by template code", () => {
        assert.deepEqual(ids("S001"), ["tss-s001", "tss-s001a"]);
        assert.deepEqual(ids("s001a"), ["tss-s001a"]);
    });

    test("by Avery code, compatible codes included", () => {
        assert.deepEqual(ids("8160"), ["avery-5160"]);
    });

    test("by size, either way round and however it is typed", () => {
        const square = ["tss-c002", "tss-s001", "tss-s001a"];
        assert.deepEqual(ids("1x1"), square);
        assert.deepEqual(ids('1" x 1"'), square);
        assert.deepEqual(ids("25.4mm × 25.4mm"), square);
        assert.deepEqual(ids("2 5/8 x 1"), ["avery-5160", "tss-r007"]);
        assert.deepEqual(ids("1 x 2⅝"), ["avery-5160", "tss-r007"]);
    });

    test("by words in the maker's product name", () => {
        assert.deepEqual(ids("clear glossy"), ["tss-r007"]);
    });

    test("size queries are only sizes", () => {
        assert.deepEqual(parseSizeQuery("1x1"), { a: 1, b: 1 });
        assert.equal(parseSizeQuery("box"), null);
        assert.equal(parseSizeQuery("S001"), null);
        assert.equal(parseSizeQuery("1 x 2 x 3"), null);
    });
});
