import fc from 'fast-check';
import { ORDER_TRANSITIONS } from '../constants';
import { ORDER_PROGRESS_STEPS, progressRank, statusLabel } from '../order-tracking';
import { canSystemCancel } from '../orders';
import { DELIVERY_MOVES } from './status';
import { SYNC_TABLE, furthestOrderStatus, orderWalk, toOrderStatus, toTrackingStatus } from './sync-table';
import { arbOrderStatus } from './testing/arbitraries';

describe('delivery sync table (example tests)', () => {
  it('has a row for every move', () => {
    for (const m of DELIVERY_MOVES) expect(SYNC_TABLE[m]).toBeDefined();
  });

  it('gives every tracking status a customer label and keeps texts free of internal words', () => {
    for (const m of DELIVERY_MOVES) {
      const { status, text } = toTrackingStatus(m);
      expect(statusLabel(status)).not.toBe('Unknown');
      expect(text.length).toBeGreaterThan(3);
      expect(text.toLowerCase()).not.toMatch(/reason|note|otp|rejected|expired/);
    }
  });

  it('maps picked up, out for delivery and delivered to the matching order statuses', () => {
    expect(toOrderStatus('picked_up')).toBe('shipped');
    expect(toOrderStatus('out_for_delivery')).toBe('out_for_delivery');
    expect(toOrderStatus('retry')).toBe('out_for_delivery');
    expect(toOrderStatus('delivered')).toBe('delivered');
    expect(toOrderStatus('accepted')).toBeNull();
    expect(toOrderStatus('failed_attempt')).toBeNull();
    expect(toOrderStatus('cancelled')).toBeNull();
  });

  it('cancels the order for an undeliverable return (FD2 = A)', () => {
    expect(SYNC_TABLE.returned.orderEffect).toBe('cancel_undeliverable');
    expect(SYNC_TABLE.returned.shipmentStatus).toBe('rto');
  });

  it('walks a confirmed order to packed and a packed order through shipped to out for delivery', () => {
    expect(orderWalk('confirmed', 'packed')).toEqual(['packed']);
    expect(orderWalk('packed', 'out_for_delivery')).toEqual(['shipped', 'out_for_delivery']);
    expect(orderWalk('shipped', 'delivered')).toEqual(['out_for_delivery', 'delivered']);
  });

  it('never walks backwards, never confirms a pending order, never touches terminal orders', () => {
    expect(orderWalk('shipped', 'packed')).toEqual([]);
    expect(orderWalk('pending', 'packed')).toEqual([]);
    expect(orderWalk('cancelled', 'delivered')).toEqual([]);
    expect(orderWalk('returned', 'delivered')).toEqual([]);
    expect(orderWalk('delivered', 'shipped')).toEqual([]);
    expect(furthestOrderStatus('out_for_delivery', 'shipped')).toBe('out_for_delivery');
  });

  it('lets the system cancel a shipped or out-for-delivery order but not a delivered one', () => {
    expect(canSystemCancel('shipped')).toBe(true);
    expect(canSystemCancel('out_for_delivery')).toBe(true);
    expect(canSystemCancel('packed')).toBe(true);
    expect(canSystemCancel('delivered')).toBe(false);
    expect(canSystemCancel('cancelled')).toBe(false);
  });
});

describe('delivery sync table (property tests)', () => {
  it('P5: the order status after a move is never lower than before', () => {
    fc.assert(
      fc.property(arbOrderStatus, fc.constantFrom(...DELIVERY_MOVES), (current, move) => {
        const target = toOrderStatus(move);
        const after = target ? furthestOrderStatus(current, target) : current;
        const before = ORDER_PROGRESS_STEPS.indexOf(current);
        if (before >= 0) expect(ORDER_PROGRESS_STEPS.indexOf(after)).toBeGreaterThanOrEqual(before);
        else expect(after).toBe(current);
      }),
    );
  });

  it('P5: every step of a walk is a legal order transition and the ranks only go up', () => {
    fc.assert(
      fc.property(arbOrderStatus, arbOrderStatus, (current, target) => {
        const walk = orderWalk(current, target);
        let at = current;
        for (const next of walk) {
          expect(ORDER_TRANSITIONS[at]).toContain(next);
          expect(progressRank(next)).toBeGreaterThan(progressRank(at));
          at = next;
        }
        if (walk.length > 0) expect(at).toBe(target);
      }),
    );
  });
});
