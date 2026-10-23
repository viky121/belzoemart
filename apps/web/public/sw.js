/*
 * Kill-switch service worker.
 *
 * The PWA/offline service worker was disabled because it repeatedly served
 * stale admin bundles (breaking image uploads and hiding deploys). Browsers
 * that still have the old worker registered will fetch this file on their next
 * update check; it clears all caches, unregisters itself, and reloads open
 * tabs so the latest assets load from the network.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch (e) {
          /* ignore */
        }
      }
    })(),
  );
});
