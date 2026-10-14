'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const LINKS = [
  { href: '/account', label: 'My Account', icon: '👤' },
  { href: '/orders', label: 'My Orders', icon: '📦' },
  { href: '/wishlist', label: 'Wishlist', icon: '♥' },
  { href: '/account#addresses', label: 'Addresses', icon: '📍' },
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/page/contact', label: 'Help & Support', icon: '🎧' },
];

/** Shared left sidebar for the customer account area (account/orders/wishlist). */
export function AccountSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { customer, logout } = useAuth();

  async function doLogout() {
    await logout();
    router.push('/');
  }

  return (
    <aside className="acctx__side" data-testid="account-sidebar">
      <div className="acctx__profile">
        <span className="acctx__avatar">{(customer?.name ?? 'U').charAt(0).toUpperCase()}</span>
        <div>
          <strong>{customer?.name ?? 'Belzo Customer'}</strong>
          <span>{customer?.email ?? customer?.phone ?? ''}</span>
        </div>
      </div>
      <nav className="acctx__nav">
        {LINKS.map((l) => {
          const active = pathname === l.href.split('#')[0];
          return (
            <Link key={l.label} href={l.href} className={active ? 'is-on' : ''}>
              <span>{l.icon}</span> {l.label}
            </Link>
          );
        })}
        <button type="button" onClick={doLogout} className="acctx__logout" data-testid="account-logout">
          <span>↩</span> Logout
        </button>
      </nav>
    </aside>
  );
}
