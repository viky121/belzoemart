import { buildSlabs, slabIndexForQty } from './slab-pricing';

describe('buildSlabs', () => {
  it('has no table when the admin set no tiers (flat price, nothing invented)', () => {
    expect(buildSlabs(71500, 50050, [])).toEqual([]);
    expect(buildSlabs(71500, 50050, undefined)).toEqual([]);
  });

  it('builds columns from the base price plus the admin tiers', () => {
    const slabs = buildSlabs(71500, 50050, [
      { minQty: 2, unitPrice: 48000 },
      { minQty: 12, unitPrice: 45000 },
    ]);
    expect(slabs.map((s) => [s.label, s.min, s.price])).toEqual([
      ['1', 1, 50050],
      ['2-11', 2, 48000],
      ['12+', 12, 45000],
    ]);
    expect(slabs[0].marginPct).toBeCloseTo(30, 1);
  });

  it('sorts tiers and picks the slab for a quantity', () => {
    const slabs = buildSlabs(1000, 900, [
      { minQty: 10, unitPrice: 800 },
      { minQty: 5, unitPrice: 850 },
    ]);
    expect(slabs.map((s) => s.min)).toEqual([1, 5, 10]);
    expect(slabIndexForQty(slabs, 1)).toBe(0);
    expect(slabIndexForQty(slabs, 7)).toBe(1);
    expect(slabIndexForQty(slabs, 10)).toBe(2);
    expect(slabIndexForQty([], 5)).toBe(0);
  });
});
