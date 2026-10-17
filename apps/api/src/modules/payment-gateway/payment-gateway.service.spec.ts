import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { PaymentService } from '../checkout/payment.service';
import { GatewayCredentials } from '../../integrations/payment/gateway-credentials';
import type { GatewaySettingsService } from './gateway-settings.service';
import { signHostedToken, verifyHostedToken } from './hosted-token';
import { PaymentGatewayService } from './payment-gateway.service';

const SECRET = 'a-long-test-secret-of-at-least-32-chars!!';
const APP = 'belzoemart-dev://payment-result';
const ORDER = '6f1d0c9e-1111-4222-8333-444455556666';

function make(cfgOver: Record<string, unknown> = {}) {
  const payments = {
    onlinePaymentEnabled: true,
    paymentConfigForOrder: jest.fn(async () => ({
      provider: 'razorpay',
      amount: 118000,
      alreadyPaid: false,
      clientConfig: { provider: 'razorpay', key: 'rzp_live_abc', orderId: 'order_1', amount: 118000 },
      ...cfgOver,
    })),
    verifyClientPayment: jest.fn(async () => ({ status: 'paid' as const })),
    expireAbandoned: jest.fn(async () => ({ checked: 0, cancelled: 0, confirmed: 0 })),
  };
  const prisma = {
    customer: { findUnique: jest.fn(async () => ({ name: 'Asha', phone: '9876543210', email: 'a@b.in' })) },
    webhookEvent: { findFirst: jest.fn(async () => null) },
    payment: { count: jest.fn(async () => 0) },
  };
  const creds = new GatewayCredentials();
  const gatewaySettings = { lastUpdatedAt: null as string | null, isUnreadable: false };
  const svc = new PaymentGatewayService(
    prisma as unknown as PrismaService,
    payments as unknown as PaymentService,
    creds,
    gatewaySettings as unknown as GatewaySettingsService,
  );
  return { svc, payments, prisma, creds, gatewaySettings };
}

const tokenFor = (over: Partial<{ o: string; c: string; r: string; e: number }> = {}) =>
  signHostedToken({ o: ORDER, c: 'cust-1', r: APP, e: Math.floor(Date.now() / 1000) + 600, ...over }, SECRET);

describe('PaymentGatewayService', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    process.env.PUBLIC_BASE_URL = 'https://belzoemart.com';
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('createHostedLink', () => {
    it('issues a link on our own host that carries order, customer and return link', async () => {
      const { svc, payments } = make();
      const { url } = await svc.createHostedLink('cust-1', ORDER, APP);
      expect(payments.paymentConfigForOrder).toHaveBeenCalledWith('cust-1', ORDER);
      expect(url.startsWith('https://belzoemart.com/api/v1/payments/hosted/')).toBe(true);
      const payload = verifyHostedToken(url.split('/hosted/')[1]!, SECRET);
      expect(payload).toMatchObject({ o: ORDER, c: 'cust-1', r: APP });
    });

    it('refuses a return link that is not our app (no open redirect)', async () => {
      const { svc } = make();
      await expect(svc.createHostedLink('cust-1', ORDER, 'https://evil.example')).rejects.toThrow(BadRequestException);
    });

    it('refuses to pay an already-paid order or when no live gateway is configured', async () => {
      await expect(make({ alreadyPaid: true }).svc.createHostedLink('cust-1', ORDER, APP)).rejects.toThrow('already paid');
      await expect(make({ provider: 'mock' }).svc.createHostedLink('cust-1', ORDER, APP)).rejects.toThrow('not available');
    });

    it('in production refuses to build links on a non-https base', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PUBLIC_BASE_URL = 'http://13.48.85.9';
      await expect(make().svc.createHostedLink('cust-1', ORDER, APP)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('hostedPage', () => {
    it('renders checkout for the gateway order with the customer prefilled and the callback tied to the token', async () => {
      const { svc } = make();
      const t = tokenFor();
      const html = await svc.hostedPage(t, 'N1');
      expect(html).toContain('"order_id":"order_1"');
      expect(html).toContain('"key":"rzp_live_abc"');
      expect(html).toContain('"contact":"9876543210"');
      expect(html).toContain(`/api/v1/payments/hosted/callback?t=${encodeURIComponent(t)}`);
      expect(html).toContain(`/api/v1/payments/hosted/cancel?t=${encodeURIComponent(t)}`);
    });

    it('rejects a forged or expired link', async () => {
      const { svc } = make();
      await expect(svc.hostedPage('garbage', 'N')).rejects.toThrow(ForbiddenException);
      await expect(svc.hostedPage(tokenFor({ e: 1 }), 'N')).rejects.toThrow(ForbiddenException);
    });

    it('signals "already_paid" so the controller can send the customer straight back', async () => {
      await expect(make({ alreadyPaid: true }).svc.hostedPage(tokenFor(), 'N')).rejects.toThrow('already_paid');
    });
  });

  describe('hostedCallback', () => {
    const good = {
      razorpay_payment_id: 'pay_1',
      razorpay_order_id: 'order_1',
      razorpay_signature: 'sig',
    };

    it('verifies the payment for the token’s customer and order, then returns to the app with success', async () => {
      const { svc, payments } = make();
      const back = await svc.hostedCallback(tokenFor(), good);
      expect(payments.verifyClientPayment).toHaveBeenCalledWith('cust-1', ORDER, {
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      });
      const u = new URL(back);
      expect(u.protocol).toBe('belzoemart-dev:');
      expect(u.searchParams.get('orderId')).toBe(ORDER);
      expect(u.searchParams.get('result')).toBe('success');
    });

    it('reports "processing" when the gateway has not confirmed yet', async () => {
      const { svc, payments } = make();
      payments.verifyClientPayment.mockResolvedValueOnce({ status: 'processing' as never });
      expect(new URL(await svc.hostedCallback(tokenFor(), good)).searchParams.get('result')).toBe('processing');
    });

    it('reports failure for a rejected signature instead of throwing', async () => {
      const { svc, payments } = make();
      payments.verifyClientPayment.mockRejectedValueOnce(new BadRequestException('Invalid payment signature'));
      expect(new URL(await svc.hostedCallback(tokenFor(), good)).searchParams.get('result')).toBe('failed');
    });

    it('treats a callback without payment fields (declined/failed payment) as failed, without calling verify', async () => {
      const { svc, payments } = make();
      const back = await svc.hostedCallback(tokenFor(), { error: { code: 'BAD_REQUEST_ERROR' } });
      expect(new URL(back).searchParams.get('result')).toBe('failed');
      expect(payments.verifyClientPayment).not.toHaveBeenCalled();
    });

    it('ignores non-string field values', async () => {
      const { svc, payments } = make();
      const back = await svc.hostedCallback(tokenFor(), { razorpay_payment_id: { $ne: 1 }, razorpay_order_id: 'o', razorpay_signature: 's' });
      expect(new URL(back).searchParams.get('result')).toBe('failed');
      expect(payments.verifyClientPayment).not.toHaveBeenCalled();
    });

    it('rejects an expired or forged token', async () => {
      const { svc } = make();
      await expect(svc.hostedCallback('nope', good)).rejects.toThrow(ForbiddenException);
    });
  });

  it('hostedCancel returns to the app with result=cancelled', () => {
    const { svc } = make();
    const u = new URL(svc.hostedCancel(tokenFor()));
    expect(u.searchParams.get('result')).toBe('cancelled');
    expect(u.searchParams.get('orderId')).toBe(ORDER);
    expect(() => svc.hostedCancel('bad')).toThrow(ForbiddenException);
  });

  describe('status', () => {
    it('reports live config without revealing the secrets', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_live_Torv2igXd3g2jv';
      process.env.RAZORPAY_KEY_SECRET = 'super-secret';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
      const { svc, prisma } = make();
      prisma.webhookEvent.findFirst.mockResolvedValueOnce({ createdAt: new Date('2026-10-17T10:00:00Z') } as never);
      prisma.payment.count.mockResolvedValueOnce(3);
      const s = await svc.status();
      expect(s).toMatchObject({
        mode: 'live',
        keyType: 'live',
        secretConfigured: true,
        webhookSecretConfigured: true,
        webhookUrl: 'https://belzoemart.com/api/v1/payments/webhook',
        lastWebhookAt: '2026-10-17T10:00:00.000Z',
        openOnlineOrders: 3,
      });
      expect(JSON.stringify(s)).not.toContain('super-secret');
      expect(JSON.stringify(s)).not.toContain('whsec');
      expect(s.keyHint).not.toBe('rzp_live_Torv2igXd3g2jv');
    });

    it('says where each credential comes from, and shows admin-entered keys without exposing them', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_live_ENVKEY123';
      process.env.RAZORPAY_KEY_SECRET = 'env-secret';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'env-webhook';
      const { svc, creds, gatewaySettings } = make();
      creds.setOverride({ keyId: 'rzp_live_AdminKey9999', keySecret: 'admin-secret-value' });
      gatewaySettings.lastUpdatedAt = '2026-10-17T09:00:00.000Z';
      const s = await svc.status();
      expect(s.source).toEqual({ keyId: 'admin', keySecret: 'admin', webhookSecret: 'env' });
      expect(s.keyHint).toBe('rzp_live_Adm…999');
      expect(s.credentialsUpdatedAt).toBe('2026-10-17T09:00:00.000Z');
      expect(JSON.stringify(s)).not.toContain('admin-secret-value');
    });

    it('says the webhook was never received and flags a test key', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
      const s = await make().svc.status();
      expect(s.keyType).toBe('test');
      expect(s.lastWebhookAt).toBeNull();
    });
  });

  it('sweep never throws, even when the expiry run fails', async () => {
    const { svc, payments } = make();
    payments.expireAbandoned.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.sweep()).resolves.toBeUndefined();
  });
});
