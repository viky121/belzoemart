'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth, type LoginResponse } from '@/lib/auth-context';
import { postAuthTarget } from '@/lib/auth-redirect';

type Mode = 'otp' | 'email';

/** Customer login: mobile-number OTP (primary) or email + password. */
export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [mode, setMode] = useState<Mode>('otp');
  const [phone, setPhone] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forward the post-login redirect target to the signup cross-link too.
  const [signupHref, setSignupHref] = useState('/signup');

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next) setSignupHref(`/signup?next=${encodeURIComponent(next)}`);
  }, []);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.payload.message : 'Something went wrong');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    const res = await run(() =>
      apiFetch<{ requestId: string; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone },
      }),
    );
    if (res) {
      setRequestId(res.requestId);
      if (res.devCode) {
        setDemoCode(res.devCode);
        setCode(res.devCode);
      }
    }
  }

  async function verifyOtp() {
    if (!requestId) return;
    const res = await run(() =>
      apiFetch<LoginResponse>('/auth/otp/verify', { method: 'POST', body: { requestId, code } }),
    );
    if (res) {
      setSession(res.accessToken, res.customer);
      router.push(postAuthTarget());
    }
  }

  async function emailLogin() {
    const res = await run(() =>
      apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
    );
    if (res) {
      setSession(res.accessToken, res.customer);
      router.push(postAuthTarget());
    }
  }

  return (
    <div className="auth-wrap" data-testid="login-page">
      <div className="auth-card">
        <aside className="auth-aside">
          <span className="auth-aside__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.svg" alt="Belzo eMart" />
          </span>
          <h2>Login</h2>
          <p>Get access to your orders, wishlist and recommendations.</p>
        </aside>

        <div className="auth-main">
          <div className="auth-tabs" role="tablist">
            <button
              className={`auth-tab${mode === 'otp' ? ' auth-tab--active' : ''}`}
              onClick={() => setMode('otp')}
              data-testid="tab-otp"
              disabled={busy}
              role="tab"
              aria-selected={mode === 'otp'}
            >
              Mobile OTP
            </button>
            <button
              className={`auth-tab${mode === 'email' ? ' auth-tab--active' : ''}`}
              onClick={() => setMode('email')}
              data-testid="tab-email"
              disabled={busy}
              role="tab"
              aria-selected={mode === 'email'}
            >
              Email &amp; Password
            </button>
          </div>

          {error && (
            <p role="alert" className="auth-error" data-testid="login-error">
              {error}
            </p>
          )}

          {mode === 'otp' ? (
            <div className="auth-form">
              <label className="auth-label" htmlFor="otp-phone">
                Mobile number
              </label>
              <input
                id="otp-phone"
                type="tel"
                className="auth-input"
                data-testid="login-otp-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                disabled={Boolean(requestId)}
              />
              {!requestId ? (
                <button
                  className="auth-btn"
                  onClick={requestOtp}
                  disabled={busy}
                  data-testid="login-request-otp"
                >
                  {busy ? 'Sending…' : 'Send OTP'}
                </button>
              ) : (
                <>
                  <label className="auth-label" htmlFor="code">
                    Enter the code sent to your mobile
                  </label>
                  <input
                    id="code"
                    className="auth-input"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    data-testid="login-otp-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  {demoCode && (
                    <p className="auth-hint">
                      Demo mode: your OTP is <strong>{demoCode}</strong>. (Connect an SMS gateway to
                      deliver it by text.)
                    </p>
                  )}
                  <button
                    className="auth-btn"
                    onClick={verifyOtp}
                    disabled={busy}
                    data-testid="login-verify-otp"
                  >
                    {busy ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                  <button
                    className="auth-linkbtn"
                    onClick={() => {
                      setRequestId(null);
                      setCode('');
                      setDemoCode(null);
                    }}
                  >
                    Change number
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="auth-form">
              <label className="auth-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                data-testid="login-email"
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
                placeholder="••••••••"
                data-testid="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="auth-btn"
                onClick={emailLogin}
                disabled={busy}
                data-testid="login-submit"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          )}

          <p className="auth-alt">
            New to Belzo? <a href={signupHref}>Create an account</a>
          </p>
        </div>
      </div>
    </div>
  );
}
