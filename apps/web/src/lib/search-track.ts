import { apiFetch } from './api-client';

/**
 * Tells the shop that the customer made a real search, so the admin "Search terms" report can count
 * it. Called after Enter, a picked suggestion or when the results page opens, never while typing.
 * Fire and forget: it never throws and never makes the search wait.
 */
export function trackSearch(q: string, accessToken?: string | null): void {
  const term = q.trim();
  if (term.length < 2) return;
  void apiFetch('/search/log', {
    method: 'POST',
    body: { q: term, source: 'web' },
    accessToken: accessToken ?? undefined,
  }).catch(() => undefined);
}
