import Link from 'next/link';
import { getMessages } from '@/lib/i18n';
import { catalogueApi } from '@/lib/catalogue-api';
import { CategoryStrip } from '@/components/category-strip';
import { HeaderSearch } from '@/components/header-search';
import { EmartHeader } from '@/components/emart-header';
import { EmartFooter } from '@/components/emart-footer';
import { Toaster } from '@/components/toaster';
import { ProfilePrompt } from '@/components/profile-prompt';
import { getSiteContent } from '@/lib/site-content';
import { apiFetch } from '@/lib/api-client';
import { FOOTER_PAGE_LINKS, visibleLinks, type PageLink } from '@/lib/cms-links';
import type { CategoryNodeDto } from '@belzo/shared';

/** Storefront shell — theme-aware (Classic Flipkart-style or eMart grocery). */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const t = getMessages();
  const { theme, footer } = await getSiteContent();
  const categories = await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]);
  const simpleCats = categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  // Enabled CMS pages: footer links to pages an admin has disabled are left out.
  const activePages = await apiFetch<{ slug: string }[]>('/cms/pages')
    .then((rows) => rows.map((r) => r.slug))
    .catch(() => null);
  const pageLinks = (slugs: string[]) =>
    visibleLinks(
      slugs.map((s) => FOOTER_PAGE_LINKS.find((l) => l.slug === s)).filter((l): l is PageLink => Boolean(l)),
      activePages,
    ).map((l) => (
      <Link key={l.slug} href={`/page/${l.slug}`}>
        {l.label}
      </Link>
    ));

  return (
    <div className="theme-root" data-theme={theme}>
      {theme === 'emart' ? (
        <EmartHeader categories={categories} />
      ) : (
        <>
          <header className="site-header">
        <div className="container row">
          <Link href="/" className="brand" data-testid="shop-brand-link">
            <span className="brand__badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/belzo-logo.png" alt={t.brand} />
            </span>
          </Link>

          <HeaderSearch />

          <nav className="main">
            <Link href="/login" className="btn-login" data-testid="nav-login">
              Login
            </Link>
            <Link href="/wishlist" data-testid="nav-wishlist">
              ♥ <span className="nav-label">Wishlist</span>
            </Link>
            <Link href="/orders" data-testid="nav-orders">
              🧾 <span className="nav-label">{t.nav.orders}</span>
            </Link>
            <Link href="/cart" data-testid="nav-cart">
              🛒 <span className="nav-label">{t.nav.cart}</span>
            </Link>
            <Link href="/account" data-testid="nav-account">
              👤 <span className="nav-label">{t.nav.account}</span>
            </Link>
          </nav>
        </div>
          </header>

          <CategoryStrip categories={simpleCats} />
        </>
      )}

      <main className="container">{children}</main>

      <Toaster />


      {/* Post-login profile completion (asks for name + the missing contact). */}
      <ProfilePrompt />

      {theme === 'emart' ? (
        <EmartFooter content={footer} activePages={activePages} />
      ) : (
      <footer className="site-footer">
        <div className="footer-brand">
          <span className="footer-brand__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.png" alt={t.brand} />
          </span>
          <p>Shop smart, live better — quality products delivered across India. 🇮🇳</p>
        </div>
        <div className="footer-cols">
          <div className="footer-col">
            <h4>About</h4>
            {pageLinks(['about', 'contact', 'grievance-support'])}
          </div>
          <div className="footer-col">
            <h4>Help</h4>
            {pageLinks(['shipping-policy', 'returns-policy', 'cancellation-policy'])}
            <Link href="/orders">Track Orders</Link>
          </div>
          <div className="footer-col">
            <h4>Policy</h4>
            {pageLinks(['privacy', 'terms', 'payment-policy'])}
          </div>
          <div className="footer-col">
            <h4>Shop</h4>
            {categories.map((c) => (
              <Link key={c.id} href={`/category/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div className="footer-col">
            <h4>Account</h4>
            <Link href="/login">Login</Link>
            <Link href="/account">My Account</Link>
            <Link href="/wishlist">Wishlist</Link>
            <Link href="/orders">My Orders</Link>
          </div>
        </div>
        <nav className="footer-links" data-testid="footer-links" style={{ display: 'none' }}>
          {pageLinks(FOOTER_PAGE_LINKS.map((l) => l.slug))}
        </nav>
        <div className="footer-bar">
          © {new Date().getFullYear()} {t.brand}. Made in India 🇮🇳 — Phase 1 build.
        </div>
      </footer>
      )}
    </div>
  );
}
