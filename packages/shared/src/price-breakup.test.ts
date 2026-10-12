import { paise } from './money';
import { computeTotals, type CouponSpec, type PriceLine } from './pricing';
import { breakupView, snapshotFromBreakup, type OrderMoneySnapshot } from './price-breakup';

const sumRows = (s: OrderMoneySnapshot) => breakupView(s).rows.reduce((t, r) => t + r.amount, 0);

const rice: PriceLine[] = [{ unitPrice: paise(958800), quantity: 1, taxRatePct: 5 }];
const mixed: PriceLine[] = [
  { unitPrice: paise(49900), quantity: 2, taxRatePct: 5 },
  { unitPrice: paise(29900), quantity: 1, taxRatePct: 18 },
  { unitPrice: paise(15050), quantity: 3, taxRatePct: 5 },
];

function engine(lines: PriceLine[], sameState: boolean, shipping = 0, codFee = 0, coupon?: CouponSpec) {
  return snapshotFromBreakup(computeTotals({ lines, sameState, shipping: paise(shipping), codFee: paise(codFee), coupon }));
}

describe('breakupView — GST-inclusive orders', () => {
  it('E1: ₹9,588 @5% intra-state shows "Includes GST" and no added GST row', () => {
    const s = engine(rice, true);
    const v = breakupView(s);
    expect(v.inclusive).toBe(true);
    expect(v.rows.find((r) => r.key === 'gst')).toBeUndefined();
    expect(v.gstNote).toEqual({ label: 'Includes GST (CGST+SGST)', amount: 45657 });
    expect(sumRows(s)).toBe(958800);
    expect(v.grandTotal).toBe(958800);
  });

  it('E2: inter-state labels the included GST as IGST', () => {
    expect(breakupView(engine(rice, false)).gstNote).toEqual({ label: 'Includes GST (IGST)', amount: 45657 });
  });

  it('E4: coupon + delivery + COD rows sum to the grand total', () => {
    const s = engine(mixed, true, 4900, 3900, { kind: 'flat', value: 3333 });
    const v = breakupView(s);
    expect(v.rows.map((r) => r.key)).toEqual(['subtotal', 'discount', 'shipping', 'codFee']);
    expect(v.rows.find((r) => r.key === 'discount')!.amount).toBe(-3333);
    expect(v.gstNote).toEqual({ label: 'Includes GST (CGST+SGST)', amount: 11245 });
    expect(sumRows(s)).toBe(180317);
  });

  it('visible rows always sum to the grand total for engine outputs', () => {
    const coupons: (CouponSpec | undefined)[] = [
      undefined,
      { kind: 'flat', value: 5000 },
      { kind: 'percent', value: 15 },
      { kind: 'free_shipping', value: 0 },
    ];
    for (const lines of [rice, mixed, [{ unitPrice: paise(6800), quantity: 2, taxRatePct: 0 }, ...mixed]]) {
      for (const sameState of [true, false]) {
        for (const coupon of coupons) {
          const s = engine(lines, sameState, 4900, 3900, coupon);
          expect(breakupView(s).inclusive).toBe(true);
          expect(sumRows(s)).toBe(s.grandTotal);
        }
      }
    }
  });
});

describe('breakupView — legacy GST-exclusive orders', () => {
  it('E3: keeps GST as an added row so the rows still reconcile', () => {
    const s: OrderMoneySnapshot = {
      subtotal: 958800, discount: 0, shipping: 0, codFee: 0,
      tax: 47940, cgst: 23970, sgst: 23970, igst: 0, grandTotal: 1006740,
    };
    const v = breakupView(s);
    expect(v.inclusive).toBe(false);
    expect(v.rows.find((r) => r.key === 'gst')).toEqual({ key: 'gst', label: 'GST (CGST+SGST)', amount: 47940 });
    expect(v.gstNote).toBeNull();
    expect(sumRows(s)).toBe(1006740);
  });

  it('labels a legacy inter-state GST row as IGST', () => {
    const s: OrderMoneySnapshot = {
      subtotal: 100000, discount: 0, shipping: 4900, codFee: 0,
      tax: 18000, cgst: 0, sgst: 0, igst: 18000, grandTotal: 122900,
    };
    expect(breakupView(s).rows.find((r) => r.key === 'gst')!.label).toBe('GST (IGST)');
    expect(sumRows(s)).toBe(122900);
  });

  it('a tax-0 order shows neither a GST row nor a note', () => {
    const s: OrderMoneySnapshot = {
      subtotal: 10000, discount: 0, shipping: 4900, codFee: 0,
      tax: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 14900,
    };
    const v = breakupView(s);
    expect(v.rows.find((r) => r.key === 'gst')).toBeUndefined();
    expect(v.gstNote).toBeNull();
    expect(sumRows(s)).toBe(14900);
  });
});
