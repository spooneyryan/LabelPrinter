import type { QrErrorLevel } from "../model/types.ts";

/*
 * A QR Code encoder (ISO/IEC 18004, Model 2, versions 1–40), small enough to ship rather than
 * depend on.
 *
 * It encodes one segment in the densest mode the text allows — numeric, alphanumeric, or bytes
 * (UTF-8) — picks the smallest version that holds it at the requested error-correction level, and
 * chooses the mask with the lowest penalty score, as the standard prescribes. The structure
 * follows the reference algorithm closely (Project Nayuki's is the well-known statement of it):
 * function patterns, Reed–Solomon blocks interleaved, the zigzag placement, then format and
 * version information. The mask choice only affects how easily a code scans, never whether it
 * decodes, so the parts that must be exactly right are the data, the error correction and the
 * placement — which is where the tests concentrate.
 */

export interface QrCode {
    version: number;
    size: number;
    /** `modules[y][x]`, true for dark. */
    modules: boolean[][];
}

// Indexed [level][version]; index 0 is unused so versions index directly.
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorLevel, readonly number[]> = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<QrErrorLevel, readonly number[]> = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
};

/** The two format bits for each level — note they are not in L, M, Q, H order. */
const FORMAT_BITS: Record<QrErrorLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

type Mode = "numeric" | "alphanumeric" | "byte";

const MODE_INDICATOR: Record<Mode, number> = { numeric: 0x1, alphanumeric: 0x2, byte: 0x4 };

/** Character-count field widths for versions 1–9, 10–26 and 27–40. */
const COUNT_BITS: Record<Mode, readonly [number, number, number]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16]
};

const countBits = (mode: Mode, version: number) => COUNT_BITS[mode][version <= 9 ? 0 : version <= 26 ? 1 : 2];

const getBit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

// ── Capacity ────────────────────────────────────────────────────────────────────────────────────

/** Modules available for data and error correction (not function patterns or format/version). */
export function rawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const alignments = Math.floor(version / 7) + 2;
        result -= (25 * alignments - 10) * alignments - 55;
        if (version >= 7) {
            result -= 36;
        }
    }

    return result;
}

export function dataCodewords(version: number, level: QrErrorLevel): number {
    return (
        Math.floor(rawDataModules(version) / 8) -
        ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version]
    );
}

// ── Reed–Solomon over GF(2^8), polynomial 0x11D ─────────────────────────────────────────────────

function multiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }

    return z;
}

/** The generator polynomial of the given degree, highest coefficient (always 1) omitted. */
export function reedSolomonDivisor(degree: number): number[] {
    const result = new Array<number>(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;

    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < result.length; j++) {
            result[j] = multiply(result[j], root);
            if (j + 1 < result.length) {
                result[j] ^= result[j + 1];
            }
        }

        root = multiply(root, 0x02);
    }

    return result;
}

/** The error-correction codewords for a block of data. */
export function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
    const result = divisor.map(() => 0);
    for (const byte of data) {
        const factor = byte ^ (result.shift() as number);
        result.push(0);
        divisor.forEach((coefficient, i) => {
            result[i] ^= multiply(coefficient, factor);
        });
    }

    return result;
}

// ── Data encoding ───────────────────────────────────────────────────────────────────────────────

class BitBuffer {
    readonly bits: number[] = [];

    append(value: number, length: number): void {
        for (let i = length - 1; i >= 0; i--) {
            this.bits.push((value >>> i) & 1);
        }
    }
}

function chooseMode(text: string): Mode {
    if (/^\d*$/.test(text)) {
        return "numeric";
    }

    return [...text].every((c) => ALPHANUMERIC.includes(c)) ? "alphanumeric" : "byte";
}

function segmentData(text: string, mode: Mode): { bits: BitBuffer; count: number } {
    const bits = new BitBuffer();

    if (mode === "numeric") {
        for (let i = 0; i < text.length; i += 3) {
            const group = text.slice(i, i + 3);
            bits.append(Number(group), group.length * 3 + 1);
        }

        return { bits, count: text.length };
    }

    if (mode === "alphanumeric") {
        for (let i = 0; i < text.length; i += 2) {
            const first = ALPHANUMERIC.indexOf(text[i]);
            if (i + 1 < text.length) {
                bits.append(first * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
            } else {
                bits.append(first, 6);
            }
        }

        return { bits, count: text.length };
    }

    const bytes = new TextEncoder().encode(text);
    bytes.forEach((byte) => bits.append(byte, 8));
    return { bits, count: bytes.length };
}

/** Thrown when the text is too long for even a version 40 code at the requested level. */
export class QrCapacityError extends Error {}

function encodeData(text: string, level: QrErrorLevel): { version: number; codewords: number[] } {
    const mode = chooseMode(text);
    const { bits: payload, count } = segmentData(text, mode);

    let version = 1;
    for (; version <= 40; version++) {
        const capacity = dataCodewords(version, level) * 8;
        const used = 4 + countBits(mode, version) + payload.bits.length;
        if (count < 1 << countBits(mode, version) && used <= capacity) {
            break;
        }
    }

    if (version > 40) {
        throw new QrCapacityError("Too much data for a QR code.");
    }

    const capacity = dataCodewords(version, level) * 8;
    const buffer = new BitBuffer();
    buffer.append(MODE_INDICATOR[mode], 4);
    buffer.append(count, countBits(mode, version));
    buffer.bits.push(...payload.bits);

    // Terminator, then zeros to a byte boundary, then the alternating pad bytes.
    buffer.append(0, Math.min(4, capacity - buffer.bits.length));
    buffer.append(0, (8 - (buffer.bits.length % 8)) % 8);
    for (let pad = 0xec; buffer.bits.length < capacity; pad ^= 0xec ^ 0x11) {
        buffer.append(pad, 8);
    }

    const codewords: number[] = [];
    for (let i = 0; i < buffer.bits.length; i += 8) {
        codewords.push(buffer.bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
    }

    return { version, codewords };
}

/** Splits data into blocks, appends each block's error correction, and interleaves the result. */
export function addErrorCorrection(data: readonly number[], version: number, level: QrErrorLevel): number[] {
    const blockCount = NUM_ERROR_CORRECTION_BLOCKS[level][version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version];
    const rawCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlocks = blockCount - (rawCodewords % blockCount);
    const shortBlockLength = Math.floor(rawCodewords / blockCount);
    const divisor = reedSolomonDivisor(eccLength);

    const blocks: number[][] = [];
    for (let i = 0, k = 0; i < blockCount; i++) {
        const block = data.slice(k, k + shortBlockLength - eccLength + (i < shortBlocks ? 0 : 1));
        k += block.length;
        const ecc = reedSolomonRemainder(block, divisor);
        if (i < shortBlocks) {
            block.push(0);
        }

        blocks.push([...block, ...ecc]);
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
        blocks.forEach((block, j) => {
            // Skip the padding placeholder the short blocks carry.
            if (i !== shortBlockLength - eccLength || j >= shortBlocks) {
                result.push(block[i]);
            }
        });
    }

    return result;
}

// ── The matrix ──────────────────────────────────────────────────────────────────────────────────

export function alignmentPositions(version: number): number[] {
    if (version === 1) {
        return [];
    }

    const count = Math.floor(version / 7) + 2;
    const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
    const positions = [6];
    for (let position = version * 4 + 17 - 7; positions.length < count; position -= step) {
        positions.splice(1, 0, position);
    }

    return positions;
}

/** The 15 format bits for a level and mask, error-corrected and masked. */
export function formatBits(level: QrErrorLevel, mask: number): number {
    const data = (FORMAT_BITS[level] << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }

    return ((data << 10) | remainder) ^ 0x5412;
}

/** The 18 version bits, for versions 7 and up. */
export function versionBits(version: number): number {
    let remainder = version;
    for (let i = 0; i < 12; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }

    return (version << 12) | remainder;
}

class Matrix {
    readonly size: number;
    readonly modules: boolean[][];
    readonly isFunction: boolean[][];

    constructor(version: number) {
        this.size = version * 4 + 17;
        this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
        this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    }

    setFunction(x: number, y: number, dark: boolean): void {
        this.modules[y][x] = dark;
        this.isFunction[y][x] = true;
    }
}

function drawFunctionPatterns(matrix: Matrix, version: number, level: QrErrorLevel): void {
    const { size } = matrix;

    for (let i = 0; i < size; i++) {
        matrix.setFunction(6, i, i % 2 === 0);
        matrix.setFunction(i, 6, i % 2 === 0);
    }

    const finder = (cx: number, cy: number) => {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                const x = cx + dx;
                const y = cy + dy;
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    matrix.setFunction(x, y, distance !== 2 && distance !== 4);
                }
            }
        }
    };

    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);

    const positions = alignmentPositions(version);
    const last = positions.length - 1;
    positions.forEach((x, i) => {
        positions.forEach((y, j) => {
            // The three corners already hold finder patterns.
            if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
                return;
            }

            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    matrix.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                }
            }
        });
    });

    drawFormat(matrix, level, 0);

    if (version >= 7) {
        const bits = versionBits(version);
        for (let i = 0; i < 18; i++) {
            const dark = getBit(bits, i);
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            matrix.setFunction(a, b, dark);
            matrix.setFunction(b, a, dark);
        }
    }
}

function drawFormat(matrix: Matrix, level: QrErrorLevel, mask: number): void {
    const bits = formatBits(level, mask);
    const { size } = matrix;

    // The copy around the top-left finder.
    for (let i = 0; i <= 5; i++) {
        matrix.setFunction(8, i, getBit(bits, i));
    }

    matrix.setFunction(8, 7, getBit(bits, 6));
    matrix.setFunction(8, 8, getBit(bits, 7));
    matrix.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) {
        matrix.setFunction(14 - i, 8, getBit(bits, i));
    }

    // The copy split between the other two finders.
    for (let i = 0; i < 8; i++) {
        matrix.setFunction(size - 1 - i, 8, getBit(bits, i));
    }

    for (let i = 8; i < 15; i++) {
        matrix.setFunction(8, size - 15 + i, getBit(bits, i));
    }

    // The dark module, always set.
    matrix.setFunction(8, size - 8, true);
}

function drawCodewords(matrix: Matrix, codewords: readonly number[]): void {
    const { size } = matrix;
    let bit = 0;

    // Two-module-wide columns from the right, alternating upward and downward, skipping the
    // vertical timing pattern.
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right = 5;
        }

        for (let vertical = 0; vertical < size; vertical++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - vertical : vertical;
                if (!matrix.isFunction[y][x] && bit < codewords.length * 8) {
                    matrix.modules[y][x] = getBit(codewords[bit >>> 3], 7 - (bit & 7));
                    bit += 1;
                }
            }
        }
    }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

/** XORs a mask over the data modules; applying it twice undoes it. */
function applyMask(matrix: Matrix, mask: number): void {
    const test = MASKS[mask];
    for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
            if (!matrix.isFunction[y][x] && test(x, y)) {
                matrix.modules[y][x] = !matrix.modules[y][x];
            }
        }
    }
}

/** The standard's penalty score: lower means easier to scan. */
function penalty(matrix: Matrix): number {
    const { size, modules } = matrix;
    let score = 0;

    const addHistory = (runLength: number, history: number[]) => {
        if (history[0] === 0) {
            runLength += size;
        }

        history.pop();
        history.unshift(runLength);
    };

    const countFinderLike = (history: number[]) => {
        const n = history[1];
        const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
        return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };

    const scanLine = (get: (i: number) => boolean) => {
        let runColor = false;
        let runLength = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];

        for (let i = 0; i < size; i++) {
            if (get(i) === runColor) {
                runLength += 1;
                if (runLength === 5) {
                    score += 3;
                } else if (runLength > 5) {
                    score += 1;
                }
            } else {
                addHistory(runLength, history);
                if (!runColor) {
                    score += countFinderLike(history) * 40;
                }

                runColor = get(i);
                runLength = 1;
            }
        }

        if (runColor) {
            addHistory(runLength, history);
            runLength = 0;
        }

        runLength += size;
        addHistory(runLength, history);
        score += countFinderLike(history) * 40;
    };

    for (let y = 0; y < size; y++) {
        scanLine((x) => modules[y][x]);
    }

    for (let x = 0; x < size; x++) {
        scanLine((y) => modules[y][x]);
    }

    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const color = modules[y][x];
            if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
                score += 3;
            }
        }
    }

    const dark = modules.reduce((total, row) => total + row.filter(Boolean).length, 0);
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;

    return score;
}

/** Encodes text as a QR code. Throws {@link QrCapacityError} when it cannot fit. */
export function encodeQr(text: string, level: QrErrorLevel = "M"): QrCode {
    const { version, codewords } = encodeData(text, level);
    const matrix = new Matrix(version);

    drawFunctionPatterns(matrix, version, level);
    drawCodewords(matrix, addErrorCorrection(codewords, version, level));

    let best = 0;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
        applyMask(matrix, mask);
        drawFormat(matrix, level, mask);
        const score = penalty(matrix);
        if (score < bestScore) {
            best = mask;
            bestScore = score;
        }

        applyMask(matrix, mask);
    }

    applyMask(matrix, best);
    drawFormat(matrix, level, best);

    return { version, size: matrix.size, modules: matrix.modules };
}
