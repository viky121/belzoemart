import Link from 'next/link';
import type { CategoryNodeDto } from '@belzo/shared';
import { HeaderSearch } from '@/components/header-search';
import { EmartAllCategories } from '@/components/emart-all-categories';
import { CartLink } from '@/components/cart-link';
import { CatbarNav } from '@/components/catbar-nav';
import { HeaderAccount } from '@/components/header-account';
import { DeliveryPin } from '@/components/delivery-pin';

/** eMart theme storefront header: white top bar + category nav row. */
export function EmartHeader({ categories }: { categories: CategoryNodeDto[] }) {
  return (
    <header className="em-header">
      <div className="em-topbar">
        <div className="container em-topbar__inner">
          <Link href="/" className="em-brand" data-testid="shop-brand-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.png" alt="Belzo eMart" />
          </Link>

          <div className="em-search">
            <HeaderSearch />
          </div>

          <nav className="em-actions">
            <DeliveryPin />
            <HeaderAccount />
            <Link href="/wishlist" data-testid="nav-wishlist">
              <span className="em-actions__ic">♥</span>
              <span>Wishlist</span>
            </Link>
            <CartLink />
          </nav>
        </div>
      </div>

      <div className="em-catbar">
        <div className="container em-catbar__inner" data-testid="header-categories">
          <EmartAllCategories categories={categories} />
          <CatbarNav categories={categories.slice(0, 6).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
        </div>
      </div>
    </header>
  );
}
