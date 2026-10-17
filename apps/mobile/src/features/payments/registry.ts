import type { PaymentAdapter } from './adapter';
import { mockAdapter } from './mock-adapter';
import { razorpayAdapter } from './razorpay-adapter';

function unavailableAdapter(provider: string): PaymentAdapter {
  return {
    provider,
    isAvailable: () => false,
    pay: async () => ({ kind: 'unavailable', message: 'This payment method is not supported in the app.' }),
  };
}

/** Resolve the adapter for a server-chosen provider (design §6.7). */
export function getPaymentAdapter(provider: string): PaymentAdapter {
  if (provider === 'mock') return mockAdapter;
  if (provider === 'razorpay') return razorpayAdapter;
  return unavailableAdapter(provider);
}
