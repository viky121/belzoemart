import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { signProof } from './otp-proof';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { LockoutService } from './lockout.service';
import type { OtpService } from './otp.service';
import type { SocialAuthService } from './social-auth.service';

interface Row {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  passwordHash: string | null;
  status: string;
  locale: string;
}

function build(initial: Row[] = [], opts: { passwordOk?: boolean; locked?: boolean } = {}) {
  const rows = [...initial];
  let seq = 0;
  const find = (where: { phone?: string; email?: string; id?: string }) =>
    rows.find((r) => (where.phone && r.phone === where.phone) || (where.email && r.email === where.email) || (where.id && r.id === where.id)) ?? null;
  const prisma = {
    customer: {
      findUnique: async ({ where }: { where: { phone?: string; email?: string } }) => find(where),
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = { id: `n${seq++}`, status: 'active', locale: 'en', phone: null, email: null, passwordHash: null, name: '', ...data } as Row;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(find(where)!, data),
    },
  } as unknown as PrismaService;
  const hashed: string[] = [];
  const passwords = {
    hash: async (p: string) => (hashed.push(p), `hash:${p}`),
    verify: async () => opts.passwordOk ?? false,
  } as unknown as PasswordService;
  const revoked: string[] = [];
  const tokens = {
    issue: async () => ({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    revokeAllFor: async (id: string) => void revoked.push(id),
  } as unknown as TokenService;
  const attempts: [string, boolean][] = [];
  const lockout = {
    isLocked: async () => opts.locked ?? false,
    record: async (key: string, _k: string, ok: boolean) => void attempts.push([key, ok]),
  } as unknown as LockoutService;
  const otp = {
    request: jest.fn(async () => ({ requestId: 'req', expiresAt: 'x' })),
    verify: jest.fn(async () => ({ phone: '9412807767', email: null })),
  } as unknown as OtpService;
  const svc = new CustomerAuthService(prisma, passwords, tokens, lockout, otp, {} as SocialAuthService);
  return { svc, rows, hashed, revoked, attempts, otp };
}

const reg = (over: Record<string, unknown> = {}) => ({
  name: 'Ravi Kumar',
  email: 'ravi@example.com',
  phone: '+91 94128 07767',
  password: 'Belzo@2026',
  confirmPassword: 'Belzo@2026',
  phoneProof: signProof('phone', '9412807767'),
  emailProof: signProof('email', 'ravi@example.com'),
  ...over,
});

describe('CustomerAuthService - verified registration', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  });

  it('creates the account from verified mobile + email and hashes the password', async () => {
    const { svc, rows, hashed } = build();
    const res = await svc.registerAccount(reg());
    expect(res.tokens.accessToken).toBe('a');
    expect(rows[0]).toMatchObject({ name: 'Ravi Kumar', phone: '9412807767', email: 'ravi@example.com', passwordHash: 'hash:Belzo@2026' });
    expect(hashed).toEqual(['Belzo@2026']);
  });

  it('refuses without a valid proof for BOTH the mobile and the email', async () => {
    const { svc, rows } = build();
    await expect(svc.registerAccount(reg({ phoneProof: signProof('phone', '9000000000') }))).rejects.toThrow(/Verify the mobile/);
    await expect(svc.registerAccount(reg({ emailProof: signProof('email', 'other@example.com') }))).rejects.toThrow(/Verify the email/);
    await expect(svc.registerAccount(reg({ emailProof: 'x.y' }))).rejects.toThrow(/invalid|expired/i);
    expect(rows).toHaveLength(0);
  });

  it('rejects a mobile or email that already has a password account', async () => {
    const existing: Row = { id: 'c1', phone: '9412807767', email: 'old@example.com', name: 'Old', passwordHash: 'h', status: 'active', locale: 'en' };
    await expect(build([existing]).svc.registerAccount(reg())).rejects.toThrow(/mobile number is already registered/);
    const byEmail: Row = { ...existing, phone: '9111111111', email: 'ravi@example.com' };
    await expect(build([byEmail]).svc.registerAccount(reg())).rejects.toBeInstanceOf(ConflictException);
  });

  it('an old email+password account (no mobile yet) is completed with the verified mobile and new password', async () => {
    const oldEmailOnly: Row = { id: 'e1', phone: null, email: 'ravi@example.com', name: 'Ravi', passwordHash: 'old', status: 'active', locale: 'en' };
    const { svc, rows } = build([oldEmailOnly]);
    await svc.registerAccount(reg());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'e1', phone: '9412807767', passwordHash: 'hash:Belzo@2026' });
  });

  it('rejects a mobile and an email that belong to two different accounts', async () => {
    const a: Row = { id: 'a', phone: '9412807767', email: null, name: 'A', passwordHash: null, status: 'active', locale: 'en' };
    const b: Row = { id: 'b', phone: null, email: 'ravi@example.com', name: 'B', passwordHash: null, status: 'active', locale: 'en' };
    await expect(build([a, b]).svc.registerAccount(reg())).rejects.toThrow(/different accounts/);
  });

  it('completes an old OTP-only account (no password yet) instead of duplicating it', async () => {
    const legacy: Row = { id: 'l1', phone: '9412807767', email: null, name: 'Belzo Customer', passwordHash: null, status: 'active', locale: 'en' };
    const { svc, rows } = build([legacy]);
    await svc.registerAccount(reg());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'l1', name: 'Ravi Kumar', email: 'ravi@example.com', passwordHash: 'hash:Belzo@2026' });
  });

  it('a blocked old account cannot be reclaimed', async () => {
    const blocked: Row = { id: 'l1', phone: '9412807767', email: null, name: 'X', passwordHash: null, status: 'blocked', locale: 'en' };
    await expect(build([blocked]).svc.registerAccount(reg())).rejects.toThrow(/blocked/);
  });
});

describe('CustomerAuthService - mobile + password sign-in', () => {
  const acct: Row = { id: 'c1', phone: '9412807767', email: 'ravi@example.com', name: 'Ravi', passwordHash: 'h', status: 'active', locale: 'en' };

  it('signs in with the right password and records the success against the number', async () => {
    const { svc, attempts } = build([acct], { passwordOk: true });
    const res = await svc.loginPhone('+91 94128 07767', 'Belzo@2026');
    expect(res.customer.id).toBe('c1');
    expect(attempts).toEqual([['phone:9412807767', true]]);
  });

  it('wrong password, unknown number and password-less accounts all give the same generic error', async () => {
    for (const rows of [[acct], [], [{ ...acct, passwordHash: null }]]) {
      const { svc, attempts } = build(rows, { passwordOk: false });
      await expect(svc.loginPhone('9412807767', 'nope')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.loginPhone('9412807767', 'nope')).rejects.toThrow('Invalid mobile number or password');
      expect(attempts.every(([, ok]) => ok === false)).toBe(true);
    }
  });

  it('is locked out after repeated failures', async () => {
    const { svc } = build([acct], { passwordOk: true, locked: true });
    await expect(svc.loginPhone('9412807767', 'Belzo@2026')).rejects.toThrow(/Too many attempts/);
  });
});

describe('CustomerAuthService - sign in with mobile OR email + password', () => {
  const acct: Row = { id: 'c1', phone: '9412807767', email: 'ravi@example.com', name: 'Ravi', passwordHash: 'h', status: 'active', locale: 'en' };

  it('signs in with the mobile number (any common format)', async () => {
    const { svc, attempts } = build([acct], { passwordOk: true });
    expect((await svc.loginIdentifier('+91 94128 07767', 'Belzo@2026')).customer.id).toBe('c1');
    expect(attempts).toEqual([['phone:9412807767', true]]);
  });

  it('signs in with the email, case-insensitively', async () => {
    const { svc, attempts } = build([acct], { passwordOk: true });
    expect((await svc.loginIdentifier(' Ravi@Example.com ', 'Belzo@2026')).customer.id).toBe('c1');
    expect(attempts).toEqual([['ravi@example.com', true]]);
  });

  it('an email-only (old) account can sign in by email', async () => {
    const old: Row = { ...acct, phone: null };
    const { svc } = build([old], { passwordOk: true });
    await expect(svc.loginIdentifier('ravi@example.com', 'x')).resolves.toBeDefined();
  });

  it('gives one generic error for unknown account, wrong password and no password yet, and locks after failures', async () => {
    for (const [rows, id] of [
      [[acct], '9412807767'],
      [[], 'nobody@example.com'],
      [[{ ...acct, passwordHash: null }], 'ravi@example.com'],
    ] as [Row[], string][]) {
      const { svc } = build(rows, { passwordOk: false });
      await expect(svc.loginIdentifier(id, 'nope')).rejects.toThrow('Invalid mobile number / email or password');
    }
    await expect(build([acct], { passwordOk: true, locked: true }).svc.loginIdentifier('9412807767', 'x')).rejects.toThrow(/Too many attempts/);
  });
});

describe('CustomerAuthService - OTP purposes, proofs and password reset', () => {
  const acct: Row = { id: 'c1', phone: '9412807767', email: 'ravi@example.com', name: 'Ravi', passwordHash: 'h', status: 'active', locale: 'en' };

  it('register OTP is refused for a number that already has an account (no SMS sent)', async () => {
    const { svc, otp } = build([acct]);
    await expect(svc.requestOtp({ phone: '9412807767' }, 'register')).rejects.toThrow(/already registered/);
    expect(otp.request).not.toHaveBeenCalled();
    await svc.requestOtp({ phone: '9000000001' }, 'register');
    expect(otp.request).toHaveBeenCalledTimes(1);
  });

  it('reset and login OTPs only go to existing accounts', async () => {
    const { svc, otp } = build([acct]);
    await expect(svc.requestOtp({ phone: '9000000001' }, 'reset')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.requestOtp({ phone: '9000000001' }, 'login')).rejects.toBeInstanceOf(NotFoundException);
    expect(otp.request).not.toHaveBeenCalled();
    await svc.requestOtp({ phone: '9412807767' }, 'reset');
    expect(otp.request).toHaveBeenCalledTimes(1);
  });

  it('OTP sign-in no longer creates accounts out of thin air', async () => {
    const { svc, rows } = build([]);
    await expect(svc.verifyOtp('req', '123456')).rejects.toBeInstanceOf(NotFoundException);
    expect(rows).toHaveLength(0);
  });

  it('proveOtp returns a proof for the verified number', async () => {
    const { svc } = build();
    const res = await svc.proveOtp('req', '123456');
    expect(res).toMatchObject({ kind: 'phone', value: '9412807767' });
    expect(res.proof).toContain('.');
  });

  it('resetPassword sets the new hash and signs the customer out everywhere', async () => {
    const { svc, rows, revoked } = build([acct]);
    await svc.resetPassword(signProof('phone', '9412807767'), 'Newpass@123');
    expect(rows[0].passwordHash).toBe('hash:Newpass@123');
    expect(revoked).toEqual(['c1']);
  });

  it('resetPassword needs a valid proof and an existing account', async () => {
    const { svc } = build([acct]);
    await expect(svc.resetPassword('forged.proof', 'Newpass@123')).rejects.toThrow(/invalid|expired/i);
    await expect(svc.resetPassword(signProof('phone', '9000000009'), 'Newpass@123')).rejects.toBeInstanceOf(NotFoundException);
  });
});
