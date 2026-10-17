/*
 * Bytes to text for the text formats. A byte-order mark decides when there is one. Without one,
 * the text is read as UTF-8 if it is valid UTF-8, and otherwise as Windows-1252 — which is what a
 * CSV saved by Excel on Windows usually is, and the difference between "Muñoz" and "MuÃ±oz" on a
 * label.
 */

export type TextEncodingChoice = "auto" | "utf-8" | "windows-1252" | "utf-16le" | "utf-16be";

export const ENCODING_OPTIONS: readonly { value: TextEncodingChoice; label: string }[] = [
    { value: "auto", label: "Detect automatically" },
    { value: "utf-8", label: "UTF-8" },
    { value: "windows-1252", label: "Windows (Western European)" },
    { value: "utf-16le", label: "UTF-16 LE" },
    { value: "utf-16be", label: "UTF-16 BE" }
];

export interface DecodedText {
    text: string;
    /** The encoding actually used, for display. */
    encoding: Exclude<TextEncodingChoice, "auto">;
}

function bomEncoding(bytes: Uint8Array): Exclude<TextEncodingChoice, "auto" | "windows-1252"> | null {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return "utf-8";
    }

    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return "utf-16le";
    }

    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return "utf-16be";
    }

    return null;
}

export function decodeText(bytes: Uint8Array, choice: TextEncodingChoice = "auto"): DecodedText {
    const encoding = choice === "auto" ? (bomEncoding(bytes) ?? detectWithoutBom(bytes)) : choice;
    // TextDecoder drops a matching BOM itself, so the text never starts with U+FEFF.
    return { text: new TextDecoder(encoding).decode(bytes), encoding };
}

function detectWithoutBom(bytes: Uint8Array): "utf-8" | "windows-1252" {
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return "utf-8";
    } catch {
        return "windows-1252";
    }
}
