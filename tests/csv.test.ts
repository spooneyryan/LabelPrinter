import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectDelimiter, parseDelimited, toDelimited } from "../src/import/csv.ts";
import { decodeText } from "../src/import/decode.ts";
import { guessHeader, pastedSource, readSource, sourceTable } from "../src/import/importFile.ts";
import { tableFromRows, uniqueFieldNames } from "../src/import/table.ts";

describe("parseDelimited", () => {
    test("reads quoted fields with delimiters, breaks and doubled quotes", () => {
        const text = 'Name,Note\r\n"Smith, Jo","said ""hi""\nthen left"\r\nLee,plain\r\n';
        assert.deepEqual(parseDelimited(text, ","), [
            ["Name", "Note"],
            ["Smith, Jo", 'said "hi"\nthen left'],
            ["Lee", "plain"]
        ]);
    });

    test("accepts LF, CR and a missing final break", () => {
        assert.deepEqual(parseDelimited("a,b\nc,d\re,f", ","), [["a", "b"], ["c", "d"], ["e", "f"]]);
    });

    test("strips a byte-order mark", () => {
        assert.deepEqual(parseDelimited("﻿a,b", ","), [["a", "b"]]);
    });

    test("is lenient with stray quotes and spaces before quotes", () => {
        assert.deepEqual(parseDelimited('5" disk, "quoted"', ","), [['5" disk', "quoted"]]);
    });

    test("keeps empty cells", () => {
        assert.deepEqual(parseDelimited("a,,c\n,,", ","), [["a", "", "c"], ["", "", ""]]);
    });
});

describe("detectDelimiter", () => {
    test("finds commas, tabs, semicolons and pipes", () => {
        assert.equal(detectDelimiter("a,b,c\n1,2,3\n"), ",");
        assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3\n"), "\t");
        assert.equal(detectDelimiter("a;b;c\n1,5;2,5;3\n"), ";");
        assert.equal(detectDelimiter("a|b\n1|2\n"), "|");
    });

    test("is not fooled by commas inside quotes", () => {
        assert.equal(detectDelimiter('Name\tCity\n"Smith, Jo"\t"Paris, TX"\n'), "\t");
    });

    test("prefers tab when commas appear inside unquoted cells", () => {
        assert.equal(detectDelimiter("Name\tAddress\nJo\t1 Main, Apt 2\nAl\t3 Elm\n"), "\t");
    });
});

describe("toDelimited", () => {
    test("quotes only what needs it and round-trips", () => {
        const rows = [["Name", "Note"], ["Smith, Jo", 'a "b"'], ["Lee", " padded "]];
        const text = toDelimited(rows);
        assert.equal(text, 'Name,Note\r\n"Smith, Jo","a ""b"""\r\nLee," padded "');
        assert.deepEqual(parseDelimited(text, ","), rows);
    });
});

describe("tables", () => {
    test("names blank and repeated headers", () => {
        assert.deepEqual(uniqueFieldNames(["Phone", "", "phone", "Phone"]), ["Phone", "Column 2", "phone (2)", "Phone (3)"]);
    });

    test("drops blank rows, trims cells and pads short rows", () => {
        const table = tableFromRows([["A", "B", "C"], [" 1 ", "2"], ["", " "], ["4", "5", "6", "7"]], true, "test");
        assert.deepEqual(table.fields, ["A", "B", "C", "Column 4"]);
        assert.deepEqual(table.rows, [["1", "2", "", ""], ["4", "5", "6", "7"]]);
    });

    test("numbers columns without a header", () => {
        assert.deepEqual(tableFromRows([["x", "y"]], false, "t").fields, ["Column 1", "Column 2"]);
    });

    test("guesses whether the first row is a header", () => {
        assert.equal(guessHeader([["Name", "City", "ZIP"]]), true);
        assert.equal(guessHeader([["Jo Smith", "Boston", "02134"]]), false);
        assert.equal(guessHeader([["Name", "Name"]]), false);
    });
});

describe("decoding", () => {
    test("reads UTF-8, and Windows-1252 when the bytes are not UTF-8", () => {
        assert.equal(decodeText(new TextEncoder().encode("Muñoz")).text, "Muñoz");
        const latin = decodeText(new Uint8Array([0x4d, 0x75, 0xf1, 0x6f, 0x7a]));
        assert.equal(latin.text, "Muñoz");
        assert.equal(latin.encoding, "windows-1252");
    });

    test("honours a UTF-16 byte-order mark", () => {
        const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x2c, 0x00, 0x42, 0x00]);
        assert.deepEqual(decodeText(bytes), { text: "A,B", encoding: "utf-16le" });
    });
});

describe("import sources", () => {
    test("a CSV file becomes a table with details", async () => {
        const source = await readSource("list.csv", new TextEncoder().encode("Name;City\nJo;Paris\n"));
        const { table, details } = sourceTable(source);
        assert.deepEqual(table.fields, ["Name", "City"]);
        assert.deepEqual(table.rows, [["Jo", "Paris"]]);
        assert.equal(details, "Semicolon-separated · UTF-8");
    });

    test("changing the header switch re-reads the source", async () => {
        const source = await readSource("list.csv", new TextEncoder().encode("Name,City\nJo,Paris\n"));
        assert.ok(source.format === "delimited");
        const table = sourceTable({ ...source, hasHeader: false }).table;
        assert.deepEqual(table.rows, [["Name", "City"], ["Jo", "Paris"]]);
    });

    test("pasted spreadsheet cells are tab-separated", () => {
        const { table } = sourceTable(pastedSource("First\tLast\nAda\tLovelace"));
        assert.deepEqual(table.rows, [["Ada", "Lovelace"]]);
    });

    test("recognises JSON and vCard by content", async () => {
        assert.equal((await readSource("data", new TextEncoder().encode('[{"a":1}]'))).format, "json");
        assert.equal((await readSource("x.txt", new TextEncoder().encode("BEGIN:VCARD\nEND:VCARD"))).format, "vcard");
    });

    test("refuses the old Excel format with a way forward", async () => {
        await assert.rejects(readSource("old.xls", new Uint8Array([1, 2, 3])), /save it as \.xlsx or \.csv/);
    });
});
