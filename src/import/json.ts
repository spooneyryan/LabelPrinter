import type { DataTable } from "../model/types.ts";
import { tableFromRows } from "./table.ts";

/*
 * JSON exports: an array of records, with or without a wrapper object around it.
 *
 * The shapes APIs and tools actually produce are an array of objects (`[{"name": …}, …]`), the
 * same inside a property (`{"contacts": [ … ]}`), or an array of arrays with a header row. Nested
 * objects flatten into dotted fields — `address.city` — and arrays of plain values join with
 * commas, so every record becomes one row of text.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** The first array of records in the value: the value itself, or one found under its properties. */
function findRecords(value: JsonValue, depth = 0): JsonValue[] | null {
    if (Array.isArray(value)) {
        return value;
    }

    if (!isRecord(value) || depth > 3) {
        return null;
    }

    for (const child of Object.values(value)) {
        if (Array.isArray(child) && child.some((item) => isRecord(item) || Array.isArray(item))) {
            return child;
        }
    }

    for (const child of Object.values(value)) {
        const found = findRecords(child, depth + 1);
        if (found) {
            return found;
        }
    }

    // A lone object is one record.
    return depth === 0 ? [value] : null;
}

function scalarText(value: JsonValue): string {
    if (value === null) {
        return "";
    }

    if (Array.isArray(value)) {
        return value.map(scalarText).filter(Boolean).join(", ");
    }

    if (isRecord(value)) {
        return JSON.stringify(value);
    }

    return String(value);
}

function flatten(record: Record<string, JsonValue>, prefix: string, into: Map<string, string>, depth = 0): void {
    for (const [key, value] of Object.entries(record)) {
        const name = prefix ? `${prefix}.${key}` : key;
        if (isRecord(value) && depth < 4) {
            flatten(value, name, into, depth + 1);
        } else {
            into.set(name, scalarText(value));
        }
    }
}

export function tableFromJson(text: string, source: string): DataTable {
    let parsed: JsonValue;
    try {
        parsed = JSON.parse(text.replace(/^﻿/, "")) as JsonValue;
    } catch (error) {
        throw new Error(`This file is not valid JSON: ${(error as Error).message}`);
    }

    const records = findRecords(parsed);
    if (!records || records.length === 0) {
        throw new Error("There are no records in this JSON file: expected an array of objects.");
    }

    // An array of arrays is a spreadsheet already, header first.
    if (records.every(Array.isArray)) {
        return tableFromRows(
            (records as JsonValue[][]).map((row) => row.map(scalarText)),
            true,
            source
        );
    }

    const flattened = records.map((record) => {
        const fields = new Map<string, string>();
        if (isRecord(record)) {
            flatten(record, "", fields);
        } else {
            fields.set("Value", scalarText(record));
        }

        return fields;
    });

    // Fields in order of first appearance across all records, so a key only some have still gets a column.
    const names: string[] = [];
    const seen = new Set<string>();
    for (const fields of flattened) {
        for (const name of fields.keys()) {
            if (!seen.has(name)) {
                seen.add(name);
                names.push(name);
            }
        }
    }

    return tableFromRows([names, ...flattened.map((fields) => names.map((name) => fields.get(name) ?? ""))], true, source);
}
