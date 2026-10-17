import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeLength, formatDecimal, formatFriendlyInches, formatLength, parseLength, snapTo } from "../src/model/units.ts";

const close = (actual: number | null, expected: number) => {
    assert.notEqual(actual, null);
    assert.ok(Math.abs((actual as number) - expected) < 1e-9, `${actual} ≈ ${expected}`);
};

describe("parseLength", () => {
    test("reads decimals, with or without a leading zero", () => {
        close(parseLength("2.625"), 2.625);
        close(parseLength(".5"), 0.5);
        close(parseLength("  1 "), 1);
    });

    test("reads fractions the way label boxes print them", () => {
        close(parseLength("5/8"), 0.625);
        close(parseLength("2 5/8"), 2.625);
        close(parseLength("2-5/8"), 2.625);
        close(parseLength("2⅝"), 2.625);
        close(parseLength("⅓"), 1 / 3);
        close(parseLength("1 1/3"), 4 / 3);
    });

    test("takes a unit suffix over the field's unit", () => {
        close(parseLength("25.4mm"), 1);
        close(parseLength("2.54 cm"), 1);
        close(parseLength("72pt"), 1);
        close(parseLength('2.5"'), 2.5);
        close(parseLength("3 in", "mm"), 3);
    });

    test("reads bare numbers in the field's unit", () => {
        close(parseLength("25.4", "mm"), 1);
        close(parseLength("12,7", "mm"), 0.5);
    });

    test("keeps the sign, for printer offsets", () => {
        close(parseLength("-1/16"), -0.0625);
        close(parseLength("+0.03"), 0.03);
    });

    test("rejects what is not a length", () => {
        assert.equal(parseLength(""), null);
        assert.equal(parseLength("abc"), null);
        assert.equal(parseLength("1/0"), null);
        assert.equal(parseLength("2..5"), null);
    });
});

describe("formatting", () => {
    test("formatLength trims trailing zeros and keeps four decimals of an inch", () => {
        assert.equal(formatLength(2.625), "2.625");
        assert.equal(formatLength(1 / 3), "0.3333");
        assert.equal(formatLength(1, "mm"), "25.4");
    });

    test("formatDecimal never prints negative zero", () => {
        assert.equal(formatDecimal(-0.00001, 3), "0");
    });

    test("formatFriendlyInches uses fraction glyphs where they exist", () => {
        assert.equal(formatFriendlyInches(2.625), "2⅝″");
        assert.equal(formatFriendlyInches(4 / 3), "1⅓″");
        assert.equal(formatFriendlyInches(2 / 3), "⅔″");
        assert.equal(formatFriendlyInches(1), "1″");
        assert.equal(formatFriendlyInches(3.4375), "3 7/16″");
        assert.equal(formatFriendlyInches(0.1875), "3/16″");
        assert.equal(formatFriendlyInches(1.2346), "1.235″");
    });

    test("describeLength names the unit", () => {
        assert.equal(describeLength(0.125), "0.125 in");
        assert.equal(describeLength(0.125, "mm"), "3.2 mm");
    });

    test("snapTo rounds to the grid without float noise", () => {
        assert.equal(snapTo(0.30000001, 0.0625), 0.3125);
        assert.equal(snapTo(1.03, 0), 1.03);
    });
});
