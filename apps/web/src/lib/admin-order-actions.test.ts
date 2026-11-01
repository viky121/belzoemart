import { canCreateShipment, nextStep, pendingAction, pickupHint } from './admin-order-actions';

describe('admin buttons for a self pickup order', () => {
  it('Ready for pickup, then Picked up, and nothing after', () => {
    expect(nextStep('confirmed', 'pickup')).toEqual({ next: 'packed', label: 'Ready for pickup' });
    expect(nextStep('packed', 'pickup')).toEqual({ next: 'delivered', label: 'Picked up' });
    for (const s of ['pending', 'shipped', 'delivered', 'cancelled']) expect(nextStep(s, 'pickup')).toBeNull();
  });
  it('home delivery keeps its steps and labels', () => {
    expect(nextStep('confirmed')).toEqual({ next: 'packed', label: '→ packed' });
    expect(nextStep('packed', 'delivery')).toEqual({ next: 'shipped', label: '→ shipped' });
    expect(nextStep('shipped')).toEqual({ next: 'out_for_delivery', label: '→ out for delivery' });
    expect(nextStep('delivered')).toBeNull();
  });
  it('Create shipment is for a confirmed home delivery order only', () => {
    expect(canCreateShipment('confirmed')).toBe(true);
    expect(canCreateShipment('confirmed', 'delivery')).toBe(true);
    expect(canCreateShipment('confirmed', 'pickup')).toBe(false);
    expect(canCreateShipment('packed')).toBe(false);
  });
  it('tells the shop what to do next', () => {
    expect(pickupHint('confirmed', 'pickup')).toMatch(/Ready for pickup/);
    expect(pickupHint('packed', 'pickup', true)).toMatch(/collect it and pay/);
    expect(pickupHint('packed', 'pickup', false)).not.toMatch(/pay/);
    expect(pickupHint('packed', 'delivery')).toBeNull();
    expect(pickupHint('delivered', 'pickup')).toBeNull();
  });
});

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
