import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { toApiError, userMessage } from '@/api/errors';
import { apiRequest } from '@/api/client';

import type { PaymentAdapter, PaymentOutcome, PaymentRequest } from './adapter';
import { outcomeFromReturn, type SyncStatus } from './payment-return';

/** Ask the server to check the order with the gateway; null if it can't be reached. */
export async function syncPayment(orderId: string): Promise<SyncStatus | null> {
  try {
    const r = await apiRequest<{ status: SyncStatus }>(`/payments/${orderId}/sync`, {
      method: 'POST',
      auth: 'required',
      retry429: false,
    });
    return r.status;
  } catch {
    return null;
  }
}

/**
 * Razorpay in the phone's own browser (a Custom Tab, not an embedded WebView, so UPI apps
 * open normally). The server issues a short-lived link to a hosted checkout page; when the
 * customer finishes, the page sends the browser back to the app through a deep link. The
 * server confirms the payment with Razorpay itself, so nothing here marks an order paid.
 */
export const razorpayAdapter: PaymentAdapter = {
  provider: 'razorpay',
  isAvailable: () => true,
  async pay(req: PaymentRequest): Promise<PaymentOutcome> {
    try {
      const returnUrl = Linking.createURL('payment-result');
      const link = await apiRequest<{ url: string }>(`/payments/${req.orderId}/hosted-link`, {
        method: 'POST',
        auth: 'required',
        body: { returnUrl },
        retry429: false,
      });
      const res = await WebBrowser.openAuthSessionAsync(link.url, returnUrl);
      const back = res.type === 'success' ? res.url : null;
      return outcomeFromReturn(back, await syncPayment(req.orderId));
    } catch (e) {
      const err = toApiError(e);
      return { kind: 'failed', message: userMessage(err) || 'Could not start the payment.' };
    }
  },
};
