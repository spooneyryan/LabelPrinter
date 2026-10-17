import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildQueue, freeSlots, jobQueue, paginate } from "../src/model/paginate.ts";
import { findPreset, sheetFromPreset } from "../src/model/presets.ts";

const sheet = sheetFromPreset(findPreset("avery-5163")!); // 2 × 5 = 10 per sheet

describe("buildQueue", () => {
    test("groups copies by default", () => {
        assert.deepEqual(buildQueue([0, 1], { copies: 2, collate: false }), [0, 0, 1, 1]);
    });

    test("collates when asked", () => {
        assert.deepEqual(buildQueue([0, 1], { copies: 2, collate: true }), [0, 1, 0, 1]);
    });

    test("never prints fewer than one copy", () => {
        assert.deepEqual(buildQueue([3], { copies: 0, collate: false }), [3]);
    });
});

describe("paginate", () => {
    test("fills sheets in order", () => {
        const pages = paginate(sheet, Array.from({ length: 23 }, (_, i) => i), []);
        assert.equal(pages.length, 3);
        assert.deepEqual(pages.map((page) => page.labels.length), [10, 10, 3]);
        assert.deepEqual(pages[2].labels.map((label) => label.slot), [0, 1, 2]);
        assert.equal(pages[2].labels[0].sequence, 20);
    });

    test("skips the first sheet's used positions only", () => {
        const pages = paginate(sheet, Array.from({ length: 12 }, (_, i) => i), [0, 1, 2]);
        assert.deepEqual(pages[0].labels.map((label) => label.slot), [3, 4, 5, 6, 7, 8, 9]);
        assert.deepEqual(pages[1].labels.map((label) => label.slot), [0, 1, 2, 3, 4]);
        assert.equal(pages[1].labels[0].item, 7);
    });

    test("a first sheet with nothing free is not fed through blank", () => {
        const all = Array.from({ length: 10 }, (_, i) => i);
        const pages = paginate(sheet, [0, 1], all);
        assert.equal(pages.length, 1);
        assert.deepEqual(pages[0].labels.map((label) => label.slot), [0, 1]);
    });

    test("nothing to print makes no pages", () => {
        assert.deepEqual(paginate(sheet, [], []), []);
    });
});

describe("jobQueue", () => {
    test("without data, fills the requested sheets around the used positions", () => {
        const queue = jobQueue(sheet, null, { copies: 1, collate: false, usedSlots: [0, 1], sheetsWithoutData: 2 });
        assert.equal(queue.length, 18);
        assert.ok(queue.every((item) => item === null));
    });

    test("with data, is the rows with their copies", () => {
        assert.deepEqual(jobQueue(sheet, [4, 7], { copies: 1, collate: false, usedSlots: [], sheetsWithoutData: 3 }), [4, 7]);
    });

    test("freeSlots lists what the used positions leave", () => {
        assert.deepEqual(freeSlots(sheet, [1, 3, 5, 7, 9]), [0, 2, 4, 6, 8]);
    });
});
