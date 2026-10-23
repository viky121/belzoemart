'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { passwordProblems } from '@belzo/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { isEmail, OtpVerifyField, PasswordField, PasswordRules, toMobile10 } from '@/components/auth-parts';

/** Forgot password: verify the mobile number with an OTP, then choose a new password (twice). */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
 // The account can be found by its mobile number or its email.
 const kind: 'phone' | 'email' = phone.includes('@') ? 'email' : 'phone';
  const [proof, setProof] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suffix, setSuffix] = useState('');
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next) setSuffix(`&next=${encodeURIComponent(next)}`);
  }, []);

  const strong = passwordProblems(password).length === 0;
  const matches = confirm.length > 0 && confirm === password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proof || !strong || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/password/reset', {
        method: 'POST',
        body: { proof, password, confirmPassword: confirm },
      });
      router.push(`/login?reset=1${suffix}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.payload.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-testid="forgot-page">
      <div className="auth-card">
        <aside className="auth-aside">
          <span className="auth-aside__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.png" alt="Belzo eMart" />
          </span>
          <h2>Forgot password</h2>
          <p>Verify your mobile number or email with an OTP and choose a new password.</p>
        </aside>
        <form className="auth-main" onSubmit={submit} noValidate>
          <div className="auth-main__title">Reset your password</div>
          {error && (
            <p role="alert" className="auth-error" data-testid="forgot-error">
              {error}
            </p>
          )}
          <div className="auth-form">
            <label className="auth-label" htmlFor="fp-phone">
              Registered mobile number or email
            </label>
            <input
              id="fp-phone"
              type="text"
              className="auth-input auth-input--tight"
              placeholder="10-digit mobile number or email"
              autoComplete="username"
 autoCapitalize="none"
 spellCheck={false}
              maxLength={254}
              data-testid="forgot-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <OtpVerifyField kind={kind} value={phone} purpose="reset" onVerified={setProof} testId="forgot-otp" />

            {proof && (toMobile10(phone) || isEmail(phone)) && (
              <>
                <label className="auth-label" htmlFor="fp-password">
                  New password
                </label>
                <PasswordField
                  id="fp-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Create a new password"
                  autoComplete="new-password"
                  testId="forgot-password"
                />
                <PasswordRules password={password} />
                <label className="auth-label" htmlFor="fp-confirm">
                  Confirm new password
                </label>
                <PasswordField
                  id="fp-confirm"
                  value={confirm}
                  onChange={setConfirm}
                  placeholder="Enter the password again"
                  autoComplete="new-password"
                  testId="forgot-confirm"
                />
                {confirm.length > 0 && (
                  <p className={`pw-match${matches ? ' pw-match--ok' : ''}`}>
                    {matches ? '✓ Passwords match' : 'Passwords do not match yet'}
                  </p>
                )}
                <button className="auth-btn" type="submit" disabled={busy || !strong || !matches} data-testid="forgot-submit">
                  {busy ? 'Saving…' : 'Change password'}
                </button>
              </>
            )}
          </div>
          <p className="auth-alt">
            Remembered it? <a href="/login">Back to sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
