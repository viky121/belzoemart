import { renderToStaticMarkup } from 'react-dom/server';
import { PICKUP_DEFAULTS, buildPickupDays, type PickupInfo } from '@belzo/shared';
import { PickupPicker, dayOfSlot } from './pickup-picker';

const NOW = new Date('2026-10-31T04:30:00.000Z'); // Saturday 10:00 India time
const INFO: PickupInfo = {
  enabled: true,
  note: 'Open every day, ask at the counter',
  shop: { name: 'Belzo eMart', address: 'Brahman colony, Kunvar Pura Road', city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', phone: '8839095625' },
  days: buildPickupDays(PICKUP_DEFAULTS, NOW),
};
const noop = () => undefined;

describe('PickupPicker', () => {
  it('home delivery is the normal choice: both choices shown, nothing about the shop or slots yet', () => {
    const html = renderToStaticMarkup(<PickupPicker info={INFO} fulfilment="delivery" onFulfilment={noop} slotStart="" onSlot={noop} />);
    expect(html).toContain('data-testid="method-delivery"');
    expect(html).toContain('data-testid="method-pickup"');
    expect(html).toMatch(/data-testid="method-delivery"[^>]*checked|checked=""[^>]*data-testid="method-delivery"/);
    expect(html).not.toContain('data-testid="pickup-details"');
    expect(html).not.toContain('Brahman colony');
  });

  it('self pickup shows the shop address, phone, the note, the three days and the slots of the first day', () => {
    const html = renderToStaticMarkup(<PickupPicker info={INFO} fulfilment="pickup" onFulfilment={noop} slotStart="" onSlot={noop} />);
    expect(html).toContain('Belzo eMart');
    expect(html).toContain('Brahman colony, Kunvar Pura Road, Tikamgarh, Madhya Pradesh - 472001');
    expect(html).toContain('8839095625');
    expect(html).toContain('Open every day, ask at the counter');
    for (const label of ['Today', 'Tomorrow', 'Mon, 2 Nov']) expect(html).toContain(`>${label}<`);
    // Today's first slot at 10:00 India time is 12:00 PM.
    expect(html).toContain('12:00 PM - 1:00 PM');
    expect(html).not.toContain('10:00 AM - 11:00 AM');
  });

  it('asks for a slot until one is chosen, and marks the chosen one', () => {
    const none = renderToStaticMarkup(<PickupPicker info={INFO} fulfilment="pickup" onFulfilment={noop} slotStart="" onSlot={noop} />);
    expect(none).toContain('data-testid="pickup-slot-hint"');
    const slot = INFO.days[1]!.slots[0]!;
    const chosen = renderToStaticMarkup(<PickupPicker info={INFO} fulfilment="pickup" onFulfilment={noop} slotStart={slot.start} onSlot={noop} />);
    expect(chosen).not.toContain('data-testid="pickup-slot-hint"');
    // The chosen slot belongs to tomorrow, so tomorrow's slots are shown and its slot is pressed.
    expect(chosen).toContain('10:00 AM - 11:00 AM');
    expect(chosen).toMatch(new RegExp(`aria-pressed="true"[^>]*data-testid="pickup-slot-${slot.start}"`));
  });

  it('shows the shop without a note or phone when the shop has none', () => {
    const bare: PickupInfo = { ...INFO, note: null, shop: { ...INFO.shop, phone: null } };
    const html = renderToStaticMarkup(<PickupPicker info={bare} fulfilment="pickup" onFulfilment={noop} slotStart="" onSlot={noop} />);
    expect(html).not.toContain('co-pickup__note');
    expect(html).not.toContain('📞');
  });
});

describe('dayOfSlot', () => {
  it('finds the day that holds a slot, else the first day', () => {
    expect(dayOfSlot(INFO, INFO.days[2]!.slots[0]!.start)).toBe('2026-11-02');
    expect(dayOfSlot(INFO, '')).toBe('2026-10-31');
    expect(dayOfSlot(INFO, '2020-01-01T00:00:00.000Z')).toBe('2026-10-31');
    expect(dayOfSlot({ ...INFO, days: [] }, '')).toBe('');
  });
});
