'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const ROWS: { href: string; label: string; hint: string; icon: string }[] = [
  { href: '/orders', label: 'My Orders', hint: 'Track and view your orders', icon: '📦' },
  { href: '/wishlist', label: 'Wishlist', hint: 'Your saved items', icon: '♥' },
  { href: '/account#addresses', label: 'Addresses', hint: 'Where we deliver', icon: '📍' },
  { href: '/wallet', label: 'Wallet', hint: 'Your Belzo balance', icon: '👛' },
  { href: '/notifications', label: 'Notifications', hint: 'Offers and updates', icon: '🔔' },
  { href: '/page/contact', label: 'Help & Support', hint: 'We are here to help', icon: '🎧' },
];

/**
 * The Account tab on a phone: a list of rows like the app's Account screen. A computer does not
 * see it (it has the side menu); the CSS shows this only on screens up to 900 px.
 */
export function MobileAccountMenu() {
  const router = useRouter();
  const { logout } = useAuth();
  async function doLogout() {
    await logout();
    router.push('/');
  }
  return (
    <nav className="macct" aria-label="Account" data-testid="mobile-account-menu">
      <ul>
        {ROWS.map((r) => (
          <li key={r.label}>
            <Link href={r.href} className="macct__row">
              <span className="macct__ic" aria-hidden="true">
                {r.icon}
              </span>
              <span className="macct__text">
                <strong>{r.label}</strong>
                <em>{r.hint}</em>
              </span>
              <span className="macct__chev" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
        <li>
          <button type="button" className="macct__row macct__row--out" onClick={doLogout} data-testid="mobile-account-logout">
            <span className="macct__ic" aria-hidden="true">
              ↩
            </span>
            <span className="macct__text">
              <strong>Logout</strong>
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
