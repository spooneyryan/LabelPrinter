# Label Printer

Design a label once, merge a list of records into it, and print full sheets of labels from the
browser. Built with React, TypeScript and the
[`@electricblazor/react`](../ElectricBlazor/react/README.md) component suite. Everything — the
open label, the data, saved templates, printer calibration — stays in the browser; nothing is
uploaded anywhere.

## Running it

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # the model, import and encoder tests, on Node's own runner
npm run build      # typecheck, then the static site in dist/
```

Node 22.18 or newer (the tests rely on Node's built-in TypeScript type stripping).

### About the `@electricblazor/react` dependency

The app needs 0.17.0, which is on `dev-claude` in the ElectricBlazor repo but not yet on the Azure
Artifacts feed (the feed's latest is 0.13.1). It is therefore installed from a tarball in
`vendor/`, made with `npm run build:lib && npm pack` in `ElectricBlazor/react`. Once 0.17.0 is
published, switch to the feed the way Git Client does:

1. Add an `.npmrc` with `@electricblazor:registry=https://pkgs.dev.azure.com/MorrisonHotel/ElectricBlazor/_packaging/ElectricBlazorPackages/npm/registry/`
   and `always-auth=true` (no credentials in it; they live in `~/.npmrc`).
2. Change the dependency to `"@electricblazor/react": "^0.17.0"`, delete `vendor/`, `npm install`.

## How it works

The app is four steps, visited in any order:

1. **Sheet** — the label stock. 150 presets:
   - **US Letter (123):** 53 Avery sheets (the classic 5160 family, plus the most used rounds,
     squares, CD/DVD, Print-to-the-Edge and Presta layouts), all 67 of The Shipping Store's
     templates (C001–C006, R001–R044A, S001–S006U, V001–V004A — the code their product pages say
     to use), and 3 OnlineLabels sheets with no Avery twin.
   - **A4 (27):** Avery L-series (L7160, L7163, L7162, L7173, L7165, L7651…), Avery Zweckform
     (3475, 3652, 3651…) and Herma.

   Other makers' codes for the same sheet (OnlineLabels OL…, SheetLabels SL…, Worldlabel WL-…,
   Uline S-…, Herma) are listed with it and searchable, so the code on any box finds its sheet.
   Presets filter by maker, shape and page size, and search by code or by size (`1x1`,
   `2 5/8 x 1`); or type in a custom sheet from a ruler, on US Letter or A4. Lengths accept
   decimals, fractions (`2 5/8`, `2⅝`) and millimetres (`66.7mm`). A corner detail letters each
   measurement (A–F) against the form. **Test** prints a box 1/16″ inside every label (see
   Printing) to check the measurements before designing anything. Changing the label size
   carries the design across, mapping the old safe area onto the new one.
2. **Data** — the records. Open or drop a file, paste cells copied from a spreadsheet, generate a
   number sequence, or start a blank table; then correct cells, rename or add columns, and tick
   records out of the merge.
3. **Design** — the label. Text, address blocks, images, QR codes, Code 128 barcodes, rectangles,
   ellipses and lines, dragged and resized on the canvas (EbDraggable and EbResizeBox) with
   snapping to a 1/32″ grid (0.5 mm in millimetres) — arrows move one step, Shift+arrows ¼″
   (5 mm) — layered with a sortable list, and edited in the inspector. Step through the records
   to see each label; the status bar names the records whose text will not fit even shrunk, or
   whose barcode value cannot be encoded.
4. **Print** — copies per record (grouped or collated), fill order, positions already used on a
   partly used sheet, a page-by-page preview, label outlines for test runs, and per-printer
   calibration (offset and stretch) with the same test sheet.

Templates (the sheet and the design, never the data) are saved by name in the browser through
EbSaveMenu, or exported and imported as `.json` files.

### Data formats

| Format | Notes |
| --- | --- |
| CSV, TSV, semicolon- or pipe-separated text | RFC 4180 quoting; the separator, header row and encoding are detected (UTF-8, UTF-16, or Windows-1252 for Excel's Windows CSVs) and can be changed afterwards without reopening the file. |
| Excel `.xlsx` | Every worksheet, shared strings and rich text, and number formats applied as Excel displays them — so ZIP codes keep their leading zeros (`00000`, `00000-0000`), phone formats and dates come out right. Read with a small built-in ZIP and XML reader; no dependencies. The old binary `.xls` is refused with instructions. |
| JSON | An array of objects (or of arrays), optionally inside a wrapper object; nested objects flatten to `address.city`. |
| vCard `.vcf` | Versions 2.1–4.0: folded lines, quoted-printable, `TYPE=` parameters. The preferred postal address is split into Address / Address 2 / City / State / ZIP. |
| Pasted cells | Tab-separated text from Excel, Google Sheets or Numbers. |
| Numbers | A sequence with start, count, step and zero padding — for asset tags and tickets. |

Loading data puts its fields on the label, so the Design step opens ready to merge: an address
list becomes an address block (recognising common English, French, German, Spanish and Dutch
column names), anything else every column, one per line. That happens on its own when the label
still has the starter text, uses none of the new data's fields, or has no fields at all — keeping
the text element's place and style, and announced with a toast; Ctrl+Z puts the old text back. A
label that already shares some fields with the data is left as it is and you are asked. On the
Design step, the field chips are ticked when their field is on the label, and **Add all fields**
adds a block with every column.

### Template syntax

| Write | Gets |
| --- | --- |
| `{{First Name}}` | That column of the record. Matched exactly, then ignoring case and spacing. |
| `{{City\|upper}}` | Filters: `upper`, `lower`, `title`, `trim`, chainable. |
| `{{#}}` | The record's row number — or, with no data loaded, the label's number in the job. |

A line whose every field is empty is skipped (switchable per text element), so a missing
"Address 2" closes up. Text shrinks to fit its box down to a minimum size; the line breaks are
computed once, in inches, so the designer, the preview and the printed page break identically.

The Shipping Store's geometry comes from their own online Label Designer, which embeds each
layout's measurements in millimetres; `src/model/presets-tss.ts` keeps them exactly as published
(October 2026) and says how to refresh them when new templates appear. The other US Letter
sheets (`presets-letter.ts`) come from OnlineLabels' and Avery's published template specs; the A4
sheets (`presets-a4.ts`) from Herma's die templates, or Label Planet's where Herma has no match,
since Avery publishes only A4 label sizes. A preset whose margins came from another maker's sheet
of the same size says so. Every preset is tested to fit its page with even margins.

## Printing

Pages are rendered into their own root under `<body>` that is hidden on screen and is the only
thing shown in print media, with an `@page` rule for the stock and zero margins. In the print
dialog choose **Scale: 100%** and turn off headers and footers. Ctrl+P works from any step, and
so does the browser's own Print menu.

Check new stock with the **test sheet** (the Test button on the Sheet step, or Print test sheet
under calibration): a numbered box drawn 1/16″ inside every label — less on labels under ⅝″ —
following the label's shape. Print it on the labels, or on plain paper held against a sheet in
front of a window. If the measurements are right, every box sits inside its label with an even
gap all round. A box over an edge means something is off: if every box is off the same way, fix
the margins or use the calibration offsets (half the difference between opposite gaps); if the
boxes drift further off across or down the page, a gap or the label size is wrong — or, when the
measurements are known good, use the stretch. Calibration belongs to the browser (that is, the
printer), not to the template, and the test sheet applies it like any print.

## Project layout

```
src/
  model/       Plain data and logic: types, units, presets, sheet geometry, merge, text layout,
               pagination, fitting a design to a new size, sanitising loaded files
  import/      CSV, encoding detection, ZIP, XML, .xlsx and number formats, JSON, vCard, sequences
  codes/       QR code (versions 1–40) and Code 128 encoders
  render/      Fonts and text measuring, drawing elements, pages, the print root, the job
  state/       The store (with undo), autosave and preferences
  features/    The four steps
  components/  Form fields the suite lacks, icons, the error boundary
tests/         node --test suites for model/, import/ and codes/
```

The QR and Code 128 encoders were also checked end to end against independent decoders (jsQR,
ZXing) across QR versions 1–40, every error-correction level, and every Code 128 code-set switch.

## Notes on the component suite

These behaviours of `@electricblazor/react` 0.17.0 are worked around here and worth fixing upstream:

- **EbDraggable handles arrow keys from its whole subtree**, so arrows on a focused EbResizeBox
  handle inside it both resize and move the box. The canvas intercepts those keys in the capture
  phase and performs the resize itself (`features/design/Canvas.tsx`).
- **EbDraggable drops its position when a drag starts.** While dragging it leaves `left`/`top` out
  of its inline style, React clears them, and the element sits at its container's top left from
  the press until the pointer first moves. The canvas also passes the position as custom
  properties, which the stylesheet uses to hold the element in place (`features/design/Canvas.tsx`).
- **EbTabbedCard handles its tab keys on its whole root**, panel included, so arrows, Home and End
  in a text box switched steps instead of moving the caret. The app stops those keys at the panel
  (`App.tsx`).
- **EbSaveMenu's Save As dialog does not focus its name box** when it opens, and its load callback
  receives only the value, not the name it was saved under. The app wraps the template store so a
  template saved as "Shipping labels" is named that (`state/persistence.ts`); the focus issue has
  no workaround from outside the component.
