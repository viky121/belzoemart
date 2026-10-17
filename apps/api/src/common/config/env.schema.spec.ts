import { validateEnv } from './env.schema';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://belzo:belzo@localhost:5432/belzo?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(4000);
    expect(env.PAYMENT_PROVIDER).toBe('mock');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.SUPPORTED_LOCALES).toEqual(['en', 'hi']);
  });

  it('rejects a short JWT secret (fail fast, SECURITY-12)', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects a missing database url', () => {
    const { DATABASE_URL, ...withoutDb } = base;
    expect(() => validateEnv(withoutDb)).toThrow(/Invalid environment configuration/);
  });

  it('parses CORS_ORIGINS into a trimmed allowlist', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('validateEnv — live payments', () => {
  const live = {
    ...base,
    PAYMENT_PROVIDER: 'live',
    RAZORPAY_KEY_ID: 'rzp_live_abc',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'whsec',
  };

  it('accepts a complete live configuration', () => {
    expect(validateEnv(live).PAYMENT_PROVIDER).toBe('live');
  });

  it('refuses to boot live without each Razorpay credential', () => {
    for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
      expect(() => validateEnv({ ...live, [k]: '' })).toThrow(new RegExp(`${k} is required`));
    }
  });

  it('refuses a key id that is not a Razorpay key (e.g. the secret pasted by mistake)', () => {
    expect(() => validateEnv({ ...live, RAZORPAY_KEY_ID: 'G9dwc5oo' })).toThrow(/starts with rzp_/);
  });

  it('in production requires an https public URL for live payments', () => {
    const prod = { ...live, NODE_ENV: 'production' };
    expect(() => validateEnv({ ...prod, PUBLIC_BASE_URL: 'http://13.48.85.9' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => validateEnv({ ...prod })).toThrow(/PUBLIC_BASE_URL/);
    expect(validateEnv({ ...prod, PUBLIC_BASE_URL: 'https://belzoemart.com' }).PUBLIC_BASE_URL).toBe(
      'https://belzoemart.com',
    );
  });

  it('mock mode needs none of it', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).PAYMENT_PROVIDER).toBe('mock');
  });
});
