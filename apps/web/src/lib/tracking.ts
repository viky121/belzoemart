/**
 * Storefront ad / analytics events. Each helper sends to Google Analytics 4 (`gtag`) and the Meta Pixel
 * (`fbq`) when they are loaded, and does nothing otherwise (no IDs set in Admin → Settings → Tracking,
 * an ad blocker, or the script has not loaded yet). Money is passed in paise and sent in rupees.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const CURRENCY = 'INR';

export interface TrackedItem {
  /** Variant id (the same id the cart uses). */
  id: string;
  name: string;
  /** Unit price in paise. */
  price: number;
  quantity: number;
}

const rupees = (paise: number) => Math.round(paise) / 100;

function gaItems(items: TrackedItem[]) {
  return items.map((i) => ({ item_id: i.id, item_name: i.name, price: rupees(i.price), quantity: i.quantity }));
}

function fbContents(items: TrackedItem[]) {
  return items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: rupees(i.price) }));
}

function totalOf(items: TrackedItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/** Runs the sender only in the browser, and never lets a tracking failure break the shop. */
function safely(send: () => void): void {
  if (typeof window === 'undefined') return;
  try {
    send();
  } catch {
    /* tracking must never affect shopping */
  }
}

/** A product page was opened. */
export function trackViewItem(item: TrackedItem): void {
  safely(() => {
    window.gtag?.('event', 'view_item', { currency: CURRENCY, value: rupees(item.price), items: gaItems([item]) });
    window.fbq?.('track', 'ViewContent', {
      content_type: 'product',
      content_ids: [item.id],
      content_name: item.name,
      value: rupees(item.price),
      currency: CURRENCY,
    });
  });
}

/** Items were added to the cart. */
export function trackAddToCart(items: TrackedItem[]): void {
  if (items.length === 0) return;
  safely(() => {
    window.gtag?.('event', 'add_to_cart', { currency: CURRENCY, value: rupees(totalOf(items)), items: gaItems(items) });
    window.fbq?.('track', 'AddToCart', {
      content_type: 'product',
      content_ids: items.map((i) => i.id),
      contents: fbContents(items),
      value: rupees(totalOf(items)),
      currency: CURRENCY,
    });
  });
}

/** The checkout page was reached with these items. */
export function trackBeginCheckout(items: TrackedItem[], totalPaise: number): void {
  if (items.length === 0) return;
  safely(() => {
    window.gtag?.('event', 'begin_checkout', { currency: CURRENCY, value: rupees(totalPaise), items: gaItems(items) });
    window.fbq?.('track', 'InitiateCheckout', {
      content_type: 'product',
      content_ids: items.map((i) => i.id),
      contents: fbContents(items),
      num_items: items.reduce((n, i) => n + i.quantity, 0),
      value: rupees(totalPaise),
      currency: CURRENCY,
    });
  });
}

const PURCHASE_KEY = 'belzo_purchase_tracked:';

/**
 * An order was placed (paid, or Cash on Delivery). Sent once per order: a refresh of the result page, or a
 * return to it later, must not count the same sale twice in Google Ads / Meta.
 */
export function trackPurchase(orderId: string, totalPaise: number): void {
  if (!orderId) return;
  safely(() => {
    const key = `${PURCHASE_KEY}${orderId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
    window.gtag?.('event', 'purchase', {
      transaction_id: orderId,
      currency: CURRENCY,
      value: rupees(totalPaise),
    });
    window.fbq?.('track', 'Purchase', { value: rupees(totalPaise), currency: CURRENCY }, { eventID: orderId });
  });
}

/** A client-side page change (the Meta Pixel does not see these on its own; GA4 does). */
export function trackPixelPageView(): void {
  safely(() => window.fbq?.('track', 'PageView'));
}
