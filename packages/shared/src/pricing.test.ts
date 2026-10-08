import fc from 'fast-check';
import {
  computeGst,
  computeTotals,
  couponDiscount,
  gstSplitLabel,
  inclusiveLineTaxes,
  isGstInclusiveSnapshot,
  splitGst,
  subtotalOf,
  weightedTaxRate,
  type CouponSpec,
  type PriceLine,
} from './pricing';
import { paise } from './money';
import { priceBreakupSchema } from './schemas';

/**
 * Property-based tests for the pricing/tax/coupon engine (BR-4..BR-9).
 * These are the highest-value invariants in the system (money + tax).
 * Prices are GST-inclusive: GST is extracted from the price, never added.
 */

// Domain generators
const line: fc.Arbitrary<PriceLine> = fc.record({
  unitPrice: fc.integer({ min: 0, max: 5_000_000 }).map((n) => paise(n)),
  quantity: fc.integer({ min: 0, max: 20 }),
  taxRatePct: fc.constantFrom(0, 5, 12, 18, 28),
});
const lines = fc.array(line, { minLength: 1, maxLength: 8 });
const money = (max: number) => fc.integer({ min: 0, max }).map((n) => paise(n));
const anyCoupon = fc.option(
  fc.oneof(
    fc.record({ kind: fc.constant('flat' as const), value: fc.integer({ min: 0, max: 5_000_000 }) }),
    fc.record({ kind: fc.constant('percent' as const), value: fc.integer({ min: 0, max: 100 }) }),
    fc.record({ kind: fc.constant('free_shipping' as const), value: fc.constant(0) }),
  ),
  { nil: undefined },
);

/**
 * Independent oracle for the inclusive order tax: floor pro-rata discount
 * shares, remainder to the last line with value, then Σ per-line extraction.
 */
function oracleTax(ls: PriceLine[], discount: number): number {
  const gross = ls.map((l) => l.unitPrice * l.quantity);
  const total = gross.reduce((s, g) => s + g, 0);
  const shares = gross.map((g) => (total === 0 ? 0 : Number((BigInt(discount) * BigInt(g)) / BigInt(total))));
  let rem = discount - shares.reduce((s, x) => s + x, 0);
  // Remainder to the last line with value; a share never exceeds its line value,
  // so any overflow spills back to earlier lines with value.
  for (let i = gross.length - 1; i >= 0 && rem > 0; i--) {
    const add = Math.min(rem, gross[i]! - shares[i]!);
    shares[i] = shares[i]! + add;
    rem -= add;
  }
  return ls.reduce((s, l, i) => {
    const net = gross[i]! - shares[i]!;
    return s + (l.taxRatePct > 0 ? Math.round((net * l.taxRatePct) / (100 + l.taxRatePct)) : 0);
  }, 0);
}

describe('computeGst (legacy exclusive maths)', () => {
  it('PBT-03: cgst + sgst + igst always equals the total tax', () => {
    fc.assert(
      fc.property(money(10_000_000), fc.constantFrom(0, 5, 12, 18, 28), fc.boolean(), (amount, rate, sameState) => {
        const g = computeGst(amount, rate, sameState);
        const tax = Math.round((amount * rate) / 100);
        expect(g.cgst + g.sgst + g.igst).toBe(tax);
      }),
    );
  });

  it('PBT-03: same-state ⇒ igst=0 & cgst=sgst(±1 paise); inter-state ⇒ cgst=sgst=0', () => {
    fc.assert(
      fc.property(money(10_000_000), fc.constantFrom(5, 12, 18, 28), (amount, rate) => {
        const same = computeGst(amount, rate, true);
        expect(same.igst).toBe(0);
        expect(Math.abs(same.cgst - same.sgst)).toBeLessThanOrEqual(1);
        const inter = computeGst(amount, rate, false);
        expect(inter.cgst).toBe(0);
        expect(inter.sgst).toBe(0);
      }),
    );
  });
});

describe('splitGst', () => {
  it('parts sum to the tax; SGST absorbs the odd paisa', () => {
    fc.assert(
      fc.property(money(10_000_000), (tax) => {
        const same = splitGst(tax, true);
        expect(same.cgst + same.sgst + same.igst).toBe(tax);
        expect(same.sgst - same.cgst).toBe(tax % 2);
        expect(splitGst(tax, false)).toEqual({ cgst: 0, sgst: 0, igst: tax });
      }),
    );
  });
});

describe('couponDiscount', () => {
  it('PBT-03: discount never exceeds subtotal', () => {
    fc.assert(
      fc.property(
        money(10_000_000),
        fc.oneof(
          fc.record({ kind: fc.constant('flat' as const), value: fc.integer({ min: 0, max: 20_000_000 }) }),
          fc.record({ kind: fc.constant('percent' as const), value: fc.integer({ min: 0, max: 100 }) }),
        ),
        (subtotal, coupon) => {
          const d = couponDiscount(coupon as CouponSpec, subtotal);
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(subtotal);
        },
      ),
    );
  });

  it('PBT-03: percent discount respects the maxDiscount cap', () => {
    fc.assert(
      fc.property(money(10_000_000), fc.integer({ min: 1, max: 100 }), fc.integer({ min: 0, max: 500_000 }), (subtotal, pct, cap) => {
        const d = couponDiscount({ kind: 'percent', value: pct, maxDiscount: paise(cap) }, subtotal);
        expect(d).toBeLessThanOrEqual(cap);
      }),
    );
  });
});

describe('inclusiveLineTaxes', () => {
  it('shares sum to the discount, each share ≤ gross, each line tax ≤ net', () => {
    fc.assert(
      fc.property(lines, fc.integer({ min: 0, max: 1_000_000_000 }), (ls, rawDiscount) => {
        const discount = paise(Math.min(rawDiscount, subtotalOf(ls)));
        const out = inclusiveLineTaxes(ls, discount);
        expect(out.reduce((s, l) => s + l.discount, 0)).toBe(discount);
        out.forEach((l, i) => {
          expect(l.gross).toBe(ls[i]!.unitPrice * ls[i]!.quantity);
          expect(l.discount).toBeGreaterThanOrEqual(0);
          expect(l.discount).toBeLessThanOrEqual(l.gross);
          expect(l.net).toBe(l.gross - l.discount);
          expect(l.tax).toBeGreaterThanOrEqual(0);
          expect(l.tax).toBeLessThanOrEqual(l.net);
          if (ls[i]!.taxRatePct === 0) expect(l.tax).toBe(0);
        });
      }),
    );
  });

  it('an all-0% cart carries no GST', () => {
    fc.assert(
      fc.property(lines, anyCoupon, (ls, coupon) => {
        const zero = ls.map((l) => ({ ...l, taxRatePct: 0 }));
        const b = computeTotals({ lines: zero, sameState: true, shipping: paise(0), codFee: paise(0), coupon: coupon as CouponSpec | undefined });
        expect(b.tax).toBe(0);
        expect(b.gst).toEqual({ cgst: 0, sgst: 0, igst: 0 });
      }),
    );
  });
});

describe('computeTotals', () => {
  it('PBT-03: GST-inclusive invariants for any cart/coupon', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), money(200_000), money(50_000), anyCoupon, (ls, sameState, shipping, codFee, coupon) => {
        const b = computeTotals({ lines: ls, sameState, shipping, codFee, coupon: coupon as CouponSpec | undefined });
        expect(b.grandTotal).toBeGreaterThanOrEqual(0);
        expect(b.discount).toBeLessThanOrEqual(b.subtotal);
        // Tax is inside the price, not added on top.
        expect(b.grandTotal).toBe(b.subtotal - b.discount + b.shipping + b.codFee);
        expect(b.gst.cgst + b.gst.sgst + b.gst.igst).toBe(b.tax);
        expect(b.tax).toBeGreaterThanOrEqual(0);
        expect(b.tax).toBeLessThanOrEqual(b.subtotal - b.discount);
        if (sameState) {
          expect(b.gst.igst).toBe(0);
          expect(Math.abs(b.gst.cgst - b.gst.sgst)).toBeLessThanOrEqual(1);
        } else {
          expect(b.gst.cgst).toBe(0);
          expect(b.gst.sgst).toBe(0);
        }
      }),
    );
  });

  it('no blended-rate drift: tax equals Σ per-line extraction (independent oracle)', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), anyCoupon, (ls, sameState, coupon) => {
        const b = computeTotals({ lines: ls, sameState, shipping: paise(0), codFee: paise(0), coupon: coupon as CouponSpec | undefined });
        expect(b.tax).toBe(oracleTax(ls, b.discount));
      }),
    );
  });

  it('a 0% line in a mixed cart contributes no GST', () => {
    fc.assert(
      fc.property(lines, money(5_000_000), fc.integer({ min: 1, max: 20 }), (ls, unitPrice, quantity) => {
        const mixed = [...ls, { unitPrice, quantity, taxRatePct: 0 }];
        const perLine = inclusiveLineTaxes(mixed, paise(0));
        expect(perLine[perLine.length - 1]!.tax).toBe(0);
        const b = computeTotals({ lines: mixed, sameState: true, shipping: paise(0), codFee: paise(0) });
        expect(b.tax).toBe(perLine.reduce((s, l) => s + l.tax, 0));
      }),
    );
  });

  it('PBT-03: free_shipping coupon zeroes the shipping component', () => {
    fc.assert(
      fc.property(lines, money(200_000), (ls, shipping) => {
        const b = computeTotals({
          lines: ls,
          sameState: true,
          shipping,
          codFee: paise(0),
          coupon: { kind: 'free_shipping', value: 0 },
        });
        expect(b.shipping).toBe(0);
      }),
    );
  });

  it('is deterministic: same input ⇒ same breakup', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), money(100_000), (ls, sameState, shipping) => {
        const input = { lines: ls, sameState, shipping, codFee: paise(0) };
        expect(computeTotals(input)).toEqual(computeTotals(input));
      }),
    );
  });

  it('PBT-02: PriceBreakup round-trips through the shared schema', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), (ls, sameState) => {
        const b = computeTotals({ lines: ls, sameState, shipping: paise(4900), codFee: paise(0) });
        const parsed = priceBreakupSchema.parse(JSON.parse(JSON.stringify(b)));
        expect(parsed).toEqual(b);
      }),
    );
  });
});

describe('isGstInclusiveSnapshot', () => {
  it('is true for every engine (inclusive) output', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), money(200_000), money(50_000), anyCoupon, (ls, sameState, shipping, codFee, coupon) => {
        const b = computeTotals({ lines: ls, sameState, shipping, codFee, coupon: coupon as CouponSpec | undefined });
        expect(isGstInclusiveSnapshot(b)).toBe(true);
      }),
    );
  });

  it('is false for a legacy exclusive snapshot (GST added on top) with tax > 0', () => {
    fc.assert(
      fc.property(lines, fc.boolean(), money(200_000), money(50_000), (ls, sameState, shipping, codFee) => {
        const subtotal = subtotalOf(ls);
        const g = computeGst(subtotal, weightedTaxRate(ls), sameState);
        const tax = g.cgst + g.sgst + g.igst;
        fc.pre(tax > 0);
        const legacy = { subtotal, discount: 0, shipping, codFee, tax, grandTotal: subtotal + tax + shipping + codFee };
        expect(isGstInclusiveSnapshot(legacy)).toBe(false);
      }),
    );
  });
});

describe('examples (PBT-10 pins)', () => {
  const rice: PriceLine[] = [{ unitPrice: paise(958800), quantity: 1, taxRatePct: 5 }];
  const mixed: PriceLine[] = [
    { unitPrice: paise(49900), quantity: 2, taxRatePct: 5 },
    { unitPrice: paise(29900), quantity: 1, taxRatePct: 18 },
    { unitPrice: paise(15050), quantity: 3, taxRatePct: 5 },
  ];

  it('E5: same-state 18% order with a 10% coupon extracts GST from the net', () => {
    const b = computeTotals({
      lines: [{ unitPrice: paise(100000), quantity: 2, taxRatePct: 18 }],
      sameState: true,
      shipping: paise(5000),
      codFee: paise(0),
      coupon: { kind: 'percent', value: 10 },
    });
    expect(b.subtotal).toBe(200000);
    expect(b.discount).toBe(20000); // 10% of 200000
    // net 180000 incl. 18% GST → 180000 × 18/118 = 27457.63 → 27458
    expect(b.tax).toBe(27458);
    expect(b.gst).toEqual({ cgst: 13729, sgst: 13729, igst: 0 });
    expect(b.grandTotal).toBe(180000 + 5000);
  });

  it('E1: ₹9,588 @5% intra-state is charged ₹9,588 with ₹456.57 GST inside', () => {
    const b = computeTotals({ lines: rice, sameState: true, shipping: paise(0), codFee: paise(0) });
    expect(b.subtotal).toBe(958800);
    expect(b.discount).toBe(0);
    expect(b.tax).toBe(45657); // 958800 × 5/105 = 45657.14
    expect(b.gst).toEqual({ cgst: 22828, sgst: 22829, igst: 0 });
    expect(b.grandTotal).toBe(958800);
    expect(b.subtotal - b.discount - b.tax).toBe(913143); // taxable value
  });

  it('E2: ₹9,588 @5% inter-state → all IGST, same total', () => {
    const b = computeTotals({ lines: rice, sameState: false, shipping: paise(0), codFee: paise(0) });
    expect(b.tax).toBe(45657);
    expect(b.gst).toEqual({ cgst: 0, sgst: 0, igst: 45657 });
    expect(b.grandTotal).toBe(958800);
  });

  it('E3: the legacy exclusive snapshot of E1 is detected as exclusive', () => {
    const legacy = { subtotal: 958800, discount: 0, shipping: 0, codFee: 0, tax: 47940, grandTotal: 1006740 };
    expect(isGstInclusiveSnapshot(legacy)).toBe(false);
    const inclusive = { ...legacy, tax: 45657, grandTotal: 958800 };
    expect(isGstInclusiveSnapshot(inclusive)).toBe(true);
    const noTax = { subtotal: 10000, discount: 0, shipping: 4900, codFee: 0, tax: 0, grandTotal: 14900 };
    expect(isGstInclusiveSnapshot(noTax)).toBe(true);
  });

  it('E4: mixed 5%/18% cart with a flat coupon extracts GST per line', () => {
    const perLine = inclusiveLineTaxes(mixed, paise(3333));
    expect(perLine.map((l) => l.gross)).toEqual([99800, 29900, 45150]);
    expect(perLine.map((l) => l.discount)).toEqual([1902, 569, 862]);
    expect(perLine.map((l) => l.net)).toEqual([97898, 29331, 44288]);
    expect(perLine.map((l) => l.tax)).toEqual([4662, 4474, 2109]);

    const input = { lines: mixed, shipping: paise(4900), codFee: paise(3900), coupon: { kind: 'flat' as const, value: 3333 } };
    const intra = computeTotals({ ...input, sameState: true });
    expect(intra.subtotal).toBe(174850);
    expect(intra.discount).toBe(3333);
    expect(intra.tax).toBe(11245);
    expect(intra.gst).toEqual({ cgst: 5622, sgst: 5623, igst: 0 });
    expect(intra.subtotal - intra.discount - intra.tax).toBe(160272);
    expect(intra.grandTotal).toBe(180317);
    // A rounded blended rate (7%) would have extracted 11221 — the drift removed.
    expect(weightedTaxRate(mixed)).toBe(7);

    const inter = computeTotals({ ...input, sameState: false });
    expect(inter.gst).toEqual({ cgst: 0, sgst: 0, igst: 11245 });
    expect(inter.grandTotal).toBe(180317);
  });

  it('gstSplitLabel names the split', () => {
    expect(gstSplitLabel({ igst: 45657 })).toBe('IGST');
    expect(gstSplitLabel({ igst: 0 })).toBe('CGST+SGST');
  });

  it('subtotalOf rejects negative quantities', () => {
    expect(() => subtotalOf([{ unitPrice: paise(100), quantity: -1, taxRatePct: 5 }])).toThrow(RangeError);
  });
});
