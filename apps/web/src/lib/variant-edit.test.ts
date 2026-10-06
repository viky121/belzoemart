import {
  initialEdit,
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
    expect(initialEdit(row())).toEqual({ sku: 'TEA-1KG', mrp: '899.00', price: '799.50', stock: '10' });
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
      imageUrl: '/uploads/tea.jpg',
      priceSlabs: [{ minQty: 5, unitPrice: 75000 }],
    });
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