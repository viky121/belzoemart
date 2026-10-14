/**
 * Pure inventory math (BR-6..BR-9), separated from persistence so it can be
 * property-tested in isolation (PBT-06 stateful). All operations preserve the
 * invariants: available >= 0, reserved >= 0.
 */
export interface Stock {
  available: number;
  reserved: number;
}

export class InsufficientStockError extends Error {
  constructor() {
    super('Insufficient stock');
    this.name = 'InsufficientStockError';
  }
}

/** Reserve qty units: available -= qty, reserved += qty. Throws if insufficient. */
export function reserve(stock: Stock, qty: number): Stock {
  assertQty(qty);
  if (stock.available < qty) throw new InsufficientStockError();
  return { available: stock.available - qty, reserved: stock.reserved + qty };
}

/** Release qty reserved units back to available (bounded by reserved). */
export function release(stock: Stock, qty: number): Stock {
  assertQty(qty);
  const released = Math.min(qty, stock.reserved);
  return { available: stock.available + released, reserved: stock.reserved - released };
}

/** Confirm a sale: consume reserved units (bounded by reserved). */
export function confirmSale(stock: Stock, qty: number): Stock {
  assertQty(qty);
  const consumed = Math.min(qty, stock.reserved);
  return { available: stock.available, reserved: stock.reserved - consumed };
}

/** Admin adjustment of available by a signed delta; clamped so available >= 0. */
export function adjust(stock: Stock, delta: number): Stock {
  if (!Number.isInteger(delta)) throw new RangeError('delta must be an integer');
  return { available: Math.max(0, stock.available + delta), reserved: stock.reserved };
}

/** Total units accounted for (available + reserved) — conserved by reserve/release. */
export function total(stock: Stock): number {
  return stock.available + stock.reserved;
}

function assertQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`qty must be a non-negative integer, received: ${qty}`);
  }
}
