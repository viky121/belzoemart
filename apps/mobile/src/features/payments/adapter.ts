/** Payment adapter contract (design §6.7). Adapters never mark an order paid client-side. */
export type PaymentOutcome =
  | { kind: 'submitted' }
  | { kind: 'dismissed' }
  | { kind: 'failed'; message: string }
  | { kind: 'unavailable'; message: string };

export interface PaymentRequest {
  orderId: string;
  amount: number;
  clientConfig?: Record<string, unknown>;
  prefill?: { name?: string; contact?: string; email?: string };
}

export interface PaymentAdapter {
  readonly provider: string;
  isAvailable(): boolean;
  pay(req: PaymentRequest): Promise<PaymentOutcome>;
}
