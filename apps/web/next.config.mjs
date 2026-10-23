import nextPwa from 'next-pwa';

// Service worker disabled: the PWA cache repeatedly served stale admin bundles
// (breaking uploads and hiding deploys). ServiceWorkerCleanup unregisters any
// previously-installed worker on the client.
const withPWA = nextPwa({
  dest: 'public',
  disable: true,
  register: false,
  skipWaiting: true,
});

/** Security headers applied to all responses (SECURITY-04). */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@belzo/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
