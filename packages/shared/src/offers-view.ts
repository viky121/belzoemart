import { formatInr } from './format';
import { offerProgressText, type ActiveOfferView, type CartOffer } from './offers';
import type { OrderLimits } from './order-limits';

/**
 * Words and numbers for "spend and get" special price offers on the website and the mobile app (cart and
 * product page). The server decides every price; this only describes it.
 */

export type CartOfferKind = 'applied' | 'add' | 'progress';

export interface CartOfferCard {
  kind: CartOfferKind;
  offerId: string;
  variantId: string;
  title: string;
  /** The first line, e.g. "Sugar 1 kg at ₹29". */
  headline: string;
  /** The second line, e.g. "Add ₹450 more to unlock". */
  detail: string;
  /** How far along, 0..100. */
  percent: number;
  imageUrl: string | null;
}

const packName = (o: Pick<CartOffer, 'title' | 'unit'>) => (o.unit ? `${o.title} ${o.unit}` : o.title);

export function cartOfferCard(o: CartOffer): CartOfferCard {
  const kind: CartOfferKind = o.applied ? 'applied' : o.unlocked && !o.inCart ? 'add' : 'progress';
  const percent = o.minSpend > 0 ? Math.min(100, Math.floor((o.spend / o.minSpend) * 100)) : 100;
  return {
    kind,
    offerId: o.offerId,
    variantId: o.variantId,
    title: o.title,
    headline: `${packName(o)} at ${formatInr(o.specialPrice)}`,
    detail: offerProgressText(o, formatInr(o.remaining)),
    percent,
    imageUrl: o.imageUrl,
  };
}

/** Offers worth showing in the cart, most useful first, at most `limit`: ready to add, then closest to unlocking, then applied. */
export function cartOffersToShow(offers: readonly CartOffer[] | undefined, limit = 3): CartOffer[] {
  const rank = (o: CartOffer) => (o.unlocked && !o.inCart ? 0 : !o.unlocked ? 1 : 2);
  return [...(offers ?? [])]
    .filter((o) => !(o.unlocked && o.inCart && !o.applied)) // unlocked but not charging the offer price: nothing useful to say
    .sort((a, b) => rank(a) - rank(b) || a.remaining - b.remaining)
    .slice(0, limit);
}

/** The offer on a pack, for the product page. */
export function offerForVariant(offers: readonly ActiveOfferView[], variantId: string | undefined): ActiveOfferView | undefined {
  return variantId ? offers.find((o) => o.variantId === variantId) : undefined;
}

export interface ProductOfferBanner {
  headline: string;
  note: string;
}

/** "Shop ₹2,000 and get this at ₹29" with the per-order limit as a note. */
export function productOfferBanner(offer: ActiveOfferView): ProductOfferBanner {
  return {
    headline: `Shop ${formatInr(offer.minSpend)} and get this at ${formatInr(offer.specialPrice)}`,
    note: offer.units === 1 ? 'Only 1 per order while this offer is on.' : `Up to ${offer.units} per order while this offer is on.`,
  };
}

/** The product's quantity limits with the offer limit applied (the server enforces the same cap). */
export function limitsWithOffer(limits: OrderLimits, offer: Pick<ActiveOfferView, 'units'> | undefined): OrderLimits {
  if (!offer || offer.units >= limits.max) return limits;
  return { min: limits.min, max: Math.max(limits.min, offer.units) };
}
