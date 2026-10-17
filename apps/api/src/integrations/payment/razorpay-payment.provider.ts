import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ResilientHttpService } from '../../common/http/resilient-http.service';
import { GatewayCredentials } from './gateway-credentials';
import type {
  PaymentProvider,
  ProviderOrder,
  ProviderPayment,
  ProviderRefund,
  WebhookVerification,
} from './payment.provider';

const API = 'https://api.razorpay.com/v1';

interface RzpPayment {
  id: string;
  order_id?: string;
  status: string;
  amount: number;
  method?: string;
}

/**
 * Razorpay adapter (FR-4.6). Creates orders via the Razorpay Orders API and
 * verifies webhooks using the configured webhook secret (HMAC-SHA256), using a
 * timing-safe comparison. Credentials come from env at deploy (SECURITY-12);
 * every API call goes through the resilient HTTP client (timeout + circuit
 * breaker).
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly kind = 'razorpay' as const;
  private readonly logger = new Logger('RazorpayPaymentProvider');

  constructor(
    private readonly http: ResilientHttpService,
    private readonly creds: GatewayCredentials,
  ) {}

  private get keyId(): string {
    return this.creds.get().keyId;
  }

  private get keySecret(): string {
    return this.creds.get().keySecret;
  }

  private authHeader(): Record<string, string> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return { authorization: `Basic ${auth}` };
  }

  clientConfigFor(providerOrderId: string, amountPaise: number): Record<string, unknown> {
    return { provider: 'razorpay', key: this.keyId, orderId: providerOrderId, amount: amountPaise };
  }

  async createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder> {
    const res = await this.http.request<{ id: string }>('razorpay', `${API}/orders`, {
      method: 'POST',
      headers: this.authHeader(),
      // Razorpay receipts are capped at 40 characters; the order id is a 36-char uuid.
      body: { amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40) },
    });
    return {
      providerOrderId: res.id,
      amount: amountPaise,
      currency: 'INR',
      clientConfig: this.clientConfigFor(res.id, amountPaise),
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string, eventIdHeader?: string): WebhookVerification {
    const secret = this.creds.get().webhookSecret;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid = secret !== '' && this.safeEqual(expected, signature);

    const body = JSON.parse(rawBody.toString('utf8')) as {
      id?: string;
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string; amount?: number } } };
    };
    const payment = body.payload?.payment?.entity;
    // Razorpay's body has no event id: the delivery id is in the X-Razorpay-Event-Id header
    // (stable across its retries). Fall back to a hash of the payload so two different
    // events can never share the empty id and shadow each other.
    const eventId = eventIdHeader || body.id || `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;
    return {
      valid,
      eventId,
      event: body.event ?? '',
      providerOrderId: payment?.order_id,
      providerPaymentId: payment?.id,
      method: payment?.method,
      amount: payment?.amount,
    };
  }

  verifyCheckoutSignature(providerOrderId: string, providerPaymentId: string, signature: string): boolean {
    if (!this.keySecret || !providerOrderId || !providerPaymentId || !signature) return false;
    const expected = createHmac('sha256', this.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
    return this.safeEqual(expected, signature);
  }

  async listOrderPayments(providerOrderId: string): Promise<ProviderPayment[]> {
    const res = await this.http.request<{ items?: RzpPayment[] }>(
      'razorpay',
      `${API}/orders/${encodeURIComponent(providerOrderId)}/payments`,
      { headers: this.authHeader() },
    );
    return (res.items ?? []).map((p) => this.toPayment(p, providerOrderId));
  }

  async capturePayment(providerPaymentId: string, amountPaise: number): Promise<ProviderPayment> {
    const res = await this.http.request<RzpPayment>(
      'razorpay',
      `${API}/payments/${encodeURIComponent(providerPaymentId)}/capture`,
      { method: 'POST', headers: this.authHeader(), body: { amount: amountPaise, currency: 'INR' } },
    );
    return this.toPayment(res, res.order_id ?? '');
  }

  async createRefund(providerPaymentId: string, amountPaise: number): Promise<ProviderRefund> {
    const res = await this.http.request<{ id: string; status: string }>(
      'razorpay',
      `${API}/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      { method: 'POST', headers: this.authHeader(), body: { amount: amountPaise } },
    );
    return {
      providerRefundId: res.id,
      amount: amountPaise,
      status: res.status === 'processed' ? 'processed' : 'pending',
    };
  }

  private toPayment(p: RzpPayment, fallbackOrderId: string): ProviderPayment {
    const known = ['created', 'authorized', 'captured', 'refunded', 'failed'] as const;
    const status = (known as readonly string[]).includes(p.status) ? (p.status as ProviderPayment['status']) : 'created';
    return { id: p.id, providerOrderId: p.order_id ?? fallbackOrderId, status, amount: p.amount, method: p.method };
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
