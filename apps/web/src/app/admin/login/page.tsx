'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError } from '@/lib/api-client';
import { adminLogin } from '@/lib/admin-api';

/** Floating grocery/product icons for the animated login background. */
const FLOATS = [
  { e: '🛒', left: '5%', size: 2.6, dur: 16, delay: 0 },
  { e: '🥦', left: '15%', size: 1.9, dur: 20, delay: 3 },
  { e: '🧴', left: '26%', size: 2.2, dur: 18, delay: 6 },
  { e: '🍫', left: '37%', size: 1.6, dur: 22, delay: 1 },
  { e: '🧃', left: '47%', size: 2.0, dur: 17, delay: 4 },
  { e: '🍞', left: '57%', size: 2.4, dur: 21, delay: 2 },
  { e: '🥛', left: '67%', size: 1.8, dur: 19, delay: 7 },
  { e: '🧼', left: '77%', size: 2.0, dur: 23, delay: 5 },
  { e: '🍎', left: '87%', size: 2.1, dur: 16, delay: 8 },
  { e: '☕', left: '93%', size: 1.7, dur: 24, delay: 2 },
  { e: '🧂', left: '11%', size: 1.5, dur: 25, delay: 9 },
  { e: '🧻', left: '72%', size: 1.9, dur: 20, delay: 11 },
  { e: '🧺', left: '33%', size: 2.0, dur: 26, delay: 5 },
  { e: '🫧', left: '62%', size: 1.6, dur: 18, delay: 10 },
];

/** Admin login — email + password. */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(email, password);
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.payload.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adlogin" data-testid="admin-login">
      <div className="adlogin__bg" aria-hidden="true">
        {FLOATS.map((f, i) => (
          <span
            key={i}
            className="adlogin__float"
            style={{
              left: f.left,
              fontSize: `${f.size}rem`,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            {f.e}
          </span>
        ))}
      </div>

      <form className="adlogin__card" onSubmit={submit}>
        <div className="adlogin__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/belzo-logo.svg" alt="Belzo eMart" />
        </div>
        <h1>Admin Panel</h1>
        <p className="adlogin__sub">Sign in to manage your store</p>

        {error && (
          <p role="alert" className="adlogin__err" data-testid="admin-login-error">
            {error}
          </p>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="admin@belzo.local"
          data-testid="admin-login-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          data-testid="admin-login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className="adlogin__btn" disabled={busy} data-testid="admin-login-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="adlogin__foot">Belzo eMart · Secure admin access</p>
      </form>
    </div>
  );
}
