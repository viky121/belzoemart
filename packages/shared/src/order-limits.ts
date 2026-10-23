import { MAX_CART_QTY } from './schemas';

/**
 * Per-variant purchase limits, set by the admin next to the stock. A customer can put between `min` and
 * `max` units of the variant in one order. Unset means the old behaviour: at least 1, at most MAX_CART_QTY.
 */
export interface OrderLimitsInput {
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
}

export interface OrderLimits {
  min: number;
  max: number;
}

/** The limits that apply to a variant, always 1 <= min <= max <= MAX_CART_QTY. */
export function effectiveOrderLimits(v?: OrderLimitsInput | null): OrderLimits {
  const rawMin = Number.isFinite(v?.minOrderQty) ? Math.trunc(v!.minOrderQty as number) : 1;
  const rawMax = Number.isFinite(v?.maxOrderQty) ? Math.trunc(v!.maxOrderQty as number) : MAX_CART_QTY;
  const min = Math.min(MAX_CART_QTY, Math.max(1, rawMin));
  const max = Math.min(MAX_CART_QTY, Math.max(min, rawMax));
  return { min, max };
}

/** True when the variant has a real limit (the storefront only shows a hint then). */
export function hasOrderLimits(l: OrderLimits): boolean {
  return l.min > 1 || l.max < MAX_CART_QTY;
}

/** Customer-facing text for a variant's limits, e.g. "Min 5 · Max 20 per order". Empty when there is none. */
export function orderLimitsHint(l: OrderLimits): string {
  const parts: string[] = [];
  if (l.min > 1) parts.push(`Min ${l.min}`);
  if (l.max < MAX_CART_QTY) parts.push(`Max ${l.max}`);
  return parts.length > 0 ? `${parts.join(' · ')} per order` : '';
}

/** Error text when a quantity is outside the limits. */
export function orderLimitsMessage(title: string, l: OrderLimits, qty: number): string {
  if (qty > l.max) return `You can buy at most ${l.max} of "${title}" per order.`;
  return `The minimum order quantity for "${title}" is ${l.min}.`;
}
