'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/** Header account area — shows Login/Sign Up for guests, or the customer's
 *  name + Logout once signed in. */
export function HeaderAccount() {
  const { customer, ready, logout } = useAuth();
  const router = useRouter();

  // While the initial session restore is in flight, show a neutral placeholder
  // so a signed-in user doesn't see a "Login / Sign Up" flash before their
  // details load.
  if (!ready) {
    return (
      <span className="em-account em-account--loading" aria-hidden data-testid="nav-account-loading">
        <span className="em-actions__ic">👤</span>
        <span>Account</span>
      </span>
    );
  }

  if (!customer) {
    return (
      <Link href="/login" data-testid="nav-login">
        <span className="em-actions__ic">👤</span>
        <span>Login / Sign Up</span>
      </Link>
    );
  }

  const firstName = (customer.name || 'Account').trim().split(/\s+/)[0];

  async function doLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="em-account">
      <Link href="/account" data-testid="nav-account">
        <span className="em-actions__ic">👤</span>
        <span>Hi, {firstName}</span>
      </Link>
      <button type="button" className="em-logout" onClick={doLogout} data-testid="nav-logout">
        Logout
      </button>
    </div>
  );
}
