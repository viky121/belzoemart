import fc from 'fast-check';
import { evaluateOffers, isOfferLive, offerProgressText, offerUnitCaps, type OfferCartLine, type SpendOfferRule } from './offers';
import { computeTotals, discountableSubtotal, inclusiveLineTaxes, type PriceLine } from './pricing';
import { paise } from './money';

const SUGAR = 'sugar-1kg';
const sugarOffer: SpendOfferRule = { id: 'o1', name: 'Sugar at 29', variantId: SUGAR, minSpend: 200000, specialPrice: 2900, units: 1 };
const line = (variantId: string, quantity: number, regularUnitPrice: number, counts = true): OfferCartLine => ({ variantId, quantity, regularUnitPrice, counts });
const sugar = (qty = 1) => line(SUGAR, qty, 4500);

describe('evaluateOffers: the sugar example (shop 2000, sugar 1 kg at 29)', () => {
  it('charges 29 once the other items reach 2000', () => {
    const r = evaluateOffers([sugar(), line('rice', 4, 50000)], [sugarOffer]);
    expect(r.prices.get(SUGAR)).toEqual({ unitPrice: 2900, offerId: 'o1', offerName: 'Sugar at 29' });
    expect(r.statuses[0]).toMatchObject({ spend: 200000, remaining: 0, unlocked: true, inCart: true, applied: true });
  });

  it('exactly 2000 unlocks it, one paisa less does not', () => {
    expect(evaluateOffers([sugar(), line('rice', 1, 200000)], [sugarOffer]).prices.size).toBe(1);
    const short = evaluateOffers([sugar(), line('rice', 1, 199999)], [sugarOffer]);
    expect(short.prices.size).toBe(0);
    expect(short.statuses[0]).toMatchObject({ unlocked: false, remaining: 1, applied: false });
  });

  it('the sugar itself never counts towards its own offer', () => {
    const r = evaluateOffers([line(SUGAR, 1, 4500)], [{ ...sugarOffer, minSpend: 4000 }]);
    expect(r.statuses[0]).toMatchObject({ spend: 0, unlocked: false });
  });

  it('removing items after unlocking takes the offer price away again', () => {
    const before = evaluateOffers([sugar(), line('rice', 4, 50000)], [sugarOffer]);
    const after = evaluateOffers([sugar(), line('rice', 3, 50000)], [sugarOffer]);
    expect(before.prices.has(SUGAR)).toBe(true);
    expect(after.prices.has(SUGAR)).toBe(false);
    expect(after.statuses[0]!.remaining).toBe(50000);
  });

  it('shows progress before the sugar is in the cart, and unlocked-but-not-added', () => {
    const none = evaluateOffers([line('rice', 2, 50000)], [sugarOffer]);
    expect(none.statuses[0]).toMatchObject({ spend: 100000, remaining: 100000, inCart: false, applied: false });
    const unlocked = evaluateOffers([line('rice', 4, 50000)], [sugarOffer]);
    expect(unlocked.statuses[0]).toMatchObject({ unlocked: true, inCart: false, applied: false });
    expect(unlocked.prices.size).toBe(0);
  });

  it('saved-for-later and unavailable lines count for nothing and get no offer', () => {
    const r = evaluateOffers([sugar(), line('rice', 4, 50000, false)], [sugarOffer]);
    expect(r.statuses[0]!.spend).toBe(0);
    expect(evaluateOffers([line(SUGAR, 1, 4500, false), line('rice', 4, 50000)], [sugarOffer]).prices.size).toBe(0);
  });

  it('uses the lower of the offer price and the bulk price', () => {
    const cheaperBulk = evaluateOffers([line(SUGAR, 1, 2500), line('rice', 4, 50000)], [sugarOffer]);
    expect(cheaperBulk.prices.size).toBe(0);
    expect(cheaperBulk.statuses[0]).toMatchObject({ unlocked: true, applied: false });
  });

  it('does not give the offer price to more units than the offer allows', () => {
    const r = evaluateOffers([sugar(2), line('rice', 4, 50000)], [sugarOffer]);
    expect(r.prices.size).toBe(0);
    expect(evaluateOffers([sugar(3), line('rice', 4, 50000)], [{ ...sugarOffer, units: 3 }]).prices.get(SUGAR)?.unitPrice).toBe(2900);
  });

  it('another offer pack counts at its normal price, so offers cannot unlock each other in a loop', () => {
    const oil: SpendOfferRule = { id: 'o2', name: 'Oil at 99', variantId: 'oil', minSpend: 300000, specialPrice: 9900, units: 1 };
    const r = evaluateOffers([sugar(), line('oil', 1, 15000), line('rice', 2, 100000)], [sugarOffer, oil]);
    expect(r.statuses.find((s) => s.offerId === 'o1')).toMatchObject({ spend: 215000, unlocked: true, applied: true });
    expect(r.statuses.find((s) => s.offerId === 'o2')).toMatchObject({ spend: 204500, unlocked: false });
  });

  it('with two offers on one pack the cheaper one wins and only it is applied', () => {
    const second: SpendOfferRule = { ...sugarOffer, id: 'o3', name: 'Sugar at 25', specialPrice: 2500 };
    const r = evaluateOffers([sugar(), line('rice', 4, 50000)], [sugarOffer, second]);
    expect(r.prices.get(SUGAR)?.offerId).toBe('o3');
    expect(r.statuses.map((s) => s.applied)).toEqual([false, true]);
  });

  it('PBT: an offer applies only when unlocked, never costs more than normal, and its pack never counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.constantFrom('a', 'b', 'c', SUGAR), qty: fc.integer({ min: 1, max: 5 }), price: fc.integer({ min: 100, max: 100000 }), counts: fc.boolean() }), { maxLength: 6 }),
        fc.integer({ min: 100, max: 500000 }),
        fc.integer({ min: 1, max: 3 }),
        (rows, minSpend, units) => {
          const seen = new Set<string>();
          const lines = rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => line(r.id, r.qty, r.price, r.counts));
          const offer: SpendOfferRule = { ...sugarOffer, minSpend, units };
          const { prices, statuses } = evaluateOffers(lines, [offer]);
          const st = statuses[0]!;
          const expectedSpend = lines.filter((l) => l.counts && l.variantId !== SUGAR).reduce((s, l) => s + l.quantity * l.regularUnitPrice, 0);
          expect(st.spend).toBe(expectedSpend);
          expect(st.unlocked).toBe(expectedSpend >= minSpend);
          expect(st.remaining).toBe(Math.max(0, minSpend - expectedSpend));
          const priced = prices.get(SUGAR);
          if (priced) {
            const l = lines.find((x) => x.variantId === SUGAR)!;
            expect(st.unlocked).toBe(true);
            expect(l.quantity).toBeLessThanOrEqual(units);
            expect(priced.unitPrice).toBeLessThan(l.regularUnitPrice);
            expect(prices.size).toBe(1);
          }
        },
      ),
    );
  });
});

describe('offerUnitCaps', () => {
  it('keeps the smallest cap per pack', () => {
    const caps = offerUnitCaps([
      { variantId: 'a', units: 3 },
      { variantId: 'a', units: 1 },
      { variantId: 'b', units: 2 },
    ]);
    expect(caps.get('a')).toBe(1);
    expect(caps.get('b')).toBe(2);
    expect(caps.get('c')).toBeUndefined();
  });
});

describe('isOfferLive', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  it('needs the switch on and today inside the dates', () => {
    expect(isOfferLive({ isActive: true }, now)).toBe(true);
    expect(isOfferLive({ isActive: false }, now)).toBe(false);
    expect(isOfferLive({ isActive: true, startsAt: '2026-10-25T00:00:00Z' }, now)).toBe(false);
    expect(isOfferLive({ isActive: true, startsAt: '2026-10-24T12:00:00Z' }, now)).toBe(true);
    expect(isOfferLive({ isActive: true, endsAt: '2026-10-24T12:00:00Z' }, now)).toBe(false);
    expect(isOfferLive({ isActive: true, startsAt: new Date('2026-10-01'), endsAt: new Date('2026-11-01') }, now)).toBe(true);
  });
});

describe('offerProgressText', () => {
  it('says what to do next', () => {
    expect(offerProgressText({ unlocked: false, inCart: false, applied: false }, '₹450')).toBe('Add ₹450 more to unlock');
    expect(offerProgressText({ unlocked: true, inCart: false, applied: false }, '₹0')).toBe('Offer unlocked. Add it to your cart');
    expect(offerProgressText({ unlocked: true, inCart: true, applied: true }, '₹0')).toBe('Offer price applied');
  });
});

describe('coupons leave special-offer lines alone', () => {
  const lines: PriceLine[] = [
    { unitPrice: paise(100000), quantity: 2, taxRatePct: 5 },
    { unitPrice: paise(2900), quantity: 1, taxRatePct: 5, noDiscount: true },
  ];
  const base = { sameState: true, shipping: paise(0), codFee: paise(0) };

  it('a percent coupon is worked out on the other lines only', () => {
    const r = computeTotals({ ...base, lines, coupon: { kind: 'percent', value: 10 } });
    expect(r.subtotal).toBe(202900);
    expect(r.discount).toBe(20000);
    expect(r.grandTotal).toBe(182900);
  });

  it('the coupon minimum order ignores the offer line', () => {
    const noCoupon = computeTotals({ ...base, lines, coupon: { kind: 'flat', value: 5000, minOrder: paise(202000) } });
    expect(noCoupon.discount).toBe(0);
    const ok = computeTotals({ ...base, lines, coupon: { kind: 'flat', value: 5000, minOrder: paise(200000) } });
    expect(ok.discount).toBe(5000);
    expect(discountableSubtotal(lines)).toBe(200000);
  });

  it('free shipping with a minimum also ignores the offer line', () => {
    const r = computeTotals({ ...base, shipping: paise(4900), lines, coupon: { kind: 'free_shipping', value: 0, minOrder: paise(202000) } });
    expect(r.shipping).toBe(4900);
  });

  it('the offer line takes no share of the discount when GST is taken out', () => {
    const t = inclusiveLineTaxes(lines, paise(20000));
    expect(t[1]).toMatchObject({ discount: 0, net: 2900 });
    expect(t[0]!.discount).toBe(20000);
  });

  it('the discount still adds up to the order total with only offer lines left', () => {
    const only = computeTotals({ ...base, lines: [lines[1]!], coupon: { kind: 'percent', value: 50 } });
    expect(only.discount).toBe(0);
    expect(only.grandTotal).toBe(2900);
  });

  it('lines without the flag behave exactly as before', () => {
    const plain = lines.map(({ noDiscount: _n, ...rest }) => rest);
    expect(computeTotals({ ...base, lines: plain, coupon: { kind: 'percent', value: 10 } }).discount).toBe(20290);
  });
});
