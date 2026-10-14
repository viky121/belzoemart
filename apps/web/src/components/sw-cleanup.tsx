'use client';

import { useEffect } from 'react';
import { safeSession } from '@/lib/safe-storage';

/**
 * In development, a service worker left over from a previous production build
 * (next-pwa registers one with skipWaiting) keeps serving stale cached assets
 * on the same origin — so source changes never appear in the browser.
 *
 * This unregisters any such worker and clears its caches once, then reloads so
 * the fresh assets load. It is a no-op in production (where the PWA worker is
 * intentionally active) and only runs in the browser.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    void (async () => {
      let cleaned = false;
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
          cleaned = true;
        }
        if ('caches' in window) {
          for (const key of await caches.keys()) {
            await caches.delete(key);
            cleaned = true;
          }
        }
      } catch {
        // best-effort cleanup; ignore failures
      }
      // Reload at most once so the page re-fetches assets from the dev server.
      if (cleaned && !safeSession.get('sw-cleaned')) {
        safeSession.set('sw-cleaned', '1');
        window.location.reload();
      }
    })();
  }, []);

  return null;
}
