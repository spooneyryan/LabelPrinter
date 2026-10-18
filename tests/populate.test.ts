import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createImageElement, createQrElement, createTextElement, defaultTemplate, STARTER_TEMPLATE } from "../src/model/defaults.ts";
import { suggestAddressBlock, suggestFieldsBlock } from "../src/model/merge.ts";
import { describeFields, planPopulate } from "../src/model/populate.ts";
import type { LabelDesign, LabelElement } from "../src/model/types.ts";

const box = { x: 0.1, y: 0.1, width: 2, height: 0.8 };
const design = (...elements: LabelElement[]): LabelDesign => ({ safeMargin: 0.0625, elements });
const text = (template: string, name = "Text") => createTextElement(box, template, name);

const products = ["Item", "Price", "SKU"];
const addresses = ["Name", "Street", "City", "State", "Zip", "Phone"];

describe("the fields block", () => {
    test("an address list becomes an address block, leaving Phone off", () => {
        assert.equal(suggestFieldsBlock(addresses), "{{Name}}\n{{Street}}\n{{City}}, {{State}} {{Zip}}");
    });

    test("other data becomes every column, one per line — not capped like the address-block button", () => {
        const many = ["A", "B", "C", "D", "E", "F", "G", "H"];
        assert.equal(suggestFieldsBlock(many), many.map((field) => `{{${field}}}`).join("\n"));
        assert.equal(suggestAddressBlock(many).split("\n").length, 6);
    });
});

describe("planPopulate", () => {
    test("the untouched starter text is replaced, and its default name follows the content", () => {
        const starter = defaultTemplate().design;
        const plan = planPopulate(starter, products);
        assert.deepEqual(plan, { kind: "replace", elementId: starter.elements[0].id, template: "{{Item}}\n{{Price}}\n{{SKU}}", name: "Fields" });
    });

    test("the starter is replaced even when the data has its fields, for a fuller block", () => {
        const starter = defaultTemplate().design;
        const sample = ["First Name", "Last Name", "Company", "Address", "Address 2", "City", "State", "ZIP"];
        const plan = planPopulate(starter, sample);
        assert.equal(plan.kind, "replace");
        assert.match(plan.kind === "replace" ? plan.template : "", /\{\{Company\}\}/);
    });

    test("a label whose fields the data has none of is replaced, keeping a name the user gave it", () => {
        const element = text("{{Title}}\n{{Author}}", "Book spine");
        const plan = planPopulate(design(element), products);
        assert.deepEqual(plan, { kind: "replace", elementId: element.id, template: "{{Item}}\n{{Price}}\n{{SKU}}", name: undefined });
    });

    test("a label already using the data is left alone", () => {
        assert.deepEqual(planPopulate(design(text("{{item}} — {{Price|upper}}")), products), { kind: "none" });
    });

    test("codes count as using the data", () => {
        assert.deepEqual(planPopulate(design(createQrElement(box, "{{SKU}}")), products), { kind: "none" });
    });

    test("a label sharing only some fields with the data is a question", () => {
        const element = text("{{Item}}\n{{Colour}}");
        const plan = planPopulate(design(element), products);
        assert.equal(plan.kind, "ask");
        assert.deepEqual(plan.kind === "ask" ? plan.missing : null, ["Colour"]);
    });

    test("a label with no fields gets a block added", () => {
        assert.deepEqual(planPopulate(design(createImageElement(box), text("FRAGILE")), addresses), {
            kind: "add",
            template: "{{Name}}\n{{Street}}\n{{City}}, {{State}} {{Zip}}",
            name: "Address"
        });
        assert.equal(planPopulate(design(), products).kind, "add");
    });

    test("the row number is not a field", () => {
        assert.equal(planPopulate(design(text("No. {{#}}")), products).kind, "add");
    });

    test("data without columns changes nothing", () => {
        assert.deepEqual(planPopulate(design(text(STARTER_TEMPLATE)), []), { kind: "none" });
    });
});

describe("describeFields", () => {
    test("lists a few and counts the rest", () => {
        assert.equal(describeFields(["A"]), "A");
        assert.equal(describeFields(["A", "B"]), "A and B");
        assert.equal(describeFields(["A", "B", "C", "D"]), "A, B, C and D");
        assert.equal(describeFields(["A", "B", "C", "D", "E", "F"]), "A, B, C and 3 more");
    });
});
