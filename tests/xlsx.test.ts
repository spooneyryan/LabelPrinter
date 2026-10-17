import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatGeneral, formatNumber, serialToDate } from "../src/import/numberFormat.ts";
import { columnIndex, readXlsx } from "../src/import/xlsx.ts";
import { attribute, descend, parseXml, textOf } from "../src/import/xml.ts";
import { ZipArchive } from "../src/import/zip.ts";

/*
 * The workbook tests build real .xlsx files in memory — a ZIP writer is a few lines when CRCs are
 * not checked, and DecompressionStream's sibling CompressionStream provides the deflate — so the
 * whole path from bytes to rows is exercised, not just the pieces.
 */

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function buildZip(files: Record<string, string>, deflate: boolean): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const [name, content] of Object.entries(files)) {
        const nameBytes = encoder.encode(name);
        const raw = encoder.encode(content);
        const data = deflate ? await deflateRaw(raw) : raw;
        const method = deflate ? 8 : 0;

        const local = new Uint8Array(30 + nameBytes.length + data.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(8, method, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, raw.length, true);
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(10, method, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, raw.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        locals.push(local);
        centrals.push(central);
        offset += local.length;
    }

    const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, centrals.length, true);
    ev.setUint16(10, centrals.length, true);
    ev.setUint32(12, directorySize, true);
    ev.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, end];
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of parts) {
        result.set(part, cursor);
        cursor += part.length;
    }

    return result;
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const workbookFiles = (sheet1: string, extra: Record<string, string> = {}) => ({
    "[Content_Types].xml": "<Types/>",
    "_rels/.rels": `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook ${NS}><workbookPr/><sheets>
            <sheet name="People" sheetId="1" r:id="rId1"/>
            <sheet name="Second" sheetId="2" r:id="rId2"/>
        </sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>
        <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="${REL}/worksheet" Target="/xl/worksheets/sheet2.xml"/>
        <Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
        <Relationship Id="rId4" Type="${REL}/styles" Target="styles.xml"/>
    </Relationships>`,
    "xl/sharedStrings.xml": `<sst ${NS}>
        <si><t>Name</t></si><si><t>ZIP</t></si><si><t>Joined</t></si>
        <si><r><t>Ada </t></r><r><rPr><b/></rPr><t>Lovelace</t></r><rPh><t>ignored</t></rPh></si>
        <si><t xml:space="preserve"> Grace &amp; Co </t></si>
    </sst>`,
    "xl/styles.xml": `<styleSheet ${NS}>
        <numFmts count="1"><numFmt numFmtId="164" formatCode="00000"/></numFmts>
        <cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs>
    </styleSheet>`,
    "xl/worksheets/sheet1.xml": sheet1,
    "xl/worksheets/sheet2.xml": `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Only</t></is></c></row></sheetData></worksheet>`,
    ...extra
});

const PEOPLE = `<worksheet ${NS}><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="1"><v>2134</v></c><c r="C2" s="2"><v>45580</v></c></row>
    <row r="4"><c r="A4" t="s"><v>4</v></c><c r="C4" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;

describe("readXlsx", () => {
    for (const deflate of [false, true]) {
        test(`reads every worksheet (${deflate ? "deflated" : "stored"})`, async () => {
            const sheets = await readXlsx(await buildZip(workbookFiles(PEOPLE), deflate));
            assert.deepEqual(sheets.map((sheet) => sheet.name), ["People", "Second"]);
            assert.deepEqual(sheets[0].rows[0], ["Name", "ZIP", "Joined"]);
            // Rich text joins its runs and leaves out phonetic guides; the ZIP keeps its zero.
            assert.equal(sheets[0].rows[1][0], "Ada Lovelace");
            assert.equal(sheets[0].rows[1][1], "02134");
            assert.equal(sheets[0].rows[1][2], "10/15/2024");
            // Row 3 is missing from the file and stays an empty row; gaps in a row become "".
            assert.deepEqual(sheets[0].rows[2], []);
            assert.deepEqual(sheets[0].rows[3], [" Grace & Co ", "", "TRUE"]);
            assert.deepEqual(sheets[1].rows, [["Only"]]);
        });
    }

    test("refuses a ZIP that is not a workbook", async () => {
        await assert.rejects(readXlsx(await buildZip({ "hello.txt": "hi" }, false)), /no workbook/);
    });

    test("refuses bytes that are not a ZIP", async () => {
        await assert.rejects(readXlsx(new Uint8Array(100)), /not a readable ZIP/);
    });

    test("finds entries regardless of case", async () => {
        const zip = ZipArchive.open(await buildZip({ "XL/Thing.xml": "<a/>" }, false));
        assert.equal(await zip.readText("xl/thing.xml"), "<a/>");
    });

    test("column letters", () => {
        assert.equal(columnIndex("A1"), 0);
        assert.equal(columnIndex("Z9"), 25);
        assert.equal(columnIndex("AA10"), 26);
        assert.equal(columnIndex("XFD1"), 16383);
    });
});

describe("parseXml", () => {
    test("reads elements, attributes, entities, CDATA and prefixes", () => {
        const root = parseXml(`<?xml version="1.0"?><!-- note --><x:root a="1 &lt; 2" r:id='q'><x:item>A &amp; B<![CDATA[<raw>]]></x:item><empty/></x:root>`);
        assert.equal(root.local, "root");
        assert.equal(attribute(root, "a"), "1 < 2");
        assert.equal(attribute(root, "id"), "q");
        assert.equal(textOf(descend(root, "item")!), "A & B<raw>");
        assert.ok(descend(root, "empty"));
    });

    test("decodes numeric character references", () => {
        assert.equal(textOf(parseXml("<a>&#233;&#x1F600;</a>")), "é😀");
    });

    test("closes unclosed children leniently, as generators sometimes need", () => {
        assert.equal(textOf(parseXml("<a><b>x</a>")), "x");
    });

    test("throws on markup it cannot make sense of", () => {
        assert.throws(() => parseXml("<a></b>"), /not valid XML/);
        assert.throws(() => parseXml("<a"), /not valid XML/);
        assert.throws(() => parseXml("just text"), /not valid XML/);
    });
});

describe("number formats", () => {
    test("General shows numbers as they are", () => {
        assert.equal(formatGeneral(5551234567), "5551234567");
        assert.equal(formatGeneral(0.1 + 0.2), "0.3");
    });

    test("zero-padded codes keep their leading zeros", () => {
        assert.equal(formatNumber(2134, "00000"), "02134");
        assert.equal(formatNumber(21340000, "00000-0000"), "02134-0000");
        assert.equal(formatNumber(123456789, "000-00-0000"), "123-45-6789");
    });

    test("phone formats, including the conditional one Excel ships", () => {
        const phone = "[<=9999999]###-####;(###) ###-####";
        assert.equal(formatNumber(5551234567, phone), "(555) 123-4567");
        assert.equal(formatNumber(5551234, phone), "555-1234");
    });

    test("decimals, thousands, percentages and negatives", () => {
        assert.equal(formatNumber(1234.5, "#,##0.00"), "1,234.50");
        assert.equal(formatNumber(1234.5, "0.0#"), "1234.5");
        assert.equal(formatNumber(0.256, "0.0%"), "25.6%");
        assert.equal(formatNumber(-42, "0;(0)"), "(42)");
        assert.equal(formatNumber(-42, "0.0"), "-42.0");
        assert.equal(formatNumber(19.99, '"$"#,##0.00'), "$19.99");
        assert.equal(formatNumber(1500, "[$€-407]#,##0"), "€1,500");
    });

    test("dates and times", () => {
        assert.equal(formatNumber(45580, "m/d/yyyy"), "10/15/2024");
        assert.equal(formatNumber(45580, "yyyy-mm-dd"), "2024-10-15");
        assert.equal(formatNumber(45580.75, "h:mm AM/PM"), "6:00 PM");
        assert.equal(formatNumber(45580.5, "hh:mm:ss"), "12:00:00");
        assert.equal(formatNumber(1.5, "[h]:mm"), "36:00");
    });

    test("the 1904 date system", () => {
        assert.equal(serialToDate(0, true).toISOString().slice(0, 10), "1904-01-01");
        assert.equal(serialToDate(1).toISOString().slice(0, 10), "1899-12-31");
    });
});
