import fc from 'fast-check';
import {
  adjust,
  confirmSale,
  InsufficientStockError,
  release,
  reserve,
  total,
  type Stock,
} from './inventory.logic';

/**
 * Property-based tests for the inventory engine (BR-6..BR-9).
 * PBT-06 stateful: run random command sequences and assert invariants hold
 * after every step. PBT-03: non-negativity and conservation invariants.
 */
type Command =
  | { kind: 'reserve'; qty: number }
  | { kind: 'release'; qty: number }
  | { kind: 'confirm'; qty: number }
  | { kind: 'adjust'; delta: number };

const command = fc.oneof(
  fc.record({ kind: fc.constant('reserve' as const), qty: fc.integer({ min: 0, max: 50 }) }),
  fc.record({ kind: fc.constant('release' as const), qty: fc.integer({ min: 0, max: 50 }) }),
  fc.record({ kind: fc.constant('confirm' as const), qty: fc.integer({ min: 0, max: 50 }) }),
  fc.record({ kind: fc.constant('adjust' as const), delta: fc.integer({ min: -50, max: 50 }) }),
);

function apply(stock: Stock, cmd: Command): Stock {
  try {
    switch (cmd.kind) {
      case 'reserve':
        return reserve(stock, cmd.qty);
      case 'release':
        return release(stock, cmd.qty);
      case 'confirm':
        return confirmSale(stock, cmd.qty);
      case 'adjust':
        return adjust(stock, cmd.delta);
    }
  } catch (e) {
    if (e instanceof InsufficientStockError) return stock; // rejected → unchanged
    throw e;
  }
}

describe('inventory.logic — property-based', () => {
  it('PBT-06: available and reserved stay non-negative across any command sequence', () => {
    fc.assert(
      fc.property(
        fc.record({ available: fc.integer({ min: 0, max: 200 }), reserved: fc.constant(0) }),
        fc.array(command, { maxLength: 40 }),
        (initial, commands) => {
          let stock: Stock = initial;
          for (const cmd of commands) {
            stock = apply(stock, cmd);
            expect(stock.available).toBeGreaterThanOrEqual(0);
            expect(stock.reserved).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it('PBT-03: reserve then release returns to the original stock', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (available, qty) => {
          const start: Stock = { available, reserved: 0 };
          if (qty > available) {
            expect(() => reserve(start, qty)).toThrow(InsufficientStockError);
            return;
          }
          const reserved = reserve(start, qty);
          const released = release(reserved, qty);
          expect(released).toEqual(start);
        },
      ),
    );
  });

  it('PBT-03: reserve/release conserve total units (available + reserved)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (available, qty) => {
          const start: Stock = { available, reserved: 0 };
          const startTotal = total(start);
          if (qty <= available) {
            const afterReserve = reserve(start, qty);
            expect(total(afterReserve)).toBe(startTotal);
            expect(total(release(afterReserve, qty))).toBe(startTotal);
          }
        },
      ),
    );
  });

  it('confirmSale reduces reserved and never touches available', () => {
    const stock: Stock = { available: 10, reserved: 5 };
    expect(confirmSale(stock, 3)).toEqual({ available: 10, reserved: 2 });
    expect(confirmSale(stock, 99)).toEqual({ available: 10, reserved: 0 });
  });

  it('adjust never drives available below zero', () => {
    expect(adjust({ available: 5, reserved: 2 }, -100)).toEqual({ available: 0, reserved: 2 });
  });
});
