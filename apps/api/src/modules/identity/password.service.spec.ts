import fc from 'fast-check';
import { PasswordService } from './password.service';

/**
 * Property-based tests for password hashing (PBT-02 round-trip, PBT-03
 * invariant). argon2 is slow by design, so runs are kept modest.
 */
describe('PasswordService', () => {
  const svc = new PasswordService();

  // Domain generator: realistic passwords (>= 8 chars, printable).
  const password = fc
    .string({ minLength: 8, maxLength: 64 })
    .filter((s) => s.trim().length >= 8);

  it('PBT-02: hash → verify round-trips for any valid password', async () => {
    await fc.assert(
      fc.asyncProperty(password, async (pw) => {
        const hash = await svc.hash(pw);
        expect(await svc.verify(hash, pw)).toBe(true);
      }),
      { numRuns: 8 },
    );
  });

  it('PBT-03: a different password never verifies against the hash', async () => {
    await fc.assert(
      fc.asyncProperty(password, password, async (a, b) => {
        fc.pre(a !== b);
        const hash = await svc.hash(a);
        expect(await svc.verify(hash, b)).toBe(false);
      }),
      { numRuns: 8 },
    );
  });

  it('produces distinct hashes for the same password (random salt)', async () => {
    const h1 = await svc.hash('same-password-123');
    const h2 = await svc.hash('same-password-123');
    expect(h1).not.toBe(h2);
    expect(await svc.verify(h1, 'same-password-123')).toBe(true);
    expect(await svc.verify(h2, 'same-password-123')).toBe(true);
  });

  it('verify fails closed on a malformed hash', async () => {
    expect(await svc.verify('not-a-valid-argon2-hash', 'anything')).toBe(false);
  });
});
