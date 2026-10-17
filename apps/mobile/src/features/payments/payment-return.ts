import type { PaymentOutcome } from './adapter';

export type ReturnResult = 'success' | 'processing' | 'failed' | 'cancelled';
export type SyncStatus = 'paid' | 'processing' | 'cancelled';

/** The `result` the server put on the deep link it sent the browser back to the app with. */
export function parseReturnResult(url: string | null | undefined): ReturnResult | null {
  if (!url) return null;
  const m = /[?&]result=([a-z]+)/.exec(url);
  const v = m?.[1];
  return v === 'success' || v === 'processing' || v === 'failed' || v === 'cancelled' ? v : null;
}

/**
 * Decide what happened after the payment browser closed. The server's own check with
 * the gateway (`sync`) is authoritative when we have it; the deep-link result is only
 * a hint. Nothing here ever marks an order paid: that is the server's job.
 */
export function outcomeFromReturn(returnUrl: string | null | undefined, sync: SyncStatus | null): PaymentOutcome {
  if (sync === 'paid') return { kind: 'submitted' };
  if (sync === 'cancelled') return { kind: 'failed', message: 'This order was cancelled.' };
  const result = parseReturnResult(returnUrl);
  if (result === 'success' || result === 'processing') return { kind: 'submitted' }; // confirmation screen keeps checking
  if (result === 'failed') return { kind: 'failed', message: 'The payment did not go through.' };
  return { kind: 'dismissed' }; // closed the browser, or tapped Cancel
}
