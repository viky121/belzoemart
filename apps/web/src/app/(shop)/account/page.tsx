'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';
import { AccountSidebar } from '@/components/account-sidebar';

interface Profile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
}
interface Address {
  id: string;
  label: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
  isDefault: boolean;
}
interface OrderSummary {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  imageUrl: string | null;
}

export default function AccountPage() {
  const router = useRouter();
  const { accessToken, authFetch } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [wishCount, setWishCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref('/account'));
      return;
    }
    void (async () => {
      try {
        const [p, a, o, w] = await Promise.all([
          authFetch<Profile>('/me'),
          authFetch<Address[]>('/me/addresses'),
          authFetch<OrderSummary[]>('/orders').catch(() => [] as OrderSummary[]),
          authFetch<unknown[]>('/wishlist').catch(() => [] as unknown[]),
        ]);
        setProfile(p);
        setAddresses(a);
        setOrders(o);
        setWishCount(w.length);
      } catch {
        setError('Could not load your account. Please sign in again.');
      }
    })();
  }, [accessToken, authFetch, router]);

  async function requestExport() {
    await authFetch('/me/data/export', { method: 'POST' });
    alert('Data export requested. You will be notified when it is ready.');
  }

  if (error) {
    return (
      <p role="alert" data-testid="account-error" style={{ color: '#b91c1c', padding: '2rem 0' }}>
        {error}
      </p>
    );
  }

  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];
  const recent = orders.slice(0, 3);

  return (
    <div className="acctx" data-testid="account-page">
      <AccountSidebar />

      <div className="acctx__main">
        <div className="acct-hero">
          <div>
            <h1>Hello, {profile?.name ?? 'there'}</h1>
            <p>Here&apos;s your account overview</p>
          </div>
          <span className="acct-hero__verified">✓ Verified Account</span>
        </div>

        <div className="acct-card" data-testid="account-profile">
          <div className="acct-card__head">
            <h2>👤 Personal Information</h2>
            <button
              type="button"
              className="acct-edit"
              onClick={() => window.dispatchEvent(new Event('belzo:edit-profile'))}
              data-testid="account-edit-profile"
            >
              ✎ Edit
            </button>
          </div>
          <div className="acct-info">
            <div><span>Name</span><strong>{profile?.name ?? '—'}</strong></div>
            <div><span>Email</span><strong>{profile?.email ?? '—'}</strong></div>
            <div><span>Phone</span><strong>{profile?.phone ?? '—'}</strong></div>
          </div>
        </div>

        <div className="acct-card" id="addresses" data-testid="account-addresses">
          <div className="acct-card__head">
            <h2>📍 Delivery Address</h2>
            <Link href="/checkout" className="acct-edit">✎ Manage</Link>
          </div>
          {defaultAddr ? (
            <p className="acct-addr">
              <strong>{defaultAddr.fullName}</strong>
              <br />
              {defaultAddr.line1}
              {defaultAddr.line2 ? `, ${defaultAddr.line2}` : ''}, {defaultAddr.city},{' '}
              {defaultAddr.state} - {defaultAddr.pincode}
              {defaultAddr.phone ? <><br />📞 {defaultAddr.phone}</> : null}
            </p>
          ) : (
            <p className="acct-addr">No saved addresses yet.</p>
          )}
        </div>

        <div className="acct-promo">
          <div>
            <strong>Shop More, Save More!</strong>
            <span>Discover great deals, exclusive offers and more.</span>
          </div>
          <Link href="/search?sort=discount" className="acct-promo__btn">Shop Now →</Link>
        </div>

        <div className="acct-card">
          <div className="acct-card__head">
            <h2>📦 Recent Orders</h2>
            <Link href="/orders" className="acct-edit">View All Orders →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="acct-addr">No orders yet.</p>
          ) : (
            <ul className="acct-orders">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`}>
                    <span className="acct-orders__id">#{o.id.slice(0, 8).toUpperCase()}</span>
                    <span className="acct-orders__meta">
                      {o.itemCount} item{o.itemCount !== 1 ? 's' : ''} · {formatInr(o.grandTotal)}
                    </span>
                    <span className="acct-orders__status">{o.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="acct-privacy">
          <h2>Privacy (DPDP)</h2>
          <button className="btn" onClick={requestExport} data-testid="account-data-export">
            Download my data
          </button>
        </div>
      </div>

      <aside className="acctx__quick">
        <Link href="/orders" className="acct-quick-card acct-quick-card--a">
          <span>📦</span>
          <strong>My Orders</strong>
          <em>Track &amp; view your orders</em>
        </Link>
        <Link href="/wishlist" className="acct-quick-card acct-quick-card--b">
          <span>♥</span>
          <strong>Wishlist</strong>
          <em>Your saved items</em>
        </Link>
        <Link href="/notifications" className="acct-quick-card acct-quick-card--c">
          <span>🔔</span>
          <strong>Notifications</strong>
          <em>Offers &amp; updates</em>
        </Link>
        <Link href="/page/contact" className="acct-quick-card acct-quick-card--d">
          <span>🎧</span>
          <strong>Help &amp; Support</strong>
          <em>We&apos;re here to help</em>
        </Link>
        <div className="acct-quickinfo">
          <h3>Quick Info</h3>
          <div><span>Total Orders</span><strong>{orders.length}</strong></div>
          <div><span>Wishlist Items</span><strong>{wishCount}</strong></div>
        </div>
      </aside>
    </div>
  );
}
