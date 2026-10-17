/*
 * Just enough ZIP to open an .xlsx, which is a ZIP of XML files.
 *
 * Entries are found through the central directory at the end of the archive — the authoritative
 * index, which is right even when local headers defer their sizes to a data descriptor — and
 * inflated with the platform's own DecompressionStream, so no inflate implementation ships with
 * the app. Stored (method 0) and deflated (method 8) entries are supported, which is everything
 * Excel, LibreOffice and Google Sheets write. ZIP64 and encryption are refused with a message
 * rather than misread.
 */

export interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    size: number;
    localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function notAZip(detail: string): never {
    throw new Error(`This file is not a readable ZIP archive (${detail}).`);
}

export class ZipArchive {
    private readonly bytes: Uint8Array;
    private readonly entries: Map<string, ZipEntry>;

    private constructor(bytes: Uint8Array, entries: ZipEntry[]) {
        this.bytes = bytes;
        this.entries = new Map(entries.map((entry) => [entry.name, entry]));
    }

    static open(bytes: Uint8Array): ZipArchive {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const minimum = 22;
        if (bytes.length < minimum) {
            notAZip("too short");
        }

        // The end-of-central-directory record is the last thing in the file, followed only by an
        // optional comment of at most 64 KiB.
        let eocd = -1;
        for (let offset = bytes.length - minimum; offset >= Math.max(0, bytes.length - minimum - 0xffff); offset--) {
            if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
                eocd = offset;
                break;
            }
        }

        if (eocd === -1) {
            notAZip("no central directory");
        }

        const count = view.getUint16(eocd + 10, true);
        const directoryOffset = view.getUint32(eocd + 16, true);
        if (count === 0xffff || directoryOffset === 0xffffffff) {
            notAZip("ZIP64 archives are not supported");
        }

        const entries: ZipEntry[] = [];
        const names = new TextDecoder("utf-8");
        let cursor = directoryOffset;

        for (let index = 0; index < count; index++) {
            if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
                notAZip("damaged central directory");
            }

            const flags = view.getUint16(cursor + 8, true);
            const nameLength = view.getUint16(cursor + 28, true);
            const extraLength = view.getUint16(cursor + 30, true);
            const commentLength = view.getUint16(cursor + 32, true);

            if (flags & 0x1) {
                notAZip("the archive is encrypted");
            }

            entries.push({
                name: names.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/^\/+/, ""),
                method: view.getUint16(cursor + 10, true),
                compressedSize: view.getUint32(cursor + 20, true),
                size: view.getUint32(cursor + 24, true),
                localHeaderOffset: view.getUint32(cursor + 42, true)
            });

            cursor += 46 + nameLength + extraLength + commentLength;
        }

        return new ZipArchive(bytes, entries);
    }

    /** The entry names, as stored. */
    names(): string[] {
        return [...this.entries.keys()];
    }

    /** Finds an entry by path, ignoring case — generators disagree on `[Content_Types].xml` and friends. */
    find(path: string): ZipEntry | undefined {
        const normalized = path.replace(/^\/+/, "");
        return (
            this.entries.get(normalized) ??
            [...this.entries.values()].find((entry) => entry.name.toLowerCase() === normalized.toLowerCase())
        );
    }

    async read(path: string): Promise<Uint8Array | null> {
        const entry = this.find(path);
        if (!entry) {
            return null;
        }

        const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
        const header = entry.localHeaderOffset;
        if (header + 30 > this.bytes.length || view.getUint32(header, true) !== LOCAL_SIGNATURE) {
            notAZip(`damaged entry ${entry.name}`);
        }

        const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
        const data = this.bytes.subarray(start, start + entry.compressedSize);

        if (entry.method === 0) {
            return data;
        }

        if (entry.method !== 8) {
            notAZip(`entry ${entry.name} uses compression method ${entry.method}`);
        }

        // `slice` copies into a plain ArrayBuffer, which is what Blob wants on every engine.
        const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async readText(path: string): Promise<string | null> {
        const bytes = await this.read(path);
        return bytes === null ? null : new TextDecoder("utf-8").decode(bytes);
    }
}
