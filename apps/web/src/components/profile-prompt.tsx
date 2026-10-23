'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { safeSession } from '@/lib/safe-storage';

/**
 * Post-login profile completion.
 *
 * Customers who sign in by mobile OTP have no email (and a placeholder name);
 * those who sign in by email have no phone. Right after login this prompt asks
 * for the missing pieces — always the name when it's still the default, plus
 * the complementary contact (email for phone-logins, phone for email-logins).
 *
 * It's non-blocking: "Later" dismisses it for the session. It also opens on a
 * `belzo:edit-profile` event so the account page's Edit control can reuse it.
 * Saving PATCHes /me and refreshes the in-memory session so the header updates.
 */
const DISMISS_KEY = 'belzo:profile-prompt-dismissed';
const DEFAULT_NAME = 'Belzo Customer';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/;

interface MeResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
}

export function ProfilePrompt() {
  const { customer, accessToken, authFetch, setSession, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // true when opened from the account page's Edit button (show every field)
  const [editAll, setEditAll] = useState(false);

  const needsName = !!customer && (!customer.name || customer.name.trim() === DEFAULT_NAME);
  const needsEmail = !!customer && !customer.email;
  const needsPhone = !!customer && !customer.phone;
  const incomplete = needsName || needsEmail || needsPhone;

  // Auto-open once per session after login when the profile is incomplete.
  useEffect(() => {
    if (!ready || !customer || !incomplete || typeof window === 'undefined') return;
    if (safeSession.get(DISMISS_KEY) === '1') return;
    setEditAll(false);
    setName(needsName ? '' : customer.name);
    setEmail(customer.email ?? '');
    setPhone(customer.phone ?? '');
    setErr(null);
    setOpen(true);
  }, [ready, customer, incomplete, needsName]);

  // Let the account page open the same prompt on demand — showing ALL fields.
  useEffect(() => {
    const onEdit = () => {
      if (!customer) return;
      setEditAll(true);
      setName(customer.name === DEFAULT_NAME ? '' : customer.name);
      setEmail(customer.email ?? '');
      setPhone(customer.phone ?? '');
      setErr(null);
      setOpen(true);
    };
    window.addEventListener('belzo:edit-profile', onEdit);
    return () => window.removeEventListener('belzo:edit-profile', onEdit);
  }, [customer]);

  const dismiss = useCallback(() => {
    safeSession.set(DISMISS_KEY, '1');
    setOpen(false);
  }, []);

  if (!open || !customer) return null;

  async function save() {
    if (!customer) return;
    setErr(null);
    const patch: { name?: string; email?: string; phone?: string } = {};

    const n = name.trim();
    if (needsName || (n && n !== customer.name)) {
      if (!n) {
        setErr('Please enter your name.');
        return;
      }
      patch.name = n;
    }
    const e = email.trim();
    if (needsEmail || (editAll && e && e.toLowerCase() !== (customer.email ?? '').toLowerCase())) {
      if (!EMAIL_RE.test(e)) {
        setErr('Enter a valid email address.');
        return;
      }
      patch.email = e;
    }
    const p = phone.replace(/\D/g, '').slice(-10);
    if (needsPhone || (editAll && p && p !== (customer.phone ?? ''))) {
      if (!PHONE_RE.test(p)) {
        setErr('Enter a valid 10-digit mobile number.');
        return;
      }
      patch.phone = p;
    }

    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      const updated = await authFetch<MeResponse>('/me', { method: 'PATCH', body: patch });
      if (accessToken) {
        setSession(accessToken, {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          locale: updated.locale,
        });
      }
      safeSession.set(DISMISS_KEY, '1');
      if (typeof window !== 'undefined') {
        // Let pages that show profile data (e.g. My Account) refresh in place.
        window.dispatchEvent(new CustomEvent('belzo:profile-updated', { detail: updated }));
      }
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profprompt" role="dialog" aria-modal="true" data-testid="profile-prompt">
      <div className="profprompt__card">
        <h2 className="profprompt__title">{editAll ? 'Edit your details' : 'Complete your profile'}</h2>
        <p className="profprompt__sub">
          Add a few details so we can personalise your orders and keep you updated.
        </p>

        {(editAll || needsName) && (
          <div className="profprompt__field">
            <label className="auth-label" htmlFor="pp-name">
              Your name
            </label>
            <input
              id="pp-name"
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              data-testid="profile-prompt-name"
              autoFocus
            />
          </div>
        )}
        {(editAll || needsEmail) && (
          <div className="profprompt__field">
            <label className="auth-label" htmlFor="pp-email">
              Email address
            </label>
            <input
              id="pp-email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              data-testid="profile-prompt-email"
            />
          </div>
        )}
        {(editAll || needsPhone) && (
          <div className="profprompt__field">
            <label className="auth-label" htmlFor="pp-phone">
              Mobile number
            </label>
            <input
              id="pp-phone"
              className="auth-input"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              data-testid="profile-prompt-phone"
            />
          </div>
        )}

        {err && (
          <p className="profprompt__err" data-testid="profile-prompt-error">
            {err}
          </p>
        )}

        <div className="profprompt__actions">
          <button type="button" className="profprompt__later" onClick={dismiss} disabled={busy}>
            Later
          </button>
          <button
            type="button"
            className="profprompt__save"
            onClick={save}
            disabled={busy}
            data-testid="profile-prompt-save"
          >
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>
    </div>
  );
}
