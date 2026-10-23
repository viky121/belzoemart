import { decryptSecret, encryptSecret } from './secret-box';
import { GatewayCredentials } from './gateway-credentials';

const SERVER = 'a-server-side-secret-that-is-long-enough!!';

describe('secret box (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret('G9dwc5ooPJxsd0Ez8YQeEFxW', SERVER);
    expect(decryptSecret(sealed, SERVER)).toBe('G9dwc5ooPJxsd0Ez8YQeEFxW');
  });

  it('does not contain the plaintext and differs on every call (random IV)', () => {
    const a = encryptSecret('super-secret-value', SERVER);
    const b = encryptSecret('super-secret-value', SERVER);
    expect(a).not.toContain('super-secret-value');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
  });

  it('cannot be opened with another server secret, or after tampering', () => {
    const sealed = encryptSecret('x-secret-value', SERVER);
    expect(decryptSecret(sealed, 'a-different-server-secret-of-32-chars!!')).toBeNull();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(decryptSecret(parts.join('.'), SERVER)).toBeNull();
  });

  it('rejects malformed input instead of throwing', () => {
    for (const bad of ['', 'abc', 'v1.a.b', 'v2.a.b.c', 'v1....']) {
      expect(decryptSecret(bad, SERVER)).toBeNull();
    }
    expect(decryptSecret(encryptSecret('x-secret-value', SERVER), '')).toBeNull();
  });

  it('refuses to encrypt without a server secret', () => {
    expect(() => encryptSecret('x', '')).toThrow();
  });
});

describe('GatewayCredentials', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_ENV';
    process.env.RAZORPAY_KEY_SECRET = 'env-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'env-webhook';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses the environment when nothing is overridden', () => {
    const c = new GatewayCredentials();
    expect(c.get()).toEqual({ keyId: 'rzp_live_ENV', keySecret: 'env-secret', webhookSecret: 'env-webhook' });
    expect(c.overridden()).toEqual({ keyId: false, keySecret: false, webhookSecret: false });
  });

  it('lets each value be overridden on its own and falls back for the rest', () => {
    const c = new GatewayCredentials();
    c.setOverride({ webhookSecret: 'admin-webhook' });
    expect(c.get()).toEqual({ keyId: 'rzp_live_ENV', keySecret: 'env-secret', webhookSecret: 'admin-webhook' });
    expect(c.overridden()).toEqual({ keyId: false, keySecret: false, webhookSecret: true });
  });

  it('clearing the override returns to the environment; empty values never override', () => {
    const c = new GatewayCredentials();
    c.setOverride({ keyId: 'rzp_live_ADMIN', keySecret: 'admin-secret' });
    expect(c.get().keyId).toBe('rzp_live_ADMIN');
    c.setOverride({});
    expect(c.get().keyId).toBe('rzp_live_ENV');
    c.setOverride({ keyId: '', keySecret: '' });
    expect(c.get().keySecret).toBe('env-secret');
  });

  it('reads the environment lazily (a changed env is seen without restart in tests)', () => {
    const c = new GatewayCredentials();
    process.env.RAZORPAY_KEY_ID = 'rzp_live_CHANGED';
    expect(c.get().keyId).toBe('rzp_live_CHANGED');
  });
});
