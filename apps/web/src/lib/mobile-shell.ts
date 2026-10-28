/** The tabs of the phone bottom bar (same five places the customer needs most). */
export type TabId = 'home' | 'categories' | 'offers' | 'cart' | 'account';

export interface TabDef {
  id: TabId;
  href: string;
  label: string;
}

export const TABS: readonly TabDef[] = [
  { id: 'home', href: '/', label: 'Home' },
  { id: 'categories', href: '/categories', label: 'Categories' },
  { id: 'offers', href: '/offers', label: 'Offers' },
  { id: 'cart', href: '/cart', label: 'Cart' },
  { id: 'account', href: '/account', label: 'Account' },
];

const is = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which tab is open for this page, or null when the page belongs to none (a product page, search ...). */
export function activeTab(pathname: string): TabId | null {
  if (pathname === '/') return 'home';
  if (is(pathname, '/categories') || is(pathname, '/category')) return 'categories';
  if (is(pathname, '/offers')) return 'offers';
  if (is(pathname, '/cart')) return 'cart';
  for (const base of ['/account', '/orders', '/wishlist', '/wallet', '/notifications']) {
    if (is(pathname, base)) return 'account';
  }
  return null;
}

/** Pages where the bar would be in the way: checkout, signing in and the order result. */
const BARE_PAGES = ['/checkout', '/login', '/signup', '/forgot-password', '/order-result'];

export function tabBarHidden(pathname: string): boolean {
  return BARE_PAGES.some((p) => is(pathname, p));
}

/** The floating "View cart" pill is not shown where the bar is hidden, or on the cart page itself. */
export function cartPillHidden(pathname: string): boolean {
  return tabBarHidden(pathname) || is(pathname, '/cart');
}

export const itemsLabel = (n: number): string => `${n} ${n === 1 ? 'item' : 'items'}`;

/** The badge text of the Cart tab: nothing for an empty cart, "99+" for a very full one. */
export function badgeText(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}
