import {
  buildOfferBody, emptyForm, formFromOffer, isoToLocalInput, localInputToIso, offerSummary, paiseToRupees, rupeesToPaise,
  type AdminOffer, type OfferForm, type OfferPack,
} from './offers-ui';

const pack: OfferPack = { variantId: 'v1', productId: 'p1', title: 'Sugar', unit: '1 kg', sellingPrice: 4500, imageUrl: null, available: 20, minOrderQty: 1 };
const form = (over: Partial<OfferForm> = {}): OfferForm => ({
  ...emptyForm(), name: 'Sugar at 29', spendRupees: '2000', specialRupees: '29', units: '1', pack, ...over,
});

describe('money text', () => {
  it('reads rupees into paise', () => {
    expect(rupeesToPaise('29')).toBe(2900);
    expect(rupeesToPaise(' 2,000 ')).toBe(200000);
    expect(rupeesToPaise('29.5')).toBe(2950);
    expect(rupeesToPaise('0.07')).toBe(7);
  });
  it('refuses anything that is not money', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '₹29', '29.']) expect(rupeesToPaise(bad)).toBeNull();
  });
  it('writes paise back for the input', () => {
    expect(paiseToRupees(2900)).toBe('29');
    expect(paiseToRupees(2950)).toBe('29.5');
    expect(rupeesToPaise(paiseToRupees(123456))).toBe(123456);
  });
});

describe('dates', () => {
  it('round-trips through the browser input', () => {
    const iso = '2026-11-01T10:30:00.000Z';
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });
  it('treats empty and bad values as no date', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('not a date')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('x')).toBe('');
  });
});

describe('buildOfferBody', () => {
  it('builds the request for the sugar example', () => {
    expect(buildOfferBody(form())).toEqual({
      ok: true,
      body: { name: 'Sugar at 29', minSpend: 200000, variantId: 'v1', specialPrice: 2900, units: 1, isActive: true, startsAt: null, endsAt: null },
    });
  });
  it.each([
    ['no name', { name: ' ' }, /name/],
    ['no pack', { pack: null }, /Pick the product pack/],
    ['a bad spend amount', { spendRupees: 'lots' }, /spend amount/],
    ['a spend amount under 1 rupee', { spendRupees: '0.5' }, /spend amount/],
    ['a bad special price', { specialRupees: '' }, /special price/],
    ['a special price equal to the normal price', { specialRupees: '45' }, /lower than the normal price \(₹45\)/],
    ['a special price above the normal price', { specialRupees: '60' }, /lower than the normal price/],
    ['0 units', { units: '0' }, /1 to 10/],
    ['11 units', { units: '11' }, /1 to 10/],
    ['fractional units', { units: '1.5' }, /whole number/],
  ])('says what is wrong with %s', (_l, over, msg) => {
    const r = buildOfferBody(form(over as Partial<OfferForm>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg as RegExp);
  });
  it('refuses units under the pack minimum order quantity', () => {
    const r = buildOfferBody(form({ pack: { ...pack, minOrderQty: 2 }, units: '1' }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('at least 2') });
  });
  it('refuses an end before the start', () => {
    const r = buildOfferBody(form({ startsAt: '2026-11-02T10:00', endsAt: '2026-11-01T10:00' }));
    expect(r).toMatchObject({ ok: false, error: 'The end date must be after the start date.' });
  });
});

describe('list text', () => {
  const offer: AdminOffer = {
    id: 'o1', name: 'Sugar at 29', isActive: true, status: 'live', startsAt: null, endsAt: '2026-11-01T10:30:00.000Z',
    minSpend: 200000, specialPrice: 2900, units: 1,
    variant: { id: 'v1', productId: 'p1', title: 'Sugar', unit: '1 kg', sellingPrice: 4500, imageUrl: null, available: 20 },
    belowCost: false, soldUnits: 3,
  };
  it('says what the offer does', () => {
    expect(offerSummary(offer)).toBe('Shop ₹2,000, get Sugar 1 kg at ₹29 (1 per order)');
    expect(offerSummary({ ...offer, units: 3 })).toContain('up to 3 per order');
  });
  it('fills the edit form from an offer', () => {
    const f = formFromOffer(offer);
    expect(f).toMatchObject({ name: 'Sugar at 29', spendRupees: '2000', specialRupees: '29', units: '1', isActive: true });
    expect(f.pack).toMatchObject({ variantId: 'v1', sellingPrice: 4500 });
    expect(localInputToIso(f.endsAt)).toBe('2026-11-01T10:30:00.000Z');
  });
});
