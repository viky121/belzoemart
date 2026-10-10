import { OLD_FORMAT_MESSAGE, type SheetGroup, type SheetIssue, type SheetRowInput } from '@belzo/shared';
import {
  NO_SKU_COLUMN_MESSAGE,
  applyResolvedImages,
  assignSkuFiles,
  chunkFailureMessage,
  chunkGroups,
  imageRefs,
  isUrlRef,
  mergeIssues,
  productsXlsxFilename,
  readProductCsv,
  slimChildRow,
  withThrottleRetry,
} from '@/lib/product-sheet';
import { CSV_BOM } from '@/lib/csv';

// The owner's header row, verbatim (incl. "Weight (g)" and the "(Dropdown: …)" suffixes).
const OWNER_HEADERS = [
  'Parent/Child Indicator', 'Parent SKU', 'SKU', 'Final detail', 'Brand', 'Title', 'Description', 'Colour',
  'Size', 'Weight (g)', 'HSN Code', 'Tax Type (Dropdown: Inclusive/Exclusive)',
  'GST Rate (Dropdown: 0%/5%/12%/18%/28%)', 'MRP (INR)', 'Selling Price (INR)', 'purchasing price',
  'Quantity/Stock', 'Pack Of', 'Bulk Tier 1 (1-4 units) Discount %', 'Bulk Tier 2 (5-8 units) Discount %',
  'Bulk Tier 3 (9-12 units) Discount %', 'Bulk Tier 4 (13-20 units) Discount %',
  'Bulk Tier 5 (21+ units) Discount %', 'image 1 (main image )', 'image 2', 'image 3', 'image 4', 'image 5',
  'dimention (LWH)',
];

const csvLine = (cells: string[]): string =>
  cells.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');

describe('readProductCsv', () => {
  const parent = ['Parent', '', 'TSHIRT-001', 'Herbal Tea', '1', "Men's Cotton Slim Fit T-Shirt",
    'High quality, 100% cotton.', 'Blue', '', '', '61091000', 'Inclusive', '12%'];
  const child = ['Child', 'TSHIRT-001', 'TSHIRT-001-S', 'Herbal Tea', 'Zara', 'T-Shirt - Small', '', 'Blue', 'S',
    '0.2', '61091000', 'Inclusive', '12%', '999', '799', '790', '50', '1', '20%', '22%', '25%', '28%', '30%'];

  it("maps the owner's headers and keeps real row numbers across a blank line", () => {
    const text = `${CSV_BOM}${[csvLine(OWNER_HEADERS), csvLine(parent), '', csvLine(child)].join('\r\n')}\r\n`;
    const s = readProductCsv(text);
    expect(s.fatal).toBeUndefined();
    expect(s.issues).toEqual([]);
    expect(s.weightUnitHint).toBe('g');
    expect(s.rows).toEqual([
      {
        row: 2, indicator: 'Parent', sku: 'TSHIRT-001', finalDetail: 'Herbal Tea', brand: '1',
        title: "Men's Cotton Slim Fit T-Shirt", description: 'High quality, 100% cotton.', colour: 'Blue',
        hsnCode: '61091000', taxType: 'Inclusive', gstRate: '12%',
      },
      {
        row: 4, indicator: 'Child', parentSku: 'TSHIRT-001', sku: 'TSHIRT-001-S', finalDetail: 'Herbal Tea',
        brand: 'Zara', title: 'T-Shirt - Small', colour: 'Blue', size: 'S', weightKg: '0.2', hsnCode: '61091000',
        taxType: 'Inclusive', gstRate: '12%', mrp: '999', sellingPrice: '799', purchasePrice: '790', stock: '50',
        packOf: '1', tier1: '20%', tier2: '22%', tier3: '25%', tier4: '28%', tier5: '30%',
      },
    ]);
  });

  it('rejects the old 12-column CSV header with OLD_FORMAT_MESSAGE and returns no rows', () => {
    const text = 'sku,title,categorySlug,mrp,sellingPrice,description,brand,hsnCode,taxRatePct,stock,status,imageUrl\r\n' +
      'RICE-5KG,Basmati,rice,899,799,,Belzo,1006,5,100,published,\r\n';
    const s = readProductCsv(text);
    expect(s.fatal).toBe(OLD_FORMAT_MESSAGE);
    expect(s.rows).toEqual([]);
  });

  it('does not search for the header: a blank record 1 gives the "no SKU column" fatal', () => {
    const s = readProductCsv(`\r\n${csvLine(OWNER_HEADERS)}\r\n${csvLine(parent)}\r\n`);
    expect(s.fatal).toBe(NO_SKU_COLUMN_MESSAGE);
    expect(s.rows).toEqual([]);
  });

  it('warns on row 1 about ignored and repeated columns', () => {
    const s = readProductCsv('SKU,Notes,Title,sku\r\nA1,x,Tea,A2\r\n');
    expect(s.issues).toEqual([
      { row: 1, sku: '', level: 'warning', message: 'Ignored columns: Notes' },
      { row: 1, sku: '', level: 'warning', message: 'Column sku appears twice — the first one is used.' },
    ]);
    expect(s.rows).toEqual([{ row: 2, sku: 'A1', title: 'Tea' }]);
    expect(s.weightUnitHint).toBeNull();
  });

  it('is fatal above 5,000 non-blank data rows', () => {
    const lines = ['SKU,Title'];
    for (let i = 0; i < 5001; i += 1) lines.push(`S${i},T`);
    const s = readProductCsv(lines.join('\n'));
    expect(s.fatal).toMatch(/^Too many rows \(5001\)\. Upload at most 5,000 rows at a time/);
    expect(s.rows).toEqual([]);
  });
});

describe('images', () => {
  it('imageRefs returns non-blank image cells in order; isUrlRef spots links and /paths', () => {
    expect(imageRefs({ row: 2, image1: ' a.jpg ', image3: 'https://x/b.jpg', image5: ' ' })).toEqual([
      'a.jpg',
      'https://x/b.jpg',
    ]);
    expect(isUrlRef('https://x/a.jpg')).toBe(true);
    expect(isUrlRef('HTTP://x/a.jpg')).toBe(true);
    expect(isUrlRef('/uploads/a.jpg')).toBe(true);
    expect(isUrlRef('a.jpg')).toBe(false);
  });

  it('assignSkuFiles gives each file to the longest SKU, exact-name file first', () => {
    const m = assignSkuFiles(
      ['tshirt-001-2.jpg', 'tshirt-001-s.jpg', 'tshirt-001.jpg', 'other.jpg'],
      ['TSHIRT-001', 'TSHIRT-001-S'],
    );
    expect(Object.fromEntries(m)).toEqual({
      'tshirt-001': ['tshirt-001.jpg', 'tshirt-001-2.jpg'],
      'tshirt-001-s': ['tshirt-001-s.jpg'],
    });
  });

  it('assignSkuFiles matches the _ separator and lets case-only SKU twins share files', () => {
    const m = assignSkuFiles(['abc_back.png'], ['ABC', 'abc']);
    expect(Object.fromEntries(m)).toEqual({ abc: ['abc_back.png'] });
  });

  it('applyResolvedImages swaps file names for URLs and keeps links', () => {
    const row: SheetRowInput = { row: 3, sku: 'A', image1: 'a.jpg', image2: 'https://x/b.jpg', image3: '/u/c.png' };
    const res = applyResolvedImages(row, (ref) => (ref === 'a.jpg' ? 'https://cdn/a.webp' : undefined));
    expect(res).toEqual({
      row: { row: 3, sku: 'A', image1: 'https://cdn/a.webp', image2: 'https://x/b.jpg', image3: '/u/c.png' },
    });
  });

  it('applyResolvedImages reports a missing or failed file', () => {
    expect(applyResolvedImages({ row: 2, image2: 'x.jpg' }, () => undefined)).toEqual({
      error: 'image file "x.jpg" was not selected in step 2',
    });
    expect(applyResolvedImages({ row: 2, image1: 'x.jpg' }, () => ({ error: 'image upload failed for "x.jpg": boom' })))
      .toEqual({ error: 'image upload failed for "x.jpg": boom' });
  });
});

describe('slimChildRow', () => {
  it('drops title and description, keeps everything else', () => {
    const row: SheetRowInput = { row: 4, indicator: 'Child', sku: 'A-S', title: 'T', description: 'D', size: 'S' };
    expect(slimChildRow(row)).toEqual({ row: 4, indicator: 'Child', sku: 'A-S', size: 'S' });
    expect(row.title).toBe('T');
  });
});

describe('chunkGroups', () => {
  const group = (key: string, start: number, children: number, extra: Partial<SheetRowInput> = {}): SheetGroup => ({
    key,
    parent: { row: start, indicator: 'Parent', sku: key, title: 'Title', ...extra },
    children: Array.from({ length: children }, (_, i) => ({
      row: start + 1 + i,
      indicator: 'Child',
      parentSku: key,
      sku: `${key}-${i}`,
      title: 'Child title',
      description: 'Child description',
    })),
  });
  const bytes = (rows: SheetRowInput[]): number => new TextEncoder().encode(JSON.stringify({ rows })).length;

  it('never splits a group and slims child rows', () => {
    const { chunks, issues } = chunkGroups([group('A', 2, 3), group('B', 6, 3)], { maxRows: 5, maxBytes: 900_000 });
    expect(issues).toEqual([]);
    expect(chunks.map((c) => c.map((r) => r.sku))).toEqual([
      ['A', 'A-0', 'A-1', 'A-2'],
      ['B', 'B-0', 'B-1', 'B-2'],
    ]);
    expect(chunks[0]![1]).not.toHaveProperty('title');
    expect(chunks[0]![1]).not.toHaveProperty('description');
    expect(chunks[0]![0]!.title).toBe('Title');
  });

  it('packs several groups into one chunk within maxRows', () => {
    const { chunks } = chunkGroups([group('A', 2, 1), group('B', 4, 1), group('C', 6, 1)], {
      maxRows: 4,
      maxBytes: 900_000,
    });
    expect(chunks.map((c) => c.length)).toEqual([4, 2]);
  });

  it('respects maxBytes exactly', () => {
    const a = group('A', 2, 0);
    const b = group('B', 3, 0);
    const exact = bytes([a.parent!, b.parent!]);
    expect(chunkGroups([a, b], { maxRows: 400, maxBytes: exact }).chunks).toHaveLength(1);
    expect(chunkGroups([a, b], { maxRows: 400, maxBytes: exact - 1 }).chunks).toHaveLength(2);
  });

  it('sends a 401-row group alone in its own chunk', () => {
    const { chunks, issues } = chunkGroups([group('A', 2, 1), group('BIG', 10, 400), group('C', 500, 1)]);
    expect(issues).toEqual([]);
    expect(chunks.map((c) => c.length)).toEqual([2, 401, 2]);
  });

  it('turns a 1,001-row group into row errors instead of a chunk', () => {
    const { chunks, issues } = chunkGroups([group('HUGE', 2, 1000), group('OK', 2000, 1)]);
    expect(chunks.map((c) => c.map((r) => r.sku))).toEqual([['OK', 'OK-0']]);
    expect(issues).toHaveLength(1001);
    expect(issues[0]).toEqual({
      row: 2,
      sku: 'HUGE',
      level: 'error',
      message:
        'This product has too many rows to import at once (max 1,000 rows / 900 KB) — split its Child rows into separate uploads.',
    });
  });

  it('rejects a group over maxBytes on its own', () => {
    const { chunks, issues } = chunkGroups([group('A', 2, 0, { description: 'x'.repeat(500) })], {
      maxRows: 400,
      maxBytes: 300,
    });
    expect(chunks).toEqual([]);
    expect(issues).toHaveLength(1);
  });
});

describe('mergeIssues', () => {
  it('shows the same row|level|message once and sorts by row', () => {
    const hint: SheetIssue = { row: 5, sku: 'tshirt-001', level: 'warning', message: 'case hint' };
    const merged = mergeIssues(
      [hint, { row: 2, sku: 'A', level: 'error', message: 'x' }],
      [{ ...hint }, { row: 5, sku: 'tshirt-001', level: 'error', message: 'case hint' }],
    );
    expect(merged).toEqual([
      { row: 2, sku: 'A', level: 'error', message: 'x' },
      hint,
      { row: 5, sku: 'tshirt-001', level: 'error', message: 'case hint' },
    ]);
  });
});

describe('withThrottleRetry', () => {
  const throttled = new Error('429');
  const isThrottled = (e: unknown): boolean => e === throttled;

  it('waits 60 s and retries once on a throttled error', async () => {
    const waits: number[] = [];
    const shown: number[] = [];
    const fn = jest.fn().mockRejectedValueOnce(throttled).mockResolvedValueOnce('ok');
    await expect(
      withThrottleRetry(fn, isThrottled, async (s) => void waits.push(s), (s) => shown.push(s)),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([60]);
    expect(shown).toEqual([60]);
  });

  it('rethrows the second failure', async () => {
    const fn = jest.fn().mockRejectedValue(throttled);
    await expect(withThrottleRetry(fn, isThrottled, async () => undefined)).rejects.toBe(throttled);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const other = new Error('boom');
    const wait = jest.fn(async () => undefined);
    const fn = jest.fn().mockRejectedValue(other);
    await expect(withThrottleRetry(fn, isThrottled, wait)).rejects.toBe(other);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('chunkFailureMessage', () => {
  it('says re-uploading is safe for network errors and 5xx', () => {
    const safe = 'Import request failed: Failed to fetch. Some of these rows may have been saved — uploading the same file again is safe.';
    expect(chunkFailureMessage('Failed to fetch')).toBe(safe);
    expect(chunkFailureMessage('Gateway Timeout', 504)).toBe(
      'Import request failed: Gateway Timeout. Some of these rows may have been saved — uploading the same file again is safe.',
    );
  });

  it('is the plain message for 400/413', () => {
    expect(chunkFailureMessage('Validation failed', 400)).toBe('Import request failed: Validation failed');
    expect(chunkFailureMessage('Payload Too Large', 413)).toBe('Import request failed: Payload Too Large');
  });
});

describe('productsXlsxFilename', () => {
  it('names the file belzo-products-YYYY-MM-DD.xlsx', () => {
    expect(productsXlsxFilename(new Date(2026, 0, 5))).toBe('belzo-products-2026-01-05.xlsx');
  });
});
