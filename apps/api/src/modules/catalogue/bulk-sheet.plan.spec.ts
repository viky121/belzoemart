import { exportRowToInput, type SheetGroup, type SheetRowInput } from '@belzo/shared';
import {
  REMOVE_ATTR,
  mergeAttr,
  pickAttr,
  planProductGroup,
  toSheetExportRows,
  type ExportProduct,
  type PlanContext,
  type PlanProduct,
  type PlanVariant,
} from './bulk-sheet.plan';

const cats = [
  { id: 'cat-tea', name: 'Herbal Tea', slug: 'herbal-tea', isActive: true },
  { id: 'cat-apparel', name: 'Apparel', slug: 'apparel', isActive: true },
];

function ctx(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    product: null,
    variantsBySku: new Map(),
    allCats: cats,
    parentSkuOf: () => undefined,
    parentSkuClash: new Map(),
    weightUnitHint: null,
    ...overrides,
  };
}

function product(overrides: Partial<PlanProduct> = {}): PlanProduct {
  return {
    id: 'p1',
    sku: 'TS-1',
    title: 'Tee',
    description: 'Soft tee',
    categoryId: 'cat-apparel',
    brandId: 'b1',
    hsnCode: '61091000',
    taxRatePct: 12,
    attributesJson: {},
    images: [],
    brand: { id: 'b1', name: 'Zara' },
    activeVariantCount: 1,
    ...overrides,
  };
}

function variant(overrides: Partial<PlanVariant> = {}): PlanVariant {
  return {
    id: 'v1',
    productId: 'p1',
    sku: 'TS-1',
    mrp: 99900,
    sellingPrice: 79900,
    costPrice: null,
    weightGrams: 200,
    attributesJson: {},
    priceSlabsJson: [],
    imageUrl: null,
    isActive: true,
    inventory: { available: 5 },
    product: { id: 'p1', sku: 'TS-1', title: 'Tee' },
    ...overrides,
  };
}

const parentRow = (cells: Partial<SheetRowInput> = {}): SheetRowInput => ({
  row: 2,
  indicator: 'Parent',
  sku: 'TS-1',
  ...cells,
});

describe('mergeAttr', () => {
  it('leaves attrs alone for blank, keeps a matching value and its key case', () => {
    const a = { size: 'M ', Color: 'Blue' };
    expect(mergeAttr(a, 'Size', ['size'], null)).toBe(a);
    expect(mergeAttr(a, 'Size', ['size'], 'M')).toBe(a);
  });

  it('replaces every match with the canonical key on a change', () => {
    expect(mergeAttr({ size: 'M', SIZE: 'X', Color: 'Blue' }, 'Size', ['size'], 'L')).toEqual({
      Size: 'L',
      Color: 'Blue',
    });
  });

  it('REMOVE_ATTR removes every match; numeric compare treats "02" as 2', () => {
    expect(mergeAttr({ 'pack of': '2', 'Pack Of ': '3', x: '1' }, 'Pack Of', ['pack of'], REMOVE_ATTR)).toEqual({
      x: '1',
    });
    const a = { 'Pack Of': '02' };
    expect(mergeAttr(a, 'Pack Of', ['pack of'], '2', { numeric: true })).toBe(a);
    expect(mergeAttr(a, 'Pack Of', ['pack of'], '2')).toEqual({ 'Pack Of': '2' });
  });

  it('a Size cell that says "remove" is a value, not the remove sentinel', () => {
    expect(mergeAttr({ Size: 'M' }, 'Size', ['size'], 'remove')).toEqual({ Size: 'remove' });
  });
});

describe('pickAttr', () => {
  it('is case-insensitive and trims', () => {
    expect(pickAttr({ size: 'M ' }, 'size')).toBe('M');
    expect(pickAttr({ Colour: 'Red' }, 'color', 'colour')).toBe('Red');
    expect(pickAttr(null, 'size')).toBe('');
  });
});

describe('planProductGroup — single-row Finding 1 (wizard-shaped product)', () => {
  const wizardProduct = () =>
    product({ attributesJson: { Size: 'M', Color: 'Blue' } });
  const wizardVariant = () =>
    variant({ attributesJson: { Size: 'M', Color: 'Blue' } });
  const row = (cells: Partial<SheetRowInput>): SheetGroup => ({
    key: 'TS-1',
    parent: parentRow({ mrp: '999', sellingPrice: '799', ...cells }),
    children: [],
  });
  const c = () => ctx({ product: wizardProduct(), variantsBySku: new Map([['TS-1', wizardVariant()]]) });

  it('sheet Size L -> both Size keys become L', () => {
    const { plan } = planProductGroup(row({ size: 'L', colour: 'Blue' }), c());
    expect(plan?.data.attributesJson).toEqual({ Size: 'L', Color: 'Blue' });
    const v = plan?.variants[0];
    expect(v?.kind).toBe('update');
    expect(v?.kind === 'update' && v.data.attributesJson).toEqual({ Size: 'L', Color: 'Blue' });
  });

  it('sheet Colour Red -> both Color keys become Red', () => {
    const { plan } = planProductGroup(row({ size: 'M', colour: 'Red' }), c());
    expect(plan?.data.attributesJson).toEqual({ Size: 'M', Color: 'Red' });
    const v = plan?.variants[0];
    expect(v?.kind === 'update' && v.data.attributesJson).toEqual({ Size: 'M', Color: 'Red' });
  });

  it('unchanged re-import -> no product or variant change', () => {
    const { plan, issues } = planProductGroup(
      row({ size: 'M', colour: 'Blue', title: 'Tee', weightKg: '0.2', stock: '5' }),
      c(),
    );
    expect(issues).toEqual([]);
    expect(plan?.data).toEqual({});
    expect(plan?.variants[0]?.kind === 'update' && plan.variants[0].data).toEqual({});
  });

  it('product Size Medium + variant Size M: re-import of its export changes nothing', () => {
    const p = product({ attributesJson: { Size: 'Medium', Color: 'Blue' } });
    const v = variant({ attributesJson: { Size: 'M', Color: 'Blue' }, inventory: { available: 5 } });
    const [exported] = toSheetExportRows(
      { ...p, brand: { name: 'Zara' }, variants: [v] },
      'TS-1',
      'Apparel',
    );
    expect(exported?.size).toBe('M');
    const input = exportRowToInput(exported!, 2);
    const { plan, issues } = planProductGroup(
      { key: 'TS-1', parent: input, children: [] },
      ctx({ product: p, variantsBySku: new Map([['TS-1', v]]) }),
    );
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(plan?.data).toEqual({});
    expect(plan?.variants[0]?.kind === 'update' && plan.variants[0].data).toEqual({});
  });

  it('variant without Size + product Size M: re-import of its export changes nothing', () => {
    const p = product({ attributesJson: { Size: 'M' } });
    const v = variant({ attributesJson: {} });
    const [exported] = toSheetExportRows({ ...p, brand: { name: 'Zara' }, variants: [v] }, 'TS-1', 'Apparel');
    expect(exported?.size).toBe('M');
    const { plan } = planProductGroup(
      { key: 'TS-1', parent: exportRowToInput(exported!, 2), children: [] },
      ctx({ product: p, variantsBySku: new Map([['TS-1', v]]) }),
    );
    expect(plan?.data).toEqual({});
    expect(plan?.variants[0]?.kind === 'update' && plan.variants[0].data).toEqual({});
  });

  it('Child rows keep the plain mapping (Colour -> variant Color only)', () => {
    const { plan } = planProductGroup(
      {
        key: 'TS',
        parent: parentRow({ sku: 'TS', title: 'Tee', finalDetail: 'Apparel', gstRate: '12%' }),
        children: [{ row: 3, indicator: 'Child', parentSku: 'TS', sku: 'TS-L', size: 'L', colour: 'Red', mrp: '999', sellingPrice: '799' }],
      },
      ctx(),
    );
    expect(plan?.create?.attributesJson).toEqual({});
    expect(plan?.variants[0]?.kind === 'create' && plan.variants[0].data.attributesJson).toEqual({
      Size: 'L',
      Color: 'Red',
    });
  });
});

describe('planProductGroup — NIT 5 weight unit', () => {
  const group = (weightKg: string): SheetGroup => ({
    key: 'W-1',
    parent: { row: 2, indicator: 'Parent', sku: 'W-1', title: 'Jar', finalDetail: 'Herbal Tea', gstRate: '5%', mrp: '100', sellingPrice: '90', weightKg },
    children: [],
  });

  it("weightUnit 'g' + '200' -> row error (nothing planned)", () => {
    const { plan, issues } = planProductGroup(group('200'), ctx({ weightUnitHint: 'g' }));
    expect(plan).toBeNull();
    expect(issues).toContainEqual(
      expect.objectContaining({ row: 2, level: 'error', message: 'Weight is in kg — 200 looks like grams; enter 0.2 (e.g. 0.2)' }),
    );
  });

  it("weightUnit 'g' + '0.2' -> ok", () => {
    const { plan, issues } = planProductGroup(group('0.2'), ctx({ weightUnitHint: 'g' }));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(plan?.variants[0]?.kind === 'create' && plan.variants[0].data.weightGrams).toBe(200);
  });

  it('no hint + 200 -> warning only', () => {
    const { plan, issues } = planProductGroup(group('200'), ctx());
    expect(plan?.variants).toHaveLength(1);
    expect(issues).toContainEqual(
      expect.objectContaining({ level: 'warning', message: 'Weight is in kg — 200 kg looks too high.' }),
    );
  });
});

describe('planProductGroup — validation rules', () => {
  it('a new single-row product without prices is a parent error', () => {
    const { plan, issues } = planProductGroup(
      { key: 'N-1', parent: { row: 2, sku: 'N-1', title: 'New', finalDetail: 'Apparel' }, children: [] },
      ctx(),
    );
    expect(plan).toBeNull();
    expect(issues.map((i) => i.message)).toContain(
      'New product needs MRP and Selling Price on the Parent row, or Child rows',
    );
  });

  it('a new product whose children are all invalid is not created', () => {
    const { plan, issues } = planProductGroup(
      {
        key: 'N',
        parent: { row: 2, sku: 'N', title: 'New', finalDetail: 'Apparel', gstRate: '5%' },
        children: [{ row: 3, parentSku: 'N', sku: 'N-1', mrp: '100', sellingPrice: '200' }],
      },
      ctx(),
    );
    expect(plan).toBeNull();
    expect(issues.map((i) => [i.row, i.message])).toEqual([
      [3, 'Selling Price ₹200 is more than MRP ₹100.'],
      [2, 'Product not created — none of its variant rows are valid'],
    ]);
  });

  it('a parent-only row on a multi-variant product with prices but a foreign SKU is an error', () => {
    const { plan, issues } = planProductGroup(
      { key: 'TS-1', parent: parentRow({ mrp: '999', sellingPrice: '799' }), children: [] },
      ctx({ product: product({ activeVariantCount: 2 }) }),
    );
    expect(plan).toBeNull();
    expect(issues[0]?.message).toBe(
      "Parent row has prices but no Child rows, and SKU TS-1 isn't a variant of this product — add Child rows for its variants.",
    );
  });

  it('a Child image 2 on an existing product is ignored with a warning', () => {
    const { plan, issues } = planProductGroup(
      {
        key: 'TS-1',
        children: [{ row: 3, parentSku: 'TS-1', sku: 'TS-1', image1: '/a.jpg', image2: '/b.jpg' }],
      },
      ctx({ product: product(), variantsBySku: new Map([['TS-1', variant()]]) }),
    );
    expect(plan?.gallery).toBeNull();
    expect(plan?.variants[0]?.kind === 'update' && plan.variants[0].data).toEqual({ imageUrl: '/a.jpg' });
    expect(issues.map((i) => i.message)).toEqual([
      "image 2–5 on Child rows are only used to build a new product's gallery — ignored.",
    ]);
  });
});

describe('toSheetExportRows', () => {
  const base = (overrides: Partial<ExportProduct> = {}): ExportProduct => ({
    title: "Men's Tee",
    description: 'Soft',
    hsnCode: '61091000',
    taxRatePct: 12,
    attributesJson: { Color: 'Blue', Dimensions: '10x10x2' },
    brand: { name: 'Zara' },
    images: [
      { url: '/b.jpg', position: 1 },
      { url: '/a.jpg', position: 0 },
    ],
    variants: [],
    ...overrides,
  });
  const v = (sku: string, overrides: Partial<ExportProduct['variants'][number]> = {}) => ({
    sku,
    mrp: 99900,
    sellingPrice: 79900,
    costPrice: 79000 as number | null,
    weightGrams: 200,
    attributesJson: { Size: 'S', Color: 'Blue' } as unknown,
    priceSlabsJson: [{ minQty: 5, unitPrice: 77922 }, { minQty: 9, unitPrice: 74925 }] as unknown,
    imageUrl: '/s.jpg' as string | null,
    inventory: { available: 50 } as { available: number } | null,
    ...overrides,
  });

  it('multi-variant -> Parent + Child rows with tiers, cost and repeated product fields', () => {
    const rows = toSheetExportRows(base({ variants: [v('TS-S'), v('TS-M', { costPrice: null })] }), 'TS', 'Apparel');
    expect(rows.map((r) => [r.indicator, r.parentSku, r.sku])).toEqual([
      ['Parent', null, 'TS'],
      ['Child', 'TS', 'TS-S'],
      ['Child', 'TS', 'TS-M'],
    ]);
    const [p, s, m] = rows;
    expect(p).toMatchObject({
      finalDetail: 'Apparel',
      brand: 'Zara',
      title: "Men's Tee",
      colour: 'Blue',
      dimensions: '10x10x2',
      gstRate: '12%',
      taxType: 'Inclusive',
      image1: '/a.jpg',
      image2: '/b.jpg',
      mrp: null,
      size: null,
    });
    expect(s).toMatchObject({
      title: "Men's Tee - S / Blue",
      size: 'S',
      colour: 'Blue',
      weightKg: 0.2,
      mrp: 999,
      sellingPrice: 799,
      purchasePrice: 790,
      stock: 50,
      packOf: 1,
      image1: '/s.jpg',
      gstRate: '12%',
      tier3: expect.closeTo(25, 6),
      tier4: null,
    });
    expect(s?.tier2).toBeCloseTo(22, 6);
    expect(s?.tier1).toBeCloseTo(20.02, 2);
    expect(m?.purchasePrice).toBeNull();
  });

  it('single variant whose SKU is the Parent SKU -> one Parent row with prices', () => {
    const rows = toSheetExportRows(base({ variants: [v('TS')] }), 'TS', 'Apparel');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ indicator: 'Parent', sku: 'TS', size: 'S', colour: 'Blue', mrp: 999 });
  });

  it('non-representable slabs -> blank tiers; zero variants -> Parent row only', () => {
    const [, child] = toSheetExportRows(
      base({ variants: [v('A-1', { priceSlabsJson: [{ minQty: 2, unitPrice: 70000 }] }), v('A-2')] }),
      'A',
      'Apparel',
    );
    expect([child?.tier2, child?.tier3, child?.tier4, child?.tier5]).toEqual([null, null, null, null]);
    expect(toSheetExportRows(base(), 'P-tee', 'Apparel')).toHaveLength(1);
  });

  it('Pack Of export rule, over-long values blank, Child title truncated to 200', () => {
    const long = 'x'.repeat(201);
    const rows = toSheetExportRows(
      base({
        title: 'T'.repeat(199),
        brand: { name: long },
        variants: [
          v('A-1', { attributesJson: { 'pack of': '2' } }),
          v('A-2', { attributesJson: { 'Pack Of': '1' } }),
          v('A-3', { attributesJson: { 'Pack Of': 'dozen', Size: long } }),
        ],
      }),
      'A',
      'Apparel',
    );
    expect(rows.slice(1).map((r) => r.packOf)).toEqual([2, null, null]);
    expect(rows[0]?.brand).toBeNull();
    expect(rows[3]?.size).toBeNull();
    expect(rows[1]?.title).toHaveLength(200);
  });

  it('gallery: first 5 of the de-duplicated list; all blank when one URL is too long', () => {
    const urls = ['/a', '/a', '/b', '/c', '/d', '/e', '/f'];
    const [p] = toSheetExportRows(
      base({ images: urls.map((url, position) => ({ url, position })) }),
      'A',
      'Apparel',
    );
    expect([p?.image1, p?.image2, p?.image3, p?.image4, p?.image5]).toEqual(['/a', '/b', '/c', '/d', '/e']);
    const [q] = toSheetExportRows(
      base({ images: [{ url: '/a', position: 0 }, { url: `/${'x'.repeat(2048)}`, position: 1 }] }),
      'A',
      'Apparel',
    );
    expect([q?.image1, q?.image2]).toEqual([null, null]);
  });
});
