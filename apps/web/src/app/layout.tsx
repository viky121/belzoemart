import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { resolveLocale } from '@/lib/i18n';
import { ServiceWorkerCleanup } from '@/components/sw-cleanup';
import { TrackingScripts } from '@/components/tracking-scripts';
import { getSiteContent } from '@/lib/site-content';
import './globals.css';

export const metadata: Metadata = {
  title: 'Belzo eMart',
  description: 'Shop apparel, groceries, electronics and handicrafts across India.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale();
  // Analytics / ad-pixel IDs from Admin → Settings → Tracking (empty = nothing is loaded).
  const { tracking } = await getSiteContent();
  return (
    <html lang={locale}>
      <body>
        <ServiceWorkerCleanup />
        <TrackingScripts ga4Id={tracking.ga4Id} metaPixelId={tracking.metaPixelId} />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
