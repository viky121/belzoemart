'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth, type LoginResponse } from '@/lib/auth-context';
import { postAuthTarget } from '@/lib/auth-redirect';
import { isEmail, PasswordField, toMobile10 } from '@/components/auth-parts';

/** Customer sign-in: mobile number OR email, plus the password. */
export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forward the post-login redirect target to the signup / forgot-password links too.
  const [suffix, setSuffix] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next) setSuffix(`?next=${encodeURIComponent(next)}`);
    if (params.get('reset') === '1') setNotice('Password changed. Sign in with your new password.');
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!isEmail(id) && !toMobile10(id)) return setError('Enter a valid mobile number or email');
    if (!password) return setError('Enter your password');
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login/identifier', {
        method: 'POST',
        body: { identifier: id, password },
      });
      setSession(res.accessToken, res.customer);
      router.push(postAuthTarget());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.payload.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-testid="login-page">
      <div className="auth-card">
        <aside className="auth-aside">
          <span className="auth-aside__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.png" alt="Belzo eMart" />
          </span>
          <h2>Login</h2>
          <p>Get access to your orders, wishlist and recommendations.</p>
        </aside>

        <form className="auth-main" onSubmit={signIn} noValidate>
          <div className="auth-main__title">Sign in to your account</div>

          {notice && (
            <p role="status" className="auth-notice" data-testid="login-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="auth-error" data-testid="login-error">
              {error}
            </p>
          )}

          <div className="auth-form">
            <label className="auth-label" htmlFor="login-id">
              Mobile number or email
            </label>
            <input
              id="login-id"
              className="auth-input"
              data-testid="login-id"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="10-digit mobile number or email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <PasswordField
              id="login-password"
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
              testId="login-password"
            />
            <div className="auth-row-end">
              <a href={`/forgot-password${suffix}`} data-testid="login-forgot">
                Forgot password?
              </a>
            </div>
            <button className="auth-btn" type="submit" disabled={busy} data-testid="login-submit">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          <p className="auth-alt">
            New to Belzo? <a href={`/signup${suffix}`}>Create an account</a>
          </p>
          <p className="auth-hint auth-hint--center">
            No password yet? Use &quot;Forgot password?&quot; to set one. Signed up earlier with only an email? Create an
            account with the same email to add your mobile number.
          </p>
        </form>
      </div>
    </div>
  );
}
