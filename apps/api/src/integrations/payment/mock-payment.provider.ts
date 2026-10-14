import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  WebhookVerification,
} from './payment.provider';

/**
 * Deterministic mock payment provider for local dev/tests. Creates a provider
 * order and "verifies" webhooks whose signature is sha256(rawBody) — so tests
 * and the dev UI can simulate a captured payment without a real gateway.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly kind = 'mock' as const;

  async createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder> {
    const providerOrderId = `mock_order_${receipt}`;
    return {
      providerOrderId,
      amount: amountPaise,
      currency: 'INR',
      clientConfig: { provider: 'mock', providerOrderId, amount: amountPaise },
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string): WebhookVerification {
    const expected = createHash('sha256').update(rawBody).digest('hex');
    const body = JSON.parse(rawBody.toString('utf8')) as {
      eventId?: string;
      event?: string;
      providerOrderId?: string;
      providerPaymentId?: string;
      method?: string;
    };
    return {
      valid: signature === expected,
      eventId: body.eventId ?? randomUUID(),
      event: body.event ?? 'payment.captured',
      providerOrderId: body.providerOrderId,
      providerPaymentId: body.providerPaymentId ?? `mock_pay_${randomUUID()}`,
      method: body.method ?? 'upi',
    };
  }

  async createRefund(_providerPaymentId: string, amountPaise: number): Promise<ProviderRefund> {
    return { providerRefundId: `mock_rfnd_${randomUUID()}`, amount: amountPaise, status: 'processed' };
  }
}
