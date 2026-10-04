'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth, type LoginResponse } from '@/lib/auth-context';
import { postAuthTarget } from '@/lib/auth-redirect';

/** Email + password signup (guest OTP signup happens implicitly on OTP verify). */
export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forward the post-auth redirect target to the login cross-link too.
  const [loginLink, setLoginLink] = useState('/login');

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next) setLoginLink(`/login?next=${encodeURIComponent(next)}`);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
      setSession(res.accessToken, res.customer);
      router.push(postAuthTarget());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.payload.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-testid="signup-page">
      <div className="auth-card">
        <aside className="auth-aside">
          <span className="auth-aside__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.svg" alt="Belzo eMart" />
          </span>
          <h2>Create account</h2>
          <p>Sign up to track orders, save your wishlist and check out faster.</p>
        </aside>

        <div className="auth-main">
          <div className="auth-main__title">Create your account</div>

          {error && (
            <p role="alert" className="auth-error" data-testid="signup-error">
              {error}
            </p>
          )}

          <div className="auth-form">
            <label className="auth-label" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className="auth-input"
              placeholder="Your name"
              data-testid="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              data-testid="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="auth-input"
              placeholder="Min 8 characters"
              data-testid="signup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="auth-btn"
              onClick={submit}
              disabled={busy}
              data-testid="signup-submit"
            >
              {busy ? 'Creating…' : 'Sign up'}
            </button>
          </div>

          <p className="auth-alt">
            Already have an account? <a href={loginLink}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
