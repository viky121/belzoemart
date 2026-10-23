import { isAllowedReturnUrl, signHostedToken, verifyHostedToken } from './hosted-token';

const SECRET = 'a-long-test-secret-of-at-least-32-chars!!';
const NOW = 1_800_000_000;
const payload = { o: 'order-1', c: 'cust-1', r: 'belzoemart://payment-result', e: NOW + 600 };

describe('hosted payment link token', () => {
  it('round-trips a valid token', () => {
    const t = signHostedToken(payload, SECRET);
    expect(verifyHostedToken(t, SECRET, NOW)).toEqual(payload);
  });

  it('rejects an expired token', () => {
    const t = signHostedToken({ ...payload, e: NOW - 1 }, SECRET);
    expect(verifyHostedToken(t, SECRET, NOW)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const t = signHostedToken(payload, 'another-secret-another-secret-another!!');
    expect(verifyHostedToken(t, SECRET, NOW)).toBeNull();
  });

  it('rejects a tampered body (e.g. swapping the order id)', () => {
    const t = signHostedToken(payload, SECRET);
    const [body, sig] = t.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...payload, o: 'order-2' })).toString('base64url');
    expect(verifyHostedToken(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifyHostedToken(`${body}.${sig}x`, SECRET, NOW)).toBeNull();
  });

  it('rejects malformed input', () => {
    for (const bad of ['', 'abc', '.', 'a.', '.b', 'a.b.c', 'x'.repeat(3000)]) {
      expect(verifyHostedToken(bad, SECRET, NOW)).toBeNull();
    }
  });

  it('rejects a token whose return link is not one of our app schemes, even if correctly signed', () => {
    const t = signHostedToken({ ...payload, r: 'https://evil.example/steal' }, SECRET);
    expect(verifyHostedToken(t, SECRET, NOW)).toBeNull();
  });

  it('allows only the app deep-link schemes as return targets', () => {
    expect(isAllowedReturnUrl('belzoemart://payment-result')).toBe(true);
    expect(isAllowedReturnUrl('belzoemart-dev://payment-result')).toBe(true);
    for (const bad of ['https://belzoemart.com', 'http://x', 'javascript:alert(1)', 'intent://x', 'file:///etc/passwd', 'not a url', '']) {
      expect(isAllowedReturnUrl(bad)).toBe(false);
    }
  });
});
