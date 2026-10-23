'use client';

import { useEffect, useState } from 'react';
import { PASSWORD_RULES } from '@belzo/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';

/** A 10-digit Indian mobile (also accepts +91 / spaces); returns the 10 digits or null. */
export function toMobile10(raw: string): string | null {
  const d = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Password box with a show/hide toggle. */
export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  testId,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: 'current-password' | 'new-password';
  testId?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="auth-input"
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/** Live checklist of the password rules (capital letter, small letter, symbol, 8+ characters). */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="pw-rules" aria-label="Password rules" data-testid="password-rules">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.key} className={ok ? 'pw-rules__ok' : ''} data-testid={`pw-rule-${r.key}`}>
            <span aria-hidden>{ok ? '✓' : '○'}</span> {r.label}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Send OTP → enter code → Verified" for one mobile number or email.
 * On success it hands the signed proof to the parent (needed to create the account / reset the password).
 * Changing the value in the parent (key) starts over, so a proof can never belong to another number.
 */
export function OtpVerifyField({
  kind,
  value,
  purpose,
  onVerified,
  testId,
}: {
  kind: 'phone' | 'email';
  /** Current text of the mobile / email input above. */
  value: string;
  purpose: 'register' | 'reset';
  onVerified: (proof: string | null) => void;
  testId: string;
}) {
  const target = kind === 'phone' ? toMobile10(value) : isEmail(value) ? value.trim().toLowerCase() : null;
  const label = kind === 'phone' ? 'mobile number' : 'email';
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Typing a different number / email invalidates any code or verification for the old one.
  useEffect(() => {
    setRequestId(null);
    setCode('');
    setVerified(false);
    setError(null);
    setDemo(null);
    setResendIn(0);
    onVerified(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const errText = (e: unknown) => (e instanceof ApiClientError ? e.payload.message : 'Something went wrong. Please try again.');

  async function send() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ requestId: string; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: kind === 'phone' ? { phone: target, purpose } : { email: target, purpose },
      });
      setRequestId(res.requestId);
      setCode(res.devCode ?? '');
      setDemo(res.devCode ?? null);
      setResendIn(30);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ proof: string }>('/auth/otp/prove', { method: 'POST', body: { requestId, code } });
      setVerified(true);
      setRequestId(null);
      onVerified(res.proof);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <p className="vf vf--ok" data-testid={`${testId}-verified`}>
        ✓ {kind === 'phone' ? 'Mobile number' : 'Email'} verified
      </p>
    );
  }

  return (
    <div className="vf" data-testid={testId}>
      {!requestId ? (
        <button type="button" className="vf__send" onClick={send} disabled={busy || !target} data-testid={`${testId}-send`}>
          {busy ? 'Sending…' : `Send OTP to verify ${label}`}
        </button>
      ) : (
        <div className="vf__code">
          <input
            className="auth-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            aria-label={`OTP sent to your ${label}`}
            data-testid={`${testId}-code`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="button"
            className="vf__send vf__send--solid"
            onClick={verify}
            disabled={busy || code.length < 4}
            data-testid={`${testId}-verify`}
          >
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button type="button" className="auth-linkbtn" onClick={send} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
          </button>
        </div>
      )}
      {demo && (
        <p className="auth-hint">
          Demo mode: your OTP is <strong>{demo}</strong>.
        </p>
      )}
      {error && (
        <p role="alert" className="vf__error" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
