import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Code128Error, encodeCode128, PATTERNS } from "../src/codes/code128.ts";
import {
    addErrorCorrection,
    alignmentPositions,
    dataCodewords,
    encodeQr,
    formatBits,
    QrCapacityError,
    reedSolomonDivisor,
    reedSolomonRemainder,
    versionBits
} from "../src/codes/qr.ts";

/*
 * Both encoders were also checked end to end against independent decoders (jsQR and ZXing) for
 * versions 1–40 and every code-set switch; these tests pin the pieces with published values so a
 * regression names the part that broke.
 */

describe("QR code", () => {
    test("Reed–Solomon matches the worked example for HELLO WORLD at 1-M", () => {
        const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
        assert.deepEqual(reedSolomonRemainder(data, reedSolomonDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    });

    test("format bits match the standard's table", () => {
        const table: Record<string, string> = {
            L0: "111011111000100",
            L7: "110100101110110",
            M0: "101010000010010",
            M5: "100000011001110",
            Q2: "011111100110001",
            H0: "001011010001001",
            H7: "000100000111011"
        };

        for (const [key, bits] of Object.entries(table)) {
            const level = key[0] as "L" | "M" | "Q" | "H";
            assert.equal(formatBits(level, Number(key[1])).toString(2).padStart(15, "0"), bits, key);
        }
    });

    test("version bits match the standard's table", () => {
        assert.equal(versionBits(7), 0x07c94);
        assert.equal(versionBits(10), 0x0a4d3);
        assert.equal(versionBits(40), 0x28c69);
    });

    test("capacities match the standard", () => {
        assert.equal(dataCodewords(1, "L"), 19);
        assert.equal(dataCodewords(1, "H"), 9);
        assert.equal(dataCodewords(10, "M"), 216);
        assert.equal(dataCodewords(40, "L"), 2956);
        assert.equal(dataCodewords(40, "H"), 1276);
    });

    test("alignment pattern centres", () => {
        assert.deepEqual(alignmentPositions(1), []);
        assert.deepEqual(alignmentPositions(2), [6, 18]);
        assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
        assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
    });

    test("interleaving keeps every codeword", () => {
        const data = Array.from({ length: dataCodewords(5, "Q") }, (_, i) => i % 256);
        const all = addErrorCorrection(data, 5, "Q");
        assert.equal(all.length, 134);
        // Version 5-Q has two blocks of 15 and two of 16: the first codewords alternate blocks.
        assert.deepEqual(all.slice(0, 4), [0, 15, 30, 46]);
    });

    test("picks the smallest version and draws the finder patterns", () => {
        const code = encodeQr("HELLO WORLD", "Q");
        assert.equal(code.version, 1);
        assert.equal(code.size, 21);
        for (const [x, y] of [[0, 0], [14, 0], [0, 14]]) {
            assert.equal(code.modules[y][x], true);
            assert.equal(code.modules[y + 1][x + 1], false);
            assert.equal(code.modules[y + 3][x + 3], true);
        }

        assert.equal(code.modules[21 - 8][8], true, "the dark module");
    });

    test("numeric data packs denser than bytes", () => {
        assert.equal(encodeQr("1".repeat(41), "L").version, 1);
        assert.equal(encodeQr("a".repeat(41), "L").version, 3);
    });

    test("too much data is a capacity error", () => {
        assert.throws(() => encodeQr("x".repeat(3000), "H"), QrCapacityError);
    });
});

describe("Code 128", () => {
    test("every symbol is 11 modules and the stop is 13", () => {
        PATTERNS.slice(0, 106).forEach((pattern, value) => {
            assert.equal([...pattern].reduce((sum, width) => sum + Number(width), 0), 11, `value ${value}`);
        });
        assert.equal([...PATTERNS[106]].reduce((sum, width) => sum + Number(width), 0), 13);
    });

    test("text in code set B with its check symbol", () => {
        // Start B (104), then values; check = (104 + Σ value × position) mod 103.
        assert.deepEqual(encodeCode128("Wikipedia").values, [104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88]);
    });

    test("digits pack into code set C", () => {
        assert.deepEqual(encodeCode128("123456").values.slice(0, 4), [105, 12, 34, 56]);
    });

    test("switches to C for a long digit run and back out", () => {
        const values = encodeCode128("AB1234567890CD").values;
        assert.deepEqual(values.slice(0, 9), [104, 33, 34, 99, 12, 34, 56, 78, 90]);
        assert.deepEqual(values.slice(9, 12), [100, 35, 36]);
    });

    test("an odd digit run spends one digit before switching", () => {
        const values = encodeCode128("X12345").values;
        assert.deepEqual(values.slice(0, 6), [104, 56, 17, 99, 23, 45]);
    });

    test("control characters use code set A", () => {
        assert.deepEqual(encodeCode128("A\tB").values.slice(0, 4), [103, 33, 73, 34]);
    });

    test("the width list is start, data, check and stop", () => {
        const code = encodeCode128("Hi");
        assert.equal(code.modules, 11 * 4 + 13);
        assert.equal(code.widths.length, 6 * 4 + 7);
    });

    test("refuses what it cannot encode", () => {
        assert.throws(() => encodeCode128(""), Code128Error);
        assert.throws(() => encodeCode128("café"), Code128Error);
    });
});
