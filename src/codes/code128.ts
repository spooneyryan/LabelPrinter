/*
 * Code 128, the barcode of shipping labels and asset tags: any ASCII text, with digit runs packed
 * two to a symbol.
 *
 * The encoder starts in code set C when the value opens with enough digits to pay for it, and
 * otherwise in B (or A, for control characters), switching to C for any run of digits long enough
 * to save symbols — four at the end of the value, six in the middle — and back out when the run
 * ends. The result is the bar pattern as a run of module widths, which the renderer scales to the
 * element's box.
 */

/** Bar/space widths for symbol values 0–105, then the stop pattern (106). Each sums to 11 modules; stop to 13. */
export const PATTERNS: readonly string[] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START = { A: 103, B: 104, C: 105 } as const;
const STOP = 106;
const SWITCH_TO = { A: 101, B: 100, C: 99 } as const;

type CodeSet = "A" | "B" | "C";

export interface Code128 {
    /** The symbol values, start and check symbols included, stop excluded. */
    values: number[];
    /** Alternating bar and space widths in modules, starting with a bar, stop pattern included. */
    widths: number[];
    /** The total width in modules, without quiet zones. */
    modules: number;
}

/** The quiet zone each side needs, in modules. */
export const QUIET_ZONE = 10;

export class Code128Error extends Error {}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** How many digits run from `index`. */
function digitRun(text: string, index: number): number {
    let end = index;
    while (isDigit(text[end])) {
        end += 1;
    }

    return end - index;
}

function valueIn(set: "A" | "B", c: string): number | null {
    const code = c.charCodeAt(0);
    if (set === "B") {
        return code >= 32 && code <= 127 ? code - 32 : null;
    }

    if (code >= 32 && code <= 95) {
        return code - 32;
    }

    return code >= 0 && code < 32 ? code + 64 : null;
}

/**
 * The set to continue in from `index`: whichever the first character only one of them can encode
 * needs — A for control characters, B for lowercase — so "A\tB" stays in A throughout instead of
 * starting in B and switching. B when nothing ahead decides it.
 */
function setFor(text: string, index: number): "A" | "B" {
    for (let i = index; i < text.length; i++) {
        const inA = valueIn("A", text[i]) !== null;
        const inB = valueIn("B", text[i]) !== null;
        if (inA !== inB) {
            return inA ? "A" : "B";
        }
    }

    return "B";
}

export function encodeCode128(text: string): Code128 {
    if (text === "") {
        throw new Code128Error("There is nothing to encode.");
    }

    for (const c of text) {
        if (c.charCodeAt(0) > 127 || c.length > 1) {
            throw new Code128Error(`Code 128 can only encode ASCII; “${c}” is not.`);
        }
    }

    const leadingDigits = digitRun(text, 0);
    let set: CodeSet = leadingDigits >= 4 || (leadingDigits === text.length && leadingDigits % 2 === 0)
        ? "C"
        : setFor(text, 0);
    const values: number[] = [START[set]];
    let i = 0;

    while (i < text.length) {
        if (set === "C") {
            if (digitRun(text, i) >= 2) {
                values.push(Number(text.slice(i, i + 2)));
                i += 2;
                continue;
            }

            set = setFor(text, i);
            values.push(SWITCH_TO[set]);
            continue;
        }

        const run = digitRun(text, i);
        const atEnd = i + run === text.length;
        if (run >= (atEnd ? 4 : 6)) {
            // An odd run spends its first digit in the current set so the rest pairs up.
            if (run % 2 === 1) {
                values.push(valueIn(set, text[i]) as number);
                i += 1;
            }

            set = "C";
            values.push(SWITCH_TO.C);
            continue;
        }

        let value = valueIn(set, text[i]);
        if (value === null) {
            set = set === "A" ? "B" : "A";
            values.push(SWITCH_TO[set]);
            value = valueIn(set, text[i]) as number;
        }

        values.push(value);
        i += 1;
    }

    const checksum = values.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103;
    values.push(checksum);

    const widths = [...values, STOP].flatMap((value) => [...PATTERNS[value]].map(Number));
    return { values, widths, modules: widths.reduce((sum, width) => sum + width, 0) };
}
