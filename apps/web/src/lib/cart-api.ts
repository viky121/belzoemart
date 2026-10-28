'use client';

import type { CartOffer } from '@belzo/shared';
import { apiFetch, type ApiRequestOptions } from './api-client';
import { safeUuid } from './uuid';
import { safeLocal } from './safe-storage';

/**
 * Client-side cart API. Uses a guest token (persisted in localStorage) so
 * anonymous users get a cart; when logged in, the caller passes the access
 * token and the API resolves the customer instead.
 */
const GUEST_KEY = 'belzo_guest_token';

// In-memory fallback so the guest token stays stable for the page's lifetime
// even when localStorage is unavailable (private mode / blocked site data).
let memoToken: string | null = null;

export function getGuestToken(): string {
  if (typeof window === 'undefined') return '';
  let token = safeLocal.get(GUEST_KEY) ?? memoToken;
  if (!token) {
    token = safeUuid();
    safeLocal.set(GUEST_KEY, token);
    memoToken = token;
  }
  return token;
}

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  savedForLater: boolean;
  title: string;
  sku: string;
  unit: string | null;
  imageUrl: string | null;
  unitPrice: number;
  /** The price before any special offer (the bulk price when one applies). */
  regularUnitPrice?: number;
  /** Set when the special-offer price is being charged on this line. */
  offerId?: string | null;
  offerName?: string | null;
  basePrice: number;
  mrp: number;
  discountPct: number;
  taxRatePct: number;
  inStock: boolean;
  available: number;
  /** Bulk pricing tiers for this variant (minQty ascending). */
  priceSlabs: { minQty: number; unitPrice: number }[];
  /** Total units of this product across the cart (drives the tier). */
  tierQty: number;
  /** Fewest / most units of this variant per order, set by the admin (1 / 99 when unset). */
  minQty?: number;
  maxQty?: number;
}

export interface CartView {
  cartId: string;
  items: CartLine[];
  /** Special-price offers with the customer's progress towards each. */
  offers?: CartOffer[];
}

function cartOptions(accessToken?: string, extra: ApiRequestOptions = {}): ApiRequestOptions {
  return {
    ...extra,
    accessToken,
    headers: { ...(extra.headers ?? {}), 'x-guest-token': getGuestToken() },
  };
}

/** Total units in the cart (excludes saved-for-later). */
export function cartCount(view: CartView): number {
  return view.items.filter((i) => !i.savedForLater).reduce((s, i) => s + i.quantity, 0);
}

/** Pictures of the first few cart items, for the phone "View cart" pill. */
export function cartThumbs(view: CartView, max = 3): (string | null)[] {
  return view.items
    .filter((i) => !i.savedForLater)
    .slice(0, max)
    .map((i) => i.imageUrl);
}

/** Broadcast the latest cart so the header badge, the phone Cart tab and the "View cart" pill update everywhere. */
function emitCart(view: CartView): CartView {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('belzo:cart', { detail: { count: cartCount(view), thumbs: cartThumbs(view) } }));
  }
  return view;
}

export interface ToastAction {
  label: string;
  href: string;
}

/** Fire a transient toast message, optionally with one link button (for example "View cart"). */
export function toast(message: string, action?: ToastAction): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('belzo:toast', { detail: { message, action } }));
  }
}

export const cartApi = {
  get: (accessToken?: string) => apiFetch<CartView>('/cart', cartOptions(accessToken)).then(emitCart),
  add: (variantId: string, quantity: number, accessToken?: string) =>
    apiFetch<CartView>('/cart/items', cartOptions(accessToken, { method: 'POST', body: { variantId, quantity } })).then(
      (v) => {
        toast('Added to cart', { label: 'View cart', href: '/cart' });
        return emitCart(v);
      },
    ),
  update: (variantId: string, quantity: number, accessToken?: string) =>
    apiFetch<CartView>(`/cart/items/${variantId}`, cartOptions(accessToken, { method: 'PUT', body: { variantId, quantity } })).then(
      emitCart,
    ),
  remove: (variantId: string, accessToken?: string) =>
    apiFetch<CartView>(`/cart/items/${variantId}`, cartOptions(accessToken, { method: 'DELETE' })).then(emitCart),
  /**
   * Merge the guest cart into the signed-in customer's cart (BR-2) so items
   * added before logging in are not lost. Requires the access token; sends the
   * guest token in the body (the server deletes the guest cart after merging).
   */
  merge: (accessToken: string) =>
    apiFetch<CartView>(
      '/cart/merge',
      cartOptions(accessToken, { method: 'POST', body: { guestToken: getGuestToken() } }),
    ).then(emitCart),
};
