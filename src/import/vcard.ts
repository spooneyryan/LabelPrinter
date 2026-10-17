import type { DataTable } from "../model/types.ts";
import { tableFromRows } from "./table.ts";

/*
 * Contacts exported as vCards (.vcf) — what Outlook, Apple Contacts, Google Contacts and phones
 * all export — turned into an address list.
 *
 * Versions 2.1, 3.0 and 4.0 are read: folded lines, `TYPE=` parameters in all three spellings,
 * quoted-printable values (2.1, still what Outlook writes), and backslash escapes. Each card
 * becomes a row with the name parts, organization, the preferred postal address split into the
 * fields an address block uses, and the first phone and email. Columns nobody has are dropped.
 */

interface Property {
    name: string;
    params: Map<string, string[]>;
    value: string;
}

const COLUMNS = [
    "Full Name",
    "Prefix",
    "First Name",
    "Middle Name",
    "Last Name",
    "Suffix",
    "Company",
    "Department",
    "Title",
    "Address",
    "Address 2",
    "City",
    "State",
    "ZIP",
    "Country",
    "Phone",
    "Email"
] as const;

type Column = (typeof COLUMNS)[number];

/** Splits on a separator that is not backslash-escaped. */
function splitUnescaped(value: string, separator: string): string[] {
    const parts: string[] = [];
    let current = "";
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "\\" && i + 1 < value.length) {
            current += value[i] + value[i + 1];
            i += 1;
        } else if (value[i] === separator) {
            parts.push(current);
            current = "";
        } else {
            current += value[i];
        }
    }

    parts.push(current);
    return parts;
}

function unescape(value: string): string {
    return value.replace(/\\([nN,;:\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function decodeQuotedPrintable(value: string, charset: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
            bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(value.charCodeAt(i) & 0xff);
        }
    }

    try {
        return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
    } catch {
        return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    }
}

function parseProperty(line: string): Property | null {
    // The value starts at the first colon outside a quoted parameter value.
    let inQuotes = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ":" && !inQuotes) {
            colon = i;
            break;
        }
    }

    if (colon <= 0) {
        return null;
    }

    const [rawName, ...rawParams] = line.slice(0, colon).split(";");
    // `item1.ADR` — a group prefix, used by Apple to pair a property with its label.
    const name = rawName.slice(rawName.lastIndexOf(".") + 1).toUpperCase();
    const params = new Map<string, string[]>();

    for (const param of rawParams) {
        const equals = param.indexOf("=");
        // vCard 2.1 writes bare types: `TEL;HOME;VOICE:…`.
        const key = equals === -1 ? "TYPE" : param.slice(0, equals).toUpperCase();
        const values = (equals === -1 ? param : param.slice(equals + 1))
            .split(",")
            .map((value) => value.replace(/^"|"$/g, "").trim().toUpperCase());
        params.set(key, [...(params.get(key) ?? []), ...values]);
    }

    let value = line.slice(colon + 1);
    if (params.get("ENCODING")?.includes("QUOTED-PRINTABLE")) {
        value = decodeQuotedPrintable(value, (params.get("CHARSET")?.[0] ?? "utf-8").toLowerCase());
    }

    return { name, params, value };
}

/** Joins folded lines: a line starting with a space or tab continues the one before it. */
function unfold(text: string): string[] {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const result: string[] = [];

    for (const line of lines) {
        const previous = result[result.length - 1];
        if (/^[ \t]/.test(line) && previous !== undefined) {
            result[result.length - 1] = previous + line.slice(1);
        } else if (previous !== undefined && /ENCODING=QUOTED-PRINTABLE/i.test(previous) && previous.endsWith("=")) {
            // Quoted-printable soft line break: the "=" at the end means "continued".
            result[result.length - 1] = previous.slice(0, -1) + line;
        } else {
            result.push(line);
        }
    }

    return result;
}

const types = (property: Property) => property.params.get("TYPE") ?? [];

/** The most preferred of several properties: PREF first, then HOME, then the first one. */
function preferred(properties: Property[], favourite = "HOME"): Property | undefined {
    return (
        properties.find((property) => types(property).includes("PREF") || property.params.has("PREF")) ??
        properties.find((property) => types(property).includes(favourite)) ??
        properties[0]
    );
}

function cardRow(properties: Property[]): Map<Column, string> {
    const row = new Map<Column, string>();
    const set = (column: Column, value: string | undefined) => {
        const text = (value ?? "").trim();
        if (text !== "") {
            row.set(column, text);
        }
    };
    const all = (name: string) => properties.filter((property) => property.name === name);
    const first = (name: string) => all(name)[0];

    set("Full Name", first("FN") && unescape(first("FN").value));

    const n = first("N");
    if (n) {
        const [last, given, middle, prefix, suffix] = splitUnescaped(n.value, ";").map(unescape);
        set("Last Name", last);
        set("First Name", given);
        set("Middle Name", middle);
        set("Prefix", prefix);
        set("Suffix", suffix);
    }

    const org = first("ORG");
    if (org) {
        const [company, ...units] = splitUnescaped(org.value, ";").map(unescape);
        set("Company", company);
        set("Department", units.filter(Boolean).join(", "));
    }

    set("Title", first("TITLE") && unescape(first("TITLE").value));

    const adr = preferred(all("ADR"));
    if (adr) {
        const [poBox, extended, street, city, region, postal, country] = splitUnescaped(adr.value, ";").map(unescape);
        const streetLines = (street ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
        const box = poBox?.trim() ? (/^p\.?\s*o\.?\s*box/i.test(poBox.trim()) ? poBox.trim() : `PO Box ${poBox.trim()}`) : "";

        const firstLine = streetLines[0] ?? box;
        const secondLine = [...streetLines.slice(1), extended?.trim() ?? "", streetLines.length > 0 ? box : ""]
            .filter(Boolean)
            .join(", ");

        set("Address", firstLine);
        set("Address 2", secondLine);
        set("City", city);
        set("State", region);
        set("ZIP", postal);
        set("Country", country);
    }

    set("Phone", preferred(all("TEL"), "CELL")?.value);
    set("Email", preferred(all("EMAIL"), "INTERNET")?.value);

    // A card with only a display name still deserves first and last names, for a
    // "Dear {{First Name}}" label: the last word is the surname, the rest the given names.
    const fullName = row.get("Full Name");
    if (fullName && !row.has("First Name") && !row.has("Last Name") && !row.has("Company")) {
        const words = fullName.split(/\s+/);
        set("First Name", words.slice(0, -1).join(" ") || words[0]);
        set("Last Name", words.length > 1 ? words[words.length - 1] : "");
    }

    return row;
}

export function tableFromVCards(text: string, source: string): DataTable {
    const cards: Property[][] = [];
    let current: Property[] | null = null;

    for (const line of unfold(text)) {
        const trimmed = line.trim();
        if (/^BEGIN:VCARD$/i.test(trimmed)) {
            current = [];
        } else if (/^END:VCARD$/i.test(trimmed)) {
            if (current) {
                cards.push(current);
            }

            current = null;
        } else if (current && trimmed !== "") {
            const property = parseProperty(line);
            if (property) {
                current.push(property);
            }
        }
    }

    if (cards.length === 0) {
        throw new Error("There are no contacts in this file: no BEGIN:VCARD found.");
    }

    const rows = cards.map(cardRow);
    const used = COLUMNS.filter((column) => rows.some((row) => row.has(column)));

    return tableFromRows([used, ...rows.map((row) => used.map((column) => row.get(column) ?? ""))], true, source);
}
