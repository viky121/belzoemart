/**
 * Razorpay Checkout (client) helper.
 *
 * The order is created server-side (POST /checkout/place → payments.initiate),
 * which returns an opaque `clientConfig`. We only load the hosted checkout.js
 * and open the widget with that config. Payment *capture* is confirmed by the
 * server webhook — never trusted from the client (SECURITY-08). The client
 * success handler just moves the user to the order-result page, which polls the
 * order status until the webhook marks it confirmed.
 */

/** Opaque config returned by the API for a Razorpay order. */
export interface RazorpayClientConfig {
  provider: string;
  key?: string;
  orderId?: string;
  amount?: number;
  [k: string]: unknown;
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (resp: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on?: (event: string, cb: (e: unknown) => void) => void;
}
type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Load the hosted Razorpay Checkout script once; resolve with the constructor. */
export function loadRazorpay(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay can only load in the browser'));
      return;
    }
    if (window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const done = () =>
      window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay script loaded without constructor'));
    const fail = () => reject(new Error('Could not load the Razorpay checkout script'));

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', fail);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', done);
    script.addEventListener('error', fail);
    document.body.appendChild(script);
  });
}

/** Open the Razorpay payment widget for a server-created order. */
export async function openRazorpayCheckout(
  cfg: RazorpayClientConfig,
  opts: {
    amount: number;
    name?: string;
    description?: string;
    prefill?: RazorpayOptions['prefill'];
    onSuccess: (r: RazorpaySuccess) => void;
    onDismiss: () => void;
  },
): Promise<void> {
  const Razorpay = await loadRazorpay();
  const instance = new Razorpay({
    key: String(cfg.key ?? ''),
    order_id: String(cfg.orderId ?? ''),
    amount: opts.amount,
    currency: 'INR',
    name: opts.name ?? 'Belzo eMart',
    description: opts.description,
    prefill: opts.prefill,
    theme: { color: '#2563eb' },
    handler: (resp) => opts.onSuccess(resp),
    modal: { ondismiss: () => opts.onDismiss() },
  });
  instance.open();
}

/** Body for POST /payments/verify, built from the widget's success response. */
export function verifyBody(orderId: string, r: RazorpaySuccess) {
  return {
    orderId,
    razorpay_order_id: r.razorpay_order_id,
    razorpay_payment_id: r.razorpay_payment_id,
    razorpay_signature: r.razorpay_signature,
  };
}
