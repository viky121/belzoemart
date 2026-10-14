import type { PaymentAdapter } from './adapter';

/**
 * Razorpay is NOT wired in this run (react-native-razorpay is not installed).
 * TODO(Phase 5): integrate react-native-razorpay 3.0.0 — open({ key, order_id:
 * clientConfig.orderId, amount, currency: 'INR', name: 'Belzo eMart', prefill }),
 * treat success as "processing" and poll the order; never mark paid client-side.
 */
export const razorpayAdapterStub: PaymentAdapter = {
  provider: 'razorpay',
  isAvailable: () => false,
  pay: async () => ({
    kind: 'unavailable',
    message: 'Online payment is not available in this app version yet.',
  }),
};
