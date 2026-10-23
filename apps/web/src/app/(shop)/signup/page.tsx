'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { passwordProblems } from '@belzo/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth, type LoginResponse } from '@/lib/auth-context';
import { postAuthTarget } from '@/lib/auth-redirect';
import { isEmail, OtpVerifyField, PasswordField, PasswordRules, toMobile10 } from '@/components/auth-parts';

/**
 * Create an account: full name, mobile and email (each verified by an OTP), and a strong password
 * entered twice. The account is only created once both OTPs are verified.
 */
export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phoneProof, setPhoneProof] = useState<string | null>(null);
  const [emailProof, setEmailProof] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forward the post-auth redirect target to the login cross-link too.
  const [loginLink, setLoginLink] = useState('/login');
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next) setLoginLink(`/login?next=${encodeURIComponent(next)}`);
  }, []);

  const phone10 = toMobile10(phone);
  const strong = passwordProblems(password).length === 0;
  const matches = confirm.length > 0 && confirm === password;
  const ready = name.trim().length >= 2 && Boolean(phone10) && isEmail(email) && Boolean(phoneProof) && Boolean(emailProof) && strong && matches;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !phone10) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>('/auth/register', {
        method: 'POST',
        body: {
          name: name.trim(),
          phone: phone10,
          email: email.trim().toLowerCase(),
          password,
          confirmPassword: confirm,
          phoneProof,
          emailProof,
        },
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
    <div className="auth-wrap" data-testid="signup-page">
      <div className="auth-card auth-card--wide">
        <aside className="auth-aside">
          <span className="auth-aside__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.png" alt="Belzo eMart" />
          </span>
          <h2>Create account</h2>
          <p>Verify your mobile number and email, set a password, and you are ready to shop.</p>
        </aside>
        <form className="auth-main" onSubmit={submit} noValidate>
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
              placeholder="Your full name"
              autoComplete="name"
              data-testid="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="auth-label" htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              className="auth-input auth-input--tight"
              placeholder="10-digit mobile number"
              autoComplete="tel"
              maxLength={14}
              data-testid="signup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <OtpVerifyField kind="phone" value={phone} purpose="register" onVerified={setPhoneProof} testId="signup-phone-otp" />

            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="auth-input auth-input--tight"
              placeholder="you@example.com"
              autoComplete="email"
              data-testid="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <OtpVerifyField kind="email" value={email} purpose="register" onVerified={setEmailProof} testId="signup-email-otp" />

            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <PasswordField
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
              autoComplete="new-password"
              testId="signup-password"
            />
            <PasswordRules password={password} />

            <label className="auth-label" htmlFor="confirm">
              Confirm password
            </label>
            <PasswordField
              id="confirm"
              value={confirm}
              onChange={setConfirm}
              placeholder="Enter the password again"
              autoComplete="new-password"
              testId="signup-confirm"
            />
            {confirm.length > 0 && (
              <p className={`pw-match${matches ? ' pw-match--ok' : ''}`} data-testid="signup-match">
                {matches ? '✓ Passwords match' : 'Passwords do not match yet'}
              </p>
            )}

            <button className="auth-btn" type="submit" disabled={busy || !ready} data-testid="signup-submit">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            {!ready && (
              <p className="auth-hint auth-hint--center">Verify your mobile and email and set a matching strong password to continue.</p>
            )}
          </div>
          <p className="auth-alt">
            Already have an account? <a href={loginLink}>Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
