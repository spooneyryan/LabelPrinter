import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultSession, defaultTemplate } from "../src/model/defaults.ts";
import { PROJECT_FORMAT, readLabelFile, sanitizeCalibration, sanitizeSession, sanitizeTemplate, toProjectFile } from "../src/model/project.ts";
import type { Session } from "../src/model/types.ts";

describe("templates", () => {
    test("a template survives a JSON round trip unchanged", () => {
        const template = defaultTemplate();
        assert.deepEqual(sanitizeTemplate(JSON.parse(JSON.stringify(template))), template);
    });

    test("anything that is not a template is rejected whole", () => {
        assert.equal(sanitizeTemplate(null), null);
        assert.equal(sanitizeTemplate([1, 2]), null);
        assert.equal(sanitizeTemplate({ name: "x" }), null);
    });

    test("bad values fall back, out-of-range ones are held in range", () => {
        const template = sanitizeTemplate({
            name: 42,
            sheet: { labelWidth: -3, columns: 2.6, rows: 1e9, shape: "hexagon" },
            design: { elements: [] }
        });

        assert.ok(template);
        assert.equal(template.name, "Untitled labels");
        assert.equal(template.sheet.labelWidth, 0.05);
        assert.equal(template.sheet.columns, 3);
        assert.equal(template.sheet.rows, 200);
        assert.equal(template.sheet.shape, "rounded");
    });

    test("unknown elements are dropped and duplicate ids replaced", () => {
        const template = sanitizeTemplate({
            sheet: {},
            design: {
                elements: [
                    { type: "text", id: "a", template: "Hi", color: "red" },
                    { type: "hologram", id: "b" },
                    { type: "shape", id: "a", shape: "ellipse", fill: "" }
                ]
            }
        });

        const elements = template!.design.elements;
        assert.deepEqual(elements.map((element) => element.type), ["text", "shape"]);
        assert.notEqual(elements[0].id, elements[1].id);
        // Only hex colours reach a style attribute.
        assert.equal(elements[0].type === "text" && elements[0].color, "#000000");
        assert.equal(elements[1].type === "shape" && elements[1].fill, "");
    });

    test("images must be inline image data", () => {
        const image = (src: string) =>
            sanitizeTemplate({ sheet: {}, design: { elements: [{ type: "image", src }] } })!.design.elements[0];

        assert.equal((image("https://example.com/track.png") as { src: string }).src, "");
        assert.equal((image("data:text/html;base64,PHA+") as { src: string }).src, "");
        assert.equal((image("data:image/png;base64,iVBORw0KGgo=") as { src: string }).src, "data:image/png;base64,iVBORw0KGgo=");
    });
});

describe("sessions", () => {
    test("a session round-trips", () => {
        const session = {
            ...defaultSession(),
            data: { source: "x.csv", fields: ["A", "B"], rows: [["1", "2"], ["3", "4"]] },
            excluded: [1]
        };
        assert.deepEqual(sanitizeSession(JSON.parse(JSON.stringify(session))), session);
    });

    test("rows are made as wide as the fields, and exclusions kept in range", () => {
        const session = sanitizeSession({
            ...defaultSession(),
            data: { source: "x", fields: ["A", "B"], rows: [["1"], [2, null, "extra"]] },
            excluded: [0, 5, -1, 0]
        });

        assert.deepEqual(session!.data!.rows, [["1", ""], ["2", ""]]);
        assert.deepEqual(session!.excluded, [0]);
    });

    test("calibration is held to a printer's plausible range", () => {
        assert.deepEqual(sanitizeCalibration({ offsetX: 9, offsetY: "x", scaleX: 50, scaleY: 101 }), {
            offsetX: 2,
            offsetY: 0,
            scaleX: 90,
            scaleY: 101
        });
    });
});

describe("project files", () => {
    const project = (): Session => ({
        ...defaultSession(),
        template: { ...defaultTemplate(), name: "Capacitors" },
        data: { source: "parts.csv", fields: ["Code", "Value"], rows: [["335", "3.3 uF"], ["104", "0.1 uF"], ["225", "2.2 uF"]] },
        excluded: [1],
        print: { ...defaultSession().print, copies: 2, usedSlots: [0, 1, 2] }
    });

    test("a project keeps everything through a JSON round trip: sheet, design, data, exclusions, print settings", () => {
        const session = project();
        const file = JSON.parse(JSON.stringify(toProjectFile(session, "2026-10-26T12:00:00.000Z")));
        assert.equal(file.format, PROJECT_FORMAT);
        assert.equal(file.savedAt, "2026-10-26T12:00:00.000Z");
        assert.deepEqual(readLabelFile(file), { kind: "project", session });
    });

    test("a template file opens as a template, not a project", () => {
        const template = defaultTemplate();
        assert.deepEqual(readLabelFile(JSON.parse(JSON.stringify(template))), { kind: "template", template });
    });

    test("a project without its marker is still recognised by the template inside it", () => {
        const session = project();
        assert.equal(readLabelFile(JSON.parse(JSON.stringify(session)))?.kind, "project");
    });

    test("anything else is neither", () => {
        assert.equal(readLabelFile({ hello: "world" }), null);
        assert.equal(readLabelFile({ format: PROJECT_FORMAT }), null);
        assert.equal(readLabelFile("text"), null);
    });
});
