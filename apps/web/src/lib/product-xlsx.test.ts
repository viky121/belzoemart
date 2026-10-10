import ExcelJS from 'exceljs';
import {
  OLD_FORMAT_MESSAGE,
  SHEET_COLUMNS,
  exportRowToInput,
  type SheetExport,
  type SheetExportRow,
  type SheetKey,
} from '@belzo/shared';
import { NO_SKU_COLUMN_MESSAGE } from '@/lib/product-sheet';
import {
  READ_FAILED_MESSAGE,
  buildProductWorkbook,
  cellToString,
  readProductWorkbook,
} from '@/lib/product-xlsx';

const FR1_HEADERS = SHEET_COLUMNS.map((c) => c.header);

/** A full SheetExportRow with every unspecified cell blank. */
function exportRow(r: Partial<SheetExportRow> & Pick<SheetExportRow, 'indicator' | 'sku'>): SheetExportRow {
  const base = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, null])) as unknown as SheetExportRow;
  return { ...base, ...r };
}

const FIXTURE: SheetExport = {
  rows: [
    exportRow({
      indicator: 'Parent',
      sku: 'TSHIRT-001',
      finalDetail: 'Herbal Tea',
      brand: 'Zara',
      title: "Men's Cotton Slim Fit T-Shirt",
      description: 'High quality 100% cotton casual t-shirt for men.',
      colour: 'Blue',
      hsnCode: '0910 30',
      taxType: 'Inclusive',
      gstRate: '12%',
      image1: 'https://cdn.example/a.jpg',
      image2: '/uploads/b.jpg',
      dimensions: '30x20x2',
    }),
    exportRow({
      indicator: 'Child',
      parentSku: 'TSHIRT-001',
      sku: 'TSHIRT-001-S',
      finalDetail: 'Herbal Tea',
      brand: 'Zara',
      title: "Men's Cotton Slim Fit T-Shirt - S / Blue",
      description: 'High quality 100% cotton casual t-shirt for men.',
      colour: 'Blue',
      size: 'S',
      weightKg: 0.2,
      hsnCode: '0910 30',
      taxType: 'Inclusive',
      gstRate: '12%',
      mrp: 999,
      sellingPrice: 799.5,
      purchasePrice: 790,
      stock: 50,
      packOf: 1,
      tier1: (1 - 79950 / 99900) * 100,
      tier2: 22,
      tier3: (1 - 74925 / 99900) * 100,
      tier4: 18.0018,
      tier5: 30,
    }),
    exportRow({
      indicator: 'Parent',
      sku: '00123',
      title: '=1+1',
      gstRate: '3%',
      taxType: 'Inclusive',
      weightKg: 1,
      mrp: 100,
      sellingPrice: 100,
      stock: 0,
      packOf: 2,
    }),
  ],
  categories: [
    { label: 'Herbal Tea', slug: 'herbal-tea', path: 'Tea › Herbal Tea' },
    { label: 'green-tea', slug: 'green-tea', path: 'Tea › Green Tea' },
  ],
};

async function load(buf: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Buffer);
  return wb;
}

/** Write a raw workbook (header row + data rows by row number) for reader tests. */
async function rawWorkbook(
  headers: string[],
  rows: Record<number, unknown[]>,
  sheetName = 'Products',
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.getRow(1).values = headers;
  for (const [n, cells] of Object.entries(rows)) {
    const row = ws.getRow(Number(n));
    cells.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c !== null && typeof c === 'object' && 'value' in (c as object)) {
        const spec = c as { value: ExcelJS.CellValue; numFmt?: string };
        cell.value = spec.value;
        if (spec.numFmt) cell.numFmt = spec.numFmt;
      } else {
        cell.value = c as ExcelJS.CellValue;
      }
    });
  }
  return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}

const col = (key: SheetKey): number => SHEET_COLUMNS.findIndex((c) => c.key === key) + 1;

describe('buildProductWorkbook', () => {
  let wb: ExcelJS.Workbook;
  beforeAll(async () => {
    wb = await load(await buildProductWorkbook(FIXTURE));
  });

  it('has the Products, Instructions and Categories sheets', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Products', 'Instructions', 'Categories']);
  });

  it('writes the exact FR-1 header row, bold and frozen', () => {
    const ws = wb.getWorksheet('Products')!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(FR1_HEADERS);
    expect(headers).toHaveLength(29);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(1).getCell(29).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('puts list validations on A2, L2, M2 and D2', () => {
    const ws = wb.getWorksheet('Products')!;
    expect(ws.getCell('A2').dataValidation).toMatchObject({ type: 'list', formulae: ['"Parent,Child"'] });
    expect(ws.getCell('L2').dataValidation).toMatchObject({ type: 'list', formulae: ['"Inclusive,Exclusive"'] });
    expect(ws.getCell('M2').dataValidation).toMatchObject({ type: 'list', formulae: ['"0%,5%,12%,18%,28%"'] });
    expect(ws.getCell('D2').dataValidation).toMatchObject({ type: 'list', formulae: ['Categories!$A$2:$A$3'] });
    expect(ws.getCell('A1000').dataValidation).toMatchObject({ type: 'list' });
    expect(ws.getCell('A2').dataValidation.errorStyle).toBe('warning');
  });

  it('lists the categories', () => {
    const ws = wb.getWorksheet('Categories')!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Name (use in Final detail)', 'Slug', 'Path']);
    expect((ws.getRow(2).values as unknown[]).slice(1)).toEqual(['Herbal Tea', 'herbal-tea', 'Tea › Herbal Tea']);
    expect((ws.getRow(3).values as unknown[]).slice(1)).toEqual(['green-tea', 'green-tea', 'Tea › Green Tea']);
  });

  it('writes percents as fractions with 0% / 0.00% formats, money 0.00, kg General, text @', () => {
    const ws = wb.getWorksheet('Products')!;
    const child = ws.getRow(3);
    expect(child.getCell(col('tier2')).value).toBeCloseTo(0.22, 12);
    expect(child.getCell(col('tier2')).numFmt).toBe('0%');
    expect(child.getCell(col('tier4')).numFmt).toBe('0.00%');
    expect(child.getCell(col('mrp')).numFmt).toBe('0.00');
    expect(child.getCell(col('stock')).numFmt).toBe('0');
    expect(child.getCell(col('weightKg')).value).toBe(0.2);
    expect(child.getCell(col('weightKg')).numFmt ?? 'General').toBe('General');
    expect(child.getCell(col('sku')).numFmt).toBe('@');
    expect(child.getCell(col('gstRate')).value).toBe('12%');
  });

  it('writes "=1+1" as a literal string, not a formula', () => {
    const ws = wb.getWorksheet('Products')!;
    expect(ws.getRow(4).getCell(col('title')).value).toBe('=1+1');
  });

  it('Instructions include rule 16b and the rule-10 note about the editor', () => {
    const ws = wb.getWorksheet('Instructions')!;
    expect(ws.getColumn(1).width).toBe(110);
    expect(ws.getRow(1).font?.bold).toBe(true);
    const texts: string[] = [];
    ws.eachRow((r) => texts.push(String(r.getCell(1).value)));
    expect(texts).toContain(
      '16b. Deleting a row from the sheet does not delete the product or variant. To remove a variant, use Remove in the product editor.',
    );
    const rule10 = texts.find((t) => t.startsWith('10. '))!;
    expect(rule10.endsWith(
      `Note: the product editor's "Bulk tiers" tool takes % off the Selling Price. The sheet takes % off MRP.`,
    )).toBe(true);
    expect(texts.findIndex((t) => t.startsWith('16b. '))).toBe(texts.findIndex((t) => t.startsWith('16. ')) + 1);
  });

  it('an empty export gives the two italic EXAMPLE rows and no category validation', async () => {
    const empty = await load(await buildProductWorkbook({ rows: [], categories: [] }));
    const ws = empty.getWorksheet('Products')!;
    expect(ws.getRow(2).getCell(col('sku')).value).toBe('EXAMPLE-TSHIRT');
    expect(ws.getRow(3).getCell(col('sku')).value).toBe('EXAMPLE-TSHIRT-M');
    expect(ws.getRow(2).getCell(1).font?.italic).toBe(true);
    expect(ws.getRow(4).hasValues).toBe(false);
    expect(ws.getCell('D2').dataValidation).toBeUndefined();

    const parsed = await readProductWorkbook(await buildProductWorkbook({ rows: [], categories: [] }));
    expect(parsed.rows.map((r) => r.sku)).toEqual(['EXAMPLE-TSHIRT', 'EXAMPLE-TSHIRT-M']);
    expect(parsed.rows[1]).toMatchObject({ mrp: '999', sellingPrice: '799', tier1: '20%', tier5: '30%', weightKg: '0.22' });
  });
});

describe('readProductWorkbook', () => {
  it('round-trips buildProductWorkbook output to the rows the client sends', async () => {
    const parsed = await readProductWorkbook(await buildProductWorkbook(FIXTURE));
    expect(parsed.fatal).toBeUndefined();
    expect(parsed.issues).toEqual([]);
    expect(parsed.weightUnitHint).toBe('kg');
    expect(parsed.rows).toEqual(FIXTURE.rows.map((r, i) => exportRowToInput(r, i + 2)));
  });

  it('normalises text "20%", numeric 0.2 with 0%, numeric SKU/HSN, hyperlinks and money', async () => {
    const headers = ['Parent/Child Indicator', 'SKU', 'HSN Code', 'Bulk Tier 1 (1-4 units) Discount %',
      'Bulk Tier 2 (5-8 units) Discount %', 'image 1 (main image )', 'image 2', 'MRP (INR)', 'Weight (g)', 'GST Rate'];
    const buf = await rawWorkbook(headers, {
      2: [
        'Parent',
        12345,
        61091000,
        '20%',
        { value: 0.2, numFmt: '0%' },
        { text: 'photo', hyperlink: 'https://cdn.example/p.jpg' },
        { text: 'local.jpg', hyperlink: 'mailto:x@y' },
        { value: 999.5, numFmt: '0.00' },
        0.25,
        { value: 0.12, numFmt: '0%' },
      ],
    });
    const parsed = await readProductWorkbook(buf);
    expect(parsed.weightUnitHint).toBe('g');
    expect(parsed.rows).toEqual([
      {
        row: 2, indicator: 'Parent', sku: '12345', hsnCode: '61091000', tier1: '20%', tier2: '20%',
        image1: 'https://cdn.example/p.jpg', image2: 'local.jpg', mrp: '999.5', weightKg: '0.25', gstRate: '0.12',
      },
    ]);
  });

  it('reads numbers as plain digits (1e21, 1e-7)', async () => {
    const buf = await rawWorkbook(['SKU', 'MRP (INR)', 'Selling Price (INR)'], { 2: ['A', 1e21, 1e-7] });
    const parsed = await readProductWorkbook(buf);
    expect(parsed.rows[0]).toEqual({ row: 2, sku: 'A', mrp: '1000000000000000000000', sellingPrice: '0.0000001' });
  });

  it('keeps real row numbers across blank rows 5–6', async () => {
    const buf = await rawWorkbook(['SKU', 'Title'], {
      2: ['A', 'a'], 3: ['B', 'b'], 4: ['C', 'c'], 7: ['D', 'd'], 8: ['E', 'e'], 9: ['F', 'f'],
    });
    const parsed = await readProductWorkbook(buf);
    expect(parsed.rows.map((r) => [r.row, r.sku])).toEqual([
      [2, 'A'], [3, 'B'], [4, 'C'], [7, 'D'], [8, 'E'], [9, 'F'],
    ]);
  });

  it('picks the first sheet with a SKU header when there is no Products sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Notes').getRow(1).values = ['hello'];
    const ws = wb.addWorksheet('Sheet2');
    ws.getRow(1).values = ['SKU', 'Title'];
    ws.getRow(2).values = ['A', 'a'];
    const parsed = await readProductWorkbook((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer);
    expect(parsed.rows).toEqual([{ row: 2, sku: 'A', title: 'a' }]);
  });

  it('a non-template workbook is fatal', async () => {
    const parsed = await readProductWorkbook(await rawWorkbook(['Name', 'Price'], { 2: ['x', 1] }, 'Sheet1'));
    expect(parsed.fatal).toBe(NO_SKU_COLUMN_MESSAGE);
    expect(parsed.rows).toEqual([]);
  });

  it('the old CSV header re-saved as .xlsx is fatal with OLD_FORMAT_MESSAGE', async () => {
    const old = ['sku', 'title', 'categorySlug', 'mrp', 'sellingPrice', 'description', 'brand', 'hsnCode',
      'taxRatePct', 'stock', 'status', 'imageUrl'];
    const parsed = await readProductWorkbook(
      await rawWorkbook(old, { 2: ['RICE-5KG', 'Rice', 'rice', 899, 799] }, 'belzo-products-2026-01-05'),
    );
    expect(parsed.fatal).toBe(OLD_FORMAT_MESSAGE);
    expect(parsed.rows).toEqual([]);
  });

  it('non-zip bytes give the "Could not read this Excel file" fatal', async () => {
    const parsed = await readProductWorkbook(new TextEncoder().encode('not a zip file').buffer as ArrayBuffer);
    expect(parsed.fatal).toBe(READ_FAILED_MESSAGE);
  });
});

describe('cellToString', () => {
  it('handles rich text, formulas, errors, booleans and dates', () => {
    expect(cellToString({ richText: [{ text: ' Ab' }, { text: 'c ' }] }, undefined, 'text')).toBe('Abc');
    expect(cellToString({ formula: 'A1*2', result: 12 }, undefined, 'money')).toBe('12');
    expect(cellToString({ sharedFormula: 'A1', result: 'x' }, undefined, 'text')).toBe('x');
    expect(cellToString({ error: '#N/A' }, undefined, 'text')).toBe('');
    expect(cellToString(true, undefined, 'text')).toBe('TRUE');
    expect(cellToString(new Date(Date.UTC(2026, 0, 5)), undefined, 'text')).toBe('2026-01-05');
    expect(cellToString(null, undefined, 'text')).toBe('');
    expect(cellToString(0.22, '0%', 'percent')).toBe('22%');
    expect(cellToString(0.22, 'General', 'percent')).toBe('0.22');
    expect(cellToString(12.5, undefined, 'sku')).toBe('12.5');
  });
});
