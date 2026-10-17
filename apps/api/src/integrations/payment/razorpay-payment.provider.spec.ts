import { createHmac } from 'node:crypto';
import type { ResilientHttpService } from '../../common/http/resilient-http.service';
import { RazorpayPaymentProvider } from './razorpay-payment.provider';

const KEY_ID = 'rzp_live_TESTKEYID00000';
const KEY_SECRET = 'test_key_secret_value';
const WEBHOOK_SECRET = 'test_webhook_secret';

function make() {
  const request = jest.fn();
  const provider = new RazorpayPaymentProvider({ request } as unknown as ResilientHttpService);
  return { provider, request };
}

const hmac = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

describe('RazorpayPaymentProvider', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('createOrder', () => {
    it('creates an INR order with basic auth and returns the client config', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({ id: 'order_ABC' });
      const res = await provider.createOrder(118000, '6f1d0c9e-1111-2222-3333-444455556666');
      const [dep, url, opts] = request.mock.calls[0]!;
      expect(dep).toBe('razorpay');
      expect(url).toBe('https://api.razorpay.com/v1/orders');
      expect(opts.method).toBe('POST');
      expect(opts.headers.authorization).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
      expect(opts.body).toEqual({ amount: 118000, currency: 'INR', receipt: '6f1d0c9e-1111-2222-3333-444455556666' });
      expect(res).toEqual({
        providerOrderId: 'order_ABC',
        amount: 118000,
        currency: 'INR',
        clientConfig: { provider: 'razorpay', key: KEY_ID, orderId: 'order_ABC', amount: 118000 },
      });
    });

    it('caps the receipt at the 40 characters Razorpay allows', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({ id: 'order_X' });
      await provider.createOrder(100, 'x'.repeat(80));
      expect(request.mock.calls[0]![2].body.receipt).toHaveLength(40);
    });

    it('never puts the key secret in the client config', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({ id: 'order_X' });
      const res = await provider.createOrder(100, 'r');
      expect(JSON.stringify(res.clientConfig)).not.toContain(KEY_SECRET);
    });
  });

  describe('verifyWebhook', () => {
    const body = (event: string, extra: object = {}) =>
      Buffer.from(
        JSON.stringify({
          entity: 'event',
          event,
          payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', method: 'upi', amount: 118000 } } },
          ...extra,
        }),
      );

    it('accepts a correctly signed webhook and extracts the payment', () => {
      const { provider } = make();
      const raw = body('payment.captured');
      const v = provider.verifyWebhook(raw, hmac(WEBHOOK_SECRET, raw), 'evt_delivery_1');
      expect(v).toMatchObject({
        valid: true,
        event: 'payment.captured',
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        method: 'upi',
        amount: 118000,
        eventId: 'evt_delivery_1',
      });
    });

    it('rejects a wrong or tampered signature', () => {
      const { provider } = make();
      const raw = body('payment.captured');
      expect(provider.verifyWebhook(raw, hmac('other-secret', raw)).valid).toBe(false);
      expect(provider.verifyWebhook(raw, 'abc').valid).toBe(false);
      const tampered = Buffer.from(raw.toString('utf8').replace('118000', '1'));
      expect(provider.verifyWebhook(tampered, hmac(WEBHOOK_SECRET, raw)).valid).toBe(false);
    });

    it('is invalid (not "valid with an empty secret") when no webhook secret is configured', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = '';
      const { provider } = make();
      const raw = body('payment.captured');
      expect(provider.verifyWebhook(raw, hmac('', raw)).valid).toBe(false);
    });

    it('gives different events different ids even without the delivery header (no shared empty id)', () => {
      const { provider } = make();
      const a = body('payment.failed');
      const b = body('payment.captured');
      const ida = provider.verifyWebhook(a, hmac(WEBHOOK_SECRET, a)).eventId;
      const idb = provider.verifyWebhook(b, hmac(WEBHOOK_SECRET, b)).eventId;
      expect(ida).not.toBe('');
      expect(idb).not.toBe('');
      expect(ida).not.toBe(idb);
      // The same payload redelivered maps to the same id, so replays stay idempotent.
      expect(provider.verifyWebhook(a, hmac(WEBHOOK_SECRET, a)).eventId).toBe(ida);
    });

    it('handles an order.paid event, which carries the payment too', () => {
      const { provider } = make();
      const raw = body('order.paid');
      const v = provider.verifyWebhook(raw, hmac(WEBHOOK_SECRET, raw), 'e2');
      expect(v).toMatchObject({ valid: true, event: 'order.paid', providerOrderId: 'order_1', amount: 118000 });
    });
  });

  describe('verifyCheckoutSignature', () => {
    it('accepts HMAC(order_id|payment_id) with the key secret', () => {
      const { provider } = make();
      expect(provider.verifyCheckoutSignature('order_1', 'pay_1', hmac(KEY_SECRET, 'order_1|pay_1'))).toBe(true);
    });

    it('rejects anything else', () => {
      const { provider } = make();
      const good = hmac(KEY_SECRET, 'order_1|pay_1');
      expect(provider.verifyCheckoutSignature('order_1', 'pay_2', good)).toBe(false);
      expect(provider.verifyCheckoutSignature('order_2', 'pay_1', good)).toBe(false);
      expect(provider.verifyCheckoutSignature('order_1', 'pay_1', hmac(WEBHOOK_SECRET, 'order_1|pay_1'))).toBe(false);
      expect(provider.verifyCheckoutSignature('order_1', 'pay_1', '')).toBe(false);
      expect(provider.verifyCheckoutSignature('', 'pay_1', good)).toBe(false);
    });

    it('rejects everything when the key secret is not configured', () => {
      process.env.RAZORPAY_KEY_SECRET = '';
      const { provider } = make();
      expect(provider.verifyCheckoutSignature('order_1', 'pay_1', hmac('', 'order_1|pay_1'))).toBe(false);
    });
  });

  describe('gateway reads and writes', () => {
    it('lists the payments on an order and normalises their status', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({
        items: [
          { id: 'pay_a', order_id: 'order_1', status: 'failed', amount: 100, method: 'card' },
          { id: 'pay_b', order_id: 'order_1', status: 'captured', amount: 100, method: 'upi' },
          { id: 'pay_c', order_id: 'order_1', status: 'weird', amount: 100 },
        ],
      });
      const list = await provider.listOrderPayments('order_1');
      expect(request.mock.calls[0]![1]).toBe('https://api.razorpay.com/v1/orders/order_1/payments');
      expect(list.map((p) => p.status)).toEqual(['failed', 'captured', 'created']);
      expect(list[1]).toMatchObject({ id: 'pay_b', providerOrderId: 'order_1', amount: 100, method: 'upi' });
    });

    it('treats an empty listing as no payments', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({});
      expect(await provider.listOrderPayments('order_1')).toEqual([]);
    });

    it('captures an authorized payment for the exact order amount', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({ id: 'pay_b', order_id: 'order_1', status: 'captured', amount: 500 });
      const p = await provider.capturePayment('pay_b', 500);
      const [, url, opts] = request.mock.calls[0]!;
      expect(url).toBe('https://api.razorpay.com/v1/payments/pay_b/capture');
      expect(opts.body).toEqual({ amount: 500, currency: 'INR' });
      expect(p.status).toBe('captured');
    });

    it('refunds a payment', async () => {
      const { provider, request } = make();
      request.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });
      expect(await provider.createRefund('pay_b', 500)).toEqual({
        providerRefundId: 'rfnd_1',
        amount: 500,
        status: 'processed',
      });
      expect(request.mock.calls[0]![1]).toBe('https://api.razorpay.com/v1/payments/pay_b/refund');
    });
  });
});
