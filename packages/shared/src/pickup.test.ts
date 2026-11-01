import {
  PICKUP_DEFAULTS,
  buildPickupDays,
  cashLabel,
  findOfferedSlot,
  formatPickupSlot,
  normalizePickupConfig,
  parseHHMM,
  shopAddressLine,
  slotLabel,
} from './pickup';
import { canTransition, nextStates } from './orders';
import { buildStepper, orderStatusLabel, paymentSummary, statusBadge, type OrderDetail } from './order-view';
import { checkoutPreviewSchema, placeOrderSchema } from './schemas';

const CFG = { ...PICKUP_DEFAULTS };
// 2026-10-31 is a Saturday. 04:30 UTC = 10:00 India time.
const TEN_AM = new Date('2026-10-31T04:30:00.000Z');

describe('parseHHMM', () => {
  it('reads 24-hour times and refuses nonsense', () => {
    expect(parseHHMM('10:00')).toBe(600);
    expect(parseHHMM('9:05')).toBe(545);
    expect(parseHHMM('23:59')).toBe(1439);
    for (const bad of ['24:00', '10:60', '10', 'ten', '', null, undefined, 1000]) expect(parseHHMM(bad)).toBeNull();
  });
});

describe('normalizePickupConfig', () => {
  it('uses the defaults for an empty setting set', () => {
    expect(normalizePickupConfig({})).toEqual(PICKUP_DEFAULTS);
  });
  it('is on unless explicitly switched off', () => {
    expect(normalizePickupConfig({ enabled: false }).enabled).toBe(false);
    expect(normalizePickupConfig({ enabled: true }).enabled).toBe(true);
    expect(normalizePickupConfig({ enabled: undefined }).enabled).toBe(true);
  });
  it('reads valid hours, slot length and note', () => {
    expect(normalizePickupConfig({ openTime: '9:30', closeTime: '18:00', slotMinutes: 30, note: '  Ask at the counter ' })).toEqual({
      enabled: true,
      openTime: '09:30',
      closeTime: '18:00',
      slotMinutes: 30,
      note: 'Ask at the counter',
    });
  });
  it('falls back for a wrong slot length, wrong times, or hours too short for one slot', () => {
    expect(normalizePickupConfig({ slotMinutes: 5 }).slotMinutes).toBe(60);
    expect(normalizePickupConfig({ slotMinutes: 1000 }).slotMinutes).toBe(60);
    expect(normalizePickupConfig({ slotMinutes: 45.5 }).slotMinutes).toBe(60);
    // A wrong or missing time falls back on its own; the other one that is valid is kept.
    expect(normalizePickupConfig({ openTime: 'x', closeTime: '18:00' })).toMatchObject({ openTime: '10:00', closeTime: '18:00' });
    expect(normalizePickupConfig({ closeTime: '14:00' })).toMatchObject({ openTime: '10:00', closeTime: '14:00' });
    expect(normalizePickupConfig({ openTime: '08:00' })).toMatchObject({ openTime: '08:00', closeTime: '20:00' });
    expect(normalizePickupConfig({ openTime: '18:00', closeTime: '10:00' })).toMatchObject({ openTime: '10:00', closeTime: '20:00' });
    expect(normalizePickupConfig({ openTime: '10:00', closeTime: '10:30', slotMinutes: 60 })).toMatchObject({ openTime: '10:00', closeTime: '20:00' });
  });
  it('drops an empty note and cuts a very long one', () => {
    expect(normalizePickupConfig({ note: '   ' }).note).toBeNull();
    expect(normalizePickupConfig({ note: 'x'.repeat(500) }).note).toHaveLength(300);
  });
});

describe('buildPickupDays', () => {
  it('offers today (from 2 hours ahead), tomorrow and the day after', () => {
    const days = buildPickupDays(CFG, TEN_AM);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Mon, 2 Nov']);
    expect(days.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    // At 10:00 the first slot is 12:00 (start >= now + 2 h), the last ends at 20:00.
    expect(days[0]!.slots.map((s) => s.label)).toEqual([
      '12:00 PM - 1:00 PM',
      '1:00 PM - 2:00 PM',
      '2:00 PM - 3:00 PM',
      '3:00 PM - 4:00 PM',
      '4:00 PM - 5:00 PM',
      '5:00 PM - 6:00 PM',
      '6:00 PM - 7:00 PM',
      '7:00 PM - 8:00 PM',
    ]);
    expect(days[0]!.slots[0]!.start).toBe('2026-10-31T06:30:00.000Z');
    expect(days[0]!.slots[0]!.end).toBe('2026-10-31T07:30:00.000Z');
    // Tomorrow has the whole day: 10 slots from 10:00 AM.
    expect(days[1]!.slots).toHaveLength(10);
    expect(days[1]!.slots[0]!.label).toBe('10:00 AM - 11:00 AM');
    expect(days[1]!.slots[0]!.start).toBe('2026-11-01T04:30:00.000Z');
  });
  it('keeps a slot that starts exactly 2 hours from now and drops one a minute earlier', () => {
    const exact = buildPickupDays(CFG, new Date('2026-10-31T04:30:00.000Z'));
    expect(exact[0]!.slots[0]!.label).toBe('12:00 PM - 1:00 PM');
    const oneMinuteLater = buildPickupDays(CFG, new Date('2026-10-31T04:31:00.000Z'));
    expect(oneMinuteLater[0]!.slots[0]!.label).toBe('1:00 PM - 2:00 PM');
  });
  it('leaves today out when no slot is left', () => {
    // 19:30 India time
    const days = buildPickupDays(CFG, new Date('2026-10-31T14:00:00.000Z'));
    expect(days.map((d) => d.label)).toEqual(['Tomorrow', 'Mon, 2 Nov']);
  });
  it('uses the India date even when UTC is still the day before', () => {
    // 2026-10-31 19:00 UTC = 2026-11-01 00:30 India time
    const days = buildPickupDays(CFG, new Date('2026-10-31T19:00:00.000Z'));
    expect(days[0]!.date).toBe('2026-11-01');
    expect(days[0]!.label).toBe('Today');
    expect(days[0]!.slots[0]!.label).toBe('10:00 AM - 11:00 AM');
  });
  it('uses the shop hours and slot length, and the last slot must end by closing time', () => {
    const days = buildPickupDays(normalizePickupConfig({ openTime: '09:00', closeTime: '11:30', slotMinutes: 45 }), new Date('2026-10-30T18:00:00.000Z'));
    // 2026-10-30 18:00 UTC = 31 Oct 23:30 India; today has nothing, tomorrow (1 Nov) is 9:00, 9:45, 10:30 (ends 11:15), not 11:15 (ends 12:00).
    expect(days[0]!.slots.map((s) => s.label)).toEqual(['9:00 AM - 9:45 AM', '9:45 AM - 10:30 AM', '10:30 AM - 11:15 AM']);
  });
  it('offers nothing when pickup is switched off', () => {
    expect(buildPickupDays({ ...CFG, enabled: false }, TEN_AM)).toEqual([]);
  });
  it('shows 12 AM / 12 PM correctly', () => {
    expect(slotLabel(0, 60)).toBe('12:00 AM - 1:00 AM');
    expect(slotLabel(720, 780)).toBe('12:00 PM - 1:00 PM');
  });
});

describe('findOfferedSlot', () => {
  const days = buildPickupDays(CFG, TEN_AM);
  it('finds an offered start however it is written', () => {
    expect(findOfferedSlot(days, '2026-11-01T04:30:00.000Z')?.label).toBe('10:00 AM - 11:00 AM');
    expect(findOfferedSlot(days, '2026-11-01T10:00:00+05:30')?.label).toBe('10:00 AM - 11:00 AM');
  });
  it('refuses a time that is not a slot start, is too soon, is too far, or is not a date', () => {
    expect(findOfferedSlot(days, '2026-11-01T04:45:00.000Z')).toBeNull(); // 10:15
    expect(findOfferedSlot(days, '2026-10-31T05:30:00.000Z')).toBeNull(); // 11:00 today, less than 2 h
    expect(findOfferedSlot(days, '2026-11-03T04:30:00.000Z')).toBeNull(); // 4 days away
    expect(findOfferedSlot(days, 'tomorrow')).toBeNull();
  });
});

describe('formatPickupSlot / shop address / cash wording', () => {
  it('writes a stored slot in India time', () => {
    expect(formatPickupSlot('2026-11-01T04:30:00.000Z', '2026-11-01T05:30:00.000Z')).toBe('Sun, 1 Nov, 10:00 AM - 11:00 AM');
    expect(formatPickupSlot(new Date('2026-10-31T06:30:00.000Z'), new Date('2026-10-31T07:30:00.000Z'))).toBe('Sat, 31 Oct, 12:00 PM - 1:00 PM');
    expect(formatPickupSlot(null, null)).toBeNull();
    expect(formatPickupSlot('bad', 'bad')).toBeNull();
  });
  it('joins the shop address', () => {
    expect(shopAddressLine({ name: 'Belzo', address: 'Brahman colony', city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', phone: null })).toBe(
      'Brahman colony, Tikamgarh, Madhya Pradesh - 472001',
    );
    expect(shopAddressLine({ name: 'Belzo', address: null, city: null, state: null, pincode: '472001', phone: null })).toBe('472001');
    expect(shopAddressLine({ name: 'Belzo', address: null, city: null, state: null, pincode: null, phone: null })).toBe('');
  });
  it('calls the cash choice "Pay at shop on pickup" only for pickup', () => {
    expect(cashLabel('pickup')).toBe('Pay at shop on pickup');
    expect(cashLabel('delivery')).toBe('Cash on Delivery');
    expect(cashLabel(undefined)).toBe('Cash on Delivery');
  });
});

describe('pickup order status steps', () => {
  it('goes confirmed, packed, delivered; never shipped', () => {
    expect(canTransition('confirmed', 'packed', 'pickup')).toBe(true);
    expect(canTransition('packed', 'delivered', 'pickup')).toBe(true);
    expect(canTransition('packed', 'shipped', 'pickup')).toBe(false);
    expect(canTransition('packed', 'cancelled', 'pickup')).toBe(true);
    expect(nextStates('packed', 'pickup')).toEqual(['delivered', 'cancelled']);
  });
  it('home delivery is unchanged', () => {
    expect(canTransition('packed', 'delivered')).toBe(false);
    expect(canTransition('packed', 'delivered', 'delivery')).toBe(false);
    expect(nextStates('packed')).toEqual(['shipped', 'cancelled']);
  });
});

function orderOf(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'o1',
    status: 'confirmed',
    createdAt: '2026-10-31T04:30:00.000Z',
    updatedAt: '2026-10-31T04:30:00.000Z',
    couponCode: null,
    cancelledReason: null,
    invoiceUrl: null,
    invoice: null,
    address: null,
    items: [],
    payments: [{ provider: 'cod', status: 'pending', method: null, amount: 10000, createdAt: '2026-10-31T04:30:00.000Z' }],
    returns: [],
    tracking: { orderStatus: 'confirmed', latestStatus: 'confirmed', latestLabel: 'Confirmed', shipments: [] },
    subtotal: 10000,
    discount: 0,
    shipping: 0,
    codFee: 0,
    tax: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    grandTotal: 10000,
    ...over,
  } as OrderDetail;
}

describe('customer order view for a pickup order', () => {
  it('has four steps with pickup wording', () => {
    const steps = buildStepper(orderOf({ fulfilment: 'pickup', status: 'packed' }));
    expect(steps.map((s) => s.label)).toEqual(['Order placed', 'Confirmed', 'Ready for pickup', 'Picked up']);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming']);
  });
  it('a delivery order still has six steps', () => {
    const steps = buildStepper(orderOf({ status: 'packed' }));
    expect(steps.map((s) => s.label)).toEqual(['Order placed', 'Confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered']);
  });
  it('labels and badge', () => {
    expect(orderStatusLabel('packed', 'pickup')).toBe('Ready for pickup');
    expect(orderStatusLabel('delivered', 'pickup')).toBe('Picked up');
    expect(orderStatusLabel('confirmed', 'pickup')).toBe('Confirmed');
    expect(orderStatusLabel('packed')).toBe('Packed');
    expect(statusBadge('packed', 'pickup')).toEqual({ label: 'Ready for pickup', tone: 'info' });
    expect(statusBadge('delivered', 'pickup').tone).toBe('ok');
    expect(statusBadge('delivered').label).toBe('Delivered');
  });
  it('says pay at shop for the cash choice', () => {
    expect(paymentSummary(orderOf({ fulfilment: 'pickup' }))).toMatchObject({ methodLabel: 'Pay at shop on pickup', statusLabel: 'Pay at shop', isCod: true });
    expect(paymentSummary(orderOf({ fulfilment: 'pickup', status: 'delivered' })).statusLabel).toBe('Paid at shop');
    expect(paymentSummary(orderOf())).toMatchObject({ methodLabel: 'Cash on Delivery', statusLabel: 'Pay on delivery' });
  });
});

describe('checkout request schemas', () => {
  const addressId = '3f2a1c9e-4d5b-4c1a-9e33-7b5a1f0c2d11';
  it('accept the old shape (no fulfilment) and the pickup shape', () => {
    expect(placeOrderSchema.safeParse({ addressId, paymentMethod: 'cod' }).success).toBe(true);
    expect(
      placeOrderSchema.safeParse({ addressId, paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: '2026-11-01T04:30:00.000Z' }).success,
    ).toBe(true);
    expect(checkoutPreviewSchema.safeParse({ addressId, fulfilment: 'pickup' }).success).toBe(true);
  });
  it('refuse an unknown method or a slot that is not a date', () => {
    expect(placeOrderSchema.safeParse({ addressId, paymentMethod: 'cod', fulfilment: 'drone' }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ addressId, paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: 'tomorrow' }).success).toBe(false);
  });
});
