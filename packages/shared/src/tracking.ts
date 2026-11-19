import { z } from 'zod';

/**
 * Ad / analytics tracking config (Google Analytics 4 + Meta/Facebook Pixel).
 *
 * The admin pastes either the bare ID or the whole snippet Google / Meta gave them. We keep ONLY the
 * validated ID and generate the loader code ourselves, so nothing the admin pastes is ever injected
 * into the storefront as raw script.
 */

/** Setting key holding the {@link TrackingConfig} (Admin → Settings → Tracking). */
export const TRACKING_SETTING_KEY = 'tracking';

export interface TrackingConfig {
  /** GA4 measurement ID, e.g. `G-ABCD123456`. Empty = off. */
  ga4Id: string;
  /** Meta (Facebook) Pixel ID, 8 to 20 digits. Empty = off. */
  metaPixelId: string;
}

export const EMPTY_TRACKING: TrackingConfig = { ga4Id: '', metaPixelId: '' };

const GA4_ID = /^G-[A-Z0-9]{6,12}$/;
const PIXEL_ID = /^\d{8,20}$/;

/** A GA4 measurement ID from a bare ID or a pasted gtag snippet. Empty string when none is found. */
export function extractGa4Id(input: unknown): string {
  if (typeof input !== 'string') return '';
  const text = input.trim();
  if (text === '') return '';
  const bare = text.toUpperCase();
  if (GA4_ID.test(bare)) return bare;
  const found = /\bG-[A-Z0-9]{6,12}\b/i.exec(text);
  return found ? found[0].toUpperCase() : '';
}

/** A Meta Pixel ID from a bare ID or a pasted pixel snippet. Empty string when none is found. */
export function extractMetaPixelId(input: unknown): string {
  if (typeof input !== 'string') return '';
  const text = input.trim();
  if (text === '') return '';
  if (PIXEL_ID.test(text)) return text;
  const init = /fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{8,20})['"]?/.exec(text);
  if (init?.[1]) return init[1];
  const img = /facebook\.com\/tr\?[^"'\s]*\bid=(\d{8,20})\b/.exec(text);
  return img?.[1] ?? '';
}

/** Whatever is stored (or served) → a clean config. Anything that is not a valid ID becomes empty. */
export function sanitizeTracking(raw: unknown): TrackingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_TRACKING };
  const r = raw as Record<string, unknown>;
  return { ga4Id: extractGa4Id(r.ga4Id), metaPixelId: extractMetaPixelId(r.metaPixelId) };
}

// ---------------------------------------------------------------------------
// Mobile app events. The app cannot run Google's or Meta's browser scripts, so it posts these events to our
// own API (POST /tracking/events), which forwards them to Google Analytics 4 (Measurement Protocol) and Meta
// (Conversions API) using the server-side keys saved in Admin → Settings → Tracking.
// ---------------------------------------------------------------------------

/** The only events the app may send. */
export const TRACKING_EVENT_NAMES = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] as const;
export type TrackingEventName = (typeof TRACKING_EVENT_NAMES)[number];

/** One product line of an event. `price` is the unit price in paise. */
export const trackingItemSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().max(200),
    price: z.number().int().min(0).max(100_000_000),
    quantity: z.number().int().min(1).max(999),
  })
  .strict();
export type TrackingItem = z.infer<typeof trackingItemSchema>;

/**
 * A mobile app event. `purchase` carries only the order id: the API reads the amount from the order itself, so
 * the app cannot report a sale that did not happen. The other events carry the product lines.
 */
export const trackingEventSchema = z
  .object({
    /** Anonymous, app-install scoped id (not the customer id). */
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    event: z.enum(TRACKING_EVENT_NAMES),
    items: z.array(trackingItemSchema).max(50).optional(),
    orderId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.event === 'purchase') {
      if (!e.orderId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderId'], message: 'orderId is required for purchase' });
    } else if (!e.items || e.items.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'items are required' });
    }
  });
export type TrackingEventInput = z.infer<typeof trackingEventSchema>;
