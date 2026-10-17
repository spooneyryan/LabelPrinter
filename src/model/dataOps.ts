import type { DataTable } from "./types.ts";
import { uniqueFieldNames } from "../import/table.ts";

/*
 * Edits to the loaded data, as pure functions: each returns a new table, and the ones that move
 * rows also return the excluded set remapped onto the new row indexes, so a row left out of the
 * merge stays left out when the rows around it come and go.
 */

export function setCell(table: DataTable, row: number, column: number, value: string): DataTable {
    if (table.rows[row]?.[column] === value) {
        return table;
    }

    const rows = table.rows.slice();
    rows[row] = rows[row].slice();
    rows[row][column] = value;
    return { ...table, rows };
}

export function addRow(table: DataTable): DataTable {
    return { ...table, rows: [...table.rows, table.fields.map(() => "")] };
}

export function deleteRows(
    table: DataTable,
    remove: ReadonlySet<number>,
    excluded: ReadonlySet<number>
): { table: DataTable; excluded: Set<number> } {
    const rows: string[][] = [];
    const nextExcluded = new Set<number>();

    table.rows.forEach((row, index) => {
        if (remove.has(index)) {
            return;
        }

        if (excluded.has(index)) {
            nextExcluded.add(rows.length);
        }

        rows.push(row);
    });

    return { table: { ...table, rows }, excluded: nextExcluded };
}

/** Renames a field, keeping names unique; returns the name actually used. */
export function renameField(table: DataTable, index: number, name: string): { table: DataTable; name: string } {
    const proposed = table.fields.map((field, i) => (i === index ? name : field));
    // Uniqueness is settled against the other names, so the renamed field is the one that yields.
    const others = table.fields.filter((_, i) => i !== index);
    const unique = uniqueFieldNames([...others, name]).at(-1) ?? name;
    proposed[index] = unique;
    return { table: { ...table, fields: proposed }, name: unique };
}

export function insertField(table: DataTable, index: number, name: string): DataTable {
    const fields = table.fields.slice();
    const unique = uniqueFieldNames([...fields, name]).at(-1) ?? name;
    fields.splice(index, 0, unique);
    return {
        ...table,
        fields,
        rows: table.rows.map((row) => {
            const next = row.slice();
            next.splice(index, 0, "");
            return next;
        })
    };
}

export function deleteField(table: DataTable, index: number): DataTable {
    return {
        ...table,
        fields: table.fields.filter((_, i) => i !== index),
        rows: table.rows.map((row) => row.filter((_, i) => i !== index))
    };
}

/** The row indexes that take part in the merge, in data order. */
export function includedRows(table: DataTable, excluded: ReadonlySet<number>): number[] {
    const rows: number[] = [];
    for (let index = 0; index < table.rows.length; index++) {
        if (!excluded.has(index)) {
            rows.push(index);
        }
    }

    return rows;
}
