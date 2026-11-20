import type { FulfilmentMethod } from './pickup';

/**
 * One place that turns "what the gateway / shop recorded for this order's payment" into the words and colour the
 * admin panel, the website and the app all show. Pure: nothing here talks to a server.
 *
 * The rule that matters: an online payment that FAILED says "Payment failed", never "Pending" or "Order placed",
 * and an order that is waiting for its payment says so.
 */

/** Same tones the order badges use. */
export type PaymentTone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

export type PaymentStateKey =
  | 'paid'
  | 'awaiting'
  | 'failed'
  | 'not_completed'
  | 'refunded'
  | 'partially_refunded'
  | 'cod_due'
  | 'cod_paid'
  | 'cod_not_charged'
  | 'none';

/** The few payment fields the views need (an API payment row has more). */
export interface PaymentLike {
  provider: string;
  status: string;
  method?: string | null;
  createdAt?: string;
}

export interface PaymentStatusView {
  key: PaymentStateKey;
  /** Short badge text, e.g. "Paid", "Payment failed", "Awaiting payment". */
  label: string;
  tone: PaymentTone;
  /** A sentence for the customer, or null when the badge says it all. */
  customerNote: string | null;
  /** A sentence for the shop staff, or null. */
  adminNote: string | null;
  /** True for a gateway payment (Razorpay, UPI, card ...), false for Cash on Delivery / pay at shop. */
  online: boolean;
  /** The customer can still pay this order (it is open and its payment is awaiting or failed). */
  canPay: boolean;
}

const SETTLED = ['captured', 'refunded', 'partially_refunded'];

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  emi: 'EMI',
};

const PROVIDER_LABELS: Record<string, string> = { razorpay: 'Razorpay', mock: 'Test mode' };

/** Cash on Delivery or pay at the shop. */
export function isCodPayment(p: Pick<PaymentLike, 'provider' | 'method'> | null | undefined): boolean {
  return Boolean(p && (p.provider === 'cod' || p.method === 'cod'));
}

/** The payment that matters for display: a settled one, else the newest attempt, else the first one. */
export function pickPayment<T extends PaymentLike>(payments: readonly T[] | null | undefined): T | null {
  if (!payments || payments.length === 0) return null;
  const settled = payments.find((p) => SETTLED.includes(p.status));
  if (settled) return settled;
  let newest: T | null = null;
  for (const p of payments) {
    if (!newest || Date.parse(p.createdAt ?? '') > Date.parse(newest.createdAt ?? '')) newest = p;
  }
  return newest ?? payments[0] ?? null;
}

/** "UPI", "Card", "Online payment", "Cash on Delivery", "Pay at shop on pickup". */
export function paymentMethodLabel(p: PaymentLike | null | undefined, fulfilment?: FulfilmentMethod | null): string {
  if (!p) return 'Not available';
  if (isCodPayment(p)) return fulfilment === 'pickup' ? 'Pay at shop on pickup' : 'Cash on Delivery';
  return METHOD_LABELS[(p.method ?? '').toLowerCase()] ?? 'Online payment';
}

/** "Razorpay" for a gateway payment, "" for Cash on Delivery. */
export function paymentProviderLabel(p: PaymentLike | null | undefined): string {
  if (!p || isCodPayment(p)) return '';
  return PROVIDER_LABELS[p.provider] ?? p.provider;
}

export interface PaymentStatusInput {
  /** The order's own status (pending, confirmed, cancelled ...). */
  orderStatus: string;
  fulfilment?: FulfilmentMethod | null;
  payment: PaymentLike | null | undefined;
}

export function paymentStatusView({ orderStatus, fulfilment, payment }: PaymentStatusInput): PaymentStatusView {
  const atShop = fulfilment === 'pickup';
  const open = orderStatus === 'pending';
  const cancelled = orderStatus === 'cancelled';
  const base = { customerNote: null, adminNote: null, online: false, canPay: false } as const;

  if (!payment) {
    return { ...base, key: 'none', label: 'No payment', tone: 'muted' };
  }

  if (isCodPayment(payment)) {
    const done = orderStatus === 'delivered' || orderStatus === 'returned';
    if (payment.status === 'captured') return { ...base, key: 'cod_paid', label: 'Paid', tone: 'ok' };
    if (payment.status === 'refunded') return { ...base, key: 'refunded', label: 'Refunded', tone: 'info' };
    if (payment.status === 'partially_refunded') return { ...base, key: 'partially_refunded', label: 'Partially refunded', tone: 'info' };
    if (done) return { ...base, key: 'cod_paid', label: atShop ? 'Paid at shop' : 'Paid on delivery', tone: 'ok' };
    if (cancelled) return { ...base, key: 'cod_not_charged', label: 'Not charged', tone: 'muted' };
    return { ...base, key: 'cod_due', label: atShop ? 'Pay at shop' : 'Pay on delivery', tone: 'info' };
  }

  const online = { ...base, online: true };
  switch (payment.status) {
    case 'captured':
      return { ...online, key: 'paid', label: 'Paid', tone: 'ok' };
    case 'refunded':
      return {
        ...online,
        key: 'refunded',
        label: 'Refunded',
        tone: 'info',
        customerNote: 'Your payment was refunded to the original payment method.',
        adminNote: 'The payment was refunded to the customer.',
      };
    case 'partially_refunded':
      return {
        ...online,
        key: 'partially_refunded',
        label: 'Partially refunded',
        tone: 'info',
        customerNote: 'Part of your payment was refunded to the original payment method.',
        adminNote: 'Part of the payment was refunded to the customer.',
      };
    case 'failed':
      return open
        ? {
            ...online,
            key: 'failed',
            label: 'Payment failed',
            tone: 'bad',
            canPay: true,
            customerNote:
              'Your payment did not go through. Please pay again to confirm your order. If money was deducted, your bank returns it automatically within a few days.',
            adminNote:
              "The customer's last payment attempt failed. They can pay again; if the order stays unpaid it is cancelled automatically (about 30 minutes after it was placed).",
          }
        : {
            ...online,
            key: 'failed',
            label: 'Payment failed',
            tone: 'bad',
            customerNote: 'The payment did not go through, so this order was cancelled.',
            adminNote: 'The payment failed and the order was cancelled automatically.',
          };
    default:
      // created / pending: the customer has not paid (yet).
      return cancelled
        ? {
            ...online,
            key: 'not_completed',
            label: 'Payment not completed',
            tone: 'muted',
            customerNote: 'The payment was not completed, so this order was cancelled.',
            adminNote: 'The customer never completed the payment, so the order was cancelled automatically.',
          }
        : {
            ...online,
            key: 'awaiting',
            label: 'Awaiting payment',
            tone: 'warn',
            canPay: open,
            customerNote: open ? 'We are waiting for your payment. Your order is confirmed as soon as it arrives.' : null,
            adminNote: open
              ? 'Waiting for the customer to pay. The order is confirmed automatically when the money arrives, and cancelled if it stays unpaid (about 30 minutes after it was placed).'
              : null,
          };
  }
}
