import { EbButton, EbFormField, EbPopover, parseHex, toHex, type EbButtonProps } from "@electricblazor/react";
import { EbColorPicker } from "@electricblazor/react/color";
import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clamp, formatDecimal, formatLength, parseLength, type LengthUnit } from "../model/units.ts";

/*
 * The form controls the suite does not have: a length field that reads fractions and metric, a
 * compact number field, a colour field, and a pressed-state toggle button. Each frames itself with
 * EbFormField, so labels, help and error text look and announce exactly as the suite's own inputs
 * do, and the boxes share the --eb-input-* tokens with EbTextBox.
 */

/** The unit lengths are shown in. Set once, near the root. */
export const UnitContext = createContext<LengthUnit>("in");

export function useUnit(): LengthUnit {
    return useContext(UnitContext);
}

interface DraftFieldProps {
    label?: ReactNode;
    ariaLabel?: string;
    helpText?: string;
    errorText?: string | null;
    disabled?: boolean;
    suffix?: string;
    className?: string;
    /** The committed text; the field shows it whenever the user is not typing. */
    text: string;
    /** Parses typed text; `null` rejects it and the field goes back to {@link text}. */
    commit: (draft: string) => void;
    /** Arrow keys step the value: `direction` is ±1, `large` with Shift, `fine` with Alt. */
    step?: (direction: 1 | -1, modifiers: { large: boolean; fine: boolean }) => void;
}

/**
 * A text box holding a draft while it has focus and committing on blur or Enter, like EbTextBox:
 * a re-render never fights the caret, and a half-typed "2 5/" is not rejected mid-word.
 */
function DraftField({ label, ariaLabel, helpText, errorText, disabled, suffix, className, text, commit, step }: DraftFieldProps) {
    const id = `lp-field-${useId().replace(/:/g, "")}`;
    const [draft, setDraft] = useState<string | null>(null);

    const finish = () => {
        if (draft !== null) {
            commit(draft);
            setDraft(null);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            finish();
        } else if (event.key === "Escape" && draft !== null) {
            setDraft(null);
        } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && step) {
            event.preventDefault();
            if (draft !== null) {
                commit(draft);
                setDraft(null);
            }

            step(event.key === "ArrowUp" ? 1 : -1, { large: event.shiftKey, fine: event.altKey });
        }
    };

    const describedBy = [helpText ? `${id}-help` : null, errorText ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

    return (
        <EbFormField className={className} label={label} htmlFor={id} helpText={helpText} errorText={errorText} disabled={disabled}>
            <span className="lp-input-wrap">
                <input
                    id={id}
                    className={suffix ? "lp-input lp-input-with-suffix" : "lp-input"}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    aria-label={label ? undefined : ariaLabel}
                    aria-describedby={describedBy}
                    aria-invalid={errorText ? "true" : undefined}
                    value={draft ?? text}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={finish}
                    onKeyDown={onKeyDown}
                    onFocus={(event) => event.target.select()}
                />
                {suffix ? (
                    <span className="lp-input-suffix" aria-hidden="true">
                        {suffix}
                    </span>
                ) : null}
            </span>
        </EbFormField>
    );
}

export interface LengthFieldProps {
    label?: ReactNode;
    ariaLabel?: string;
    /** In inches, whatever unit the field shows. */
    value: number;
    onChange: (inches: number) => void;
    min?: number;
    max?: number;
    helpText?: string;
    errorText?: string | null;
    disabled?: boolean;
    className?: string;
}

/**
 * A length, shown in the app's unit. Takes decimals, fractions ("2 5/8", "2⅝") and a unit suffix
 * that overrides the field's ("66.7mm" in an inch field). Arrow keys step by 1/16″ or 1 mm —
 * Shift for ten times that, Alt for a tenth.
 */
export function LengthField({ value, onChange, min = 0, max = 100, ...rest }: LengthFieldProps) {
    const unit = useUnit();
    const baseStep = unit === "mm" ? 1 / 25.4 : 1 / 16;

    return (
        <DraftField
            {...rest}
            suffix={unit}
            text={formatLength(value, unit)}
            commit={(draft) => {
                const parsed = parseLength(draft, unit);
                if (parsed !== null) {
                    onChange(clamp(Number(parsed.toFixed(6)), min, max));
                }
            }}
            step={(direction, { large, fine }) => {
                const step = baseStep * (large ? 10 : fine ? 0.1 : 1);
                onChange(clamp(Number((value + direction * step).toFixed(6)), min, max));
            }}
        />
    );
}

export interface NumberFieldProps {
    label?: ReactNode;
    ariaLabel?: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Whole numbers only. */
    integer?: boolean;
    suffix?: string;
    helpText?: string;
    errorText?: string | null;
    disabled?: boolean;
    className?: string;
}

/** A plain number with arrow-key stepping, for counts, point sizes and percentages. */
export function NumberField({ value, onChange, min = -Infinity, max = Infinity, step = 1, integer = false, ...rest }: NumberFieldProps) {
    const normalize = (raw: number) => {
        const rounded = integer ? Math.round(raw) : Number(raw.toFixed(4));
        return clamp(rounded, min, max);
    };

    return (
        <DraftField
            {...rest}
            text={integer ? String(value) : formatDecimal(value, 3)}
            commit={(draft) => {
                const parsed = Number(draft.trim().replace(",", "."));
                if (draft.trim() !== "" && Number.isFinite(parsed)) {
                    onChange(normalize(parsed));
                }
            }}
            step={(direction, { large, fine }) => {
                const amount = step * (large ? 10 : fine && !integer ? 0.1 : 1);
                onChange(normalize(value + direction * amount));
            }}
        />
    );
}

export interface ColorFieldProps {
    label: string;
    /** A hex colour, or "" for none when {@link allowNone}. */
    value: string;
    onChange: (value: string) => void;
    allowNone?: boolean;
}

/** A swatch that opens the suite's colour picker, plus a hex box for typing a colour directly. */
export function ColorField({ label, value, onChange, allowNone = false }: ColorFieldProps) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);
    const color = parseHex(value);

    return (
        <div className="lp-inline-field">
            <span className="lp-label-text">{label}</span>
            <div className="lp-color-field">
                <EbButton
                    ref={anchor}
                    className="lp-swatch-button"
                    aria-label={`${label}: ${value || "none"}. Choose a colour`}
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                >
                    <span className={value ? "lp-swatch" : "lp-swatch lp-swatch-none"} style={value ? { background: value } : undefined} />
                </EbButton>
                <DraftField
                    ariaLabel={`${label} hex value`}
                    text={value || (allowNone ? "none" : "")}
                    commit={(draft) => {
                        const text = draft.trim();
                        if (allowNone && (text === "" || /^none$/i.test(text))) {
                            onChange("");
                            return;
                        }

                        const parsed = parseHex(text.startsWith("#") ? text : `#${text}`);
                        if (parsed) {
                            onChange(toHex(parsed).toLowerCase());
                        }
                    }}
                />
                {allowNone && value ? (
                    <EbButton className="lp-compact" onClick={() => onChange("")}>
                        None
                    </EbButton>
                ) : null}
            </div>
            <EbPopover visible={open} onVisibleChange={setOpen} anchorRef={anchor} placement="left" align="start">
                <div className="lp-color-popover">
                    <EbColorPicker
                        value={color ?? { r: 0, g: 0, b: 0, a: 255 }}
                        onValueChange={(next) => onChange(toHex({ ...next, a: 255 }).toLowerCase())}
                        showCollections={false}
                        defaultMode="hueCube"
                    />
                </div>
            </EbPopover>
        </div>
    );
}

export interface ToggleButtonProps extends Omit<EbButtonProps, "onClick"> {
    pressed: boolean;
    onPressedChange: (pressed: boolean) => void;
}

/** An EbButton that stays down: `aria-pressed`, and the accent tint through the button's own tokens. */
export function ToggleButton({ pressed, onPressedChange, className, ...rest }: ToggleButtonProps) {
    return (
        <EbButton
            {...rest}
            className={className ? `lp-toggle ${className}` : "lp-toggle"}
            aria-pressed={pressed}
            onClick={() => onPressedChange(!pressed)}
        />
    );
}
