import { STARTER_TEMPLATE } from "./defaults.ts";
import { addressBlock, buildFieldIndex, suggestFieldsBlock, templateFields } from "./merge.ts";
import type { LabelDesign, TextElement } from "./types.ts";

/*
 * Filling the label from newly loaded data. A design made before the data arrived names fields
 * the data may spell differently, or none at all, and a label merging fields that do not exist
 * prints blanks — so loading data puts the data's own fields on the label, unless the label is
 * already using them:
 *
 *   the starter text, never edited        → replaced with the data's fields
 *   fields the new data has none of       → replaced (keeping the element's place and style)
 *   no fields anywhere on the label       → a block of the data's fields is added
 *   some of the new data's fields already → left alone, and the user is asked
 *   every field it uses is in the data    → left alone
 *
 * Replacing is safe to do unasked because it is one undo away, and because what it replaces could
 * not have printed anything from this data. A label that already shares fields with the data is
 * someone's deliberate design, so that one is a question.
 */

export type PopulatePlan =
    | { kind: "none" }
    | { kind: "replace"; elementId: string; template: string; name?: string }
    | { kind: "add"; template: string; name: string }
    | { kind: "ask"; elementId: string; template: string; name?: string; missing: string[] };

/** The default element names, which follow the content; anything else is the user's and stays. */
const DEFAULT_NAMES = new Set(["Address", "Fields", "Text"]);

export function planPopulate(design: LabelDesign, fields: readonly string[]): PopulatePlan {
    if (fields.length === 0) {
        return { kind: "none" };
    }

    const template = suggestFieldsBlock(fields);
    const blockName = addressBlock(fields) ? "Address" : "Fields";
    const index = buildFieldIndex(fields);

    const textWithFields = design.elements.filter(
        (element): element is TextElement => element.type === "text" && templateFields(element.template).length > 0
    );
    const renamed = (element: TextElement) => (DEFAULT_NAMES.has(element.name) ? blockName : undefined);

    const starter = textWithFields.find((element) => element.template === STARTER_TEMPLATE);
    if (starter) {
        return starter.template === template
            ? { kind: "none" }
            : { kind: "replace", elementId: starter.id, template, name: renamed(starter) };
    }

    const used = [
        ...new Set(design.elements.flatMap((element) => ("template" in element ? templateFields(element.template) : [])))
    ];
    const missing = used.filter((field) => index.resolve(field) === undefined);

    if (used.length > 0 && missing.length === 0) {
        return { kind: "none" };
    }

    if (textWithFields.length === 0) {
        return { kind: "add", template, name: blockName };
    }

    const target =
        textWithFields.find((element) => templateFields(element.template).some((field) => missing.includes(field))) ??
        textWithFields[0];

    return missing.length === used.length
        ? { kind: "replace", elementId: target.id, template, name: renamed(target) }
        : { kind: "ask", elementId: target.id, template, name: renamed(target), missing };
}

/** `"Name, Address, City and 3 more"`, for telling someone which fields went onto the label. */
export function describeFields(fields: readonly string[], shown = 3): string {
    if (fields.length <= shown + 1) {
        return fields.length <= 1 ? (fields[0] ?? "") : `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}`;
    }

    return `${fields.slice(0, shown).join(", ")} and ${fields.length - shown} more`;
}
