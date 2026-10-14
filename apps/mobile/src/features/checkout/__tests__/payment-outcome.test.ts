import type { PaymentOutcome } from '@/features/payments/adapter';

import { handlePaymentOutcome } from '../payment-outcome';

const ctxBase = { orderId: 'o1', provider: 'razorpay' };

describe('handlePaymentOutcome', () => {
  it('issues exactly one cancel for an unavailable provider and returns payment_unavailable', async () => {
    const cancelOrder = jest.fn(async () => ({}));
    const outcome: PaymentOutcome = { kind: 'unavailable', message: 'x' };
    const params = await handlePaymentOutcome(outcome, { ...ctxBase, cancelOrder });
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(cancelOrder).toHaveBeenCalledWith('o1', 'Online payment unavailable in app');
    expect(params).toEqual({ orderId: 'o1', provider: 'razorpay', notice: 'payment_unavailable' });
  });

  it('returns payment_unavailable_cancel_failed when the cancel rejects (no retry)', async () => {
    const cancelOrder = jest.fn(async () => {
      throw new Error('cancel failed');
    });
    const params = await handlePaymentOutcome({ kind: 'unavailable', message: 'x' }, { ...ctxBase, cancelOrder });
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(params.notice).toBe('payment_unavailable_cancel_failed');
  });

  it('never cancels for submitted/dismissed/failed', async () => {
    const cancelOrder = jest.fn(async () => ({}));
    const submitted = await handlePaymentOutcome({ kind: 'submitted' }, { ...ctxBase, cancelOrder });
    const dismissed = await handlePaymentOutcome({ kind: 'dismissed' }, { ...ctxBase, cancelOrder });
    const failed = await handlePaymentOutcome({ kind: 'failed', message: 'x' }, { ...ctxBase, cancelOrder });
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(submitted.notice).toBeUndefined();
    expect(dismissed.notice).toBe('payment_incomplete');
    expect(failed.notice).toBe('payment_incomplete');
  });
});
