/**
 * Payment provider port (FR-4.6-4.8, NFR-1.5). Domain code depends only on this
 * interface; concrete adapters (Razorpay, Mock) are env-selected. No raw card
 * data is ever handled — the gateway tokenises payment instruments.
 */
export interface ProviderOrder {
  providerOrderId: string;
  amount: number; // paise
  currency: 'INR';
  /** Opaque data the client SDK needs to open the checkout (key id, order id). */
  clientConfig: Record<string, unknown>;
}

export interface WebhookVerification {
  valid: boolean;
  eventId: string;
  event: string; // e.g. 'payment.captured', 'payment.failed'
  providerOrderId?: string;
  providerPaymentId?: string;
  method?: string;
}

export interface ProviderRefund {
  providerRefundId: string;
  amount: number;
  status: 'processed' | 'pending';
}

export interface PaymentProvider {
  readonly kind: 'razorpay' | 'mock';
  createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder>;
  /** Verify a webhook payload's signature and extract the event. */
  verifyWebhook(rawBody: Buffer, signature: string): WebhookVerification;
  createRefund(providerPaymentId: string, amountPaise: number): Promise<ProviderRefund>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
