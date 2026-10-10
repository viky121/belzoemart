/**
 * Build and read the Belzo product workbook (.xlsx). No React. `exceljs` is
 * loaded lazily with a dynamic import, so it only ever lands in an async
 * chunk fetched by the admin download/upload handlers (storefront bundles
 * are unaffected).
 */
import type { CellValue, Workbook, Worksheet } from 'exceljs';
import type { SheetCellKind, SheetExport, SheetExportRow, SheetRowInput } from '@belzo/shared';
import { SHEET_COLUMNS, SHEET_NAME, canonicalHeader } from './shared-bulk-sheet';
import {
  NO_SKU_COLUMN_MESSAGE,
  finishSheet,
  readSheetHeader,
  toSheetRow,
  type ParsedSheet,
} from './product-sheet';

export type { ParsedSheet } from './product-sheet';

type ExcelModule = typeof import('exceljs');

async function loadExcel(): Promise<ExcelModule> {
  const mod = await import('exceljs');
  return ((mod as { default?: unknown }).default ?? mod) as ExcelModule;
}

export const READ_FAILED_MESSAGE = 'Could not read this Excel file. Open it in Excel, save it as .xlsx and try again.';
export const LOAD_FAILED_MESSAGE = 'Could not load the Excel reader. Refresh the page and try again.';

const HEADER_FILL = 'FFE5E7EB';
const EXAMPLE_FILL = 'FFFEF3C7';
const LAST_COL = 'AC';

/** Instructions sheet text, one rule per row (design §7, plus review NITs 4 and 12). */
const INSTRUCTIONS: readonly string[] = [
  '1. Belzo product sheet — one file for download and upload. Keep the header row exactly as it is. Upload at most 5,000 rows at a time — split larger files (keep each product\'s Parent and Child rows together).',
  '2. Parent row = the product (Title, Description, Final detail = category, Brand, HSN, GST, Tax Type, Colour, dimention). Child row = one variant (size, colour, pack) of the Parent named in Parent SKU.',
  '3. A product with a single variant can be one Parent row with MRP and Selling Price filled (its SKU is the variant SKU).',
  '4. A Child whose Parent SKU is not in the file is added to the existing product with that Parent SKU.',
  "5. SKU and Parent SKU match existing products exactly, including upper/lower case (TSHIRT-001 and tshirt-001 are different SKUs). Don't change them on existing rows: a changed Child SKU is added as a new variant, and a changed Parent SKU of an existing product is rejected once that product's Parent SKU has been saved.",
  '6. Final detail: pick a category from the list (Categories sheet). The category name or slug both work.',
  '7. Prices are in rupees. Selling Price is the price for 1–4 units. MRP is always GST-inclusive.',
  '8. Tax Type: Inclusive (default) = prices already include GST. Exclusive = we add the GST Rate to the Selling Price when importing (purchasing price is not changed). After adding GST the Selling Price must not exceed MRP.',
  '9. GST Rate must be 0%, 5%, 12%, 18% or 28%.',
  '10. Bulk Tiers are % OFF MRP. Tier 1 (1–4 units) is for reference only — the Selling Price is used. Tiers 2–5 set the price per unit from 5, 9, 13 and 21 units in the cart. A tier that is not cheaper than the Selling Price (or the tier before it) is skipped with a warning. If every filled tier is skipped, that variant has no bulk prices after the import. Leave all of tiers 2–5 blank to keep the current bulk prices. Note: the product editor\'s "Bulk tiers" tool takes % off the Selling Price. The sheet takes % off MRP.',
  "11. If a product has custom bulk prices set in the editor that don't fit these ranges, the tier cells are left blank — re-uploading keeps those prices.",
  '12. Weight is in kg (e.g. 0.25 for 250 g).',
  '13. Pack Of: number of items in the pack (1 = single).',
  '14. purchasing price is for your records only. Customers never see it.',
  "15. Images: put a full link (https://…), or the file name of an image you select on the upload page. image 1 on the Parent row is the main image. Filled image cells REPLACE the product's images in that order. All blank keeps the current images. image 1 on a Child row is that variant's photo. For a NEW product with no Parent images, the Child images become its gallery. If the product has more than 5 images and you leave the first 5 as they are, the extra images are kept; remove them in the product editor. If all image cells of a row are blank, selected files named after that row's SKU (e.g. TSHIRT-001.jpg, TSHIRT-001-2.jpg) are used; a file goes to the longest SKU it matches, so TSHIRT-001-S.jpg belongs to the Child TSHIRT-001-S.",
  '16. Blank cells keep the current value for existing products.',
  '16b. Deleting a row from the sheet does not delete the product or variant. To remove a variant, use Remove in the product editor.',
  '17. ⚠ Quantity/Stock overwrites live stock. If orders came in after you downloaded, clear the stock cells unless you have just counted stock.',
  '18. Example rows (SKU starting with EXAMPLE-) are skipped.',
  '19. You can also upload this sheet saved as CSV UTF-8 (Comma delimited) with the same headers in row 1. The old CSV format is no longer accepted.',
];

type ExampleRow = Partial<Record<keyof SheetExportRow, string | number | null>>;

function exampleRows(firstCategory: string | null): ExampleRow[] {
  return [
    {
      indicator: 'Parent',
      sku: 'EXAMPLE-TSHIRT',
      finalDetail: firstCategory,
      brand: 'Zara',
      title: "EXAMPLE – Men's Cotton T-Shirt (delete this row)",
      description: 'Example only — delete these two rows.',
      colour: 'Blue',
      hsnCode: '61091000',
      taxType: 'Inclusive',
      gstRate: '12%',
    },
    {
      indicator: 'Child',
      parentSku: 'EXAMPLE-TSHIRT',
      sku: 'EXAMPLE-TSHIRT-M',
      size: 'M',
      weightKg: 0.22,
      mrp: 999,
      sellingPrice: 799,
      purchasePrice: 790,
      stock: 65,
      packOf: 1,
      tier1: 20,
      tier2: 22,
      tier3: 25,
      tier4: 28,
      tier5: 30,
    },
  ];
}

const NUM_FMT: Partial<Record<SheetCellKind, string>> = { money: '0.00', kg: 'General', int: '0' };

function writeDataRow(ws: Worksheet, data: ExampleRow, example: boolean): void {
  const row = ws.addRow([]);
  SHEET_COLUMNS.forEach((c, i) => {
    const v = data[c.key];
    if (v === null || v === undefined || v === '') return;
    const cell = row.getCell(i + 1);
    if (typeof v === 'number') {
      if (c.kind === 'percent') {
        cell.value = v / 100;
        cell.numFmt = Math.abs(v - Math.round(v)) < 1e-6 ? '0%' : '0.00%';
      } else {
        cell.value = v;
        cell.numFmt = NUM_FMT[c.kind] ?? 'General';
      }
    } else {
      // Plain string -> shared string, never a formula ('=…' / '+…' stay literal).
      cell.value = v;
    }
  });
  if (example) {
    for (let c = 1; c <= SHEET_COLUMNS.length; c += 1) {
      const cell = row.getCell(c);
      cell.font = { italic: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXAMPLE_FILL } };
    }
  }
}

function colLetter(key: string): string {
  const i = SHEET_COLUMNS.findIndex((c) => c.key === key);
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Build the Products / Instructions / Categories workbook from the export JSON. */
export async function buildProductWorkbook(data: SheetExport): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcel();
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = 'Belzo eMart';

  // --- Products
  const ws = wb.addWorksheet(SHEET_NAME);
  ws.columns = SHEET_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    ...(c.kind === 'text' || c.kind === 'sku' || c.kind === 'image' ? { style: { numFmt: '@' } } : {}),
  }));
  const head = ws.getRow(1);
  head.height = 32;
  head.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = `A1:${LAST_COL}1`;

  if (data.rows.length === 0) {
    for (const r of exampleRows(data.categories[0]?.label ?? null)) writeDataRow(ws, r, true);
  } else {
    for (const r of data.rows) writeDataRow(ws, r, false);
  }

  const lastRow = ws.rowCount;
  const until = Math.max(1000, lastRow + 200);
  const n = data.categories.length;
  const lists: { col: string; formulae: string[]; error: string }[] = [
    { col: colLetter('indicator'), formulae: ['"Parent,Child"'], error: 'Use Parent or Child.' },
    { col: colLetter('taxType'), formulae: ['"Inclusive,Exclusive"'], error: 'Use Inclusive or Exclusive.' },
    { col: colLetter('gstRate'), formulae: ['"0%,5%,12%,18%,28%"'], error: 'Use 0%, 5%, 12%, 18% or 28%.' },
    ...(n > 0
      ? [
          {
            col: colLetter('finalDetail'),
            formulae: [`Categories!$A$2:$A$${n + 1}`],
            error: 'Pick a category from the Categories sheet (a slug also works).',
          },
        ]
      : []),
  ];
  for (const l of lists) {
    for (let r = 2; r <= until; r += 1) {
      ws.getCell(`${l.col}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Not in the list',
        error: l.error,
        formulae: l.formulae,
      };
    }
  }

  // --- Instructions
  const ins = wb.addWorksheet('Instructions');
  ins.getColumn(1).width = 110;
  const title = ins.addRow(['How to use the Belzo product sheet']);
  title.font = { bold: true, size: 14 };
  for (const rule of INSTRUCTIONS) {
    ins.addRow([rule]).getCell(1).alignment = { wrapText: true, vertical: 'top' };
  }

  // --- Categories
  const cats = wb.addWorksheet('Categories');
  cats.columns = [
    { header: 'Name (use in Final detail)', key: 'label', width: 30 },
    { header: 'Slug', key: 'slug', width: 30 },
    { header: 'Path', key: 'path', width: 50 },
  ];
  cats.getRow(1).font = { bold: true };
  cats.views = [{ state: 'frozen', ySplit: 1 }];
  for (const c of data.categories) cats.addRow({ label: c.label, slug: c.slug, path: c.path });

  return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Number -> plain decimal text (never exponent notation). */
function plainNumber(v: number): string {
  const s = String(v);
  if (!/e/i.test(s)) return s;
  return v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Normalise one exceljs cell value to the text the import parsers expect. */
export function cellToString(value: unknown, numFmt: string | undefined, kind: SheetCellKind): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (kind === 'percent' && numFmt && numFmt.includes('%')) {
      return `${plainNumber(Number((value * 100).toPrecision(15)))}%`;
    }
    if (kind === 'sku' && Number.isInteger(value)) return value.toFixed(0);
    return plainNumber(value);
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((t) => t.text ?? '')
        .join('')
        .trim();
    }
    if ('hyperlink' in o) {
      const link = typeof o.hyperlink === 'string' ? o.hyperlink.trim() : '';
      if (kind === 'image' && /^https?:\/\//i.test(link)) return link;
      return cellToString(o.text, numFmt, kind);
    }
    if ('formula' in o || 'sharedFormula' in o) return cellToString(o.result, numFmt, kind);
    if ('error' in o) return '';
    if ('text' in o) return cellToString(o.text, numFmt, kind);
  }
  return '';
}

function headerTexts(ws: Worksheet): string[] {
  const row = ws.getRow(1);
  const out: string[] = [];
  for (let c = 1; c <= ws.columnCount; c += 1) out.push(cellToString(row.getCell(c).value, undefined, 'text'));
  return out;
}

function pickSheet(wb: Workbook): Worksheet | undefined {
  const named = wb.worksheets.find((w) => w.name.trim().toLowerCase() === SHEET_NAME.toLowerCase());
  if (named) return named;
  return wb.worksheets.find((w) => headerTexts(w).some((h) => canonicalHeader(h) === 'sku'));
}

/** Read an uploaded .xlsx into sheet rows (row = the spreadsheet row number). */
export async function readProductWorkbook(buf: ArrayBuffer): Promise<ParsedSheet> {
  let ExcelJS: ExcelModule;
  try {
    ExcelJS = await loadExcel();
  } catch {
    return { rows: [], issues: [], fatal: LOAD_FAILED_MESSAGE, weightUnitHint: null };
  }
  const wb: Workbook = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as Parameters<Workbook['xlsx']['load']>[0]);
  } catch {
    return { rows: [], issues: [], fatal: READ_FAILED_MESSAGE, weightUnitHint: null };
  }

  const ws = pickSheet(wb);
  if (!ws) return { rows: [], issues: [], fatal: NO_SKU_COLUMN_MESSAGE, weightUnitHint: null };
  const header = readSheetHeader(headerTexts(ws));
  if (header.fatal) {
    return { rows: [], issues: [], fatal: header.fatal, weightUnitHint: header.mapping.weightUnitHint };
  }

  // eachRow with includeEmpty: false visits every non-empty row up to the last
  // one (unlike looping to actualRowCount, which is a count, not a row number).
  const rows: SheetRowInput[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const r = toSheetRow(rowNumber, header.mapping, (col, kind) => {
      const cell = row.getCell(col + 1);
      return cellToString(cell.value as CellValue, cell.numFmt, kind);
    });
    if (r) rows.push(r);
  });
  return finishSheet(rows, header);
}
