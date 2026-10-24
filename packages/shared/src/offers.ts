/**
 * "Spend and get" special price offers. Example: shop for ₹2000 and get Sugar 1 kg at ₹29.
 *
 * Pure rules, shared by the API (which sets the price) and the website and app (which show progress).
 * All money is integer paise.
 *
 * Rules (decided with the shop owner):
 *  - Spend is the value of the OTHER items in the cart, at their normal prices (bulk price included),
 *    before any coupon. The offer pack never counts towards its own offer.
 *  - The pack costs the lower of the offer price and its normal price once the spend is reached.
 *  - While an offer is live the pack can be bought only up to the offer units per order.
 *  - Each order can use the offer again.
 */

export interface SpendOfferRule {
  id: string;
  name: string;
  /** The pack (variant) that gets the special price. */
  variantId: string;
  /** Spend needed on the other items, in paise. */
  minSpend: number;
  /** Price per unit once unlocked, in paise. */
  specialPrice: number;
  /** How many units of the pack one order may hold (and get the special price). */
  units: number;
}

export interface SpendOfferWindow {
  isActive: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

/** True while the offer is switched on and inside its dates. */
export function isOfferLive(offer: SpendOfferWindow, now: Date = new Date()): boolean {
  if (!offer.isActive) return false;
  const t = now.getTime();
  if (offer.startsAt && new Date(offer.startsAt).getTime() > t) return false;
  if (offer.endsAt && new Date(offer.endsAt).getTime() <= t) return false;
  return true;
}

/** One cart line as the offer rules need it. */
export interface OfferCartLine {
  variantId: string;
  quantity: number;
  /** Normal price per unit in paise (the bulk price when one applies), before any offer. */
  regularUnitPrice: number;
  /** False for saved-for-later and unavailable lines: they do not count and get no offer. */
  counts: boolean;
}

export interface OfferStatus {
  offerId: string;
  name: string;
  variantId: string;
  minSpend: number;
  specialPrice: number;
  units: number;
  /** Spend so far on the other items. */
  spend: number;
  /** How much more to spend to unlock (0 once unlocked). */
  remaining: number;
  unlocked: boolean;
  /** The pack is in the cart. */
  inCart: boolean;
  /** The special price is being charged on the pack's cart line. */
  applied: boolean;
}

export interface OfferLinePrice {
  unitPrice: number;
  offerId: string;
  offerName: string;
}

export interface OfferEvaluation {
  /** Per variant: the special price to charge and which offer gave it. Only for applied offers. */
  prices: Map<string, OfferLinePrice>;
  /** One entry per live offer, in the order given, for the progress bars. */
  statuses: OfferStatus[];
}

/** The most units one order may hold of each offer pack (the smallest when two offers cover one pack). */
export function offerUnitCaps(offers: readonly Pick<SpendOfferRule, 'variantId' | 'units'>[]): Map<string, number> {
  const caps = new Map<string, number>();
  for (const o of offers) caps.set(o.variantId, Math.min(caps.get(o.variantId) ?? Number.POSITIVE_INFINITY, o.units));
  return caps;
}

/**
 * Works out which offers are unlocked for a cart and the price of each offer pack.
 * `offers` must already be filtered to the live ones (see isOfferLive).
 */
export function evaluateOffers(lines: readonly OfferCartLine[], offers: readonly SpendOfferRule[]): OfferEvaluation {
  const counted = lines.filter((l) => l.counts && l.quantity > 0);
  const prices = new Map<string, OfferLinePrice>();
  const statuses: OfferStatus[] = [];

  for (const offer of offers) {
    const spend = counted
      .filter((l) => l.variantId !== offer.variantId)
      .reduce((sum, l) => sum + l.regularUnitPrice * l.quantity, 0);
    const unlocked = spend >= offer.minSpend;
    const line = counted.find((l) => l.variantId === offer.variantId);
    let applied = false;
    // The special price is charged only inside the offer units, and only when it is cheaper than the normal price.
    if (unlocked && line && line.quantity <= offer.units && offer.specialPrice < line.regularUnitPrice) {
      const current = prices.get(offer.variantId);
      if (!current || offer.specialPrice < current.unitPrice) {
        prices.set(offer.variantId, { unitPrice: offer.specialPrice, offerId: offer.id, offerName: offer.name });
      }
      applied = true;
    }
    statuses.push({
      offerId: offer.id,
      name: offer.name,
      variantId: offer.variantId,
      minSpend: offer.minSpend,
      specialPrice: offer.specialPrice,
      units: offer.units,
      spend,
      remaining: Math.max(0, offer.minSpend - spend),
      unlocked,
      inCart: line !== undefined,
      applied,
    });
  }
  // Two offers on one pack: only the one whose price won is "applied".
  for (const s of statuses) {
    if (s.applied && prices.get(s.variantId)?.offerId !== s.offerId) s.applied = false;
  }
  return { prices, statuses };
}

/** Customer text: "Shop ₹2,000 and get this at ₹29". Money is passed already formatted. */
export function offerHeadline(minSpendText: string, specialPriceText: string): string {
  return `Shop ${minSpendText} and get this at ${specialPriceText}`;
}

/** Customer text for the cart progress bar. */
export function offerProgressText(s: Pick<OfferStatus, 'unlocked' | 'inCart' | 'applied'>, remainingText: string): string {
  if (s.applied) return 'Offer price applied';
  if (s.unlocked) return s.inCart ? 'Offer unlocked' : 'Offer unlocked. Add it to your cart';
  return `Add ${remainingText} more to unlock`;
}

/** A live offer as the product page needs it (public list). */
export interface ActiveOfferView {
  id: string;
  name: string;
  variantId: string;
  productId: string;
  minSpend: number;
  specialPrice: number;
  units: number;
}

/** An offer in the cart response: its progress plus what the customer needs to see and add the pack. */
export interface CartOffer extends OfferStatus {
  productId: string;
  title: string;
  unit: string;
  imageUrl: string | null;
  /** The pack's normal price per unit (before the offer). */
  regularPrice: number;
  mrp: number;
}

/** Customer text when the offer limit stops a quantity. */
export function offerLimitMessage(title: string, units: number): string {
  return units === 1
    ? `Only 1 of "${title}" can be bought per order while this offer is on.`
    : `Only ${units} of "${title}" can be bought per order while this offer is on.`;
}
