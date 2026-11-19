import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { TrackingEventInput, TrackingItem } from '@belzo/shared';
import { apiRequest } from '@/api/client';
import type { PublicSettings } from '@/api/types';

/**
 * Ad / analytics events for Google Analytics and Meta (Facebook). The app cannot run their browser scripts, so
 * each event goes to our own API (POST /tracking/events), which forwards it using the keys saved in
 * Admin → Settings → Tracking.
 *
 * Every function here is fire-and-forget and swallows all errors: tracking must never slow down, block or
 * break shopping. Nothing is sent until the admin has set it up (the API tells the app via `appTracking`).
 */

const CLIENT_ID_KEY = 'belzo.trackingId';
/** How long the "is tracking on?" answer is kept before asking the server again. */
const ENABLED_TTL_MS = 10 * 60_000;
const FAILED_TTL_MS = 60_000;

let clientIdMemo: Promise<string> | null = null;

/** A random id for this app install (not the customer id, never shown anywhere). */
export function getTrackingClientId(): Promise<string> {
  if (!clientIdMemo) {
    clientIdMemo = (async () => {
      try {
        const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);
        if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
        const created = Crypto.randomUUID();
        await AsyncStorage.setItem(CLIENT_ID_KEY, created);
        return created;
      } catch {
        // Storage unavailable: an id for this run only is still better than none.
        return Crypto.randomUUID();
      }
    })();
  }
  return clientIdMemo;
}

let enabledMemo: { value: boolean; until: number } | null = null;

async function trackingEnabled(): Promise<boolean> {
  const now = Date.now();
  if (enabledMemo && enabledMemo.until > now) return enabledMemo.value;
  try {
    const s = await apiRequest<PublicSettings>('/settings/public');
    enabledMemo = { value: s?.appTracking === true, until: now + ENABLED_TTL_MS };
  } catch {
    enabledMemo = { value: false, until: now + FAILED_TTL_MS };
  }
  return enabledMemo.value;
}

/** Fire-and-forget: resolves immediately, sends in the background, never throws. */
function send(event: Omit<TrackingEventInput, 'clientId'>): void {
  void (async () => {
    try {
      if (!(await trackingEnabled())) return;
      const clientId = await getTrackingClientId();
      await apiRequest('/tracking/events', { method: 'POST', auth: 'optional', body: { ...event, clientId }, timeoutMs: 8000 });
    } catch {
      /* tracking must never affect the app */
    }
  })();
}

/** Prices are paise, as everywhere in the app. */
export type TrackedItem = TrackingItem;

export function trackViewItem(item: TrackedItem): void {
  send({ event: 'view_item', items: [item] });
}

export function trackAddToCart(items: TrackedItem[]): void {
  if (items.length > 0) send({ event: 'add_to_cart', items: items.slice(0, 50) });
}

export function trackBeginCheckout(items: TrackedItem[]): void {
  if (items.length > 0) send({ event: 'begin_checkout', items: items.slice(0, 50) });
}

const purchasesSent = new Set<string>();

/** A sale: the order id only. The server checks the order is the customer's and reads the amount itself. */
export function trackPurchase(orderId: string): void {
  if (!orderId || purchasesSent.has(orderId)) return;
  purchasesSent.add(orderId);
  send({ event: 'purchase', orderId });
}

/** Test-only: forget cached state. */
export function __resetTrackingForTests(): void {
  clientIdMemo = null;
  enabledMemo = null;
  purchasesSent.clear();
}
