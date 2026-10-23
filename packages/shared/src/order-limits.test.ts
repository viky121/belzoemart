import { MAX_CART_QTY } from './schemas';
import { effectiveOrderLimits, hasOrderLimits, orderLimitsHint, orderLimitsMessage } from './order-limits';

describe('effectiveOrderLimits', () => {
  it('defaults to 1..MAX_CART_QTY when nothing is set', () => {
    expect(effectiveOrderLimits()).toEqual({ min: 1, max: MAX_CART_QTY });
    expect(effectiveOrderLimits({ minOrderQty: null, maxOrderQty: null })).toEqual({ min: 1, max: MAX_CART_QTY });
    expect(effectiveOrderLimits({})).toEqual({ min: 1, max: MAX_CART_QTY });
  });

  it('uses the admin values', () => {
    expect(effectiveOrderLimits({ minOrderQty: 5, maxOrderQty: 20 })).toEqual({ min: 5, max: 20 });
    expect(effectiveOrderLimits({ minOrderQty: 3 })).toEqual({ min: 3, max: MAX_CART_QTY });
    expect(effectiveOrderLimits({ maxOrderQty: 4 })).toEqual({ min: 1, max: 4 });
  });

  it('never returns an impossible range', () => {
    expect(effectiveOrderLimits({ minOrderQty: 0, maxOrderQty: 0 })).toEqual({ min: 1, max: 1 });
    expect(effectiveOrderLimits({ minOrderQty: 10, maxOrderQty: 3 })).toEqual({ min: 10, max: 10 });
    expect(effectiveOrderLimits({ minOrderQty: 500, maxOrderQty: 900 })).toEqual({ min: MAX_CART_QTY, max: MAX_CART_QTY });
  });

  it('ignores junk and fractions', () => {
    expect(effectiveOrderLimits({ minOrderQty: Number.NaN, maxOrderQty: 7.9 })).toEqual({ min: 1, max: 7 });
  });
});

describe('order limit text', () => {
  it('only shows a hint when there is a real limit', () => {
    expect(hasOrderLimits({ min: 1, max: MAX_CART_QTY })).toBe(false);
    expect(orderLimitsHint({ min: 1, max: MAX_CART_QTY })).toBe('');
    expect(orderLimitsHint({ min: 5, max: MAX_CART_QTY })).toBe('Min 5 per order');
    expect(orderLimitsHint({ min: 1, max: 20 })).toBe('Max 20 per order');
    expect(orderLimitsHint({ min: 5, max: 20 })).toBe('Min 5 · Max 20 per order');
  });

  it('explains which side of the range was broken', () => {
    expect(orderLimitsMessage('Rice', { min: 5, max: 20 }, 25)).toBe('You can buy at most 20 of "Rice" per order.');
    expect(orderLimitsMessage('Rice', { min: 5, max: 20 }, 2)).toBe('The minimum order quantity for "Rice" is 5.');
  });
});
