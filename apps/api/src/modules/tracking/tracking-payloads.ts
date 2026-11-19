import { createHash } from 'node:crypto';
import type { TrackingEventName, TrackingItem } from '@belzo/shared';

/** Meta Graph API version used for the Conversions API (v25.0 is supported until 2028). */
export const META_GRAPH_VERSION = 'v25.0';

/** One event as the server forwards it. */
export interface ServerEvent {
  name: TrackingEventName;
  /** Anonymous app-install id. */
  clientId: string;
  /** Unique per event. For a purchase it is the order id, so the same sale is never counted twice. */
  eventId: string;
  /** Unix seconds. */
  timeSec: number;
  items: TrackingItem[];
  /** Total in paise. */
  valuePaise: number;
  orderId?: string;
  customer?: { id: string; email?: string | null; phone?: string | null };
  ip?: string;
  userAgent?: string;
}

export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Meta wants the email trimmed and lowercased before hashing. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Meta wants digits only, with the country code. Indian mobiles: 91 + the last 10 digits. */
export function normalizeIndianPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? `91${last10}` : null;
}

const rupees = (paise: number): number => Math.round(paise) / 100;

const META_NAMES: Record<TrackingEventName, string> = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};

/** Google Analytics 4 Measurement Protocol request for one event. */
export function buildGa4Request(measurementId: string, apiSecret: string, ev: ServerEvent): { url: string; body: unknown } {
  const params: Record<string, unknown> = {
    currency: 'INR',
    value: rupees(ev.valuePaise),
    // Needed for the event to show up in GA4 reports; marks these as coming from the app.
    engagement_time_msec: 100,
    app_source: 'mobile_app',
  };
  if (ev.items.length > 0) {
    params.items = ev.items.map((i) => ({ item_id: i.id, item_name: i.name, price: rupees(i.price), quantity: i.quantity }));
  }
  if (ev.name === 'purchase' && ev.orderId) params.transaction_id = ev.orderId;
  return {
    url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
    body: {
      client_id: ev.clientId,
      ...(ev.customer ? { user_id: ev.customer.id } : {}),
      timestamp_micros: ev.timeSec * 1_000_000,
      events: [{ name: ev.name, params }],
    },
  };
}

/**
 * Meta Conversions API request for one event. Customer details are sent only as SHA-256 hashes (as Meta
 * requires); the IP address and user agent are sent as they are, also as Meta requires. The action source is
 * `other`: `app` needs the dataset linked to a Facebook App plus device details we do not collect.
 */
export function buildMetaRequest(
  pixelId: string,
  accessToken: string,
  ev: ServerEvent,
  testEventCode?: string,
): { url: string; body: unknown } {
  const email = normalizeEmail(ev.customer?.email);
  const phone = normalizeIndianPhone(ev.customer?.phone);
  const userData: Record<string, unknown> = {
    external_id: [sha256Hex(ev.customer?.id ?? ev.clientId)],
    ...(email ? { em: [sha256Hex(email)] } : {}),
    ...(phone ? { ph: [sha256Hex(phone)] } : {}),
    ...(ev.ip ? { client_ip_address: ev.ip } : {}),
    ...(ev.userAgent ? { client_user_agent: ev.userAgent } : {}),
  };
  const customData: Record<string, unknown> = { currency: 'INR', value: rupees(ev.valuePaise) };
  if (ev.items.length > 0) {
    customData.content_type = 'product';
    customData.content_ids = ev.items.map((i) => i.id);
    customData.contents = ev.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: rupees(i.price) }));
    if (ev.name === 'begin_checkout' || ev.name === 'purchase') {
      customData.num_items = ev.items.reduce((n, i) => n + i.quantity, 0);
    }
  }
  return {
    url: `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`,
    body: {
      data: [
        {
          event_name: META_NAMES[ev.name],
          event_time: ev.timeSec,
          event_id: ev.eventId,
          action_source: 'other',
          user_data: userData,
          custom_data: customData,
        },
      ],
      access_token: accessToken,
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    },
  };
}
