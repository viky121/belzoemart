'use client';
import type { ActiveOfferView } from '@belzo/shared';
import { apiFetch } from './api-client';

const TTL_MS = 60_000;
let cache: { at: number; promise: Promise<ActiveOfferView[]> } | null = null;

/**
 * The special-price offers that are on now (public). Remembered for a minute so a product page does not ask
 * again for every variant change. A failure means "no offers": the page then shows normal prices.
 */
export function fetchActiveOffers(now: number = Date.now()): Promise<ActiveOfferView[]> {
  if (cache && now - cache.at < TTL_MS) return cache.promise;
  const promise = apiFetch<ActiveOfferView[]>('/offers/active').catch(() => [] as ActiveOfferView[]);
  cache = { at: now, promise };
  return promise;
}
