import { UnauthorizedException } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { LockoutService } from './lockout.service';
import type { OtpService } from './otp.service';
import type { SocialAuthService } from './social-auth.service';

/**
 * Focused unit tests for CustomerAuthService orchestration using lightweight
 * fakes. Verifies lockout short-circuits login and invalid credentials are
 * rejected without leaking which field was wrong.
 */
describe('CustomerAuthService', () => {
  function build(overrides: {
    customer?: unknown;
    verify?: boolean;
    locked?: boolean;
  }) {
    const prisma = {
      customer: {
        findUnique: async () => overrides.customer ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', status: 'active', ...data }),
      },
    } as unknown as PrismaService;
    const passwords = { verify: async () => overrides.verify ?? false } as unknown as PasswordService;
    const tokens = {
      issue: async () => ({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    } as unknown as TokenService;
    const recorded: boolean[] = [];
    const lockout = {
      isLocked: async () => overrides.locked ?? false,
      record: async (_i: string, _k: string, ok: boolean) => {
        recorded.push(ok);
      },
    } as unknown as LockoutService;
    const otp = {} as OtpService;
    const social = {} as SocialAuthService;
    return {
      svc: new CustomerAuthService(prisma, passwords, tokens, lockout, otp, social),
      recorded,
    };
  }

  it('rejects login when the account is locked', async () => {
    const { svc } = build({ locked: true });
    await expect(svc.loginEmail('a@b.com', 'secret123')).rejects.toThrow(/Too many attempts/);
  });

  it('rejects invalid credentials and records a failed attempt', async () => {
    const { svc, recorded } = build({ customer: null, verify: false });
    await expect(svc.loginEmail('a@b.com', 'secret123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(recorded).toContain(false);
  });

  it('issues tokens and records success on valid credentials', async () => {
    const { svc, recorded } = build({
      customer: { id: 'c1', name: 'A', email: 'a@b.com', phone: null, locale: 'en', status: 'active', passwordHash: 'h' },
      verify: true,
    });
    const res = await svc.loginEmail('a@b.com', 'secret123');
    expect(res.tokens.accessToken).toBe('a');
    expect(recorded).toContain(true);
  });
});
