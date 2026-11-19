'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { sanitizeTracking } from '@belzo/shared';
import { trackPixelPageView } from '@/lib/tracking';

/**
 * Loads Google Analytics 4 and the Meta Pixel on the storefront, using the IDs saved in
 * Admin → Settings → Tracking. Nothing loads when an ID is empty, and never on the admin panel.
 *
 * The loader code is built here from the validated IDs; no admin-pasted script is ever injected.
 * GA4 counts in-app page changes itself (enhanced measurement). The Meta Pixel does not, so a PageView
 * is sent on every route change after the first (the first is sent by the pixel's own init code).
 * Meta's `<noscript>` image is deliberately left out: Chrome fetches it even with JavaScript on, which counted
 * every page view twice, and the shop does not work without JavaScript anyway.
 */
export function TrackingScripts({ ga4Id, metaPixelId }: { ga4Id: string; metaPixelId: string }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  // Re-validate: only a well-formed ID may reach the inline scripts below.
  const ids = sanitizeTracking({ ga4Id, metaPixelId });
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  useEffect(() => {
    // The first path is counted by the pixel's own init code; only later, different paths need a PageView.
    if (lastPath.current === null || lastPath.current === pathname) {
      lastPath.current = pathname;
      return;
    }
    lastPath.current = pathname;
    if (ids.metaPixelId && !isAdmin) trackPixelPageView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isAdmin) return null;

  return (
    <>
      {ids.ga4Id && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ids.ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ids.ga4Id)});`}
          </Script>
        </>
      )}
      {ids.metaPixelId && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(ids.metaPixelId)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
