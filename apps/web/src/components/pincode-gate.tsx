'use client';

import { useEffect, useState } from 'react';
import { usePincode } from '@/lib/use-pincode';
import { safeSession } from '@/lib/safe-storage';

/**
 * Design shape (A): a blocking first-visit gate (full-screen popup).
 *
 * Mounted ONCE in the shared shop layout (`app/(shop)/layout.tsx`) so it covers
 * the entire storefront — including both the `classic` home (`page.tsx`) and the
 * `emart` home (`emart-home.tsx`) — with no per-page duplication.
 *
 * Visibility is gated PER BROWSER SESSION (sessionStorage), not once-ever: the
 * popup opens every time the shopper opens the website fresh, and only closes
 * after they enter a PIN that is confirmed serviceable in this session. The PIN
 * itself is still remembered in localStorage (via `usePincode`) so the field is
 * pre-filled and the header/product-page widgets stay in sync.
 *
 * Single source of truth: it reuses `usePincode()` for the serviceability check
 * (no parallel fetch). The hook fails open on a network error (serviceable=true,
 * configured=false), so a down endpoint never hard-blocks the site — but a valid
 * 6-digit PIN must still be entered and confirmed to pass the gate.
 */
const PIN_RE = /^[1-9]\d{5}$/;
const ACK_KEY = 'belzo:pincode-ack';

export function PincodeGate() {
  const { pincode, serviceable, configured, setPincode } = usePincode();
  const [entry, setEntry] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // null = session ack not read yet (avoid flashing the gate before we know).
  const [acked, setAcked] = useState<boolean | null>(null);

  // Read the per-session acknowledgement once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAcked(safeSession.get(ACK_KEY) === '1');
  }, []);

  // Pre-fill with the remembered PIN (from localStorage via the hook) when known.
  useEffect(() => {
    if (pincode) setEntry((e) => e || pincode);
  }, [pincode]);

  // Once the shopper confirms a serviceable PIN in this session, remember the
  // ack so the popup doesn't re-appear on in-session navigation.
  useEffect(() => {
    if (acked !== false || !submitted) return;
    if (pincode && serviceable === true) {
      safeSession.set(ACK_KEY, '1');
      setAcked(true);
    }
  }, [acked, submitted, pincode, serviceable]);

  const visible = acked === false;

  // Lock background scroll while the popup is visible.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('pingate-locked', visible);
    return () => document.body.classList.remove('pingate-locked');
  }, [visible]);

  if (!visible) return null;

  function submit() {
    const pin = entry.trim();
    if (!PIN_RE.test(pin)) {
      setErr('Enter a valid 6-digit PIN code.');
      return;
    }
    setErr(null);
    setSubmitted(true);
    setPincode(pin);
  }

  const checking = submitted && pincode != null && serviceable === null;
  const notServiceable = submitted && configured && serviceable === false;

  return (
    <div className="pingate" role="dialog" aria-modal="true" data-testid="pincode-gate">
      <div className="pingate__card">
        <h2 className="pingate__title">Enter your delivery PIN code</h2>
        <p className="pingate__sub">
          We check delivery availability before you shop. Please enter a 6-digit PIN code to
          continue.
        </p>
        <div className="pingate__row">
          <input
            value={entry}
            inputMode="numeric"
            maxLength={6}
            placeholder="e.g. 472001"
            onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            data-testid="pincode-gate-input"
            autoFocus
          />
          <button type="button" onClick={submit} data-testid="pincode-gate-check">
            Check
          </button>
        </div>
        {err && (
          <p className="pingate__err" data-testid="pincode-gate-error">
            {err}
          </p>
        )}
        {!err && checking && (
          <p className="pingate__checking" data-testid="pincode-gate-checking">
            Checking availability…
          </p>
        )}
        {!err && !checking && notServiceable && (
          <p className="pingate__no" data-testid="pincode-gate-unserviceable">
            Sorry, delivery is not serviceable on the selected PIN code{pincode ? ` ${pincode}` : ''}.
            Please try a different PIN code.
          </p>
        )}
      </div>
    </div>
  );
}
