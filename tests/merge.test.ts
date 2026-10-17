import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    buildFieldIndex,
    detectAddressFields,
    mergeLines,
    mergeText,
    placeholderContext,
    renameField,
    suggestAddressBlock,
    templateFields,
    tokenize,
    toTitleCase,
    type MergeContext
} from "../src/model/merge.ts";

const fields = ["First Name", "Last Name", "Address", "Address 2", "City", "State", "ZIP"];
const context = (record: string[], rowNumber = 1): MergeContext => ({ record, fields: buildFieldIndex(fields), rowNumber });
const block = "{{First Name}} {{Last Name}}\n{{Address}}\n{{Address 2}}\n{{City}}, {{State}} {{ZIP}}";

describe("tokenize", () => {
    test("splits text and placeholders, with filters", () => {
        assert.deepEqual(tokenize("Hi {{ First Name | upper }}!"), [
            { kind: "text", text: "Hi " },
            { kind: "field", name: "First Name", filters: ["upper"] },
            { kind: "text", text: "!" }
        ]);
    });

    test("leaves empty braces alone", () => {
        assert.deepEqual(tokenize("a {{}} b"), [{ kind: "text", text: "a {{}} b" }]);
    });

    test("templateFields lists each field once, without the row number", () => {
        assert.deepEqual(templateFields("{{A}} {{B}} {{A}} {{#}}"), ["A", "B"]);
    });
});

describe("mergeLines", () => {
    const record = ["Ada", "Lovelace", "12 St James's Sq", "", "London", "", "SW1Y 4JH"];

    test("fills fields and keeps literal text", () => {
        assert.deepEqual(mergeLines(block, context(record)), ["Ada Lovelace", "12 St James's Sq", "", "London,  SW1Y 4JH"]);
    });

    test("drops lines whose every field is empty, when asked", () => {
        assert.deepEqual(mergeLines(block, context(record), { removeBlankLines: true }), [
            "Ada Lovelace",
            "12 St James's Sq",
            "London,  SW1Y 4JH"
        ]);
    });

    test("keeps blank lines that have no fields: spacing typed on purpose", () => {
        assert.deepEqual(mergeLines("Top\n\nBottom", context(record), { removeBlankLines: true }), ["Top", "", "Bottom"]);
    });

    test("matches field names loosely", () => {
        assert.deepEqual(mergeLines("{{first name}} {{LAST  NAME}}", context(record)), ["Ada Lovelace"]);
    });

    test("unknown fields merge as empty", () => {
        assert.deepEqual(mergeLines("[{{Nope}}]", context(record)), ["[]"]);
    });

    test("applies filters in order", () => {
        assert.deepEqual(mergeLines("{{City|upper}} {{Last Name|lower}}", context(record)), ["LONDON lovelace"]);
    });

    test("the row number is {{#}}", () => {
        assert.equal(mergeText("No. {{#}}", context(record, 42)), "No. 42");
    });

    test("a cell with line breaks stays on its line", () => {
        const multi = ["Ada", "", "1 Main St\nFloor 2", "", "", "", ""];
        assert.deepEqual(mergeLines("{{Address}}", context(multi)), ["1 Main St Floor 2"]);
    });

    test("shows field names when there is no record", () => {
        assert.deepEqual(mergeLines("{{City}}, {{State}}", placeholderContext()), ["«City», «State»"]);
    });
});

describe("helpers", () => {
    test("title case handles names", () => {
        assert.equal(toTitleCase("MARY O'BRIEN-SMITH"), "Mary O'Brien-Smith");
        assert.equal(toTitleCase("don't stop"), "Don't Stop");
    });

    test("renameField rewrites placeholders and keeps filters", () => {
        assert.equal(renameField("{{zip}} {{ ZIP | upper }} {{Zipper}}", "ZIP", "Postal Code"), "{{Postal Code}} {{Postal Code|upper}} {{Zipper}}");
    });
});

describe("address detection", () => {
    test("recognises common column names", () => {
        assert.deepEqual(detectAddressFields(["first_name", "Surname", "Street Address", "Town", "Province", "Postcode"]), {
            first: "first_name",
            last: "Surname",
            address1: "Street Address",
            city: "Town",
            state: "Province",
            zip: "Postcode"
        });
    });

    test("builds an address block", () => {
        assert.equal(
            suggestAddressBlock(["Company", "Name", "Address 1", "Address 2", "City", "State", "Zip Code", "Phone"]),
            "{{Name}}\n{{Company}}\n{{Address 1}}\n{{Address 2}}\n{{City}}, {{State}} {{Zip Code}}"
        );
    });

    test("recognises French, German and Spanish column names, accents or not", () => {
        assert.equal(
            suggestAddressBlock(["Prénom", "Nom", "Société", "Rue", "Ville", "Code postal", "Pays"]),
            "{{Prénom}} {{Nom}}\n{{Société}}\n{{Rue}}\n{{Ville}} {{Code postal}}\n{{Pays}}"
        );
        assert.deepEqual(detectAddressFields(["Vorname", "Nachname", "Straße", "PLZ", "Ort"]), {
            first: "Vorname",
            last: "Nachname",
            address1: "Straße",
            zip: "PLZ",
            city: "Ort"
        });
        assert.equal(detectAddressFields(["Nombre", "Apellidos", "Dirección", "Ciudad", "Código Postal"]).zip, "Código Postal");
    });

    test("falls back to one line per column for other data", () => {
        assert.equal(suggestAddressBlock(["SKU", "Price"]), "{{SKU}}\n{{Price}}");
    });
});
