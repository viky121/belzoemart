import type { PermissionKey } from '@belzo/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  testid: string;
  /** The admin needs ANY of these to see the item and open the page. Empty = everyone signed in. */
  anyOf: PermissionKey[];
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** The admin sidebar. Each page lists the permissions that open it (the server enforces the same rules). */
export const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: '/admin', label: 'Dashboard', icon: '▦', testid: 'admin-nav-dashboard', anyOf: [] }] },
  {
    title: 'Catalog',
    items: [
      { href: '/admin/catalogue', label: 'Products', icon: '📦', testid: 'admin-nav-catalogue', anyOf: ['products.view'] },
      { href: '/admin/categories', label: 'Categories', icon: '🗂️', testid: 'admin-nav-categories', anyOf: ['taxonomy.view'] },
      { href: '/admin/brands', label: 'Brands', icon: '🔖', testid: 'admin-nav-brands', anyOf: ['taxonomy.view'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: '🧾', testid: 'admin-nav-orders', anyOf: ['orders.view'] },
      { href: '/admin/returns', label: 'Returns', icon: '↩️', testid: 'admin-nav-returns', anyOf: ['returns.view'] },
      { href: '/admin/payments', label: 'Payments', icon: '💳', testid: 'admin-nav-payments', anyOf: ['payments.view'] },
      { href: '/admin/customers', label: 'Customers', icon: '👥', testid: 'admin-nav-customers', anyOf: ['customers.view'] },
      { href: '/admin/reviews', label: 'Reviews', icon: '⭐', testid: 'admin-nav-reviews', anyOf: ['reviews.moderate'] },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/admin/marketing', label: 'Marketing', icon: '📣', testid: 'admin-nav-marketing', anyOf: ['content.edit'] },
      { href: '/admin/mobile', label: 'Mobile app', icon: '📱', testid: 'admin-nav-mobile', anyOf: ['mobile.edit'] },
      { href: '/admin/pages', label: 'Pages', icon: '📄', testid: 'admin-nav-pages', anyOf: ['content.edit', 'mobile.edit'] },
      { href: '/admin/coupons', label: 'Coupons', icon: '🏷️', testid: 'admin-nav-coupons', anyOf: ['coupons.view'] },
      { href: '/admin/offers', label: 'Offers', icon: '🎁', testid: 'admin-nav-offers', anyOf: ['offers.view'] },
      { href: '/admin/reports', label: 'Reports', icon: '📈', testid: 'admin-nav-reports', anyOf: ['reports.view'] },
    ],
  },
  {
    title: 'Configure',
    items: [
      { href: '/admin/serviceability', label: 'Serviceability', icon: '📍', testid: 'admin-nav-serviceability', anyOf: ['serviceability.edit'] },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️', testid: 'admin-nav-settings', anyOf: ['settings.edit', 'gateway.edit', 'delivery.settings'] },
      { href: '/admin/access', label: 'Staff and types', icon: '🔐', testid: 'admin-nav-access', anyOf: ['staff.manage'] },
    ],
  },
];

export type CanFn = (...keys: string[]) => boolean;

export function canOpen(item: NavItem, can: CanFn): boolean {
  return item.anyOf.length === 0 || can(...item.anyOf);
}

/** The sidebar for one admin: only the items they may open, and no group left empty. */
export function visibleGroups(groups: NavGroup[], can: CanFn): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canOpen(i, can)) }))
    .filter((g) => g.items.length > 0);
}

/** The sidebar entry that owns a path (the longest matching one), or null for a page outside the sidebar. */
export function navItemFor(pathname: string, groups: NavGroup[] = NAV_GROUPS): NavItem | null {
  let best: NavItem | null = null;
  for (const g of groups) {
    for (const i of g.items) {
      const hit = i.href === '/admin' ? pathname === '/admin' : pathname === i.href || pathname.startsWith(`${i.href}/`);
      if (hit && (!best || i.href.length > best.href.length)) best = i;
    }
  }
  return best;
}

/** True when the admin may open the page at this path. Pages outside the sidebar are left to the server. */
export function mayOpenPath(pathname: string, can: CanFn, groups: NavGroup[] = NAV_GROUPS): boolean {
  const item = navItemFor(pathname, groups);
  return item ? canOpen(item, can) : true;
}

/** Where to send someone who has no dashboard access: the first page they may open. */
export function firstAllowedHref(can: CanFn, groups: NavGroup[] = NAV_GROUPS): string | null {
  for (const g of visibleGroups(groups, can)) {
    const item = g.items.find((i) => i.href !== '/admin');
    if (item) return item.href;
  }
  return null;
}
