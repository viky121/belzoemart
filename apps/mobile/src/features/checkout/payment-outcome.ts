import type { PaymentOutcome } from '@/features/payments/adapter';
import type { OrderConfirmationNotice } from '@/navigation/types';

export interface OrderConfirmationParams {
  orderId: string;
  provider: string;
  notice?: OrderConfirmationNotice;
}

export interface PaymentOutcomeContext {
  orderId: string;
  provider: string;
  /** Cancels the order (used only for an `unavailable` outcome). */
  cancelOrder: (orderId: string, reason: string) => Promise<unknown>;
}

/**
 * Decide the OrderConfirmation params for a payment outcome (design §6.6). Pure except for the
 * single cancel call it makes for an `unavailable` provider — issued exactly once, never retried.
 */
export async function handlePaymentOutcome(
  outcome: PaymentOutcome,
  ctx: PaymentOutcomeContext,
): Promise<OrderConfirmationParams> {
  if (outcome.kind === 'unavailable') {
    try {
      await ctx.cancelOrder(ctx.orderId, 'Online payment unavailable in app');
      return { orderId: ctx.orderId, provider: ctx.provider, notice: 'payment_unavailable' };
    } catch {
      return {
        orderId: ctx.orderId,
        provider: ctx.provider,
        notice: 'payment_unavailable_cancel_failed',
      };
    }
  }
  if (outcome.kind === 'dismissed' || outcome.kind === 'failed') {
    return { orderId: ctx.orderId, provider: ctx.provider, notice: 'payment_incomplete' };
  }
  return { orderId: ctx.orderId, provider: ctx.provider };
}
