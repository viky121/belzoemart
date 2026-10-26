'use client';
import { useEffect, useRef } from 'react';
import { useAccessTokenIfAny } from '@/lib/auth-context';
import { trackSearch } from '@/lib/search-track';

/**
 * Renders nothing. Saves the keyword of the search results page once per keyword (not again when only
 * the sort or a filter changes). It waits until the login check has finished, so a logged-in
 * customer's search is saved with the customer.
 */
export function TrackSearch({ q }: { q: string }) {
  const { accessToken, ready } = useAccessTokenIfAny();
  const done = useRef<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (!ready || !term || done.current === term) return;
    done.current = term;
    trackSearch(term, accessToken);
  }, [q, ready, accessToken]);
  return null;
}
