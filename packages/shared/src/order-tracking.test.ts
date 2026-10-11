import {
  furthestStatus,
  normalizeStatus,
  progressRank,
  reconcileTracking,
  statusLabel,
} from './order-tracking';

describe('status labels', () => {
  it('labels known order and tracking statuses', () => {
    expect(statusLabel('out_for_delivery')).toBe('Out for delivery');
    expect(statusLabel('pending')).toBe('Order placed');
    expect(statusLabel('in_transit')).toBe('In transit');
    expect(statusLabel('Out-For Delivery')).toBe('Out for delivery');
  });

  it('humanizes unknown statuses', () => {
    expect(statusLabel('in_transit_hub')).toBe('In transit hub');
    expect(statusLabel('')).toBe('Unknown');
    expect(statusLabel(undefined)).toBe('Unknown');
  });

  it('normalizes and ranks statuses', () => {
    expect(normalizeStatus(' Out For-Delivery ')).toBe('out_for_delivery');
    expect(progressRank('in_transit')).toBe(progressRank('shipped'));
    expect(progressRank('created')).toBe(progressRank('packed'));
    expect(progressRank('cancelled')).toBe(-1);
    expect(progressRank('mystery')).toBe(-1);
  });
});

describe('furthestStatus', () => {
  it('takes the furthest of order and tracking statuses', () => {
    expect(furthestStatus('delivered', ['out_for_delivery'])).toBe('delivered');
    expect(furthestStatus('packed', ['out_for_delivery'])).toBe('out_for_delivery');
    expect(furthestStatus('confirmed', ['in_transit'])).toBe('shipped');
  });

  it('a terminal order status always wins', () => {
    expect(furthestStatus('cancelled', ['delivered'])).toBe('cancelled');
    expect(furthestStatus('returned', ['out_for_delivery'])).toBe('returned');
  });
});

describe('reconcileTracking', () => {
  const events = [
    { status: 'packed', description: 'Shipment packed', occurredAt: '2025-01-01T10:00:00.000Z' },
    { status: 'shipped', description: 'Handed to courier', location: 'Bengaluru', occurredAt: '2025-01-01T11:00:00.000Z' },
    { status: 'out_for_delivery', description: 'Out for delivery', occurredAt: '2025-01-01T12:00:00.000Z' },
  ];

  it('a delivered order with a stale packed shipment reads as delivered', () => {
    const res = reconcileTracking({
      order: { status: 'delivered', updatedAt: '2025-01-02T09:00:00.000Z' },
      shipments: [{ id: 's1', status: 'packed', createdAt: '2025-01-01T09:00:00.000Z', events }],
    });
    expect(res.latestStatus).toBe('delivered');
    expect(res.latestLabel).toBe('Delivered');
    const s = res.shipments[0]!;
    expect(s.status).toBe('delivered');
    expect(s.providerStatus).toBe('packed');
    expect(s.events[0]).toMatchObject({
      status: 'delivered',
      derived: true,
      occurredAt: '2025-01-02T09:00:00.000Z',
    });
    // Real events follow, newest first.
    expect(s.events.slice(1).map((e) => e.status)).toEqual(['out_for_delivery', 'shipped', 'packed']);
    expect(s.events[2]).toMatchObject({ location: 'Bengaluru', derived: false });
  });

  it('collapses duplicate events from repeated syncs', () => {
    const res = reconcileTracking({
      order: { status: 'out_for_delivery' },
      shipments: [{ id: 's1', status: 'packed', events: [...events, ...events] }],
    });
    expect(res.shipments[0]!.events).toHaveLength(3);
    expect(res.shipments[0]!.events.every((e) => !e.derived)).toBe(true);
  });

  it('adds no derived events for a cancelled order', () => {
    const res = reconcileTracking({
      order: { status: 'cancelled' },
      shipments: [{ id: 's1', status: 'packed', events: [events[0]!] }],
    });
    expect(res.latestStatus).toBe('cancelled');
    expect(res.shipments[0]!.events.some((e) => e.derived)).toBe(false);
  });

  it('an order without shipments reports the order status', () => {
    const res = reconcileTracking({ order: { status: 'confirmed' }, shipments: [] });
    expect(res.latestStatus).toBe('confirmed');
    expect(res.shipments).toEqual([]);
  });

  it('a returned order derives up to delivered without dates', () => {
    const res = reconcileTracking({
      order: { status: 'returned', updatedAt: '2025-01-05T00:00:00.000Z' },
      shipments: [{ id: 's1', status: 'packed', events: [] }],
    });
    expect(res.latestStatus).toBe('returned');
    const evs = res.shipments[0]!.events;
    expect(evs.map((e) => e.status)).toEqual(['delivered', 'out_for_delivery', 'shipped']);
    expect(evs.every((e) => e.derived && e.occurredAt === null)).toBe(true);
  });

  it('derives packed from the shipment creation time and never throws on missing dates', () => {
    const res = reconcileTracking({
      order: { status: 'shipped' },
      shipments: [{ id: 's1', status: 'created', createdAt: new Date('2025-01-01T09:00:00.000Z'), events: [{ status: 'x', occurredAt: 'not-a-date' }] }],
    });
    const evs = res.shipments[0]!.events;
    expect(evs.map((e) => e.status)).toEqual(['shipped', 'x']);
    expect(evs[0]).toMatchObject({ derived: true, occurredAt: null });
    expect(evs[1]).toMatchObject({ derived: false, occurredAt: null, label: 'X' });
    expect(res.shipments[0]!.status).toBe('shipped');
  });
});
