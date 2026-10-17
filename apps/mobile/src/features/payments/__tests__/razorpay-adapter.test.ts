import { apiRequest } from '@/api/client';

import { getPaymentAdapter } from '../registry';
import { razorpayAdapter, syncPayment } from '../razorpay-adapter';

const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: unknown[]) => mockOpen(...a) }));
jest.mock('expo-linking', () => ({ createURL: (p: string) => `belzoemart-dev://${p}` }));
jest.mock('@/api/client', () => ({ apiRequest: jest.fn() }));

const api = apiRequest as jest.Mock;
const req = { orderId: 'o1', amount: 118000 };

/** Routes the two calls the adapter makes: hosted-link, then sync. */
function server(opts: { link?: unknown; sync?: unknown }) {
  api.mockImplementation(async (path: string) => {
    if (path.endsWith('/hosted-link')) {
      if (opts.link instanceof Error) throw opts.link;
      return opts.link ?? { url: 'https://belzoemart.com/api/v1/payments/hosted/T' };
    }
    if (path.endsWith('/sync')) {
      if (opts.sync instanceof Error) throw opts.sync;
      return opts.sync ?? { status: 'processing' };
    }
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  api.mockReset();
  mockOpen.mockReset();
});

describe('razorpay adapter (hosted checkout in the phone browser)', () => {
  it('is registered for razorpay and available', () => {
    expect(getPaymentAdapter('razorpay')).toBe(razorpayAdapter);
    expect(razorpayAdapter.isAvailable()).toBe(true);
  });

  it('asks the server for a link tied to the app deep link, opens it, then checks with the server', async () => {
    server({ sync: { status: 'paid' } });
    mockOpen.mockResolvedValueOnce({ type: 'success', url: 'belzoemart-dev://payment-result?orderId=o1&result=success' });
    const out = await razorpayAdapter.pay(req);

    expect(api).toHaveBeenNthCalledWith(
      1,
      '/payments/o1/hosted-link',
      expect.objectContaining({ method: 'POST', auth: 'required', body: { returnUrl: 'belzoemart-dev://payment-result' } }),
    );
    expect(mockOpen).toHaveBeenCalledWith(
      'https://belzoemart.com/api/v1/payments/hosted/T',
      'belzoemart-dev://payment-result',
    );
    expect(api).toHaveBeenNthCalledWith(2, '/payments/o1/sync', expect.objectContaining({ method: 'POST' }));
    expect(out).toEqual({ kind: 'submitted' });
  });

  it('reports dismissed when the customer closes the browser and nothing was paid', async () => {
    server({ sync: { status: 'processing' } });
    mockOpen.mockResolvedValueOnce({ type: 'cancel' });
    expect(await razorpayAdapter.pay(req)).toEqual({ kind: 'dismissed' });
  });

  it('still confirms with the server if the browser closed after the payment actually went through', async () => {
    server({ sync: { status: 'paid' } });
    mockOpen.mockResolvedValueOnce({ type: 'dismiss' });
    expect(await razorpayAdapter.pay(req)).toEqual({ kind: 'submitted' });
  });

  it('reports failed when the gateway said the payment failed', async () => {
    server({ sync: { status: 'processing' } });
    mockOpen.mockResolvedValueOnce({ type: 'success', url: 'belzoemart-dev://payment-result?orderId=o1&result=failed' });
    expect(await razorpayAdapter.pay(req)).toMatchObject({ kind: 'failed' });
  });

  it('falls back to the deep-link result when the sync call cannot reach the server', async () => {
    server({ sync: new Error('offline') });
    mockOpen.mockResolvedValueOnce({ type: 'success', url: 'belzoemart-dev://payment-result?orderId=o1&result=success' });
    expect(await razorpayAdapter.pay(req)).toEqual({ kind: 'submitted' });
  });

  it('never opens the browser or throws when the link cannot be created', async () => {
    server({ link: new Error('boom') });
    const out = await razorpayAdapter.pay(req);
    expect(out.kind).toBe('failed');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('syncPayment returns null instead of throwing', async () => {
    api.mockRejectedValueOnce(new Error('x'));
    expect(await syncPayment('o1')).toBeNull();
  });
});
