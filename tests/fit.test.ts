import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createQrElement, createTextElement, defaultDesign } from "../src/model/defaults.ts";
import { fitDesignToLabel, labelSizeChanged } from "../src/model/fit.ts";
import { findPreset, sheetFromPreset } from "../src/model/presets.ts";
import { createElement } from "../src/features/design/insert.ts";

const address = sheetFromPreset(findPreset("avery-5160")!); // 2⅝″ × 1″
const shipping = sheetFromPreset(findPreset("avery-5163")!); // 4″ × 2″

describe("fitDesignToLabel", () => {
    test("a block filling the safe area fills the new one", () => {
        const design = defaultDesign(address, "{{Name}}");
        const fitted = fitDesignToLabel(design, address, shipping);
        const [block] = fitted.elements;

        assert.equal(fitted.safeMargin, 0.125);
        assert.deepEqual(
            { x: block.x, y: block.y, width: block.width, height: block.height },
            { x: 0.125, y: 0.125, width: 3.75, height: 1.75 }
        );
    });

    test("type grows with the smaller stretch, to the half point", () => {
        const design = { safeMargin: 0.0625, elements: [createTextElement({ x: 0.0625, y: 0.0625, width: 2.5, height: 0.875 })] };
        const [text] = fitDesignToLabel(design, address, shipping).elements;
        assert.equal(text.type === "text" && text.fontSize, 16.5); // 11pt × 1.5
    });

    test("QR codes keep their proportions and centre", () => {
        const design = { safeMargin: 0.0625, elements: [createQrElement({ x: 1.5, y: 0.0625, width: 0.875, height: 0.875 })] };
        const [qr] = fitDesignToLabel(design, address, shipping).elements;
        assert.equal(qr.width, qr.height);
        assert.equal(qr.width, 1.3125);
    });

    test("a chosen safe margin is kept", () => {
        const design = { safeMargin: 0.1, elements: [] };
        assert.equal(fitDesignToLabel(design, address, shipping).safeMargin, 0.1);
    });

    test("the same size changes nothing", () => {
        const design = defaultDesign(address, "x");
        const moved = { ...address, marginTop: 3 };
        assert.equal(fitDesignToLabel(design, address, { ...address }), design);
        assert.equal(labelSizeChanged(address, moved), false);
    });
});

describe("createElement", () => {
    test("new elements land inside the safe area", () => {
        const design = defaultDesign(address, "x");
        for (const kind of ["text", "address", "image", "qr", "barcode", "rectangle", "ellipse", "line"] as const) {
            const element = createElement(kind, address, design, ["Name"]);
            assert.ok(element.x >= design.safeMargin - 1e-9, `${kind} x`);
            assert.ok(element.y >= design.safeMargin - 1e-9, `${kind} y`);
            assert.ok(element.x + element.width <= address.labelWidth - design.safeMargin + 1e-9, `${kind} right`);
            assert.ok(element.y + element.height <= address.labelHeight - design.safeMargin + 1e-9, `${kind} bottom`);
        }
    });

    test("a field dropped near the edge is pulled inside", () => {
        const element = createElement("text", address, defaultDesign(address, "x"), [], { x: 2.6, y: 0.99 }, "{{Name}}");
        assert.ok(element.x + element.width <= address.labelWidth);
        assert.equal(element.type === "text" && element.template, "{{Name}}");
    });
});
