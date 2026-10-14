import fc from 'fast-check';
import {
  canCustomerCancel,
  canTransition,
  clampRefund,
  formatInvoiceNumber,
  nextStates,
} from './orders';
import { ORDER_STATUSES, ORDER_TRANSITIONS, type OrderStatus } from './constants';

const status = fc.constantFrom(...ORDER_STATUSES);

describe('order state machine — property-based', () => {
  it('PBT-03: canTransition(from,to) matches ORDER_TRANSITIONS exactly', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        expect(canTransition(from, to)).toBe(ORDER_TRANSITIONS[from].includes(to));
      }),
    );
  });

  it('PBT-06: any sequence of valid transitions stays within defined states', () => {
    const defined = new Set<string>(ORDER_STATUSES);
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 20 }), (choices) => {
        let current: OrderStatus = 'pending';
        for (const choice of choices) {
          const options = nextStates(current);
          if (options.length === 0) break;
          const next = options[choice % options.length]!;
          expect(canTransition(current, next)).toBe(true);
          current = next;
          expect(defined.has(current)).toBe(true);
        }
      }),
    );
  });

  it('terminal states have no outgoing transitions', () => {
    expect(nextStates('cancelled')).toEqual([]);
    expect(nextStates('returned')).toEqual([]);
  });
});

describe('cancel predicate & helpers', () => {
  it('customer can cancel any time before the order has shipped (pending/confirmed/packed)', () => {
    for (const s of ORDER_STATUSES) {
      expect(canCustomerCancel(s)).toBe(s === 'pending' || s === 'confirmed' || s === 'packed');
    }
  });

  it('cancel is allowed by the state machine from every customer-cancellable state', () => {
    for (const s of ORDER_STATUSES) {
      if (canCustomerCancel(s)) expect(canTransition(s, 'cancelled')).toBe(true);
    }
  });

  it('PBT-03: formatInvoiceNumber matches BELZO/YYYY/NNNNN', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2020, max: 2100 }), fc.integer({ min: 1, max: 99999 }), (yr, seq) => {
        expect(formatInvoiceNumber(yr, seq)).toMatch(/^BELZO\/\d{4}\/\d{5}$/);
      }),
    );
  });

  it('PBT-03: clampRefund never exceeds captured and never negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1_000_000 }), fc.integer({ min: 0, max: 500_000 }), (req, cap) => {
        const r = clampRefund(req, cap);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(cap);
      }),
    );
  });
});
