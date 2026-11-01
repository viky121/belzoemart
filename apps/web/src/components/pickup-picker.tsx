'use client';

import { useState } from 'react';
import { pickupDayOfSlot, shopAddressLine, type FulfilmentMethod, type PickupInfo } from '@belzo/shared';

interface Props {
  info: PickupInfo;
  fulfilment: FulfilmentMethod;
  onFulfilment: (f: FulfilmentMethod) => void;
  /** Start (ISO) of the chosen slot, or '' for none. */
  slotStart: string;
  onSlot: (startIso: string) => void;
}

/** The day that holds the chosen slot, else the first day on offer. */
export function dayOfSlot(info: PickupInfo, slotStart: string): string {
  return pickupDayOfSlot(info.days, slotStart);
}

/**
 * Checkout: choose Home delivery or Self pickup. For pickup it shows the shop address, the shop's timings
 * note, and the days and time slots to choose from. Home delivery is the normal choice, so the picker shows
 * nothing extra until the customer picks Self pickup.
 */
export function PickupPicker({ info, fulfilment, onFulfilment, slotStart, onSlot }: Props) {
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const pickup = fulfilment === 'pickup';
  const activeDate = pickedDay && info.days.some((d) => d.date === pickedDay) ? pickedDay : dayOfSlot(info, slotStart);
  const day = info.days.find((d) => d.date === activeDate);
  const addressLine = shopAddressLine(info.shop);

  return (
    <div className="cox__card" data-testid="delivery-method">
      <h2>Delivery Method</h2>
      <div className="co-pay">
        <label className={`co-pay__opt${!pickup ? ' co-pay__opt--active' : ''}`}>
          <input type="radio" name="fulfilment" checked={!pickup} onChange={() => onFulfilment('delivery')} data-testid="method-delivery" />
          <span>
            🚚 Home delivery<em>We deliver to your address</em>
          </span>
        </label>
        <label className={`co-pay__opt${pickup ? ' co-pay__opt--active' : ''}`}>
          <input type="radio" name="fulfilment" checked={pickup} onChange={() => onFulfilment('pickup')} data-testid="method-pickup" />
          <span>
            🏬 Self pickup<em>Collect your order from our shop. No delivery charge.</em>
          </span>
        </label>
      </div>

      {pickup && (
        <div className="co-pickup" data-testid="pickup-details">
          <div className="co-pickup__shop" data-testid="pickup-shop">
            <strong>{info.shop.name}</strong>
            {addressLine && <span>{addressLine}</span>}
            {info.shop.phone && <span>📞 {info.shop.phone}</span>}
            {info.note && <span className="co-pickup__note">{info.note}</span>}
          </div>

          <p className="co-pickup__label" id="pickup-day-label">
            Choose pickup day
          </p>
          <div className="co-pickup__days" role="group" aria-labelledby="pickup-day-label">
            {info.days.map((d) => (
              <button
                key={d.date}
                type="button"
                className={`co-pickup__chip${d.date === activeDate ? ' is-on' : ''}`}
                aria-pressed={d.date === activeDate}
                onClick={() => {
                  setPickedDay(d.date);
                  // The slot belongs to the old day: ask again.
                  if (!d.slots.some((s) => s.start === slotStart)) onSlot('');
                }}
                data-testid={`pickup-day-${d.date}`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <p className="co-pickup__label" id="pickup-slot-label">
            Choose pickup time
          </p>
          <div className="co-pickup__slots" role="group" aria-labelledby="pickup-slot-label">
            {(day?.slots ?? []).map((s) => (
              <button
                key={s.start}
                type="button"
                className={`co-pickup__chip${s.start === slotStart ? ' is-on' : ''}`}
                aria-pressed={s.start === slotStart}
                onClick={() => onSlot(s.start)}
                data-testid={`pickup-slot-${s.start}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {!slotStart && (
            <p className="co-pickup__hint" data-testid="pickup-slot-hint">
              Please choose a pickup time to place the order.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
