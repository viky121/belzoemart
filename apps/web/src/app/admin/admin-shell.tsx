'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { adminLogout } from '@/lib/admin-api';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  testid: string;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  { items: [{ href: '/admin', label: 'Dashboard', icon: '▦', testid: 'admin-nav-dashboard' }] },
  {
    title: 'Catalog',
    items: [
      { href: '/admin/catalogue', label: 'Products', icon: '📦', testid: 'admin-nav-catalogue' },
      { href: '/admin/categories', label: 'Categories', icon: '🗂️', testid: 'admin-nav-categories' },
      { href: '/admin/brands', label: 'Brands', icon: '🔖', testid: 'admin-nav-brands' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: '🧾', testid: 'admin-nav-orders' },
      { href: '/admin/returns', label: 'Returns', icon: '↩️', testid: 'admin-nav-returns' },
      { href: '/admin/payments', label: 'Payments', icon: '💳', testid: 'admin-nav-payments' },
      { href: '/admin/customers', label: 'Customers', icon: '👥', testid: 'admin-nav-customers' },
      { href: '/admin/reviews', label: 'Reviews', icon: '⭐', testid: 'admin-nav-reviews' },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/admin/marketing', label: 'Marketing', icon: '📣', testid: 'admin-nav-marketing' },
      { href: '/admin/mobile', label: 'Mobile app', icon: '📱', testid: 'admin-nav-mobile' },
      { href: '/admin/coupons', label: 'Coupons', icon: '🏷️', testid: 'admin-nav-coupons' },
      { href: '/admin/reports', label: 'Reports', icon: '📈', testid: 'admin-nav-reports' },
    ],
  },
  {
    title: 'Configure',
    items: [
      { href: '/admin/serviceability', label: 'Serviceability', icon: '📍', testid: 'admin-nav-serviceability' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️', testid: 'admin-nav-settings' },
    ],
  },
];

/** Admin chrome: grouped icon sidebar + top bar. Hidden on the login screen. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/admin/login') return <>{children}</>;

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  async function logout() {
    await adminLogout();
    router.push('/admin/login');
  }

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__logo">B</span>
          <span>Belzo <em>Admin</em></span>
        </div>
        <nav className="admin-nav">
          {GROUPS.map((g, i) => (
            <div className="admin-nav__group" key={i}>
              {g.title && <div className="admin-nav__title">{g.title}</div>}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`admin-nav__link${isActive(it.href) ? ' is-active' : ''}`}
                  data-testid={it.testid}
                >
                  <span className="admin-nav__icon">{it.icon}</span>
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="admin-main-wrap">
        <header className="admin-topbar">
          <div className="admin-topbar__search">
            <span aria-hidden="true">🔍</span>
            <input placeholder="Search orders, products, customers…" aria-label="Search" />
          </div>
          <div className="admin-topbar__right">
            <button className="admin-topbar__icon" aria-label="Notifications">🔔</button>
            <div className="admin-topbar__profile">
              <span className="admin-topbar__avatar">A</span>
              <span className="admin-topbar__name">Admin</span>
            </div>
            <button className="admin-topbar__logout" onClick={logout} data-testid="admin-logout">
              Logout
            </button>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
