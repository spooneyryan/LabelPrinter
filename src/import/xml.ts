/*
 * A small XML reader for the one XML dialect this app meets: SpreadsheetML inside an .xlsx.
 *
 * It exists instead of DOMParser so the Excel importer is plain logic that runs (and is tested)
 * outside a browser. It reads well-formed XML into a tree of elements and text — attributes,
 * self-closing tags, CDATA, comments, processing instructions and the predefined and numeric
 * entities — and does not try to be a validating parser: there are no DTDs, entity declarations or
 * namespace URIs, and elements are matched by local name, so `x:sheetData` and `sheetData` are the
 * same thing (some generators prefix every element).
 */

export interface XmlElement {
    /** The qualified name as written, `r:id`-style prefix and all. */
    name: string;
    /** The name without its prefix. */
    local: string;
    attributes: Record<string, string>;
    children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
    if (!text.includes("&")) {
        return text;
    }

    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
        }

        return ENTITIES[body] ?? whole;
    });
}

const localName = (name: string) => name.slice(name.indexOf(":") + 1);

/** The end of a start tag: the first `>` that is not inside a quoted attribute value. */
function tagEnd(text: string, start: number): number {
    let quote: string | null = null;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === quote) {
                quote = null;
            }
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === ">") {
            return i;
        }
    }

    return -1;
}

const ATTRIBUTE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function malformed(): never {
    throw new Error("The file is not valid XML.");
}

/** Parses a document and returns its root element. Throws on markup it cannot make sense of. */
export function parseXml(text: string): XmlElement {
    const document: XmlElement = { name: "#document", local: "#document", attributes: {}, children: [] };
    const stack: XmlElement[] = [document];
    let i = 0;

    const appendText = (raw: string, decode: boolean) => {
        const parent = stack[stack.length - 1];
        // Text outside the root element is only ever whitespace between the prolog and the root.
        if (parent !== document && raw !== "") {
            parent.children.push(decode ? decodeEntities(raw) : raw);
        }
    };

    while (i < text.length) {
        const open = text.indexOf("<", i);
        if (open === -1) {
            appendText(text.slice(i), true);
            break;
        }

        if (open > i) {
            appendText(text.slice(i, open), true);
        }

        if (text.startsWith("<!--", open)) {
            const close = text.indexOf("-->", open + 4);
            i = close === -1 ? malformed() : close + 3;
        } else if (text.startsWith("<![CDATA[", open)) {
            const close = text.indexOf("]]>", open + 9);
            if (close === -1) {
                malformed();
            }

            appendText(text.slice(open + 9, close), false);
            i = close + 3;
        } else if (text.startsWith("<?", open)) {
            const close = text.indexOf("?>", open + 2);
            i = close === -1 ? malformed() : close + 2;
        } else if (text.startsWith("<!", open)) {
            // A DOCTYPE, possibly with an internal subset in brackets. Skipped, not interpreted.
            const bracket = text.indexOf("[", open);
            const gt = text.indexOf(">", open);
            const close = bracket !== -1 && bracket < gt ? text.indexOf("]>", bracket) + 1 : gt;
            i = close <= 0 ? malformed() : close + 1;
        } else if (text[open + 1] === "/") {
            const close = text.indexOf(">", open);
            if (close === -1) {
                malformed();
            }

            const name = text.slice(open + 2, close).trim();
            const index = stack.map((element) => element.name).lastIndexOf(name);
            if (index <= 0) {
                malformed();
            }

            stack.length = index;
            i = close + 1;
        } else {
            const close = tagEnd(text, open + 1);
            if (close === -1) {
                malformed();
            }

            let body = text.slice(open + 1, close);
            const selfClosing = body.endsWith("/");
            if (selfClosing) {
                body = body.slice(0, -1);
            }

            const nameMatch = /^[^\s/>]+/.exec(body);
            if (!nameMatch) {
                malformed();
            }

            const attributes: Record<string, string> = {};
            for (const match of body.slice(nameMatch[0].length).matchAll(ATTRIBUTE)) {
                attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? "");
            }

            const element: XmlElement = { name: nameMatch[0], local: localName(nameMatch[0]), attributes, children: [] };
            stack[stack.length - 1].children.push(element);
            if (!selfClosing) {
                stack.push(element);
            }

            i = close + 1;
        }
    }

    const root = document.children.find((child): child is XmlElement => typeof child !== "string");
    return root ?? malformed();
}

/** The element children, optionally only those with a given local name. */
export function elements(parent: XmlElement, local?: string): XmlElement[] {
    return parent.children.filter(
        (child): child is XmlElement => typeof child !== "string" && (local === undefined || child.local === local)
    );
}

export function firstElement(parent: XmlElement, local: string): XmlElement | undefined {
    return parent.children.find((child): child is XmlElement => typeof child !== "string" && child.local === local);
}

/** Follows a path of local names down from `parent`, taking the first match at each step. */
export function descend(parent: XmlElement, ...path: string[]): XmlElement | undefined {
    let current: XmlElement | undefined = parent;
    for (const step of path) {
        current = current && firstElement(current, step);
    }

    return current;
}

/** All the text inside an element, in document order. */
export function textOf(element: XmlElement): string {
    return element.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

/** An attribute by exact name, or failing that by local name (`id` finds `r:id`). */
export function attribute(element: XmlElement, name: string): string | undefined {
    if (name in element.attributes) {
        return element.attributes[name];
    }

    const key = Object.keys(element.attributes).find((candidate) => localName(candidate) === name);
    return key === undefined ? undefined : element.attributes[key];
}
