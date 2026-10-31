import { CheckoutController } from './checkout.controller';
import type { CheckoutService } from './checkout.service';
import type { PaymentService } from './payment.service';

/** Placing a Cash on Delivery order confirms it right away; an online order waits for its payment. */
const user = { sub: 'cust1', kind: 'customer', roles: [] } as never;
const ADDR = '11111111-1111-4111-8111-111111111111';
const result = (provider: string, reused = false) => ({
  orderId: 'o1',
  reused,
  breakup: { grandTotal: 50000 },
  payment: { provider, amount: 50000 },
});

function make(provider: string, reused = false) {
  const checkout = { place: jest.fn().mockResolvedValue(result(provider, reused)) };
  const payments = {
    confirmCodOrder: jest.fn().mockResolvedValue(true),
    initiate: jest.fn().mockResolvedValue({ clientConfig: { provider: 'razorpay' } }),
    onlinePaymentEnabled: true,
  };
  const controller = new CheckoutController(checkout as unknown as CheckoutService, payments as unknown as PaymentService);
  return { controller, checkout, payments };
}

describe('CheckoutController.place for Cash on Delivery', () => {
  it('confirms the order right after placing it and starts no online payment', async () => {
    const { controller, payments } = make('cod');
    const res = await controller.place(user, { addressId: ADDR, paymentMethod: 'cod' }, 'K1');
    expect(payments.confirmCodOrder).toHaveBeenCalledWith('o1');
    expect(payments.initiate).not.toHaveBeenCalled();
    expect(res.orderId).toBe('o1');
    expect(res.payment).toMatchObject({ provider: 'cod', amount: 50000 });
  });

  it('tries again on a replayed key, in case the first confirmation failed', async () => {
    const { controller, payments } = make('cod', true);
    await controller.place(user, { addressId: ADDR, paymentMethod: 'cod' }, 'K1');
    expect(payments.confirmCodOrder).toHaveBeenCalledWith('o1');
  });

  it('still answers the customer when the confirmation fails (the order stays pending for the admin)', async () => {
    const { controller, payments } = make('cod');
    payments.confirmCodOrder.mockRejectedValue(new Error('queue down'));
    const res = await controller.place(user, { addressId: ADDR, paymentMethod: 'cod' }, 'K1');
    expect(res.orderId).toBe('o1');
  });

  it('does not confirm an online order: it waits for its payment', async () => {
    const { controller, payments } = make('razorpay');
    await controller.place(user, { addressId: ADDR, paymentMethod: 'upi' }, 'K2');
    expect(payments.confirmCodOrder).not.toHaveBeenCalled();
    expect(payments.initiate).toHaveBeenCalledWith('o1');
  });
});
