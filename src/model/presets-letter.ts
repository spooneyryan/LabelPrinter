import type { PresetKind, SheetPreset } from "./presets.ts";
import type { LabelShape, SheetSpec } from "./types.ts";

/*
 * More US Letter stock: the most used Avery layouts beyond the classic address and shipping
 * sheets (rounds, squares, Print-to-the-Edge and Presta), and a few OnlineLabels sheets with no
 * Avery equivalent. Researched October 2026, ranked by Avery's own template popularity.
 *
 * The numbers are the makers' published template specs, in inches: OnlineLabels product pages
 * (onlinelabels.com/products/<code>) publish every measurement; Avery's blank-label pages
 * (avery.com/blank/labels/<code>) publish the margins, from which the gaps follow. Every layout adds
 * up to the page within a hundredth of an inch.
 *
 * Other makers' codes for the same layout come from their published cross-references: OnlineLabels
 * (OL…), SheetLabels (SL…), Worldlabel (WL-…) and Uline (S-…). They are search terms, so a code read
 * off any box finds its sheet. Avery's own compatible products are listed without a prefix.
 */

interface Layout {
    brand: "Avery" | "OnlineLabels";
    code: string;
    kind: PresetKind;
    name: string;
    shape: LabelShape;
    /** Corner radius for rounded labels; the usual 1/16″ when a maker gives none. */
    radius?: number;
    w: number;
    h: number;
    cols: number;
    rows: number;
    top: number;
    left: number;
    gapX: number;
    gapY: number;
    compatible?: string[];
    equivalents?: string[];
    note?: string;
}

const LAYOUTS: readonly Layout[] = [
    { brand: "Avery", code: "22830", kind: "Round", name: "Print-to-the-Edge Round Labels 2-1/2\"", shape: "ellipse", w: 2.5, h: 2.5, cols: 3, rows: 3, top: 0.625, left: 0.3125, gapX: 0.1875, gapY: 1.125, compatible: ["22808", "22818", "22856", "22924", "22926", "22962", "22963", "41462", "41493", "22562", "27953", "72830", "5639"], equivalents: ["OL2683", "SL1507"] },
    { brand: "Avery", code: "22805", kind: "Square", name: "Print-to-the-Edge Square Labels 1-1/2\"", shape: "rounded", radius: 0.03125, w: 1.5, h: 1.5, cols: 4, rows: 6, top: 0.5, left: 0.7812, gapX: 0.3125, gapY: 0.2, compatible: ["5214"], equivalents: ["OL2681", "SL655"] },
    { brand: "Avery", code: "94237", kind: "Rectangle", name: "Presta 2\" x 3\" Rectangle Labels", shape: "rounded", w: 3, h: 2, cols: 2, rows: 4, top: 1, left: 0.85, gapX: 0.8, gapY: 1 / 3, compatible: ["5906", "22890", "5539", "5619", "36460", "36461", "36462", "36463", "36464", "36559"] },
    { brand: "Avery", code: "22827", kind: "Rectangle", name: "Durable Rectangular Labels 3-1/2\" x 4-3/4\"", shape: "rounded", radius: 0.125, w: 3.5, h: 4.75, cols: 2, rows: 2, top: 0.6875, left: 0.5, gapX: 0.5, gapY: 0.125, equivalents: ["OL4546"] },
    { brand: "Avery", code: "5931", kind: "CD/DVD", name: "CD/DVD Labels", shape: "ellipse", w: 4.625, h: 4.625, cols: 1, rows: 2, top: 0.6875, left: 1.9375, gapX: 0, gapY: 0.375, compatible: ["8692", "5692", "8691", "28669", "5192", "5584", "5694", "5697", "5698", "6692", "8942", "8962", "94604"], equivalents: ["OL5075", "WL-5075", "SL122"], note: "The centre hole (about 1⅝″) and the spine strips aren't drawn: keep text clear of the middle." },
    { brand: "Avery", code: "94500", kind: "Round", name: "Presta 1\" Round Labels", shape: "ellipse", w: 1, h: 1, cols: 6, rows: 8, top: 0.625, left: 0.625, gapX: 0.25, gapY: 0.25, compatible: ["5224", "5232", "36485", "36486", "36487", "36488", "36489"] },
    { brand: "Avery", code: "5390", kind: "Name badge", name: "Name Badge Inserts 2-1/4\" x 3-1/2\"", shape: "rectangle", w: 3.5, h: 2.21875, cols: 2, rows: 4, top: 1.0625, left: 0.75, gapX: 0, gapY: 0, compatible: ["5383", "74461", "74549"], equivalents: ["OL712"] },
    { brand: "Avery", code: "5352", kind: "Shipping", name: "Shipping Labels for Copiers 2\" x 4-1/4\"", shape: "rectangle", w: 4.25, h: 2, cols: 2, rows: 5, top: 0.5, left: 0, gapX: 0, gapY: 0, compatible: ["45005"], equivalents: ["OL625", "WL-625WX"] },
    { brand: "Avery", code: "94090", kind: "Round", name: "Presta 2-1/2\" Round Labels", shape: "ellipse", w: 2.5, h: 2.5, cols: 3, rows: 4, top: 0.359375, left: 0.25, gapX: 0.25, gapY: 0.09375 },
    { brand: "Avery", code: "94104", kind: "Square", name: "Presta 2-1/2\" Square Labels", shape: "rounded", w: 2.5, h: 2.5, cols: 3, rows: 3, top: 1, left: 0.375, gapX: 0.125, gapY: 0.75 },
    { brand: "Avery", code: "94082", kind: "Round", name: "Presta 1-1/4\" Round Labels", shape: "ellipse", w: 1.25, h: 1.25, cols: 6, rows: 8, top: 0.28125, left: 0.34375, gapX: 0.0625, gapY: 0.0625, equivalents: ["OL3012"] },
    { brand: "Avery", code: "94505", kind: "Round", name: "Presta 1-1/4\" Round Labels", shape: "ellipse", w: 1.25, h: 1.25, cols: 5, rows: 6, top: 0.8125, left: 0.375, gapX: 0.375, gapY: 0.375, compatible: ["69678"] },
    { brand: "Avery", code: "6873", kind: "Shipping", name: "Print-to-the-Edge Shipping Labels 2\" x 3-3/4\"", shape: "rounded", radius: 0.125, w: 3.75, h: 2, cols: 2, rows: 4, top: 1.125, left: 0.375, gapX: 0.25, gapY: 0.25, compatible: ["64504", "94240"], equivalents: ["OL171", "WL-171WX"] },
    { brand: "Avery", code: "6878", kind: "Shipping", name: "Print-to-the-Edge Shipping Labels 3-3/4\" x 4-3/4\"", shape: "rounded", radius: 0.125, w: 3.75, h: 4.75, cols: 2, rows: 2, top: 0.625, left: 0.375, gapX: 0.25, gapY: 0.25, compatible: ["70124", "94254"], equivalents: ["OL162", "SL571", "S-20136"] },
    // Published as 2.83″ wide; a third of the page is what the copier sheet is cut to.
    { brand: "Avery", code: "5360", kind: "Address", name: "Address Labels for Copiers 1-1/2\" x 2-13/16\"", shape: "rectangle", w: 8.5 / 3, h: 1.5, cols: 3, rows: 7, top: 0.25, left: 0, gapX: 0, gapY: 0, compatible: ["45008"], equivalents: ["OL5350", "SL552"] },
    { brand: "Avery", code: "94510", kind: "Round", name: "Presta 2-1/4\" Round Labels", shape: "ellipse", w: 2.25, h: 2.25, cols: 3, rows: 4, top: 0.625, left: 0.5, gapX: 0.375, gapY: 0.25, compatible: ["70123"] },
    { brand: "Avery", code: "94509", kind: "Round", name: "Presta 1-3/4\" Round Labels", shape: "ellipse", w: 1.75, h: 1.75, cols: 4, rows: 5, top: 0.625, left: 0.375, gapX: 0.25, gapY: 0.25, compatible: ["70125", "97204"] },
    { brand: "Avery", code: "94106", kind: "Square", name: "Presta 1-1/2\" Square Labels", shape: "rounded", w: 1.5, h: 1.5, cols: 4, rows: 5, top: 0.625, left: 0.5, gapX: 0.5, gapY: 0.5625 },
    { brand: "Avery", code: "6871", kind: "Address", name: "Print-to-the-Edge Address Labels 1-1/4\" x 2-3/8\"", shape: "rounded", w: 2.375, h: 1.25, cols: 3, rows: 6, top: 1.125, left: 0.3725, gapX: 0.315, gapY: 0.25, equivalents: ["OL160", "WL-160WX", "S-21845"] },
    { brand: "Avery", code: "5026", kind: "File folder", name: "Extra Large File Folder Labels 15/16\" x 3-7/16\"", shape: "rounded", radius: 0.09375, w: 3.4375, h: 0.9375, cols: 2, rows: 9, top: 0.51125, left: 0.49755, gapX: 0.6299, gapY: 0.1925, compatible: ["5027", "8425", "94218"], equivalents: ["OL157", "WL-157WX", "SL577"] },
    { brand: "Avery", code: "94504", kind: "Round", name: "Presta 3/4\" Round Labels", shape: "ellipse", w: 0.75, h: 0.75, cols: 8, rows: 10, top: 0.625, left: 0.375, gapX: 0.25, gapY: 0.25, compatible: ["4220", "34220", "97202"] },
    { brand: "Avery", code: "5363", kind: "Address", name: "Address Labels for Copiers 1-3/8\" x 2-13/16\"", shape: "rectangle", w: 8.5 / 3, h: 1.375, cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["OL870"] },
    { brand: "Avery", code: "94244", kind: "Rectangle", name: "Presta Rectangle Labels 2-1/4\" x 7-3/4\"", shape: "rounded", radius: 0.125, w: 7.75, h: 2.25, cols: 1, rows: 4, top: 0.625, left: 0.375, gapX: 0, gapY: 0.25, equivalents: ["OL4498"] },
    { brand: "Avery", code: "94105", kind: "Square", name: "Presta Square Labels 2-1/8\"", shape: "rounded", radius: 0.125, w: 2.125, h: 2.125, cols: 3, rows: 4, top: 0.625, left: 0.75, gapX: 0.3125, gapY: 0.41667, compatible: ["70144"], equivalents: ["OL4603"] },
    { brand: "Avery", code: "94232", kind: "Rectangle", name: "Presta Rectangle Labels 1-3/4\" x 7-3/4\"", shape: "rounded", radius: 0.125, w: 7.75, h: 1.75, cols: 1, rows: 5, top: 0.625, left: 0.375, gapX: 0, gapY: 0.25, equivalents: ["OL4501"] },
    { brand: "Avery", code: "94233", kind: "Rectangle", name: "Presta Rectangle Labels 1-13/16\" x 2-3/16\"", shape: "rounded", radius: 0.125, w: 2.1875, h: 1.8125, cols: 3, rows: 4, top: 1.125, left: 0.65625, gapX: 0.3125, gapY: 0.5, equivalents: ["OL4606"] },
    { brand: "Avery", code: "94236", kind: "Rectangle", name: "Presta Rectangle Labels 2\" x 2-3/4\"", shape: "rounded", radius: 0.125, w: 2.75, h: 2, cols: 2, rows: 4, top: 0.75, left: 1, gapX: 1, gapY: 0.5, equivalents: ["OL4648"] },
    { brand: "Avery", code: "6876", kind: "Shipping", name: "Print-to-the-Edge Shipping Labels 4-3/4\" x 7-3/4\"", shape: "rectangle", w: 7.75, h: 4.75, cols: 1, rows: 2, top: 0.625, left: 0.375, gapX: 0, gapY: 0.25, compatible: ["94255"], equivalents: ["OL1258", "S-21846"] },
    { brand: "Avery", code: "6879", kind: "Address", name: "Print-to-the-Edge Labels 1-1/4\" x 3-3/4\"", shape: "rounded", radius: 0.09375, w: 3.75, h: 1.25, cols: 2, rows: 6, top: 1.1595, left: 0.375, gapX: 0.25, gapY: 0.2362, compatible: ["70139", "94228"], equivalents: ["OL161", "WL-161WX", "SL576"] },
    { brand: "Avery", code: "94507", kind: "Round", name: "Presta 1-5/8\" Round Labels", shape: "ellipse", w: 1.625, h: 1.625, cols: 4, rows: 5, top: 0.6875, left: 0.4375, gapX: 0.375, gapY: 0.375, equivalents: ["OL4646"] },
    { brand: "Avery", code: "94221", kind: "Rectangle", name: "Presta Rectangle Labels 1\" x 2-1/2\"", shape: "rounded", w: 2.5, h: 1, cols: 3, rows: 8, top: 0.625, left: 0.325, gapX: 0.175, gapY: 0.25, equivalents: ["OL4607"] },
    { brand: "Avery", code: "94251", kind: "Rectangle", name: "Presta Rectangle Labels 3-1/4\" x 8-3/8\"", shape: "rounded", radius: 0.125, w: 8.375, h: 3.25, cols: 1, rows: 3, top: 0.625, left: 0.0625, gapX: 0, gapY: 0, compatible: ["97187"], equivalents: ["OL4544"] },
    { brand: "Avery", code: "6573", kind: "Shipping", name: "ID Labels 5\" x 8-1/8\"", shape: "rounded", radius: 0.125, w: 8.12992, h: 5, cols: 1, rows: 2, top: 0.5, left: 0.18504, gapX: 0, gapY: 0, compatible: ["6579", "6794", "94259", "97193"], equivalents: ["OL159", "SL515"] },
    { brand: "Avery", code: "94266", kind: "Shipping", name: "Presta Rectangle Labels 4-1/4\" x 11\" (half sheet, tall)", shape: "rectangle", w: 4.25, h: 11, cols: 2, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0, equivalents: ["OL178"] },
    { brand: "Avery", code: "94052", kind: "Oval", name: "Presta Oval Labels 3\" x 5\"", shape: "ellipse", w: 5, h: 3, cols: 1, rows: 3, top: 0.625, left: 1.75, gapX: 0, gapY: 0.375, equivalents: ["OL4468"] },
    { brand: "Avery", code: "6571", kind: "File folder", name: "ID Labels 5/8\" x 3\"", shape: "rounded", radius: 0.09375, w: 3, h: 0.625, cols: 2, rows: 16, top: 0.5, left: 0.8415, gapX: 0.817, gapY: 0, compatible: ["6577", "6792", "94214", "97176"], equivalents: ["OL173", "WL-173WX", "SL704"] },
    { brand: "Avery", code: "5293", kind: "Round", name: "Round Labels 1-2/3\"", shape: "ellipse", w: 1.625, h: 1.625, cols: 4, rows: 6, top: 0.5063, left: 0.412, gapX: 0.392, gapY: 0.0475, compatible: ["4330", "5193"], equivalents: ["OL325", "WL-325WX", "SL107", "S-5489", "S-10418"] },
    { brand: "Avery", code: "5295", kind: "Round", name: "Round Labels 3-1/3\"", shape: "ellipse", w: 3.3125, h: 3.3125, cols: 2, rows: 3, top: 0.4844, left: 0.6406, gapX: 0.5938, gapY: 0.0469, equivalents: ["OL375", "SLS09", "WL-375WX"] },
    { brand: "Avery", code: "22845", kind: "Rectangle", name: "Wraparound Labels 1-1/4\" x 9-3/4\"", shape: "rounded", w: 1.25, h: 9.75, cols: 5, rows: 1, top: 0.625, left: 0.325, gapX: 0.4, gapY: 0, compatible: ["22929", "94262"], equivalents: ["OL2680", "S-21951"] },
    { brand: "OnlineLabels", code: "OL1735", kind: "Return address", name: "1.75\" x 0.75\" Labels", shape: "rounded", radius: 0.125, w: 1.75, h: 0.75, cols: 4, rows: 12, top: 0.25, left: 0.25, gapX: 1 / 3, gapY: 0.136 },
    { brand: "OnlineLabels", code: "OL5425", kind: "Square", name: "1\" x 1\" Square Labels", shape: "rectangle", w: 1, h: 1, cols: 8, rows: 10, top: 0.5, left: 0.25, gapX: 0, gapY: 0, equivalents: ["S-10433"] },
    { brand: "OnlineLabels", code: "OL1416", kind: "Rectangle", name: "2\" x 3\" Labels", shape: "rectangle", w: 2, h: 3, cols: 3, rows: 3, top: 0.75, left: 1, gapX: 0.25, gapY: 0.25 }
];

function toPreset(layout: Layout): SheetPreset {
    const sheet: Omit<SheetSpec, "presetId" | "name"> = {
        pageWidth: 8.5,
        pageHeight: 11,
        labelWidth: layout.w,
        labelHeight: layout.h,
        columns: layout.cols,
        rows: layout.rows,
        marginTop: layout.top,
        marginLeft: layout.left,
        gapX: layout.gapX,
        gapY: layout.gapY,
        shape: layout.shape,
        cornerRadius: layout.shape === "rounded" ? (layout.radius ?? 0.0625) : 0
    };

    return {
        id: `${layout.brand === "Avery" ? "avery" : "onlinelabels"}-${layout.code.toLowerCase()}`,
        brand: layout.brand,
        code: layout.code,
        kind: layout.kind,
        compatible: layout.compatible ?? [],
        equivalents: layout.equivalents,
        sheet,
        keywords: layout.name,
        note: layout.note
    };
}

export const LETTER_PRESETS: readonly SheetPreset[] = LAYOUTS.map(toPreset);

/*
 * Other makers' codes for sheets already in the list, from the same cross-references — so a box
 * from OnlineLabels, SheetLabels, Worldlabel or Uline finds its Avery or Shipping Store twin.
 */
export const EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
    "avery-5160": ["OL875", "SL100", "SL100VP", "WL-875WX", "S-5042", "S-11893", "S-15184", "S-10420", "S-6773", "S-8080", "S-14855", "S-16643", "S-21933", "5970", "5971", "5972", "5979", "5980", "15660", "18660", "22837", "28660", "38260", "45160", "48160", "48460", "55160", "94200"],
    "avery-5161": ["OL75", "SL550", "WL-75WX", "8461", "5909", "94202"],
    "avery-5162": ["OL100", "SL101", "SL101VP", "WL-100WX", "S-8039", "S-19649", "S-14856", "S-6774", "5522", "5962", "8462", "18262", "48462", "6445", "6455", "95522", "94206"],
    "avery-5159": ["5259", "94087"],
    "avery-5163": ["OL125", "SL102", "WL-125WX", "S-3845", "S-11892", "S-15186", "S-5962", "S-6775", "S-14857", "S-10421", "S-19321", "S-16644", "5523", "15513", "18863", "48163", "48263", "48363", "48863", "55163", "55463", "94207"],
    "avery-5164": ["OL150", "SL103", "WL-150WX", "5524", "8254", "8464", "8564", "15264", "48464", "48864", "55164", "6436", "95905", "94215"],
    "avery-5168": ["OL5100", "SL145", "WL-5100", "S-8064", "S-17380", "S-18454", "S-20181", "27950", "95935", "60503"],
    "avery-5167": ["OL25", "SL105", "SL105VP", "WL-25WX", "S-5957", "S-15183", "S-17379", "S-10432", "S-8068", "S-14854", "5667", "5967", "8667", "8867", "8927", "15667", "18167", "18667", "48267", "48467", "48867", "94203"],
    "avery-5195": ["OL385", "SL683", "WL-385WX", "S-21929", "5155", "15695", "18195", "18294", "18695", "6430", "6520", "94208"],
    "avery-5366": ["OL200", "SL109", "WL-200WX", "5066", "8066", "5029", "5566", "6505", "8478", "8593", "45366", "48266", "48366", "75366", "94210"],
    "avery-5371": ["5376", "5377", "8471", "8871", "8877", "28371", "28877", "27871", "38871"],
    "avery-5395": ["OL5030", "SL574", "25395", "42395", "45395", "48395", "85395", "88395", "94211", "94366"],
    "avery-5126": ["OL400", "SL514", "S-5044", "S-11891", "S-5964", "S-16087", "S-19323", "S-10424", "S-14076", "S-16645", "5526", "5912", "5917", "15516", "18126", "48126", "95526", "95900", "95930", "94229"],
    "avery-5165": ["OL175", "OL177", "SL111VS", "WL-175WX", "S-5045", "S-14115", "S-15574", "S-15581", "S-19324", "S-14858", "S-8070", "S-21934", "S-19650", "5265", "5353", "8255", "8465", "8665", "15265", "18665", "95920", "94268"]
};

/*
 * Other makers' sheets with the same label size and count as a Shipping Store layout. Their margins
 * may differ by a little, so these are offered as a starting point — run the test sheet — rather
 * than claimed as the same template.
 */
export const SIMILAR: Readonly<Record<string, readonly string[]>> = {
    "tss-c004a": ["Avery 22807", "22817", "22825", "22205", "94501", "OL2682"],
    "tss-s002a": ["Avery 22806", "22816", "22846", "22853", "94107", "OL2679"],
    "tss-c005": ["Avery 5294", "45294", "OL350", "SL108", "WL-350WX", "S-5046"],
    "tss-c002": ["Avery 6450", "94066", "OL1025", "S-8075"],
    "tss-c001": ["OL5275", "S-13768"],
    "tss-c003": ["Avery 94091", "OL2088", "S-13769"],
    "tss-c001fa": ["Avery 94506", "8293"],
    "tss-c004": ["Avery 94089", "OL5375", "S-14071"],
    "tss-s002": ["Avery 94069", "OL330"],
    "tss-c006": ["Avery 94513", "OL2279", "S-10417"],
    "tss-s003": ["Avery 94076", "OL291"],
    "tss-s001a": ["Avery 94103"],
    "tss-s004a": ["Avery 60504"],
    "tss-v004a": ["Avery 22804", "22814", "94051", "OL2684", "SL1501"],
    "tss-v001": ["Avery 22820", "22829", "94056", "OL2685", "SL1502"],
    "tss-v002": ["Avery 8216", "94054", "OL4545"],
    "tss-r038l": ["Avery 6570", "22828", "94226", "OL1905", "SL701"],
    "tss-r009": ["Avery 6572", "SL694"],
    "tss-r014": ["Avery 6874", "94248", "OL172", "SL499", "WL-172WX"],
    "tss-r021": ["Avery 5392", "OL730", "SL573", "S-5960"],
    "tss-r041l": ["Avery 8257", "6870", "8987", "OL6950", "SL700", "S-21844"],
    "tss-r033l": ["Avery 5197", "OL250", "SL116", "WL-250WX", "S-5627"],
    "tss-r027": ["Avery 22802", "94238", "OL3072"],
    "tss-r011": ["Avery 94092", "OL996", "S-19643"],
    "tss-r035l": ["OL131"],
    "tss-r020": ["OL600", "S-5043"],
    "tss-r022": ["OL475", "S-3846"],
    "tss-r023": ["OL450", "S-8065"],
    "tss-r01f01a": ["Avery 94073", "OL975", "S-5959"],
    "tss-r005": ["OL5125", "S-20133"],
    "tss-r043l": ["OL1115", "S-19346"]
};
