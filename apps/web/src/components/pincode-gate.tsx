'use client';

import { useEffect, useState } from 'react';
import { usePincode } from '@/lib/use-pincode';

/**
 * Design shape (A): a blocking first-visit gate (full-screen overlay).
 *
 * Mounted ONCE in the shared shop layout (`app/(shop)/layout.tsx`) so it covers
 * the entire storefront — including both the `classic` home (`page.tsx`) and the
 * `emart` home (`emart-home.tsx`) — with no per-page duplication. This is why the
 * "surface PIN entry on the home page (both theme branches)" requirement needs no
 * edits to the home pages themselves.
 *
 * Single source of truth: it reuses `usePincode()` (no parallel serviceability
 * fetch or second localStorage key). The gate is "satisfied" and hidden only when
 * `ready && pincode && serviceable === true`. Anything else keeps the shopper
 * blocked. The hook fails open on a network error (serviceable=true, configured=
 * false), so a down endpoint never hard-blocks the site — but a valid 6-digit PIN
 * must still be entered and confirmed to satisfy the mandatory requirement.
 */
const PIN_RE = /^[1-9]\d{5}$/;

export function PincodeGate() {
  const { pincode, serviceable, configured, ready, setPincode } = usePincode();
  const [entry, setEntry] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const satisfied = ready && pincode != null && serviceable === true;

  // Lock background scroll while the overlay is visible.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const show = ready && !satisfied;
    document.body.classList.toggle('pingate-locked', show);
    return () => document.body.classList.remove('pingate-locked');
  }, [ready, satisfied]);

  // Avoid flashing the gate before localStorage is read, and hide once satisfied.
  if (!ready || satisfied) return null;

  function submit() {
    const pin = entry.trim();
    if (!PIN_RE.test(pin)) {
      setErr('Enter a valid 6-digit PIN code.');
      return;
    }
    setErr(null);
    setEntry('');
    setPincode(pin);
  }

  const checking = pincode != null && serviceable === null;
  const notServiceable = configured && serviceable === false;

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
            This PIN code is not serviceable.
          </p>
        )}
      </div>
    </div>
  );
}
