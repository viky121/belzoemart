import type { PaymentAdapter } from './adapter';

/** Mock gateway: the server's mock provider already auto-captured inside `place`. */
export const mockAdapter: PaymentAdapter = {
  provider: 'mock',
  isAvailable: () => true,
  pay: async () => ({ kind: 'submitted' }),
};
