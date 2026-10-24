import fc from 'fast-check';
import { DEFAULT_DELIVERY_SETTINGS, type DeliverySettings } from '@belzo/shared';
import { checkOtp, decideResend, generateOtpCode, hashOtp, isVerificationFresh, otpMatches, type OtpState } from './otp-rules';

const PEPPER = 'p'.repeat(40);
const JOB = '3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c';
const NOW = new Date('2026-10-23T10:00:00Z');
const S: DeliverySettings = DEFAULT_DELIVERY_SETTINGS;
const arbCode = fc.stringMatching(/^[0-9]{6}$/);

function otpFor(code: string, over: Partial<OtpState> = {}): OtpState {
  return { codeHash: hashOtp(PEPPER, JOB, 1, code), wrongGuesses: 0, expiresAt: new Date(NOW.getTime() + 3_600_000), attemptNo: 1, ...over };
}

const check = (otp: OtpState | null, code: string, over: Partial<Parameters<typeof checkOtp>[0]> = {}) =>
  checkOtp({ otp, jobId: JOB, lockedUntil: null, now: NOW, settings: S, pepper: PEPPER, code, ...over });

describe('delivery OTP rules (example tests)', () => {
  it('makes 6-digit numeric codes', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('hashes to 64 hex characters and never contains the code', () => {
    const h = hashOtp(PEPPER, JOB, 1, '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('123456');
  });

  it('accepts the right code and refuses a wrong one', () => {
    expect(check(otpFor('123456'), '123456')).toEqual({ kind: 'verified' });
    expect(check(otpFor('123456'), '654321')).toEqual({ kind: 'wrong', wrongGuesses: 1, attemptsLeft: 4, lock: false });
  });

  it('locks on the fifth wrong guess', () => {
    expect(check(otpFor('123456', { wrongGuesses: 3 }), '000000')).toMatchObject({ kind: 'wrong', wrongGuesses: 4, lock: false });
    expect(check(otpFor('123456', { wrongGuesses: 4 }), '000000')).toMatchObject({ kind: 'wrong', wrongGuesses: 5, attemptsLeft: 0, lock: true });
  });

  it('does not even look at the code while the job is locked', () => {
    const until = new Date(NOW.getTime() + 90_000);
    expect(check(otpFor('123456'), '123456', { lockedUntil: until })).toEqual({ kind: 'job_locked', retryAfterSeconds: 90 });
    expect(check(otpFor('123456'), '123456', { lockedUntil: new Date(NOW.getTime() - 1) })).toEqual({ kind: 'verified' });
  });

  it('reports expired for no code or an old one, even if the code is right', () => {
    expect(check(null, '123456')).toEqual({ kind: 'expired' });
    expect(check(otpFor('123456', { expiresAt: new Date(NOW.getTime() - 1) }), '123456')).toEqual({ kind: 'expired' });
    expect(check(otpFor('123456', { expiresAt: NOW }), '123456')).toEqual({ kind: 'expired' });
  });

  it('refuses a code made for another attempt or another job', () => {
    expect(otpMatches(PEPPER, JOB, 2, '123456', hashOtp(PEPPER, JOB, 1, '123456'))).toBe(false);
    expect(otpMatches(PEPPER, 'other-job', 1, '123456', hashOtp(PEPPER, JOB, 1, '123456'))).toBe(false);
    expect(otpMatches('q'.repeat(40), JOB, 1, '123456', hashOtp(PEPPER, JOB, 1, '123456'))).toBe(false);
    expect(otpMatches(PEPPER, JOB, 1, '123456', 'zz-not-hex')).toBe(false);
  });

  it('resend: ok at first, then cooldown, then limit, and locked wins', () => {
    const base = { now: NOW, lockedUntil: null, settings: S };
    expect(decideResend({ ...base, lastSentAt: null, sendCount: 0 })).toEqual({ ok: true });
    expect(decideResend({ ...base, lastSentAt: new Date(NOW.getTime() - 20_000), sendCount: 1 })).toEqual({ ok: false, reason: 'cooldown', retryAfterSeconds: 40 });
    expect(decideResend({ ...base, lastSentAt: new Date(NOW.getTime() - 60_000), sendCount: 1 })).toEqual({ ok: true });
    expect(decideResend({ ...base, lastSentAt: new Date(NOW.getTime() - 600_000), sendCount: 5 })).toEqual({ ok: false, reason: 'limit' });
    expect(decideResend({ ...base, lockedUntil: new Date(NOW.getTime() + 30_000), lastSentAt: null, sendCount: 0 })).toEqual({ ok: false, reason: 'locked', retryAfterSeconds: 30 });
  });

  it('a verification stays fresh for 30 minutes', () => {
    expect(isVerificationFresh(new Date(NOW.getTime() - 29 * 60_000), NOW, S)).toBe(true);
    expect(isVerificationFresh(new Date(NOW.getTime() - 30 * 60_000), NOW, S)).toBe(true);
    expect(isVerificationFresh(new Date(NOW.getTime() - 31 * 60_000), NOW, S)).toBe(false);
    expect(isVerificationFresh(null, NOW, S)).toBe(false);
  });
});

describe('delivery OTP rules (property tests)', () => {
  it('P6: verify succeeds only for the code that was issued', () => {
    fc.assert(
      fc.property(arbCode, arbCode, (issued, tried) => {
        const d = check(otpFor(issued), tried);
        expect(d.kind === 'verified').toBe(issued === tried);
      }),
    );
  });

  it('P6: wrong guesses only go up, and the lock appears exactly at the limit', () => {
    fc.assert(
      fc.property(arbCode, arbCode, fc.integer({ min: 0, max: 4 }), (issued, tried, before) => {
        fc.pre(issued !== tried);
        const d = check(otpFor(issued, { wrongGuesses: before }), tried);
        expect(d.kind).toBe('wrong');
        if (d.kind === 'wrong') {
          expect(d.wrongGuesses).toBe(before + 1);
          expect(d.lock).toBe(before + 1 >= S.otpMaxWrongGuesses);
          expect(d.attemptsLeft).toBe(Math.max(0, S.otpMaxWrongGuesses - (before + 1)));
        }
      }),
    );
  });

  it('P6: while locked, every code (right or wrong) is refused the same way', () => {
    fc.assert(
      fc.property(arbCode, arbCode, fc.integer({ min: 1, max: 900 }), (issued, tried, secs) => {
        const until = new Date(NOW.getTime() + secs * 1000);
        expect(check(otpFor(issued), tried, { lockedUntil: until })).toEqual({ kind: 'job_locked', retryAfterSeconds: secs });
      }),
    );
  });

  it('P7: the hash is deterministic and changes when any input changes', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 1, max: 9 }), arbCode, arbCode, (job, attempt, a, b) => {
        expect(hashOtp(PEPPER, job, attempt, a)).toBe(hashOtp(PEPPER, job, attempt, a));
        if (a !== b) expect(hashOtp(PEPPER, job, attempt, a)).not.toBe(hashOtp(PEPPER, job, attempt, b));
        expect(hashOtp(PEPPER, job, attempt, a)).not.toBe(hashOtp(PEPPER, job, attempt + 1, a));
        expect(hashOtp(PEPPER, job, attempt, a)).not.toBe(hashOtp(PEPPER + 'x', job, attempt, a));
      }),
    );
  });

  it('P8: a resend never happens past the send limit or before the cooldown', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: -300, max: 300 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 10, max: 120 }),
        (sendCount, ageSeconds, maxSends, cooldown) => {
          const settings = { otpMaxSends: maxSends, otpResendSeconds: cooldown };
          const lastSentAt = new Date(NOW.getTime() - ageSeconds * 1000);
          const d = decideResend({ now: NOW, lockedUntil: null, lastSentAt, sendCount, settings });
          if (d.ok) {
            expect(sendCount).toBeLessThan(maxSends);
            expect(ageSeconds).toBeGreaterThanOrEqual(cooldown);
          } else if (d.reason === 'limit') {
            expect(sendCount).toBeGreaterThanOrEqual(maxSends);
          } else if (d.reason === 'cooldown') {
            expect(d.retryAfterSeconds).toBeGreaterThan(0);
            expect(d.retryAfterSeconds).toBeLessThanOrEqual(cooldown + 300);
          }
        },
      ),
    );
  });
});
