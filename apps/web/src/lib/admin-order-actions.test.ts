import { pendingAction } from './admin-order-actions';

describe('pendingAction', () => {
  it('lets the admin confirm a pending Cash on Delivery order', () => {
    expect(pendingAction('pending', [{ provider: 'cod' }])).toBe('confirm_cod');
  });
  it('says an unpaid online order is waiting for its payment', () => {
    expect(pendingAction('pending', [{ provider: 'razorpay' }])).toBe('waiting_payment');
    expect(pendingAction('pending', [{ provider: 'mock' }])).toBe('waiting_payment');
    expect(pendingAction('pending', [])).toBe('waiting_payment');
  });
  it('offers nothing once the order is past pending', () => {
    for (const s of ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) {
      expect(pendingAction(s, [{ provider: 'cod' }])).toBeNull();
    }
  });
});
