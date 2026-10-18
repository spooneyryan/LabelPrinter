import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findPreset, matchesSearch, parseSizeQuery, presetShape, presetSummary, presetTitle, SHEET_PRESETS } from "../src/model/presets.ts";
import { TSS_LAYOUTS } from "../src/model/presets-tss.ts";
import { pageSizeOf } from "../src/model/sheet.ts";

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

describe("more makers and A4", () => {
    test("every preset has a unique id", () => {
        assert.equal(new Set(SHEET_PRESETS.map((preset) => preset.id)).size, SHEET_PRESETS.length);
    });

    test("A4 sheets are A4 and described in millimetres", () => {
        const l7160 = findPreset("avery-l7160")!;
        assert.equal(pageSizeOf(l7160.sheet)?.name, "A4");
        assert.equal(presetSummary(l7160), "Address · 38.1 × 63.5 mm · 21 per sheet · A4");
        assert.equal(pageSizeOf(findPreset("avery-5160")!.sheet)?.name, "US Letter");
    });

    test("Avery L7160's geometry is Herma 4677's die, in inches", () => {
        const sheet = findPreset("avery-l7160")!.sheet;
        assert.equal(sheet.labelWidth, 2.5);
        assert.equal(sheet.labelHeight, 1.5);
        assert.equal(sheet.marginTop, 0.59646); // 15.15 mm
        assert.equal(sheet.gapX, 0.1); // 2.54 mm
    });

    test("cross-references reach the sheets defined before them", () => {
        assert.ok(findPreset("avery-5160")!.equivalents?.includes("OL875"));
        assert.ok(findPreset("tss-c005")!.similar?.includes("Avery 5294"));
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
        const square = ["avery-94500", "tss-c002", "tss-s001", "tss-s001a", "onlinelabels-ol5425"];
        assert.deepEqual(ids("1x1"), square);
        assert.deepEqual(ids('1" x 1"'), square);
        assert.deepEqual(ids("25.4mm × 25.4mm"), square);
        assert.deepEqual(ids("2 5/8 x 1"), ["avery-5160", "tss-r007"]);
        assert.deepEqual(ids("1 x 2⅝"), ["avery-5160", "tss-r007"]);
    });

    test("by words in the maker's product name", () => {
        assert.deepEqual(ids("clear glossy"), ["tss-r007"]);
    });

    test("by another maker's code for the same sheet", () => {
        assert.deepEqual(ids("OL875"), ["avery-5160"]);
        assert.deepEqual(ids("S-5042"), ["avery-5160"]);
        assert.deepEqual(ids("Herma 4677"), ["avery-l7160"]);
        assert.deepEqual(ids("J8160"), ["avery-l7160"]);
        assert.deepEqual(ids("22807"), ["tss-c004a"]);
    });

    test("codes match from the start, not from inside another code", () => {
        assert.ok(ids("516").includes("avery-5160"));
        assert.ok(!ids("8160").includes("avery-l7160"));
    });

    test("size queries are only sizes", () => {
        assert.deepEqual(parseSizeQuery("1x1"), { a: 1, b: 1 });
        assert.equal(parseSizeQuery("box"), null);
        assert.equal(parseSizeQuery("S001"), null);
        assert.equal(parseSizeQuery("1 x 2 x 3"), null);
    });
});
