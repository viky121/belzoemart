import {
  initialEdit,
  mergeVariantAttrs,
  pickAttr,
  removeVariantConfirmText,
  removeVariantSuccessMessage,
  stockDelta,
  variantLabel,
  toPaise,
  toRupees,
  validateEdits,
  variantUpsertBody,
  type AdminVariantRow,
  type VariantEdit,
} from '@/lib/variant-edit';

function row(over: Partial<AdminVariantRow> = {}): AdminVariantRow {
  return {
    id: 'v1',
    productId: 'p1',
    sku: 'TEA-1KG',
    mrp: 89900,
    sellingPrice: 79950,
    attributesJson: { Size: '1 kg' },
    priceSlabsJson: [{ minQty: 5, unitPrice: 75000 }],
    weightGrams: 1000,
    imageUrl: '/uploads/tea.jpg',
    costPrice: null,
    inventory: { available: 10 },
    ...over,
  };
}

describe('variant-edit — money conversion', () => {
  it('converts rupee strings to integer paise', () => {
    expect(toPaise('19.99')).toBe(1999);
    expect(toPaise('799.5')).toBe(79950);
    expect(toPaise('')).toBe(0);
  });

  it('formats paise as rupees with two decimals', () => {
    expect(toRupees(79950)).toBe('799.50');
  });
});

describe('variant-edit — initialEdit', () => {
  it('formats rupees and stock', () => {
    expect(initialEdit(row())).toEqual({
      sku: 'TEA-1KG',
      mrp: '899.00',
      price: '799.50',
      cost: '',
      stock: '10',
    });
  });

  it('formats a recorded purchase price in rupees', () => {
    expect(initialEdit(row({ costPrice: 79000 })).cost).toBe('790.00');
  });

  it('treats missing inventory as 0 stock', () => {
    expect(initialEdit(row({ inventory: null })).stock).toBe('0');
  });
});

describe('variant-edit — variantUpsertBody', () => {
  it('returns null for an untouched edit', () => {
    const v = row();
    expect(variantUpsertBody(v, initialEdit(v))).toBeNull();
  });

  it('returns null when only stock changed', () => {
    const v = row();
    expect(variantUpsertBody(v, { ...initialEdit(v), stock: '25' })).toBeNull();
  });

  it('preserves slabs/attributes/weight/image exactly and converts prices to paise', () => {
    const v = row();
    const body = variantUpsertBody(v, { ...initialEdit(v), price: '780', mrp: '899' });
    expect(body).toEqual({
      id: 'v1',
      productId: 'p1',
      sku: 'TEA-1KG',
      mrp: 89900,
      sellingPrice: 78000,
      attributes: { Size: '1 kg' },
      weightGrams: 1000,
      weightValue: null,
      weightUnit: null,
      imageUrl: '/uploads/tea.jpg',
      priceSlabs: [{ minQty: 5, unitPrice: 75000 }],
      costPrice: null,
    });
  });

  it('returns null for an untouched edit with a recorded purchase price', () => {
    const v = row({ costPrice: 79000 });
    expect(variantUpsertBody(v, initialEdit(v))).toBeNull();
  });

  it('treats a purchase-price-only change as a change and converts it to paise', () => {
    const v = row();
    const body = variantUpsertBody(v, { ...initialEdit(v), cost: '790.50' });
    expect(body).not.toBeNull();
    expect(body?.costPrice).toBe(79050);
    expect(body?.priceSlabs).toEqual([{ minQty: 5, unitPrice: 75000 }]);
    expect(body?.attributes).toEqual({ Size: '1 kg' });
  });

  it('sends costPrice null when the purchase price is cleared', () => {
    const v = row({ costPrice: 79000 });
    const body = variantUpsertBody(v, { ...initialEdit(v), cost: '  ' });
    expect(body?.costPrice).toBeNull();
  });

  it('always carries the current costPrice when another field changes', () => {
    const v = row({ costPrice: 79000 });
    expect(variantUpsertBody(v, { ...initialEdit(v), price: '780' })?.costPrice).toBe(79000);
  });

  it('sends a trimmed SKU change', () => {
    const v = row();
    expect(variantUpsertBody(v, { ...initialEdit(v), sku: '  TEA-1000G ' })?.sku).toBe('TEA-1000G');
  });

  it('maps null imageUrl to undefined and null slabs/attributes to empty', () => {
    const v = row({ imageUrl: null, priceSlabsJson: null, attributesJson: null });
    const body = variantUpsertBody(v, { ...initialEdit(v), price: '700' });
    expect(body?.imageUrl).toBeUndefined();
    expect(body?.priceSlabs).toEqual([]);
    expect(body?.attributes).toEqual({});
  });
});

describe('variant-edit — stockDelta', () => {
  it('computes target - current', () => {
    const v = row();
    expect(stockDelta(v, { ...initialEdit(v), stock: '25' })).toBe(15);
    expect(stockDelta(v, { ...initialEdit(v), stock: '0' })).toBe(-10);
  });

  it('treats missing inventory as 0', () => {
    const v = row({ inventory: null });
    expect(stockDelta(v, { ...initialEdit(v), stock: '7' })).toBe(7);
  });
});

describe('variant-edit — validateEdits', () => {
  const v1 = row();
  const v2 = row({ id: 'v2', sku: 'TEA-500G', mrp: 50000, sellingPrice: 45000 });
  const base = (): Record<string, VariantEdit> => ({ v1: initialEdit(v1), v2: initialEdit(v2) });

  it('returns null for a valid set', () => {
    expect(validateEdits([v1, v2], base())).toBeNull();
  });

  it('requires a SKU', () => {
    const edits = base();
    edits.v1.sku = '   ';
    expect(validateEdits([v1, v2], edits)).toMatch(/SKU is required/);
  });

  it('blocks selling price above MRP', () => {
    const edits = base();
    edits.v1.price = '900';
    expect(validateEdits([v1, v2], edits)).toBe('TEA-1KG: selling price cannot exceed MRP');
  });

  it('blocks invalid money', () => {
    const edits = base();
    edits.v1.mrp = '';
    expect(validateEdits([v1, v2], edits)).toMatch(/valid MRP/);
    edits.v1.mrp = '899';
    edits.v1.price = '-1';
    expect(validateEdits([v1, v2], edits)).toMatch(/valid selling price/);
  });

  it('blocks negative or non-integer stock', () => {
    const edits = base();
    edits.v2.stock = '-3';
    expect(validateEdits([v1, v2], edits)).toMatch(/TEA-500G: stock must be a whole number/);
    edits.v2.stock = '2.5';
    expect(validateEdits([v1, v2], edits)).toMatch(/stock must be a whole number/);
  });

  it('blocks a duplicate SKU within the product', () => {
    const edits = base();
    edits.v2.sku = ' TEA-1KG ';
    expect(validateEdits([v1, v2], edits)).toBe('SKU "TEA-1KG" is used twice');
  });

  it('allows a blank purchase price and blocks an invalid one', () => {
    const edits = base();
    edits.v1.cost = '   ';
    expect(validateEdits([v1, v2], edits)).toBeNull();
    edits.v1.cost = '-5';
    expect(validateEdits([v1, v2], edits)).toBe(
      'TEA-1KG: enter a valid purchase price (0 or more), or leave it blank.',
    );
    edits.v1.cost = 'abc';
    expect(validateEdits([v1, v2], edits)).toMatch(/valid purchase price/);
    edits.v1.cost = '950'; // a purchase price may exceed MRP
    expect(validateEdits([v1, v2], edits)).toBeNull();
  });
});

describe('variant-edit — pickAttr', () => {
  it('returns the trimmed value of the first matching key, case-insensitively', () => {
    expect(pickAttr({ size: 'M ' }, 'size')).toBe('M');
    expect(pickAttr({ Colour: 'Red' }, 'color', 'colour')).toBe('Red');
  });

  it('returns an empty string when nothing matches', () => {
    expect(pickAttr({ Fabric: 'Cotton' }, 'size')).toBe('');
    expect(pickAttr(null, 'size')).toBe('');
    expect(pickAttr(undefined, 'color', 'colour')).toBe('');
  });
});

describe('variant-edit — mergeVariantAttrs', () => {
  it('keeps every other attribute such as Pack Of', () => {
    expect(mergeVariantAttrs({ Size: 'S', Color: 'Blue', 'Pack Of': '2' }, 'M', 'Black')).toEqual({
      Size: 'M',
      Color: 'Black',
      'Pack Of': '2',
    });
  });

  it('replaces Size/Color/Colour keys case-insensitively and drops blank values', () => {
    expect(mergeVariantAttrs({ size: 'S', Colour: 'Red', Fabric: 'Cotton' }, ' L ', '  ')).toEqual({
      Size: 'L',
      Fabric: 'Cotton',
    });
  });

  it('round-trips a legacy lower-case size read via pickAttr', () => {
    expect(
      mergeVariantAttrs({ size: 'M', 'Pack Of': '2' }, pickAttr({ size: 'M' }, 'size'), ''),
    ).toEqual({ Size: 'M', 'Pack Of': '2' });
  });

  it('handles null existing attributes', () => {
    expect(mergeVariantAttrs(null, 'S', '')).toEqual({ Size: 'S' });
  });
});

describe('variant-edit — remove variant helpers', () => {
  it('labels a variant by size and colour plus SKU', () => {
    expect(variantLabel({ Size: 'M', Color: 'Black' }, 'TS-M-BLK')).toBe('M / Black (TS-M-BLK)');
  });

  it('labels a size-only variant (keys matched case-insensitively)', () => {
    expect(variantLabel({ size: '500 ml' }, 'OIL-500')).toBe('500 ml (OIL-500)');
    expect(variantLabel({ Size: '500 ml' }, 'OIL-500')).toBe('500 ml (OIL-500)');
  });

  it('falls back to the SKU without size/colour', () => {
    expect(variantLabel(null, 'OIL-500')).toBe('OIL-500');
    expect(variantLabel(undefined, 'OIL-500')).toBe('OIL-500');
    expect(variantLabel({ Fabric: 'Cotton', Size: '  ' }, 'OIL-500')).toBe('OIL-500');
  });

  it('names the variant in the confirm text', () => {
    const text = removeVariantConfirmText('500 ml (OIL-500)');
    expect(text).toContain('"500 ml (OIL-500)"');
    expect(text).toMatch(/kept for order history/);
  });

  it('says whether the variant was deleted or deactivated', () => {
    expect(removeVariantSuccessMessage('500 ml (OIL-500)', 'deleted')).toBe(
      'Removed "500 ml (OIL-500)" (deleted).',
    );
    expect(removeVariantSuccessMessage('500 ml (OIL-500)', 'deactivated')).toMatch(
      /^Removed "500 ml \(OIL-500\)" — .*kept for order history\.$/,
    );
  });
});