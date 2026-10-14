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
