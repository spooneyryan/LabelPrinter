import { EbButton, EbCheckbox, EbPopover, EbTextBox, useDialogs } from "@electricblazor/react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../../components/Icon.tsx";
import type { DataTable } from "../../model/types.ts";

/*
 * The records, as a table you can correct before printing: tick a row out of the merge, click a
 * cell to fix a typo, rename or add a column. Pages of a hundred rows keep a long list quick, and
 * the search narrows what is shown (and what "include shown" acts on) without changing the data.
 */

const PAGE_SIZE = 100;

export interface DataGridProps {
    table: DataTable;
    excluded: ReadonlySet<number>;
    onExcludedChange: (excluded: ReadonlySet<number>) => void;
    onCellChange: (row: number, column: number, value: string) => void;
    onAddRow: () => void;
    onDeleteRow: (row: number) => void;
    onRenameField: (column: number, name: string) => void;
    onInsertField: (column: number) => void;
    onDeleteField: (column: number) => void;
}

interface EditingCell {
    row: number;
    column: number;
}

const CellEditor = memo(function CellEditor({
    initial,
    onCommit,
    onCancel
}: {
    initial: string;
    onCommit: (value: string, move: "down" | "right" | null) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initial);
    const done = useRef(false);

    const finish = (move: "down" | "right" | null) => {
        if (!done.current) {
            done.current = true;
            onCommit(value, move);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish("down");
        } else if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            finish("right");
        } else if (event.key === "Escape") {
            done.current = true;
            onCancel();
        }
    };

    return (
        <input
            className="lp-cell-input"
            value={value}
            autoFocus
            aria-label="Cell value"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => finish(null)}
        />
    );
});

function ColumnMenu({
    name,
    index,
    count,
    onRename,
    onInsert,
    onDelete
}: {
    name: string;
    index: number;
    count: number;
    onRename: (index: number, name: string) => void;
    onInsert: (index: number) => void;
    onDelete: (index: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);
    const dialogs = useDialogs();

    const rename = async () => {
        setOpen(false);
        const next = await dialogs.prompt(`Rename the “${name}” column. Placeholders for it in the design are renamed too.`, {
            title: "Rename column",
            initialValue: name,
            confirmLabel: "Rename",
            required: true
        });
        if (next !== null && next.trim() !== "" && next.trim() !== name) {
            onRename(index, next.trim());
        }
    };

    const remove = async () => {
        setOpen(false);
        if (
            await dialogs.confirm(`Delete the “${name}” column and everything in it?`, {
                title: "Delete column",
                confirmLabel: "Delete",
                confirmVariant: "danger"
            })
        ) {
            onDelete(index);
        }
    };

    return (
        <>
            <EbButton
                ref={anchor}
                className="lp-compact lp-icon-button"
                aria-label={`Column ${name} options`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                <Icon name="chevronDown" />
            </EbButton>
            <EbPopover visible={open} onVisibleChange={setOpen} anchorRef={anchor} placement="bottom" align="end" showArrow={false}>
                <div className="lp-menu" role="menu" aria-label={`${name} column`}>
                    <button type="button" role="menuitem" className="lp-menu-item" onClick={rename}>
                        Rename…
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="lp-menu-item"
                        onClick={() => {
                            setOpen(false);
                            onInsert(index);
                        }}
                    >
                        Insert column before
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="lp-menu-item"
                        onClick={() => {
                            setOpen(false);
                            onInsert(index + 1);
                        }}
                    >
                        Insert column after
                    </button>
                    {count > 1 ? (
                        <>
                            <div className="lp-menu-separator" role="separator" />
                            <button type="button" role="menuitem" className="lp-menu-item lp-menu-item-danger" onClick={remove}>
                                Delete column
                            </button>
                        </>
                    ) : null}
                </div>
            </EbPopover>
        </>
    );
}

export function DataGrid({
    table,
    excluded,
    onExcludedChange,
    onCellChange,
    onAddRow,
    onDeleteRow,
    onRenameField,
    onInsertField,
    onDeleteField
}: DataGridProps) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);
    const [editing, setEditing] = useState<EditingCell | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const visibleRows = useMemo(() => {
        const text = search.trim().toLowerCase();
        const all = table.rows.map((_, index) => index);
        return text === "" ? all : all.filter((index) => table.rows[index].some((cell) => cell.toLowerCase().includes(text)));
    }, [table.rows, search]);

    const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = visibleRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [currentPage, search]);

    const includedCount = table.rows.length - excluded.size;
    const visibleIncluded = visibleRows.filter((row) => !excluded.has(row)).length;

    const setIncluded = (rows: readonly number[], include: boolean) => {
        const next = new Set(excluded);
        rows.forEach((row) => (include ? next.delete(row) : next.add(row)));
        onExcludedChange(next);
    };

    const commitCell = (row: number, column: number, value: string, move: "down" | "right" | null) => {
        onCellChange(row, column, value);
        if (move === "right" && column + 1 < table.fields.length) {
            setEditing({ row, column: column + 1 });
        } else if (move === "down") {
            const position = pageRows.indexOf(row);
            const below = pageRows[position + 1];
            setEditing(below === undefined ? null : { row: below, column });
        } else {
            setEditing(null);
        }
    };

    const allShownIncluded = visibleIncluded === visibleRows.length && visibleRows.length > 0;

    return (
        <div className="lp-grid-panel">
            <div className="lp-grid-toolbar">
                <EbTextBox
                    className="lp-grid-search"
                    type="search"
                    ariaLabel="Search the records"
                    placeholder="Search records"
                    value={search}
                    immediate
                    onValueChange={(value) => {
                        setSearch(value);
                        setPage(0);
                    }}
                />
                <span className="lp-muted lp-small">
                    {search.trim() ? `${visibleRows.length} of ${table.rows.length} shown · ` : ""}
                    {includedCount} of {table.rows.length} included
                </span>
                <span className="lp-header-spacer" />
                <EbButton className="lp-compact" onClick={() => setIncluded(visibleRows, true)}>
                    Include {search.trim() ? "shown" : "all"}
                </EbButton>
                <EbButton className="lp-compact" onClick={() => setIncluded(visibleRows, false)}>
                    Exclude {search.trim() ? "shown" : "all"}
                </EbButton>
            </div>

            <div className="lp-grid-scroll" ref={scrollRef}>
                <table className="lp-grid">
                    <thead>
                        <tr>
                            <th className="lp-grid-gutter" scope="col">
                                <div className="lp-grid-gutter-inner">
                                    <EbCheckbox
                                        ariaLabel={allShownIncluded ? "Exclude all shown records" : "Include all shown records"}
                                        value={allShownIncluded}
                                        onValueChange={(include) => setIncluded(visibleRows, include)}
                                    />
                                    <span>#</span>
                                </div>
                            </th>
                            {table.fields.map((field, column) => (
                                <th key={`${column}-${field}`} scope="col">
                                    <div className="lp-grid-header">
                                        <span className="lp-grid-header-name">{field}</span>
                                        <ColumnMenu
                                            name={field}
                                            index={column}
                                            count={table.fields.length}
                                            onRename={onRenameField}
                                            onInsert={onInsertField}
                                            onDelete={onDeleteField}
                                        />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.map((row) => {
                            const isExcluded = excluded.has(row);
                            return (
                                <tr key={row} className={isExcluded ? "lp-row-excluded" : undefined}>
                                    <td className="lp-grid-gutter">
                                        <div className="lp-grid-gutter-inner">
                                            <EbCheckbox
                                                ariaLabel={`Include record ${row + 1}`}
                                                value={!isExcluded}
                                                onValueChange={(include) => setIncluded([row], include)}
                                            />
                                            <span>{row + 1}</span>
                                            <button
                                                type="button"
                                                className="lp-layer-toggle"
                                                aria-label={`Delete record ${row + 1}`}
                                                title="Delete this record"
                                                onClick={() => onDeleteRow(row)}
                                            >
                                                <Icon name="close" />
                                            </button>
                                        </div>
                                    </td>
                                    {table.fields.map((field, column) => (
                                        <td key={column}>
                                            {editing?.row === row && editing.column === column ? (
                                                <CellEditor
                                                    initial={table.rows[row][column]}
                                                    onCommit={(value, move) => commitCell(row, column, value, move)}
                                                    onCancel={() => setEditing(null)}
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="lp-cell"
                                                    aria-label={`${field}, record ${row + 1}: ${table.rows[row][column] || "empty"}. Edit`}
                                                    title={table.rows[row][column]}
                                                    onClick={() => setEditing({ row, column })}
                                                >
                                                    {table.rows[row][column]}
                                                </button>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {pageRows.length === 0 ? <p className="lp-note" style={{ padding: "1rem" }}>No records match “{search}”.</p> : null}
            </div>

            <div className="lp-grid-footer">
                <EbButton className="lp-compact" onClick={onAddRow}>
                    <Icon name="plus" /> Add record
                </EbButton>
                <div className="lp-toolbar-group">
                    <EbButton
                        className="lp-compact lp-icon-button"
                        aria-label="Previous page"
                        disabled={currentPage === 0}
                        onClick={() => setPage(currentPage - 1)}
                    >
                        <Icon name="chevronLeft" />
                    </EbButton>
                    <span>
                        Page {currentPage + 1} of {pageCount}
                    </span>
                    <EbButton
                        className="lp-compact lp-icon-button"
                        aria-label="Next page"
                        disabled={currentPage >= pageCount - 1}
                        onClick={() => setPage(currentPage + 1)}
                    >
                        <Icon name="chevronRight" />
                    </EbButton>
                </div>
            </div>
        </div>
    );
}
