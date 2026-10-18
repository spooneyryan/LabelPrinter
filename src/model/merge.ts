/*
 * Mail merge: templates with `{{Field}}` placeholders, filled from one record at a time.
 *
 * A placeholder names a column of the data — `{{First Name}}` — matched exactly first and then
 * case- and spacing-insensitively, so `{{first name}}` and `{{FIRST  NAME}}` find it too. Filters
 * follow a bar: `{{City|upper}}`. `{{#}}` is the record's row number in the data.
 *
 * Blank-line removal is the classic mail-merge rule, line by line: a line whose every field came
 * out empty is dropped, so "Address 2" closes up when a record has none. A line with no fields at
 * all is the designer's own text and always stays — even when it is empty, because an empty line
 * typed on purpose is spacing.
 */

export type TemplateToken =
    | { kind: "text"; text: string }
    | { kind: "field"; name: string; filters: string[] };

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** The name that stands for the record's row number. */
export const ROW_NUMBER_FIELD = "#";

export const FILTERS = ["upper", "lower", "title", "trim"] as const;
export type FilterName = (typeof FILTERS)[number];

/** Splits a template into its literal text and its placeholders. */
export function tokenize(template: string): TemplateToken[] {
    const tokens: TemplateToken[] = [];
    let last = 0;

    for (const match of template.matchAll(PLACEHOLDER)) {
        const [whole, inner] = match;
        const start = match.index;
        const [rawName, ...rawFilters] = inner.split("|");
        const name = rawName.trim();

        // `{{}}` and `{{ }}` are not placeholders; they stay as typed.
        if (name === "") {
            continue;
        }

        if (start > last) {
            tokens.push({ kind: "text", text: template.slice(last, start) });
        }

        tokens.push({
            kind: "field",
            name,
            filters: rawFilters.map((filter) => filter.trim().toLowerCase()).filter(Boolean)
        });
        last = start + whole.length;
    }

    if (last < template.length) {
        tokens.push({ kind: "text", text: template.slice(last) });
    }

    return tokens;
}

/** The distinct field names a template refers to, in order of first use, without `{{#}}`. */
export function templateFields(template: string): string[] {
    const seen = new Set<string>();
    for (const token of tokenize(template)) {
        if (token.kind === "field" && token.name !== ROW_NUMBER_FIELD) {
            seen.add(token.name);
        }
    }

    return [...seen];
}

/** Folds a field name for loose matching: case, surrounding space, and runs of space. */
export function foldFieldName(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Looks field names up by position: exact names first, then folded ones. */
export interface FieldIndex {
    resolve(name: string): number | undefined;
}

export function buildFieldIndex(fields: readonly string[]): FieldIndex {
    const exact = new Map<string, number>();
    const folded = new Map<string, number>();

    fields.forEach((field, index) => {
        if (!exact.has(field)) {
            exact.set(field, index);
        }

        const key = foldFieldName(field);
        if (!folded.has(key)) {
            folded.set(key, index);
        }
    });

    return {
        resolve: (name) => exact.get(name) ?? folded.get(foldFieldName(name))
    };
}

/** What one label is merged from. */
export interface MergeContext {
    /**
     * The record's cells, or `null` while designing without data — every placeholder then shows
     * its own name, so the layout can be judged before a file is loaded.
     */
    record: readonly string[] | null;
    fields: FieldIndex;
    /** The record's 1-based row number, for `{{#}}`. */
    rowNumber: number;
}

/** A context with no record, for previews before any data exists. */
export function placeholderContext(fields: FieldIndex = buildFieldIndex([])): MergeContext {
    return { record: null, fields, rowNumber: 1 };
}

export function applyFilters(value: string, filters: readonly string[]): string {
    return filters.reduce((text, filter) => {
        switch (filter) {
            case "upper":
                return text.toLocaleUpperCase();
            case "lower":
                return text.toLocaleLowerCase();
            case "title":
                return toTitleCase(text);
            case "trim":
                return text.trim();
            default:
                return text;
        }
    }, value);
}

/**
 * Capitalizes each word: after a space or a hyphen, and after an apostrophe that follows a single
 * letter, so "o'brien" becomes "O'Brien" while "don't" stays "Don't".
 */
export function toTitleCase(text: string): string {
    const lower = text.toLocaleLowerCase();
    let result = "";

    for (let i = 0; i < lower.length; i++) {
        const previous = lower[i - 1];
        const startsWord =
            i === 0 ||
            /[\s\-/(]/.test(previous) ||
            (previous === "'" && i >= 2 && /\p{L}/u.test(lower[i - 2]) && (i < 3 || !/\p{L}/u.test(lower[i - 3])));
        result += startsWord ? lower[i].toLocaleUpperCase() : lower[i];
    }

    return result;
}

/** The value one placeholder stands for in a context, with its filters applied. */
function fieldValue(token: Extract<TemplateToken, { kind: "field" }>, context: MergeContext): string {
    if (token.name === ROW_NUMBER_FIELD) {
        return applyFilters(String(context.rowNumber), token.filters);
    }

    if (context.record === null) {
        return `«${token.name}»`;
    }

    const index = context.fields.resolve(token.name);
    const value = index === undefined ? "" : (context.record[index] ?? "");
    return applyFilters(value, token.filters);
}

export interface MergeOptions {
    /** Drops lines whose every field is empty. See the header. */
    removeBlankLines?: boolean;
}

/** Fills a template for one record, returning its lines. */
export function mergeLines(template: string, context: MergeContext, options: MergeOptions = {}): string[] {
    const lines: string[] = [];

    for (const line of template.split(/\r\n|\r|\n/)) {
        let text = "";
        let fieldCount = 0;
        let filledCount = 0;

        for (const token of tokenize(line)) {
            if (token.kind === "text") {
                text += token.text;
                continue;
            }

            const value = fieldValue(token, context);
            fieldCount += 1;
            if (value.trim() !== "") {
                filledCount += 1;
            }

            // A value with a line break of its own (a multi-line address cell) stays one line of
            // the template: its break becomes a space rather than splitting the line around it.
            text += value.replace(/\s*(\r\n|\r|\n)\s*/g, " ");
        }

        if (options.removeBlankLines && fieldCount > 0 && filledCount === 0) {
            continue;
        }

        lines.push(text);
    }

    return lines;
}

/** Fills a template for one record as a single string — the value of a QR code or barcode. */
export function mergeText(template: string, context: MergeContext): string {
    return mergeLines(template, context).join("\n");
}

/** Rewrites every placeholder for `from` to name `to` instead, keeping its filters. */
export function renameField(template: string, from: string, to: string): string {
    const key = foldFieldName(from);
    return template.replace(PLACEHOLDER, (whole, inner: string) => {
        const [rawName, ...filters] = inner.split("|");
        if (foldFieldName(rawName) !== key) {
            return whole;
        }

        return `{{${[to, ...filters.map((filter) => filter.trim())].join("|")}}}`;
    });
}

// ── Address detection ───────────────────────────────────────────────────────────────────────────

type AddressPart =
    | "fullName"
    | "prefix"
    | "first"
    | "middle"
    | "last"
    | "suffix"
    | "company"
    | "address1"
    | "address2"
    | "city"
    | "state"
    | "zip"
    | "country";

/**
 * Column names people actually use, folded (lowercase, accents dropped, `_-./` as spaces,
 * single-spaced) — English first, then the common French, German, Spanish and Dutch ones, since
 * a mailing list exported from a European CRM says "Ville", "Ort" or "Ciudad".
 */
const ADDRESS_PATTERNS: [AddressPart, RegExp][] = [
    ["fullName", /^(full name|name|contact|contact name|recipient|addressee|display name|nom complet|nombre completo)$/],
    ["prefix", /^(prefix|salutation|honorific|name prefix|mr mrs|civilite|anrede|titulo|aanhef)$/],
    ["first", /^(first|first name|firstname|given name|given|fname|forename|prenom|vorname|nombre|voornaam)$/],
    ["middle", /^(middle|middle name|middle initial|mi)$/],
    ["last", /^(last|last name|lastname|surname|family name|lname|nom|nom de famille|nachname|familienname|apellido|apellidos|achternaam)$/],
    ["suffix", /^(suffix|name suffix)$/],
    ["company", /^(company|company name|organization|organisation|business|business name|org|firm|societe|entreprise|firma|unternehmen|empresa|bedrijf)$/],
    [
        "address1",
        /^(address|address 1|address1|address line 1|street|street address|street 1|street1|addr1|addr 1|mailing address|line 1|adresse|rue|strasse|straße|anschrift|direccion|calle|domicilio|adres|straat)$/
    ],
    ["address2", /^(address 2|address2|address line 2|street 2|street2|addr2|addr 2|apt|apartment|suite|unit|line 2|complement|adresse 2|adresszusatz|zusatz)$/],
    ["city", /^(city|town|locality|municipality|suburb|ville|commune|ort|stadt|wohnort|ciudad|localidad|poblacion|plaats|woonplaats|stad)$/],
    ["state", /^(state|province|region|st|state province|state or province|prov|provincia|bundesland|departement)$/],
    [
        "zip",
        /^(zip|zip code|zipcode|zip 4|zip\+4|postal code|postalcode|postcode|post code|postal|code postal|cp|plz|postleitzahl|codigo postal)$/
    ],
    ["country", /^(country|country name|nation|country region|pays|land|pais)$/]
];

function foldColumnName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[_.\-/]+/g, " ")
        .replace(/\s+/g, " ");
}

/** Which column plays which part of an address, by name. */
export function detectAddressFields(fields: readonly string[]): Partial<Record<AddressPart, string>> {
    const found: Partial<Record<AddressPart, string>> = {};

    for (const field of fields) {
        const folded = foldColumnName(field);
        const match = ADDRESS_PATTERNS.find(([part, pattern]) => found[part] === undefined && pattern.test(folded));
        if (match) {
            found[match[0]] = field;
        }
    }

    return found;
}

/**
 * The address block for the given columns — name, company, street lines, then "City, State ZIP" —
 * or `null` when fewer than two of those lines can be made, which means the data is not an
 * address list.
 */
export function addressBlock(fields: readonly string[]): string | null {
    const parts = detectAddressFields(fields);
    const placeholder = (field: string | undefined) => (field === undefined ? null : `{{${field}}}`);
    const joinPresent = (separator: string, ...values: (string | null)[]) =>
        values.filter((value): value is string => value !== null).join(separator);

    const nameLine = parts.fullName
        ? placeholder(parts.fullName)
        : joinPresent(
              " ",
              placeholder(parts.prefix),
              placeholder(parts.first),
              placeholder(parts.middle),
              placeholder(parts.last),
              placeholder(parts.suffix)
          ) || null;

    const cityState = joinPresent(", ", placeholder(parts.city), placeholder(parts.state)) || null;
    const lastLine = joinPresent(" ", cityState, placeholder(parts.zip)) || null;

    const lines = [
        nameLine,
        placeholder(parts.company),
        placeholder(parts.address1),
        placeholder(parts.address2),
        lastLine,
        placeholder(parts.country)
    ].filter((line): line is string => line !== null);

    return lines.length < 2 ? null : lines.join("\n");
}

/** Every column as a placeholder, one per line. */
export function fieldLines(fields: readonly string[]): string {
    return fields.map((field) => `{{${field}}}`).join("\n");
}

/**
 * A ready-made address block for the given columns, falling back to the first few columns one per
 * line for data that is not an address list. What the "Address block" button inserts.
 */
export function suggestAddressBlock(fields: readonly string[]): string {
    return addressBlock(fields) ?? fieldLines(fields.slice(0, 6));
}

/**
 * What a label shows when it is filled from loaded data: the address block for an address list
 * (so a mailing label reads as one, and Phone and Email stay off it), and otherwise every column,
 * one per line.
 */
export function suggestFieldsBlock(fields: readonly string[]): string {
    return addressBlock(fields) ?? fieldLines(fields);
}
