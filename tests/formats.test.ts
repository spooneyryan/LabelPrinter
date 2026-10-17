import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tableFromJson } from "../src/import/json.ts";
import { MAX_SEQUENCE, sequenceTable } from "../src/import/sequence.ts";
import { tableFromVCards } from "../src/import/vcard.ts";

describe("JSON", () => {
    test("an array of objects, fields in order of first appearance", () => {
        const table = tableFromJson('[{"name":"Ada","age":36},{"name":"Alan","city":"Wilmslow"}]', "people.json");
        assert.deepEqual(table.fields, ["name", "age", "city"]);
        assert.deepEqual(table.rows, [["Ada", "36", ""], ["Alan", "", "Wilmslow"]]);
    });

    test("records inside a wrapper, nested objects flattened", () => {
        const table = tableFromJson('{"meta":{"count":1},"contacts":[{"name":"Jo","address":{"city":"Lyon","zip":"69001"},"tags":["a","b"],"vip":true,"note":null}]}', "x");
        assert.deepEqual(table.fields, ["name", "address.city", "address.zip", "tags", "vip", "note"]);
        assert.deepEqual(table.rows, [["Jo", "Lyon", "69001", "a, b", "true", ""]]);
    });

    test("an array of arrays has its header first", () => {
        assert.deepEqual(tableFromJson('[["A","B"],[1,2]]', "x").rows, [["1", "2"]]);
    });

    test("a single object is one record", () => {
        assert.deepEqual(tableFromJson('{"a":"x"}', "x").rows, [["x"]]);
    });

    test("explains what is wrong", () => {
        assert.throws(() => tableFromJson("{oops", "x"), /not valid JSON/);
        assert.throws(() => tableFromJson("[]", "x"), /no records/);
    });
});

describe("vCard", () => {
    test("version 3 with folding, escapes, types and an Apple group", () => {
        const text = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "N:Lovelace;Ada;King;Lady;",
            "FN:Lady Ada King Lovelace",
            "ORG:Analytical Engines\\, Ltd;Research",
            "item1.ADR;TYPE=WORK:;;1 Work Rd;Worktown;;W1 1AA;UK",
            "ADR;TYPE=HOME,PREF:;Flat 2;12 St James's Sq\\nRear entrance;London;;SW1Y",
            "  4JH;United Kingdom",
            "TEL;TYPE=CELL:+44 20 7946 0000",
            "EMAIL;TYPE=INTERNET:ada@example.com",
            "END:VCARD"
        ].join("\r\n");

        const table = tableFromVCards(text, "contacts.vcf");
        const row = Object.fromEntries(table.fields.map((field, index) => [field, table.rows[0][index]]));
        assert.deepEqual(row, {
            "Full Name": "Lady Ada King Lovelace",
            Prefix: "Lady",
            "First Name": "Ada",
            "Middle Name": "King",
            "Last Name": "Lovelace",
            Company: "Analytical Engines, Ltd",
            Department: "Research",
            Address: "12 St James's Sq",
            "Address 2": "Rear entrance, Flat 2",
            City: "London",
            ZIP: "SW1Y 4JH",
            Country: "United Kingdom",
            Phone: "+44 20 7946 0000",
            Email: "ada@example.com"
        });
    });

    test("version 2.1 quoted-printable with soft line breaks", () => {
        const text = [
            "BEGIN:VCARD",
            "VERSION:2.1",
            "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Mu=C3=B1oz;Jos=C3=A9",
            "ADR;HOME;ENCODING=QUOTED-PRINTABLE:;;Calle Mayor 1=",
            "0;Madrid;;28013;Spain",
            "END:VCARD"
        ].join("\n");

        const table = tableFromVCards(text, "x");
        const row = Object.fromEntries(table.fields.map((field, index) => [field, table.rows[0][index]]));
        assert.equal(row["Last Name"], "Muñoz");
        assert.equal(row["First Name"], "José");
        assert.equal(row.Address, "Calle Mayor 10");
        assert.equal(row.City, "Madrid");
    });

    test("only the columns somebody has, and names split from FN when N is missing", () => {
        const table = tableFromVCards("BEGIN:VCARD\nFN:Grace Brewster Hopper\nEND:VCARD\nBEGIN:VCARD\nFN:Cher\nEND:VCARD", "x");
        assert.deepEqual(table.fields, ["Full Name", "First Name", "Last Name"]);
        assert.deepEqual(table.rows, [["Grace Brewster Hopper", "Grace Brewster", "Hopper"], ["Cher", "Cher", ""]]);
    });

    test("a file with no cards is an error", () => {
        assert.throws(() => tableFromVCards("hello", "x"), /no contacts/);
    });
});

describe("sequences", () => {
    test("pads and steps", () => {
        const table = sequenceTable({ start: 8, count: 3, step: 1, digits: 4 });
        assert.deepEqual(table.rows, [["0008"], ["0009"], ["0010"]]);
        assert.equal(table.source, "Numbers 0008–0010");
    });

    test("counts down and keeps decimals", () => {
        assert.deepEqual(sequenceTable({ start: 1, count: 3, step: -0.5, digits: 0 }).rows, [["1.0"], ["0.5"], ["0.0"]]);
    });

    test("is capped", () => {
        assert.equal(sequenceTable({ start: 1, count: 1e9, step: 1, digits: 0 }).rows.length, MAX_SEQUENCE);
    });
});
