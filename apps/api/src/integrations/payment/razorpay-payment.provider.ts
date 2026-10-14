import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ResilientHttpService } from '../../common/http/resilient-http.service';
import type {
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  WebhookVerification,
} from './payment.provider';

/**
 * Razorpay adapter (FR-4.6). Creates orders via the Razorpay Orders API and
 * verifies webhooks using the configured webhook secret (HMAC-SHA256), using a
 * timing-safe comparison. Credentials come from env at deploy (SECURITY-12);
 * the API call goes through the resilient HTTP client (timeout + circuit
 * breaker).
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly kind = 'razorpay' as const;
  private readonly logger = new Logger('RazorpayPaymentProvider');

  constructor(private readonly http: ResilientHttpService) {}

  private get keyId(): string {
    return process.env.RAZORPAY_KEY_ID ?? '';
  }

  async createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder> {
    const auth = Buffer.from(`${this.keyId}:${process.env.RAZORPAY_KEY_SECRET ?? ''}`).toString('base64');
    const res = await this.http.request<{ id: string }>('razorpay', 'https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { authorization: `Basic ${auth}` },
      body: { amount: amountPaise, currency: 'INR', receipt },
    });
    return {
      providerOrderId: res.id,
      amount: amountPaise,
      currency: 'INR',
      clientConfig: { provider: 'razorpay', key: this.keyId, orderId: res.id, amount: amountPaise },
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string): WebhookVerification {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid = this.safeEqual(expected, signature);

    const body = JSON.parse(rawBody.toString('utf8')) as {
      id?: string;
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string } } };
    };
    const payment = body.payload?.payment?.entity;
    return {
      valid,
      eventId: body.id ?? '',
      event: body.event ?? '',
      providerOrderId: payment?.order_id,
      providerPaymentId: payment?.id,
      method: payment?.method,
    };
  }

  async createRefund(providerPaymentId: string, amountPaise: number): Promise<ProviderRefund> {
    const auth = Buffer.from(`${this.keyId}:${process.env.RAZORPAY_KEY_SECRET ?? ''}`).toString('base64');
    const res = await this.http.request<{ id: string; status: string }>(
      'razorpay',
      `https://api.razorpay.com/v1/payments/${providerPaymentId}/refund`,
      { method: 'POST', headers: { authorization: `Basic ${auth}` }, body: { amount: amountPaise } },
    );
    return {
      providerRefundId: res.id,
      amount: amountPaise,
      status: res.status === 'processed' ? 'processed' : 'pending',
    };
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
