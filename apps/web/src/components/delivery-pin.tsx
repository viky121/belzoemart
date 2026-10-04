'use client';

import { useEffect, useRef, useState } from 'react';
import { usePincode } from '@/lib/use-pincode';

/** Header delivery-location widget: shows the current PIN + serviceability,
 *  and lets the shopper set/change it. Remembers the choice (localStorage). */
export function DeliveryPin() {
  const { pincode, serviceable, configured, setPincode } = usePincode();
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function submit() {
    const pin = entry.trim();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setErr('Enter a valid 6-digit PIN code.');
      return;
    }
    setPincode(pin);
    setErr(null);
    setEntry('');
    setOpen(false);
  }

  const notServiceable = configured && serviceable === false;

  return (
    <div className="delpin" ref={ref}>
      <button
        type="button"
        className={`delpin__btn${notServiceable ? ' delpin__btn--bad' : ''}`}
        onClick={() => setOpen((o) => !o)}
        data-testid="delivery-pin"
      >
        <span className="em-actions__ic">📍</span>
        <span className="delpin__text">
          <span className="delpin__hint">
            {notServiceable ? 'Not deliverable' : 'Deliver to'}
          </span>
          <span className="delpin__value">{pincode ?? 'Select PIN ▾'}</span>
        </span>
      </button>

      {open && (
        <div className="delpin__pop" data-testid="delivery-pin-pop">
          <p className="delpin__poptitle">Enter delivery PIN code</p>
          <div className="delpin__row">
            <input
              value={entry}
              inputMode="numeric"
              maxLength={6}
              placeholder={pincode ?? 'e.g. 472001'}
              onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              data-testid="delivery-pin-input"
              autoFocus
            />
            <button type="button" onClick={submit} data-testid="delivery-pin-check">
              Check
            </button>
          </div>
          {err && <p className="delpin__err">{err}</p>}
          {!err && pincode && serviceable === true && (
            <p className="delpin__ok">✓ We deliver to {pincode}.</p>
          )}
          {!err && notServiceable && (
            <p className="delpin__no">✗ This PIN code is not serviceable.</p>
          )}
        </div>
      )}
    </div>
  );
}
