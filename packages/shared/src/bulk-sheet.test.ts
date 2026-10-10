import fc from 'fast-check';
import {
  assignParentSkus,
  buildTierSlabs,
  canonicalHeader,
  columnLabel,
  exclusiveToInclusive,
  exportRowToInput,
  groupSheetRows,
  mapHeaderRow,
  OLD_FORMAT_MESSAGE,
  ParentSkuSource,
  parseGstRate,
  parseIndicator,
  parseKgToGrams,
  parseNonNegInt,
  parsePercent,
  parseRupeesToPaise,
  parseTaxType,
  parseText,
  PACK_OF_MAX,
  SHEET_COLUMNS,
  SHEET_FIELD_MAX,
  SheetExportRow,
  SheetKey,
  SheetRowInput,
  stableStringify,
  tier1Percent,
  tierPercentsFromSlabs,
} from './bulk-sheet';

const FR1_HEADERS = [
  'Parent/Child Indicator',
  'Parent SKU',
  'SKU',
  'Final detail',
  'Brand',
  'Title',
  'Description',
  'Colour',
  'Size',
  'Weight (kg)',
  'HSN Code',
  'Tax Type (Dropdown: Inclusive/Exclusive)',
  'GST Rate (Dropdown: 0%/5%/12%/18%/28%)',
  'MRP (INR)',
  'Selling Price (INR)',
  'purchasing price',
  'Quantity/Stock',
  'Pack Of',
  'Bulk Tier 1 (1-4 units) Discount %',
  'Bulk Tier 2 (5-8 units) Discount %',
  'Bulk Tier 3 (9-12 units) Discount %',
  'Bulk Tier 4 (13-20 units) Discount %',
  'Bulk Tier 5 (21+ units) Discount %',
  'image 1 (main image )',
  'image 2',
  'image 3',
  'image 4',
  'image 5',
  'dimention (LWH)',
];

const FR1_KEYS: SheetKey[] = [
  'indicator', 'parentSku', 'sku', 'finalDetail', 'brand', 'title', 'description', 'colour', 'size',
  'weightKg', 'hsnCode', 'taxType', 'gstRate', 'mrp', 'sellingPrice', 'purchasePrice', 'stock',
  'packOf', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'image1', 'image2', 'image3', 'image4',
  'image5', 'dimensions',
];

const OLD_CSV_HEADERS = [
  'sku', 'title', 'categorySlug', 'mrp', 'sellingPrice', 'description', 'brand', 'hsnCode',
  'taxRatePct', 'stock', 'status', 'imageUrl',
];

const desc = 'High quality 100% cotton casual t-shirt for men.';
const shoeDesc = 'Comfortable sports and running shoes with maximum cushioning.';

/** The owner's 7 sample rows (rows 2..8 of the sheet). */
function ownerRows(): SheetRowInput[] {
  const tee = (row: number, sku: string, title: string, size: string, w: string, mrp: string, sp: string, pp: string, stock: string): SheetRowInput => ({
    row, indicator: 'Child', parentSku: 'TSHIRT-001', sku, finalDetail: 'Herbal Tea', brand: 'Zara', title,
    description: desc, colour: 'Blue', size, weightKg: w, hsnCode: '61091000', taxType: 'Inclusive',
    gstRate: '12%', mrp, sellingPrice: sp, purchasePrice: pp, stock, packOf: '1',
    tier1: '20%', tier2: '22%', tier3: '25%', tier4: '28%', tier5: '30%',
  });
  const shoe = (row: number, sku: string, title: string, size: string, w: string, stock: string): SheetRowInput => ({
    row, indicator: 'Child', parentSku: 'SHOES-102', sku, finalDetail: 'Herbal Tea', brand: 'Nike', title,
    description: shoeDesc, colour: 'Black', size, weightKg: w, hsnCode: '64041190', taxType: 'Inclusive',
    gstRate: '18%', mrp: '4995', sellingPrice: '3999', purchasePrice: '3899', stock, packOf: '1',
    tier1: '15%', tier2: '18%', tier3: '20%', tier4: '22%', tier5: '25%',
  });
  return [
    { row: 2, indicator: 'Parent', sku: 'TSHIRT-001', finalDetail: 'Herbal Tea', brand: '1', title: "Men's Cotton Slim Fit T-Shirt", description: desc, colour: 'Blue', hsnCode: '61091000', taxType: 'Inclusive', gstRate: '12%' },
    tee(3, 'TSHIRT-001-S', "Men's Cotton Slim Fit T-Shirt - Small", 'S', '0.2', '999', '799', '790', '50'),
    tee(4, 'TSHIRT-001-M', "Men's Cotton Slim Fit T-Shirt - Medium", 'M', '0.22', '999', '799', '790', '65'),
    tee(5, 'TSHIRT-001-L', "Men's Cotton Slim Fit T-Shirt - Large", 'L', '0.25', '1099', '849', '820', '40'),
    { row: 6, indicator: 'Parent', sku: 'SHOES-102', finalDetail: 'Herbal Tea', brand: 'Nike', title: 'Air Max Running Shoes', description: shoeDesc, colour: 'Black', hsnCode: '64041190', taxType: 'Inclusive', gstRate: '18%' },
    shoe(7, 'SHOES-102-UK7', 'Air Max Running Shoes - UK 7', 'UK 7', '0.8', '20'),
    shoe(8, 'SHOES-102-UK8', 'Air Max Running Shoes - UK 8', 'UK 8', '0.85', '35'),
  ];
}

const P = (row: number, sku: string, extra: Partial<SheetRowInput> = {}): SheetRowInput => ({
  row, indicator: 'Parent', sku, title: `T ${sku}`, ...extra,
});
const C = (row: number, parentSku: string, sku: string, extra: Partial<SheetRowInput> = {}): SheetRowInput => ({
  row, indicator: 'Child', parentSku, sku, ...extra,
});
const errors = (issues: { level: string }[]) => issues.filter((i) => i.level === 'error');
const warnings = (issues: { level: string }[]) => issues.filter((i) => i.level === 'warning');

describe('SHEET_COLUMNS / SHEET_FIELD_MAX', () => {
  it('has the 29 FR-1 headers in order', () => {
    expect(SHEET_COLUMNS.map((c) => c.header)).toEqual(FR1_HEADERS);
    expect(SHEET_COLUMNS.map((c) => c.key)).toEqual(FR1_KEYS);
  });

  it('SHEET_FIELD_MAX covers every SheetKey', () => {
    expect(Object.keys(SHEET_FIELD_MAX).sort()).toEqual([...FR1_KEYS].sort());
    for (const k of FR1_KEYS) expect(SHEET_FIELD_MAX[k]).toBeGreaterThan(0);
    expect(SHEET_FIELD_MAX.title).toBe(200);
    expect(SHEET_FIELD_MAX.description).toBe(5000);
    expect(SHEET_FIELD_MAX.sku).toBe(60);
  });
});

describe('canonicalHeader', () => {
  it('maps all 29 FR-1 headers to their keys', () => {
    FR1_HEADERS.forEach((h, i) => expect(canonicalHeader(h)).toBe(FR1_KEYS[i]));
  });

  it.each([
    ['Weight (g)', 'weightKg'],
    ['  tax type  ', 'taxType'],
    ['GST RATE (Dropdown: x)', 'gstRate'],
    ['dimention (LWH)', 'dimensions'],
    ['image 1 (main image )', 'image1'],
    ['image 1 (main image ', 'image1'],
    ['Colour', 'colour'],
    ['Color', 'colour'],
    ['\uFEFFParent/Child Indicator', 'indicator'],
    ['Category', 'finalDetail'],
    ['Purchase Price', 'purchasePrice'],
  ])('%s -> %s', (raw, key) => {
    expect(canonicalHeader(raw)).toBe(key);
  });

  it('unknown headers and categorySlug -> null', () => {
    expect(canonicalHeader('Something else')).toBeNull();
    expect(canonicalHeader('categorySlug')).toBeNull();
    expect(canonicalHeader('')).toBeNull();
  });
});

describe('mapHeaderRow', () => {
  it('old PRODUCT_CSV_COLUMNS header list -> oldFormat', () => {
    expect(mapHeaderRow(OLD_CSV_HEADERS).oldFormat).toBe(true);
    expect(OLD_FORMAT_MESSAGE).toBe(
      'This is the old CSV format. Click "⬇ Download Excel", copy your rows into that file and upload it.',
    );
  });

  it('FR-1 headers -> not oldFormat, every key indexed', () => {
    const m = mapHeaderRow(FR1_HEADERS);
    expect(m.oldFormat).toBe(false);
    expect(m.index.size).toBe(29);
    expect(m.index.get('sku')).toBe(2);
    expect(m.unknown).toEqual([]);
    expect(m.duplicates).toEqual([]);
  });

  it('FR-1 headers without the indicator column -> not oldFormat', () => {
    expect(mapHeaderRow(FR1_HEADERS.slice(1)).oldFormat).toBe(false);
  });

  it('reports unknown and duplicate headers; the first occurrence wins', () => {
    const m = mapHeaderRow(['SKU', 'Notes', 'sku', '', 'Title']);
    expect(m.index.get('sku')).toBe(0);
    expect(m.index.get('title')).toBe(4);
    expect(m.unknown).toEqual(['Notes']);
    expect(m.duplicates).toEqual(['sku']);
  });

  it('weightUnitHint (NIT 5)', () => {
    expect(mapHeaderRow(['SKU', 'Weight (g)']).weightUnitHint).toBe('g');
    expect(mapHeaderRow(['SKU', 'Weight (kg)']).weightUnitHint).toBe('kg');
    expect(mapHeaderRow(['SKU', 'Weight']).weightUnitHint).toBeNull();
    expect(mapHeaderRow(['SKU', 'Weight g']).weightUnitHint).toBe('g');
    expect(mapHeaderRow(['SKU', 'Weight in grams']).weightUnitHint).toBeNull(); // not a weight alias
    expect(mapHeaderRow(['SKU', 'Weight (grams)']).weightUnitHint).toBe('g');
    expect(mapHeaderRow(['SKU', 'Weight (KGS)']).weightUnitHint).toBe('kg');
    expect(mapHeaderRow(['SKU']).weightUnitHint).toBeNull();
    expect(mapHeaderRow(FR1_HEADERS).weightUnitHint).toBe('kg');
  });
});

describe('columnLabel', () => {
  it.each([
    ['tier2', 'Bulk Tier 2 Discount %'],
    ['gstRate', 'GST Rate'],
    ['mrp', 'MRP'],
    ['sellingPrice', 'Selling Price'],
    ['purchasePrice', 'purchasing price'],
    ['stock', 'Quantity/Stock'],
    ['packOf', 'Pack Of'],
    ['weightKg', 'Weight'],
    ['image1', 'image 1'],
  ] as [SheetKey, string][])('%s -> %s', (key, label) => {
    expect(columnLabel(key)).toBe(label);
  });
});

describe('parser messages', () => {
  it('uses the column label', () => {
    expect(parseNonNegInt('x', 'Quantity/Stock')).toEqual({
      ok: false,
      error: 'Quantity/Stock must be a whole number (0 or more)',
    });
    expect(parseNonNegInt('-1', 'Quantity/Stock')).toEqual({ ok: false, error: 'Quantity/Stock cannot be negative' });
    expect(parseKgToGrams('x')).toEqual({ ok: false, error: 'Weight must be a number in kg, e.g. 0.25' });
    expect(parsePercent('x', 'Bulk Tier 2 Discount %')).toEqual({
      ok: false,
      error: 'Bulk Tier 2 Discount % must be a percentage, e.g. 20%',
    });
    expect(parseText('abcd', 3, 'Brand')).toEqual({ ok: false, error: 'Brand is longer than 3 characters' });
  });
});

describe('parsers', () => {
  it('blank / whitespace -> null for every parser', () => {
    for (const s of [undefined, '', '   ']) {
      expect(parseText(s, 10)).toEqual({ ok: true, value: null });
      expect(parseRupeesToPaise(s, 'MRP')).toEqual({ ok: true, value: null });
      expect(parsePercent(s, 'GST Rate')).toEqual({ ok: true, value: null });
      expect(parseGstRate(s)).toEqual({ ok: true, value: null });
      expect(parseTaxType(s)).toEqual({ ok: true, value: null });
      expect(parseIndicator(s)).toEqual({ ok: true, value: null });
      expect(parseNonNegInt(s, 'Pack Of')).toEqual({ ok: true, value: null });
      expect(parseKgToGrams(s)).toEqual({ ok: true, value: null });
    }
  });

  it('parseText trims', () => {
    expect(parseText('  Zara ', 10)).toEqual({ ok: true, value: 'Zara' });
  });

  it('parsePercent', () => {
    expect(parsePercent('20%', 'X')).toEqual({ ok: true, value: 20 });
    expect(parsePercent('20 %', 'X')).toEqual({ ok: true, value: 20 });
    expect(parsePercent('0.2', 'X')).toEqual({ ok: true, value: 20 });
    expect(parsePercent('20', 'X')).toEqual({ ok: true, value: 20 });
    expect(parsePercent('18.0018%', 'X')).toEqual({ ok: true, value: 18.0018 });
    expect(parsePercent('', 'X')).toEqual({ ok: true, value: null });
    expect(parsePercent('x', 'X').ok).toBe(false);
    expect(parsePercent('0x10', 'X').ok).toBe(false);
    expect(parsePercent('1e1%', 'X').ok).toBe(false);
    expect(parsePercent('-5%', 'X')).toEqual({ ok: false, error: 'X cannot be negative' });
  });

  it('parseGstRate', () => {
    expect(parseGstRate('12%')).toEqual({ ok: true, value: 12 });
    expect(parseGstRate('0.12')).toEqual({ ok: true, value: 12 });
    expect(parseGstRate('12')).toEqual({ ok: true, value: 12 });
    expect(parseGstRate('0')).toEqual({ ok: true, value: 0 });
    expect(parseGstRate('0%')).toEqual({ ok: true, value: 0 });
    expect(parseGstRate('28%')).toEqual({ ok: true, value: 28 });
    const msg = { ok: false, error: 'GST Rate must be one of 0%, 5%, 12%, 18%, 28%' };
    expect(parseGstRate('3%')).toEqual(msg);
    expect(parseGstRate('x')).toEqual(msg);
  });

  it('parseRupeesToPaise', () => {
    expect(parseRupeesToPaise('999', 'MRP')).toEqual({ ok: true, value: 99900 });
    expect(parseRupeesToPaise('1,099.50', 'MRP')).toEqual({ ok: true, value: 109950 });
    expect(parseRupeesToPaise('₹ 799', 'MRP')).toEqual({ ok: true, value: 79900 });
    expect(parseRupeesToPaise('Rs. 799/-', 'MRP')).toEqual({ ok: true, value: 79900 });
    expect(parseRupeesToPaise('799 INR', 'MRP')).toEqual({ ok: true, value: 79900 });
    expect(parseRupeesToPaise('0', 'MRP')).toEqual({ ok: true, value: 0 });
    expect(parseRupeesToPaise('-1', 'MRP')).toEqual({ ok: false, error: 'MRP cannot be negative' });
    const nan = { ok: false, error: 'MRP must be a number in rupees, e.g. 799 or 799.50' };
    for (const s of ['abc', '0x10', '1e3', '.5', '5.', 'Infinity', '₹']) {
      expect(parseRupeesToPaise(s, 'MRP')).toEqual(nan);
    }
    expect(parseRupeesToPaise('99999999999', 'MRP')).toEqual({ ok: false, error: 'MRP is too large' });
    expect(parseRupeesToPaise('9'.repeat(400), 'MRP')).toEqual({ ok: false, error: 'MRP is too large' });
    expect(parseRupeesToPaise('21474836.47', 'MRP')).toEqual({ ok: true, value: 2147483647 });
    expect(parseRupeesToPaise('21474836.48', 'MRP')).toEqual({ ok: false, error: 'MRP is too large' });
  });

  it('parseNonNegInt', () => {
    expect(parseNonNegInt('1,000', 'Quantity/Stock')).toEqual({ ok: true, value: 1000 });
    expect(parseNonNegInt('0', 'Quantity/Stock')).toEqual({ ok: true, value: 0 });
    expect(parseNonNegInt('0x10', 'Quantity/Stock').ok).toBe(false);
    expect(parseNonNegInt('1e3', 'Quantity/Stock').ok).toBe(false);
    expect(parseNonNegInt('1.5', 'Quantity/Stock').ok).toBe(false);
    expect(parseNonNegInt('2147483647', 'Quantity/Stock')).toEqual({ ok: true, value: 2147483647 });
    expect(parseNonNegInt('2147483648', 'Quantity/Stock')).toEqual({
      ok: false,
      error: 'Quantity/Stock is too large (max 2147483647)',
    });
    expect(parseNonNegInt('10001', 'Pack Of', PACK_OF_MAX)).toEqual({
      ok: false,
      error: 'Pack Of is too large (max 10000)',
    });
    expect(parseNonNegInt('10000', 'Pack Of', PACK_OF_MAX)).toEqual({ ok: true, value: 10000 });
  });

  it('parseKgToGrams', () => {
    expect(parseKgToGrams('0.22')).toEqual({ ok: true, value: 220 });
    expect(parseKgToGrams('0.85 kg')).toEqual({ ok: true, value: 850 });
    expect(parseKgToGrams('2KGS')).toEqual({ ok: true, value: 2000 });
    expect(parseKgToGrams('1e3').ok).toBe(false);
    expect(parseKgToGrams('-0.5')).toEqual({ ok: false, error: 'Weight cannot be negative' });
    expect(parseKgToGrams('9999999')).toEqual({ ok: false, error: 'Weight is too large' });
  });

  it('parseIndicator', () => {
    for (const s of ['Parent', 'parent', ' P ', 'p']) expect(parseIndicator(s)).toEqual({ ok: true, value: 'parent' });
    for (const s of ['Child', 'c', 'Variant']) expect(parseIndicator(s)).toEqual({ ok: true, value: 'child' });
    expect(parseIndicator('Kid')).toEqual({ ok: false, error: 'Parent/Child Indicator must be Parent or Child' });
  });

  it('parseTaxType', () => {
    expect(parseTaxType('Inclusive')).toEqual({ ok: true, value: 'inclusive' });
    expect(parseTaxType('incl. GST')).toEqual({ ok: true, value: 'inclusive' });
    expect(parseTaxType('EXCLUSIVE')).toEqual({ ok: true, value: 'exclusive' });
    expect(parseTaxType('with tax')).toEqual({ ok: false, error: 'Tax Type must be Inclusive or Exclusive' });
  });
});

describe('stableStringify', () => {
  it('ignores object key order, keeps array order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
    expect(stableStringify([{ y: 1, x: 2 }])).toBe('[{"x":2,"y":1}]');
    expect(stableStringify(null)).toBe('null');
  });
});

describe('groupSheetRows', () => {
  it("owner's 7 rows -> 2 groups with 3 and 2 children, no errors", () => {
    const { groups, issues } = groupSheetRows(ownerRows());
    expect(errors(issues)).toEqual([]);
    expect(groups.map((g) => g.key)).toEqual(['TSHIRT-001', 'SHOES-102']);
    expect(groups[0]?.parent?.row).toBe(2);
    expect(groups[0]?.children.map((c) => c.sku)).toEqual(['TSHIRT-001-S', 'TSHIRT-001-M', 'TSHIRT-001-L']);
    expect(groups[1]?.parent?.row).toBe(6);
    expect(groups[1]?.children.map((c) => c.row)).toEqual([7, 8]);
  });

  it('a child before its parent is still grouped', () => {
    const { groups, issues } = groupSheetRows([C(2, 'A', 'A-1'), P(3, 'A'), C(4, 'A', 'A-2')]);
    expect(issues).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.parent?.row).toBe(3);
    expect(groups[0]?.children.map((c) => c.row)).toEqual([2, 4]);
  });

  it('skips blank rows and EXAMPLE rows (with a warning)', () => {
    const { groups, issues } = groupSheetRows([
      { row: 2 },
      { row: 3, sku: '  ', title: '' },
      P(4, 'example-tee'),
      C(5, 'EXAMPLE-TEE', 'EXAMPLE-TEE-S'),
      P(6, 'REAL'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['REAL']);
    expect(issues).toEqual([
      { row: 4, sku: 'example-tee', level: 'warning', message: 'Example row skipped — delete it or replace it with a real product.' },
      { row: 5, sku: 'EXAMPLE-TEE-S', level: 'warning', message: 'Example row skipped — delete it or replace it with a real product.' },
    ]);
  });

  it('duplicate child SKU -> error on the later row', () => {
    const { groups, issues } = groupSheetRows([P(2, 'A'), C(3, 'A', 'X'), P(4, 'B'), C(5, 'B', 'X')]);
    expect(errors(issues)).toEqual([{ row: 5, sku: 'X', level: 'error', message: 'SKU X is already used in row 3' }]);
    expect(groups.find((g) => g.key === 'B')?.children).toEqual([]);
  });

  it('a single-row Parent SKU repeated as a child SKU in another group -> error', () => {
    const { issues } = groupSheetRows([P(2, 'SOLO'), P(3, 'B'), C(4, 'B', 'SOLO')]);
    expect(errors(issues)).toEqual([
      { row: 4, sku: 'SOLO', level: 'error', message: 'SKU SOLO is also a Parent SKU in row 2' },
    ]);
  });

  it('duplicate Parent SKU -> error on the later row, children stay with the first', () => {
    const { groups, issues } = groupSheetRows([P(2, 'A'), P(3, 'A'), C(4, 'A', 'A-1')]);
    expect(errors(issues)).toEqual([
      { row: 3, sku: 'A', level: 'error', message: 'Parent SKU A is already used in row 2' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.parent?.row).toBe(2);
    expect(groups[0]?.children).toHaveLength(1);
  });

  it('child without Parent SKU -> error; blank SKU -> error', () => {
    const { groups, issues } = groupSheetRows([
      { row: 2, indicator: 'Child', sku: 'X' },
      { row: 3, indicator: 'Parent', title: 'No sku' },
    ]);
    expect(groups).toEqual([]);
    expect(issues).toEqual([
      { row: 2, sku: 'X', level: 'error', message: 'Parent SKU is required on Child rows' },
      { row: 3, sku: '', level: 'error', message: 'SKU is required' },
    ]);
  });

  it('child SKU equal to its own Parent SKU is allowed; equal to another group key -> error', () => {
    const ok = groupSheetRows([P(2, 'A'), C(3, 'A', 'A')]);
    expect(ok.issues).toEqual([]);
    expect(ok.groups[0]?.children).toHaveLength(1);

    const bad = groupSheetRows([P(2, 'A'), C(3, 'A', 'A-1'), P(4, 'B'), C(5, 'B', 'A')]);
    expect(errors(bad.issues)).toEqual([
      { row: 5, sku: 'A', level: 'error', message: 'SKU A is also a Parent SKU in row 2' },
    ]);
  });

  it('infers a blank indicator', () => {
    const { groups, issues } = groupSheetRows([
      { row: 2, sku: 'A', title: 'A' },
      { row: 3, parentSku: 'A', sku: 'A-1' },
    ]);
    expect(issues).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.parent?.row).toBe(2);
    expect(groups[0]?.children.map((c) => c.row)).toEqual([3]);
  });

  it('NIT 10: blank indicator with parentSku === sku is a Parent row', () => {
    const { groups, issues } = groupSheetRows([{ row: 2, parentSku: ' SOLO ', sku: 'SOLO', title: 'Solo', mrp: '10' }]);
    expect(issues).toEqual([]);
    expect(groups).toEqual([{ key: 'SOLO', parent: expect.objectContaining({ row: 2 }), children: [] }]);
  });

  it('Parent row over a length limit fails its group: children are cascaded', () => {
    const { groups, issues } = groupSheetRows([
      P(2, 'A', { description: 'x'.repeat(5001) }),
      C(3, 'A', 'A-1', { title: 'y'.repeat(300) }),
      C(4, 'A', 'A-2'),
    ]);
    expect(groups).toEqual([]);
    expect(issues).toEqual([
      { row: 2, sku: 'A', level: 'error', message: 'Description is longer than 5000 characters' },
      { row: 3, sku: 'A-1', level: 'error', message: 'Not imported: Parent row 2 has errors.' },
      { row: 4, sku: 'A-2', level: 'error', message: 'Not imported: Parent row 2 has errors.' },
    ]);
  });

  it('a 300-character title on a Child row is not checked', () => {
    const { groups, issues } = groupSheetRows([P(2, 'A'), C(3, 'A', 'A-1', { title: 'y'.repeat(300), description: 'z'.repeat(6000) })]);
    expect(issues).toEqual([]);
    expect(groups[0]?.children).toHaveLength(1);
  });

  it('a 201-character title on a Parent row is a row error', () => {
    const { groups, issues } = groupSheetRows([P(2, 'A', { title: 't'.repeat(201) })]);
    expect(groups).toEqual([]);
    expect(issues).toEqual([{ row: 2, sku: 'A', level: 'error', message: 'Title is longer than 200 characters' }]);
  });

  it('201-character colour -> error; 200 -> ok', () => {
    expect(errors(groupSheetRows([P(2, 'A', { colour: 'c'.repeat(201) })]).issues)).toEqual([
      { row: 2, sku: 'A', level: 'error', message: 'Colour is longer than 200 characters' },
    ]);
    expect(groupSheetRows([P(2, 'A', { colour: 'c'.repeat(200) })]).issues).toEqual([]);
  });

  it('a Parent row with an invalid indicator is excluded and does not cascade', () => {
    const { groups, issues } = groupSheetRows([P(2, 'A', { indicator: 'Mother' }), C(3, 'A', 'A-1')]);
    expect(issues).toEqual([
      { row: 2, sku: 'A', level: 'error', message: 'Parent/Child Indicator must be Parent or Child' },
    ]);
    expect(groups).toEqual([{ key: 'A', children: [expect.objectContaining({ row: 3 })] }]);
  });

  it('case-only near miss: two groups and a hint; ABC and abc are different SKUs', () => {
    const { groups, issues } = groupSheetRows([
      P(2, 'TSHIRT-001'),
      C(3, 'TSHIRT-001', 'ABC'),
      C(4, 'tshirt-001', 'abc'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['TSHIRT-001', 'tshirt-001']);
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual([
      {
        row: 4,
        sku: 'abc',
        level: 'warning',
        message:
          'Parent SKU tshirt-001 differs only in letter case from the Parent row 2 (TSHIRT-001). SKUs are case-sensitive, so this row is not part of that product.',
      },
    ]);
  });

  it('Parent SKU on a Parent row: different -> ignored with a warning; equal -> no warning', () => {
    const diff = groupSheetRows([P(2, 'TSHIRT-001', { parentSku: 'TSHIRT-X' })]);
    expect(diff.groups.map((g) => g.key)).toEqual(['TSHIRT-001']);
    expect(diff.issues).toEqual([
      {
        row: 2,
        sku: 'TSHIRT-001',
        level: 'warning',
        message: 'Parent SKU on a Parent row is ignored — its SKU (TSHIRT-001) is the Parent SKU.',
      },
    ]);
    expect(groupSheetRows([P(2, 'TSHIRT-001', { parentSku: 'TSHIRT-001' })]).issues).toEqual([]);
  });
});

describe('buildTierSlabs (AC-4)', () => {
  const t = (tier2: number | null, tier3: number | null, tier4: number | null, tier5: number | null) => ({
    tier2, tier3, tier4, tier5,
  });

  it('TSHIRT S/M', () => {
    expect(buildTierSlabs(99900, 79900, t(22, 25, 28, 30))).toEqual({
      mode: 'replace',
      slabs: [
        { minQty: 5, unitPrice: 77922 },
        { minQty: 9, unitPrice: 74925 },
        { minQty: 13, unitPrice: 71928 },
        { minQty: 21, unitPrice: 69930 },
      ],
      warnings: [],
    });
  });

  it('TSHIRT L: tier 2 above SP is skipped', () => {
    expect(buildTierSlabs(109900, 84900, t(22, 25, 28, 30))).toEqual({
      mode: 'replace',
      slabs: [
        { minQty: 9, unitPrice: 82425 },
        { minQty: 13, unitPrice: 79128 },
        { minQty: 21, unitPrice: 76930 },
      ],
      warnings: ['Bulk Tier 2 (22% off MRP = ₹857.22) is above the Selling Price ₹849 — tier skipped'],
    });
  });

  it('shoes: tier 2 above SP is skipped', () => {
    expect(buildTierSlabs(499500, 399900, t(18, 20, 22, 25))).toEqual({
      mode: 'replace',
      slabs: [
        { minQty: 9, unitPrice: 399600 },
        { minQty: 13, unitPrice: 389610 },
        { minQty: 21, unitPrice: 374625 },
      ],
      warnings: ['Bulk Tier 2 (18% off MRP = ₹4095.90) is above the Selling Price ₹3999 — tier skipped'],
    });
  });

  it('a non-decreasing tier is skipped', () => {
    const r = buildTierSlabs(10000, 9000, t(20, 15, null, 30));
    expect(r).toEqual({
      mode: 'replace',
      slabs: [
        { minQty: 5, unitPrice: 8000 },
        { minQty: 21, unitPrice: 7000 },
      ],
      warnings: ['Bulk Tier 3 (₹85) is not lower than the previous price ₹80 — tier skipped'],
    });
  });

  it('a tier equal to the SP is skipped', () => {
    expect(buildTierSlabs(10000, 9000, t(10, null, null, null))).toEqual({
      mode: 'replace',
      slabs: [],
      warnings: ['Bulk Tier 2 (₹90) is not lower than the previous price ₹90 — tier skipped'],
    });
  });

  it('all blank -> keep', () => {
    expect(buildTierSlabs(10000, 9000, t(null, null, null, null))).toEqual({ mode: 'keep' });
  });
});

describe('exclusiveToInclusive', () => {
  it('adds GST', () => {
    expect(exclusiveToInclusive(79900, 12)).toBe(89488);
    expect(exclusiveToInclusive(79900, 0)).toBe(79900);
  });
});

describe('tierPercentsFromSlabs / tier1Percent', () => {
  it('representable slabs -> percents per present tier', () => {
    const r = tierPercentsFromSlabs(99900, 79900, [
      { minQty: 9, unitPrice: 74925 },
      { minQty: 5, unitPrice: 77922 },
    ]);
    expect(r?.tier2).toBeCloseTo(22, 9);
    expect(r?.tier3).toBeCloseTo(25, 9);
    expect(r?.tier4).toBeNull();
    expect(r?.tier5).toBeNull();
    expect(tierPercentsFromSlabs(99900, 79900, [])).toEqual({ tier2: null, tier3: null, tier4: null, tier5: null });
  });

  it('not representable -> null', () => {
    expect(tierPercentsFromSlabs(0, 0, [])).toBeNull();
    expect(tierPercentsFromSlabs(10000, 9000, [{ minQty: 2, unitPrice: 8000 }])).toBeNull();
    expect(
      tierPercentsFromSlabs(10000, 9000, [
        { minQty: 5, unitPrice: 8000 },
        { minQty: 9, unitPrice: 8000 },
      ]),
    ).toBeNull();
    expect(tierPercentsFromSlabs(10000, 9000, [{ minQty: 5, unitPrice: 9000 }])).toBeNull();
    expect(tierPercentsFromSlabs(10000, 9000, [{ minQty: 5, unitPrice: 400 }])).toBeNull();
  });

  it('tier1Percent', () => {
    expect(tier1Percent(99900, 79900)).toBeCloseTo(20.02, 2);
    expect(tier1Percent(0, 100)).toBeNull();
  });

  it('property: export pct -> /100 -> toPrecision(15) -> import price round-trips', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }).chain((mrp) =>
          fc.tuple(fc.constant(mrp), fc.integer({ min: 0, max: mrp - 1 })),
        ),
        ([mrp, unitPrice]) => {
          const pct = (1 - unitPrice / mrp) * 100;
          const cellValue = pct / 100; // what the workbook stores in a %-formatted cell
          const text = `${Number((cellValue * 100).toPrecision(15))}%`; // cellToString
          const parsed = parsePercent(text, 'Bulk Tier 2 Discount %');
          if (!parsed.ok || parsed.value === null) return false;
          return Math.round((mrp * (100 - parsed.value)) / 100) === unitPrice;
        },
      ),
    );
  });
});

describe('assignParentSkus', () => {
  const prod = (id: string, slug: string, skus: string[], sku: string | null = null): ParentSkuSource => ({
    id, slug, sku, activeSkus: skus, allSkus: skus,
  });

  it('LCP of variant SKUs; a single variant keeps its own SKU', () => {
    const m = assignParentSkus([
      prod('p1', 'tee', ['TSHIRT-001-S', 'TSHIRT-001-M', 'TSHIRT-001-L']),
      prod('p2', 'mug', ['MUG-42']),
    ]);
    expect(m.get('p1')).toBe('TSHIRT-001');
    expect(m.get('p2')).toBe('MUG-42');
  });

  it('LCP shorter than 3 or no active SKUs -> P-slug', () => {
    const m = assignParentSkus([prod('p1', 'red-tee', ['AB-1', 'AX-2']), prod('p2', 'empty', [])]);
    expect(m.get('p1')).toBe('P-red-tee');
    expect(m.get('p2')).toBe('P-empty');
  });

  it("a candidate that is another product's variant SKU -> P-slug", () => {
    const m = assignParentSkus([prod('p1', 'other', ['TEE']), prod('p2', 'tee-set', ['TEE-S', 'TEE-M'])]);
    expect(m.get('p1')).toBe('TEE');
    expect(m.get('p2')).toBe('P-tee-set');
  });

  it("a product's own variant SKUs don't count as taken", () => {
    const m = assignParentSkus([prod('p1', 'tee', ['TEE', 'TEE-S'])]);
    expect(m.get('p1')).toBe('TEE');
  });

  it('a stored sku is kept and reserved', () => {
    const m = assignParentSkus([
      prod('p1', 'b', ['B-1', 'B-2'], 'MUG'),
      prod('p2', 'mug', ['MUG-1', 'MUG-2']),
    ]);
    expect(m.get('p1')).toBe('MUG');
    expect(m.get('p2')).toBe('P-mug');
  });

  it('collision chain -> -id8', () => {
    const m = assignParentSkus([
      prod('aaaaaaaa-1111', 'tee', ['X1', 'Y1']),
      prod('bbbbbbbb-2222', 'tee', ['X2', 'Y2']),
    ]);
    expect(m.get('aaaaaaaa-1111')).toBe('P-tee');
    expect(m.get('bbbbbbbb-2222')).toBe('P-tee-bbbbbbbb');
  });

  it('LCP over 60 characters falls back to P-slug', () => {
    const long = 'L'.repeat(61);
    expect(assignParentSkus([prod('p1', 'legacy', [long])]).get('p1')).toBe('P-legacy');
  });

  it('a 200-character slug gives a derived SKU of 60 characters or fewer', () => {
    const slug = 'a'.repeat(39) + '-' + 'b'.repeat(160);
    const m = assignParentSkus([
      prod('11111111-x', slug, []),
      prod('22222222-y', slug, []),
    ]);
    expect(m.get('11111111-x')).toBe(`P-${'a'.repeat(39)}`);
    expect(m.get('22222222-y')).toBe(`P-${'a'.repeat(39)}-22222222`);
    for (const v of m.values()) expect(v.length).toBeLessThanOrEqual(60);
  });

  it('identical input -> identical result', () => {
    const input = [
      prod('p1', 'tee', ['TSHIRT-001-S', 'TSHIRT-001-M']),
      prod('p2', 'tee', ['A1']),
      prod('p3', 'tee', ['B1']),
    ];
    expect([...assignParentSkus(input)]).toEqual([...assignParentSkus(input)]);
  });
});

describe('exportRowToInput', () => {
  it('turns an export row into client strings', () => {
    const blankRow = Object.fromEntries(FR1_KEYS.map((k) => [k, null])) as unknown as SheetExportRow;
    const r: SheetExportRow = {
      ...blankRow,
      indicator: 'Child',
      parentSku: 'TSHIRT-001',
      sku: 'TSHIRT-001-S',
      mrp: 999,
      sellingPrice: 799.5,
      weightKg: 0.2,
      stock: 50,
      packOf: 1,
      tier1: 19.97997997997998,
      tier2: 22,
    };
    expect(exportRowToInput(r, 3)).toEqual({
      row: 3,
      indicator: 'Child',
      parentSku: 'TSHIRT-001',
      sku: 'TSHIRT-001-S',
      mrp: '999',
      sellingPrice: '799.5',
      weightKg: '0.2',
      stock: '50',
      packOf: '1',
      tier1: '19.97997997998%',
      tier2: '22%',
    });
  });
});
