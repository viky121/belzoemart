'use client';

import { useState } from 'react';
import { usePincode } from '@/lib/use-pincode';

/** Product-page delivery box: shows whether we deliver to the shopper's PIN
 *  (auto-filled for logged-in customers) and lets them check another PIN. */
export function DeliveryCheck({ deliveryDate }: { deliveryDate: string }) {
  const { pincode, serviceable, configured, setPincode } = usePincode();
  const [entry, setEntry] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const pin = entry.trim();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setErr('Enter a valid 6-digit PIN code.');
      return;
    }
    setPincode(pin);
    setErr(null);
    setEntry('');
  }

  const notServiceable = configured && serviceable === false;

  return (
    <div className="delivery-card" data-testid="pdp-delivery">
      <h3 className="delivery-card__title">Delivery details</h3>

      <div className="delchk__row">
        <input
          value={entry}
          inputMode="numeric"
          maxLength={6}
          placeholder={pincode ? `Current: ${pincode}` : 'Enter delivery PIN code'}
          onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="pdp-delivery-input"
        />
        <button type="button" onClick={submit} data-testid="pdp-delivery-check">
          Check
        </button>
      </div>
      {err && <p className="delchk__err">{err}</p>}

      {!err && pincode && serviceable === true && (
        <>
          <div className="delivery-row">
            <span className="delivery-row__icon">✅</span>
            <span>
              Deliverable to <strong>{pincode}</strong>
            </span>
          </div>
          <div className="delivery-row">
            <span className="delivery-row__icon">🚚</span>
            <span>
              Delivery by <strong>{deliveryDate}</strong> · Free delivery
            </span>
          </div>
        </>
      )}

      {!err && notServiceable && (
        <div className="delivery-row delchk__bad">
          <span className="delivery-row__icon">🚫</span>
          <span>
            This PIN code is not serviceable. You won&apos;t be able to place this order to{' '}
            <strong>{pincode}</strong>.
          </span>
        </div>
      )}

      {!err && !pincode && (
        <p className="delchk__hint">Enter your PIN code to check delivery availability.</p>
      )}
    </div>
  );
}
