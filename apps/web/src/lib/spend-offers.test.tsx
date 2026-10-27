import { renderToStaticMarkup } from 'react-dom/server';
import type { ActiveOfferView, CartOffer } from '@belzo/shared';
import { CartOffers } from '@/components/cart-offers';
import { cartOfferCard, cartOffersToShow, limitsWithOffer, offerForVariant, productOfferBanner } from './spend-offers';

const offer = (over: Partial<CartOffer> = {}): CartOffer => ({
  offerId: 'o1', name: 'Sugar at 29', variantId: 'sugar', minSpend: 200000, specialPrice: 2900, units: 1,
  spend: 155000, remaining: 45000, unlocked: false, inCart: false, applied: false,
  productId: 'p1', title: 'Sugar', unit: '1 kg', imageUrl: null, regularPrice: 4500, mrp: 5000, ...over,
});

describe('cartOfferCard', () => {
  it('shows progress while locked', () => {
    expect(cartOfferCard(offer())).toMatchObject({
      kind: 'progress', headline: 'Sugar 1 kg at ₹29', detail: 'Add ₹450 more to unlock', percent: 77,
    });
  });
  it('invites to add once unlocked and not in the cart', () => {
    expect(cartOfferCard(offer({ unlocked: true, remaining: 0, spend: 210000 }))).toMatchObject({ kind: 'add', detail: 'Offer unlocked. Add it to your cart', percent: 100 });
  });
  it('confirms when the offer price is being charged', () => {
    expect(cartOfferCard(offer({ unlocked: true, inCart: true, applied: true, remaining: 0, spend: 210000 }))).toMatchObject({ kind: 'applied', detail: 'Offer price applied' });
  });
  it('never goes past 100 per cent', () => {
    expect(cartOfferCard(offer({ spend: 900000 })).percent).toBe(100);
  });
  it('copes with a pack that has no size label', () => {
    expect(cartOfferCard(offer({ unit: '' })).headline).toBe('Sugar at ₹29');
  });
});

describe('cartOffersToShow', () => {
  it('puts the ready-to-add offer first, then the closest to unlocking, and caps the list', () => {
    const list = [
      offer({ offerId: 'far', remaining: 90000 }),
      offer({ offerId: 'near', remaining: 1000 }),
      offer({ offerId: 'ready', unlocked: true, remaining: 0 }),
      offer({ offerId: 'done', unlocked: true, inCart: true, applied: true, remaining: 0 }),
    ];
    expect(cartOffersToShow(list).map((o) => o.offerId)).toEqual(['ready', 'near', 'far']);
    expect(cartOffersToShow(list, 4).map((o) => o.offerId)).toEqual(['ready', 'near', 'far', 'done']);
  });
  it('hides an unlocked offer that is in the cart but not charging the offer price', () => {
    expect(cartOffersToShow([offer({ unlocked: true, inCart: true, applied: false, remaining: 0 })])).toEqual([]);
  });
  it('handles no offers', () => {
    expect(cartOffersToShow(undefined)).toEqual([]);
  });
});

describe('product page', () => {
  const active: ActiveOfferView = { id: 'o1', name: 'Sugar at 29', variantId: 'sugar', productId: 'p1', minSpend: 200000, specialPrice: 2900, units: 1 };
  it('finds the offer for the selected pack only', () => {
    expect(offerForVariant([active], 'sugar')).toBe(active);
    expect(offerForVariant([active], 'rice')).toBeUndefined();
    expect(offerForVariant([active], undefined)).toBeUndefined();
  });
  it('words the banner', () => {
    expect(productOfferBanner(active)).toEqual({ headline: 'Shop ₹2,000 and get this at ₹29', note: 'Only 1 per order while this offer is on.' });
    expect(productOfferBanner({ ...active, units: 3 }).note).toBe('Up to 3 per order while this offer is on.');
  });
  it('limits the quantity to the offer units, never below the pack minimum', () => {
    expect(limitsWithOffer({ min: 1, max: 99 }, active)).toEqual({ min: 1, max: 1 });
    expect(limitsWithOffer({ min: 2, max: 99 }, active)).toEqual({ min: 2, max: 2 });
    expect(limitsWithOffer({ min: 1, max: 5 }, { units: 9 })).toEqual({ min: 1, max: 5 });
    expect(limitsWithOffer({ min: 1, max: 5 }, undefined)).toEqual({ min: 1, max: 5 });
  });
});

describe('CartOffers', () => {
  it('draws a progress bar for a locked offer and no Add button', () => {
    const html = renderToStaticMarkup(<CartOffers offers={[offer()]} onAdd={() => undefined} />);
    expect(html).toContain('Sugar 1 kg at ₹29');
    expect(html).toContain('Add ₹450 more to unlock');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="77"');
    expect(html).not.toContain('cart-offer-add-');
  });
  it('shows an Add button once unlocked', () => {
    const html = renderToStaticMarkup(<CartOffers offers={[offer({ unlocked: true, remaining: 0 })]} onAdd={() => undefined} />);
    expect(html).toContain('data-testid="cart-offer-add-o1"');
    expect(html).not.toContain('role="progressbar"');
  });
  it('renders nothing without offers', () => {
    expect(renderToStaticMarkup(<CartOffers offers={[]} onAdd={() => undefined} />)).toBe('');
  });
});
