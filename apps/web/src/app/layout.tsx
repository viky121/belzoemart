import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { resolveLocale } from '@/lib/i18n';
import { ServiceWorkerCleanup } from '@/components/sw-cleanup';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale();
  return (
    <html lang={locale}>
      <body>
        <ServiceWorkerCleanup />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
