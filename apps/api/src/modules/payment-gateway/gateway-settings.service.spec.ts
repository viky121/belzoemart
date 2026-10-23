import { BadRequestException } from '@nestjs/common';
import { GatewayCredentials } from '../../integrations/payment/gateway-credentials';
import { decryptSecret } from '../../integrations/payment/secret-box';
import type { SettingsService } from '../admin/settings.service';
import { GATEWAY_CREDENTIALS_KEY, GatewaySettingsService } from './gateway-settings.service';

const SERVER = 'a-server-side-secret-that-is-long-enough!!';
const KEY_ID = 'rzp_live_NewKeyId123';
const SECRET = 'NewKeySecret_abcdef';

function make(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const set = jest.fn(async (_actor: string, key: string, value: unknown) => {
    store[key] = value;
  });
  const settings = { get: jest.fn(async (key: string) => store[key] ?? null), set } as unknown as SettingsService;
  const creds = new GatewayCredentials();
  const svc = new GatewaySettingsService(settings, creds);
  return { svc, creds, store, set };
}

function razorpayAnswers(status: number) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status >= 200 && status < 300, status } as Response);
}

describe('GatewaySettingsService', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = SERVER;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    process.env.RAZORPAY_KEY_ID = 'rzp_live_ENVKEY123';
    process.env.RAZORPAY_KEY_SECRET = 'env-key-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'env-webhook-secret';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  describe('save', () => {
    it('verifies new keys with Razorpay, stores them encrypted, and starts using them', async () => {
      const fetchSpy = razorpayAnswers(200);
      const { svc, creds, store, set } = make();
      await svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.razorpay.com/v1/orders?count=1',
        expect.objectContaining({
          headers: { authorization: `Basic ${Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64')}` },
        }),
      );
      expect(set).toHaveBeenCalledWith('admin-1', GATEWAY_CREDENTIALS_KEY, expect.any(Object));
      const row = store[GATEWAY_CREDENTIALS_KEY] as { keyId: string; keySecretEnc: string };
      expect(row.keyId).toBe(KEY_ID);
      expect(JSON.stringify(row)).not.toContain(SECRET);
      expect(decryptSecret(row.keySecretEnc, SERVER)).toBe(SECRET);
      expect(creds.get()).toMatchObject({ keyId: KEY_ID, keySecret: SECRET, webhookSecret: 'env-webhook-secret' });
    });

    it('refuses keys Razorpay rejects, leaving the working keys in place', async () => {
      razorpayAnswers(401);
      const { svc, creds, set } = make();
      await expect(svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET })).rejects.toThrow(/rejected these keys/);
      expect(set).not.toHaveBeenCalled();
      expect(creds.get().keyId).toBe('rzp_live_ENVKEY123');
    });

    it('does not save when Razorpay cannot be reached', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
      const { svc, set } = make();
      await expect(svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET })).rejects.toThrow(/Could not reach Razorpay/);
      expect(set).not.toHaveBeenCalled();
    });

    it('saves only the webhook secret without calling Razorpay, keeping the API keys', async () => {
      const fetchSpy = razorpayAnswers(200);
      const { svc, creds, store } = make();
      await svc.save('admin-1', { webhookSecret: 'brand-new-webhook-secret' });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(creds.get()).toMatchObject({
        keyId: 'rzp_live_ENVKEY123',
        keySecret: 'env-key-secret',
        webhookSecret: 'brand-new-webhook-secret',
      });
      expect(JSON.stringify(store[GATEWAY_CREDENTIALS_KEY])).not.toContain('brand-new-webhook-secret');
    });

    it('a later webhook-only save keeps the previously saved API keys', async () => {
      razorpayAnswers(200);
      const { svc, creds } = make();
      await svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET });
      await svc.save('admin-1', { webhookSecret: 'another-webhook-secret' });
      expect(creds.get()).toMatchObject({ keyId: KEY_ID, keySecret: SECRET, webhookSecret: 'another-webhook-secret' });
    });

    it('requires the key id and secret together', async () => {
      const { svc } = make();
      await expect(svc.save('a', { keyId: KEY_ID })).rejects.toThrow(/together/);
      await expect(svc.save('a', { keySecret: SECRET })).rejects.toThrow(/together/);
    });

    it('rejects values that cannot be right, before touching Razorpay', async () => {
      const fetchSpy = razorpayAnswers(200);
      const { svc } = make();
      await expect(svc.save('a', { keyId: SECRET, keySecret: SECRET })).rejects.toThrow(/Key ID must look like/);
      await expect(svc.save('a', { keyId: KEY_ID, keySecret: 'short' })).rejects.toThrow(/too short/);
      await expect(svc.save('a', { webhookSecret: 'abc' })).rejects.toThrow(/at least 8/);
      await expect(svc.save('a', {})).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('cannot save when the server has no secret to encrypt with', async () => {
      delete process.env.JWT_REFRESH_SECRET;
      razorpayAnswers(200);
      const { svc } = make();
      await expect(svc.save('a', { webhookSecret: 'long-enough-secret' })).rejects.toThrow(/cannot encrypt/);
    });
  });

  describe('load / reset', () => {
    it('picks up saved credentials on startup (another instance saved them)', async () => {
      razorpayAnswers(200);
      const first = make();
      await first.svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET, webhookSecret: 'wh-secret-saved' });

      const second = make(first.store);
      await second.svc.load();
      expect(second.creds.get()).toEqual({ keyId: KEY_ID, keySecret: SECRET, webhookSecret: 'wh-secret-saved' });
      expect(second.svc.lastUpdatedAt).not.toBeNull();
      expect(second.svc.isUnreadable).toBe(false);
    });

    it('falls back to the environment when the saved values cannot be decrypted, and says so', async () => {
      razorpayAnswers(200);
      const first = make();
      await first.svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET });
      process.env.JWT_REFRESH_SECRET = 'a-completely-different-server-secret-32chars';

      const second = make(first.store);
      await second.svc.load();
      expect(second.creds.get().keyId).toBe('rzp_live_ENVKEY123');
      expect(second.creds.get().keySecret).toBe('env-key-secret');
      expect(second.svc.isUnreadable).toBe(true);
    });

    it('never pairs a saved key id with the environment secret', async () => {
      const { svc, creds } = make({ [GATEWAY_CREDENTIALS_KEY]: { keyId: KEY_ID } });
      await svc.load();
      expect(creds.get().keyId).toBe('rzp_live_ENVKEY123');
    });

    it('keeps working if the settings store is down', async () => {
      const creds = new GatewayCredentials();
      const settings = { get: jest.fn().mockRejectedValue(new Error('redis down')), set: jest.fn() } as unknown as SettingsService;
      const svc = new GatewaySettingsService(settings, creds);
      await expect(svc.load()).resolves.toBeUndefined();
      expect(creds.get().keyId).toBe('rzp_live_ENVKEY123');
    });

    it('reset clears the override and returns to the environment keys', async () => {
      razorpayAnswers(200);
      const { svc, creds } = make();
      await svc.save('admin-1', { keyId: KEY_ID, keySecret: SECRET });
      await svc.reset('admin-1');
      expect(creds.get().keyId).toBe('rzp_live_ENVKEY123');
      expect(creds.overridden()).toEqual({ keyId: false, keySecret: false, webhookSecret: false });
    });
  });

  describe('verifyKeys / testCurrent', () => {
    it('reports success, rejection and outages in plain words', async () => {
      const { svc } = make();
      razorpayAnswers(200);
      expect((await svc.verifyKeys(KEY_ID, SECRET)).ok).toBe(true);
      jest.restoreAllMocks();
      razorpayAnswers(401);
      expect((await svc.verifyKeys(KEY_ID, SECRET)).message).toMatch(/rejected/);
      jest.restoreAllMocks();
      razorpayAnswers(503);
      expect((await svc.verifyKeys(KEY_ID, SECRET)).message).toMatch(/503/);
      expect((await svc.verifyKeys('', SECRET)).ok).toBe(false);
    });

    it('testCurrent checks the keys in use', async () => {
      const fetchSpy = razorpayAnswers(200);
      const { svc } = make();
      expect((await svc.testCurrent()).ok).toBe(true);
      expect(fetchSpy.mock.calls[0]![1]).toMatchObject({
        headers: { authorization: `Basic ${Buffer.from('rzp_live_ENVKEY123:env-key-secret').toString('base64')}` },
      });
    });
  });
});
