import { HttpException, UnauthorizedException } from '@nestjs/common';
import { PartnerAuthService, partnerLoginKey } from './partner-auth.service';
import { PasswordService } from '../../identity/password.service';
import { LockoutService } from '../../identity/lockout.service';
import { SECURITY_EVENTS, type DeliverySecurityEvents } from '../security-events';
import type { PartnerTokenService } from './partner-token.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';

const GOOD = 'Zx9!kLm2pQ';

async function build(opts: { active?: boolean; mustChange?: boolean } = {}) {
  const passwords = new PasswordService();
  const hash = await passwords.hash(GOOD);
  const partner = {
    id: 'p1',
    name: 'Ravi',
    mobile: '9876543210',
    passwordHash: hash,
    isActive: opts.active ?? true,
    mustChangePassword: opts.mustChange ?? false,
  };
  const attempts: { identifier: string; kind: string; succeeded: boolean; createdAt: Date }[] = [];
  const prisma = {
    deliveryPartner: {
      findUnique: async ({ where }: any) => (where.mobile === partner.mobile || where.id === partner.id ? partner : null),
      update: async ({ data }: any) => Object.assign(partner, data),
    },
    loginAttempt: {
      count: async ({ where }: any) =>
        attempts.filter((a) => a.identifier === where.identifier && a.succeeded === where.succeeded && a.createdAt >= where.createdAt.gte).length,
      create: async ({ data }: any) => void attempts.push({ ...data, createdAt: new Date() }),
    },
  } as unknown as PrismaService;
  const lockout = new LockoutService(prisma);
  const calls: string[] = [];
  const tokens = {
    issue: async (id: string, mcp: boolean) => (calls.push(`issue:${id}:${mcp}`), { accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    rotate: async (t: string) => (calls.push(`rotate:${t}`), { accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 }),
    revoke: async (t: string) => void calls.push(`revoke:${t}`),
    revokeOthers: async (id: string, keep?: string) => void calls.push(`revokeOthers:${id}:${keep ?? ''}`),
  } as unknown as PartnerTokenService;
  const events: string[] = [];
  const security = { record: async (e: string) => void events.push(e) } as unknown as DeliverySecurityEvents;
  const verifySpy = jest.spyOn(passwords, 'verify');
  const service = new PartnerAuthService(prisma, passwords, lockout, tokens, security);
  return { service, partner, attempts, calls, events, verifySpy };
}

describe('PartnerAuthService.login', () => {
  it('signs in with the right mobile and password', async () => {
    const { service, calls, attempts } = await build();
    const r = await service.login('9876543210', GOOD, '1.1.1.1');
    expect(r.partner).toEqual({ id: 'p1', name: 'Ravi', mobile: '9876543210', mustChangePassword: false });
    expect(r.tokens.accessToken).toBe('a');
    expect(calls).toEqual(['issue:p1:false']);
    expect(attempts.at(-1)).toMatchObject({ identifier: partnerLoginKey('9876543210'), kind: 'partner', succeeded: true });
  });

  it('tells the token that a password change is needed', async () => {
    const { service, calls } = await build({ mustChange: true });
    const r = await service.login('9876543210', GOOD);
    expect(r.partner.mustChangePassword).toBe(true);
    expect(calls).toEqual(['issue:p1:true']);
  });

  it('answers the same way for a wrong password, an unknown mobile and an inactive partner (BR-D3)', async () => {
    const wrong = await build();
    const unknown = await build();
    const inactive = await build({ active: false });
    const errors = await Promise.all([
      wrong.service.login('9876543210', 'Wrong@pass1').catch((e: unknown) => e),
      unknown.service.login('9123456780', GOOD).catch((e: unknown) => e),
      inactive.service.login('9876543210', GOOD).catch((e: unknown) => e),
    ]);
    for (const e of errors) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).message).toBe('Invalid mobile or password');
    }
  });

  it('still checks a password hash for an unknown mobile (equal timing)', async () => {
    const { service, verifySpy } = await build();
    await service.login('9123456780', GOOD).catch(() => undefined);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(String(verifySpy.mock.calls[0]?.[0]).startsWith('$argon2id$')).toBe(true);
  });

  it('records failures under a partner-only key and raises the security event', async () => {
    const { service, attempts, events } = await build();
    await service.login('9876543210', 'Wrong@pass1', '2.2.2.2').catch(() => undefined);
    expect(attempts[0]).toMatchObject({ identifier: 'partner:9876543210', kind: 'partner', succeeded: false, ip: '2.2.2.2' });
    expect(events).toEqual([SECURITY_EVENTS.LOGIN_FAILED]);
  });

  it('locks after 5 failures and answers 429, even with the right password', async () => {
    const { service, events } = await build();
    for (let i = 0; i < 5; i += 1) await service.login('9876543210', 'Wrong@pass1').catch(() => undefined);
    const e = await service.login('9876543210', GOOD).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(429);
    expect(events).toContain(SECURITY_EVENTS.LOGIN_LOCKED);
  });
});

describe('PartnerAuthService.changePassword', () => {
  it('sets the new password, clears the must-change flag and signs out other devices', async () => {
    const { service, partner, calls } = await build({ mustChange: true });
    await service.changePassword('p1', GOOD, 'Qw8#nPr5tY', 'my-refresh');
    expect(partner.mustChangePassword).toBe(false);
    expect(await new PasswordService().verify(partner.passwordHash, 'Qw8#nPr5tY')).toBe(true);
    expect(calls).toEqual(['revokeOthers:p1:my-refresh']);
  });

  it('refuses a wrong current password, counts it toward the lockout and leaves the password alone', async () => {
    const { service, partner, attempts } = await build();
    const before = partner.passwordHash;
    await expect(service.changePassword('p1', 'Wrong@pass1', 'Qw8#nPr5tY')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(partner.passwordHash).toBe(before);
    expect(attempts[0]).toMatchObject({ identifier: 'partner:9876543210', succeeded: false });
  });

  it('is blocked once the lockout is reached', async () => {
    const { service } = await build();
    for (let i = 0; i < 5; i += 1) await service.changePassword('p1', 'Wrong@pass1', 'Qw8#nPr5tY').catch(() => undefined);
    const e = await service.changePassword('p1', GOOD, 'Qw8#nPr5tY').catch((x: unknown) => x);
    expect((e as HttpException).getStatus()).toBe(429);
  });

  it('refuses an inactive or missing partner', async () => {
    const { service } = await build({ active: false });
    await expect(service.changePassword('p1', GOOD, 'Qw8#nPr5tY')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.changePassword('nobody', GOOD, 'Qw8#nPr5tY')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('PartnerAuthService refresh and logout', () => {
  it('delegates to the token service', async () => {
    const { service, calls } = await build();
    expect((await service.refresh('tok')).accessToken).toBe('a2');
    await service.logout('tok');
    expect(calls).toEqual(['rotate:tok', 'revoke:tok']);
  });
});
