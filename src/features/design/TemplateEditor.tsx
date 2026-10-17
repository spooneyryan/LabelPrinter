import { EbButton, EbPopover, EbTextBox } from "@electricblazor/react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Icon } from "../../components/Icon.tsx";
import { ROW_NUMBER_FIELD } from "../../model/merge.ts";

/*
 * The text box a template is written in — a text element's lines, a code's value — with a menu of
 * the data's fields to insert at the caret. The caret is remembered when the box loses focus, so
 * clicking a field chip in the side panel still inserts where the cursor was.
 */

export interface TemplateEditorHandle {
    /** Inserts text at the remembered caret (the end, if the box was never focused). */
    insert(text: string): void;
    focus(): void;
}

export interface TemplateEditorProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    fields: readonly string[];
    rows?: number;
    helpText?: string;
    handleRef?: Ref<TemplateEditorHandle>;
}

export function TemplateEditor({ label, value, onChange, fields, rows = 5, helpText, handleRef }: TemplateEditorProps) {
    const wrapper = useRef<HTMLDivElement>(null);
    const caret = useRef<{ start: number; end: number } | null>(null);
    const menuAnchor = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const textarea = () => wrapper.current?.querySelector("textarea") ?? null;

    const remember = () => {
        const element = textarea();
        if (element && document.activeElement === element) {
            caret.current = { start: element.selectionStart, end: element.selectionEnd };
        }
    };

    const insert = (text: string) => {
        const { start, end } = caret.current ?? { start: value.length, end: value.length };
        const safeStart = Math.min(start, value.length);
        const safeEnd = Math.min(Math.max(end, safeStart), value.length);
        const next = value.slice(0, safeStart) + text + value.slice(safeEnd);
        const position = safeStart + text.length;
        onChange(next);
        caret.current = { start: position, end: position };

        requestAnimationFrame(() => {
            const element = textarea();
            if (element) {
                element.focus();
                element.setSelectionRange(position, position);
            }
        });
    };

    useImperativeHandle(handleRef, () => ({ insert, focus: () => textarea()?.focus() }));

    return (
        <div
            ref={wrapper}
            className="lp-inline-field"
            onKeyUp={remember}
            onMouseUp={remember}
            onInput={remember}
            onBlur={() => {
                // Read before focus has moved on: selectionStart survives the blur itself.
                const element = textarea();
                if (element) {
                    caret.current = { start: element.selectionStart, end: element.selectionEnd };
                }
            }}
        >
            <EbTextBox
                className="lp-template-box"
                label={label}
                multiline
                rows={rows}
                immediate
                value={value}
                onValueChange={onChange}
                helpText={helpText}
            />
            <div className="lp-button-row">
                <EbButton
                    ref={menuAnchor}
                    className="lp-compact"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <Icon name="field" /> Insert field <Icon name="chevronDown" />
                </EbButton>
            </div>
            <EbPopover visible={menuOpen} onVisibleChange={setMenuOpen} anchorRef={menuAnchor} placement="bottom" align="start" showArrow={false}>
                <div className="lp-field-picker" role="menu" aria-label="Fields">
                    {fields.length === 0 ? (
                        <p className="lp-note" style={{ padding: "0.4rem 0.6rem" }}>
                            No data yet — load records on the Data step to list their fields.
                        </p>
                    ) : null}
                    {fields.map((field) => (
                        <button
                            key={field}
                            type="button"
                            role="menuitem"
                            className="lp-menu-item"
                            onClick={() => {
                                setMenuOpen(false);
                                insert(`{{${field}}}`);
                            }}
                        >
                            {field}
                        </button>
                    ))}
                    <div className="lp-menu-separator" role="separator" />
                    <button
                        type="button"
                        role="menuitem"
                        className="lp-menu-item"
                        onClick={() => {
                            setMenuOpen(false);
                            insert(`{{${ROW_NUMBER_FIELD}}}`);
                        }}
                    >
                        <Icon name="hash" /> Row number
                    </button>
                </div>
            </EbPopover>
        </div>
    );
}
