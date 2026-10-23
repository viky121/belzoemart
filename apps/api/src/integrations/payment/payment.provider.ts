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
  /** Amount the gateway reports for the payment, in paise. */
  amount?: number;
}

export interface ProviderRefund {
  providerRefundId: string;
  amount: number;
  status: 'processed' | 'pending';
}

/** A payment attempt on a gateway order, as the gateway itself reports it. */
export interface ProviderPayment {
  id: string;
  providerOrderId: string;
  /** `authorized` = money held but not yet captured; `captured` = ours. */
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number; // paise
  method?: string;
}

export interface PaymentProvider {
  readonly kind: 'razorpay' | 'mock';
  createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder>;
  /**
   * Verify a webhook payload's signature and extract the event. `eventIdHeader` is
   * the gateway's delivery id header (Razorpay sends it as X-Razorpay-Event-Id;
   * the JSON body carries no id of its own).
   */
  verifyWebhook(rawBody: Buffer, signature: string, eventIdHeader?: string): WebhookVerification;
  /**
   * Verify the signature the checkout widget hands back after a payment
   * (HMAC of "orderId|paymentId" with the API secret). Proves the payment
   * belongs to this gateway order; never trusts the client's say-so.
   */
  verifyCheckoutSignature(providerOrderId: string, providerPaymentId: string, signature: string): boolean;
  /** Ask the gateway which payments exist on an order (authoritative status). */
  listOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  /** Capture an authorized payment (needed when the account is not on auto-capture). */
  capturePayment(providerPaymentId: string, amountPaise: number): Promise<ProviderPayment>;
  /** Client config for an already-created gateway order (pay again / hosted page). */
  clientConfigFor(providerOrderId: string, amountPaise: number): Record<string, unknown>;
  createRefund(providerPaymentId: string, amountPaise: number): Promise<ProviderRefund>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
