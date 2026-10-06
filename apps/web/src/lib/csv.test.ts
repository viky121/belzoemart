import { CSV_BOM, parseCsv, toCsv } from '@/lib/csv';
import {
  PRODUCT_CSV_COLUMNS,
  buildProductsCsv,
  productsCsvFilename,
  type ProductExportRow,
} from '@/lib/product-csv';

describe('csv — toCsv', () => {
  it('quotes comma/quote/newline fields, doubles inner quotes, leaves plain fields bare', () => {
    const out = toCsv(['a', 'b', 'c', 'd', 'e'], [
      { a: 'plain', b: 'x,y', c: 'say "hi"', d: 'line1\nline2', e: 'cr\rhere' },
    ]);
    expect(out).toBe('a,b,c,d,e\r\nplain,"x,y","say ""hi""","line1\nline2","cr\rhere"\r\n');
  });

  it('renders null/undefined as empty cells and numbers as-is', () => {
    expect(toCsv(['a', 'b', 'c'], [{ a: null, b: undefined, c: 799.5 }])).toBe('a,b,c\r\n,,799.5\r\n');
  });
});

describe('csv — parseCsv', () => {
  it('strips a leading BOM so the first header is "sku"', () => {
    const rows = parseCsv(`${CSV_BOM}sku,title\nA1,Tea\n`);
    expect(Object.keys(rows[0]!)[0]).toBe('sku');
    expect(rows).toEqual([{ sku: 'A1', title: 'Tea' }]);
  });

  it('skips blank records, trims cells and fills missing cells with ""', () => {
    expect(parseCsv('a,b,c\r\n\r\n x , y \r\n,,\r\nonly\r\n')).toEqual([
      { a: 'x', b: 'y', c: '' },
      { a: 'only', b: '', c: '' },
    ]);
  });
});

describe('product-csv', () => {
  const row: ProductExportRow = {
    sku: 'RICE-5KG',
    title: 'Basmati Rice, 5kg "Premium"',
    categorySlug: 'rice',
    mrp: 899,
    sellingPrice: 799.5,
    description: 'Line one ₹ 899\r\nदूसरी पंक्ति, "quoted"',
    brand: 'Belzo',
    hsnCode: '1006',
    taxRatePct: 5,
    stock: 100,
    status: 'published',
    imageUrl: 'https://a/x.jpg|/uploads/y.png',
  };

  it('keeps the bulk upload column order', () => {
    expect([...PRODUCT_CSV_COLUMNS]).toEqual([
      'sku',
      'title',
      'categorySlug',
      'mrp',
      'sellingPrice',
      'description',
      'brand',
      'hsnCode',
      'taxRatePct',
      'stock',
      'status',
      'imageUrl',
    ]);
  });

  it('round-trips through parseCsv (BOM, quotes, multi-line, ₹ and Hindi, images)', () => {
    const csv = buildProductsCsv([row]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      ...row,
      mrp: '899',
      sellingPrice: '799.5',
      taxRatePct: '5',
      stock: '100',
    });
  });

  it('names the file belzo-products-YYYY-MM-DD.csv', () => {
    expect(productsCsvFilename(new Date(2026, 0, 5))).toBe('belzo-products-2026-01-05.csv');
  });
});
