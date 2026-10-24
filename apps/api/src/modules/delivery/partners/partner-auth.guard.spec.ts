import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { TokenService } from '../../identity/token.service';
import { AllowPasswordChange } from './partner-auth.decorators';
import { PartnerAuthGuard, PRESENCE_TOUCH_MS } from './partner-auth.guard';
import { PartnerTokenService } from './partner-token.service';
import type { DeliverySecurityEvents } from '../security-events';
import type { PrismaService } from '../../../common/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'access-secret-for-tests-0123456789abcdef';
process.env.JWT_PARTNER_SECRET = 'partner-secret-for-tests-0123456789abcdef';

class PlainController {
  handle(): void {}
}
class PasswordController {
  @AllowPasswordChange()
  handle(): void {}
}

function ctx(headers: Record<string, string>, controller: new () => object = PlainController) {
  const request: Record<string, any> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (controller.prototype as { handle: () => void }).handle,
    getClass: () => controller,
  } as unknown as ExecutionContext;
  return { context, request };
}

function build(partner: Record<string, any> | null) {
  const updates: unknown[] = [];
  const prisma = {
    deliveryPartner: {
      findUnique: async () => partner,
      update: async (args: unknown) => void updates.push(args),
    },
  } as unknown as PrismaService;
  const jwt = new JwtService();
  const tokens = new PartnerTokenService(jwt, prisma, { record: async () => undefined } as unknown as DeliverySecurityEvents);
  const guard = new PartnerAuthGuard(new Reflector(), tokens, prisma);
  return { guard, tokens, jwt, updates };
}

const ACTIVE = { id: 'p1', name: 'Ravi', mobile: '9876543210', isActive: true, isOnline: false, mustChangePassword: false, lastSeenAt: null };

async function bearer(jwt: JwtService, secret: string, claims: Record<string, unknown>): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await jwt.signAsync(claims, { secret, expiresIn: 600 })}` };
}

describe('PartnerAuthGuard', () => {
  it('lets an active partner in and exposes only the loaded partner', async () => {
    const { guard, jwt } = build(ACTIVE);
    const { context, request } = ctx(await bearer(jwt, process.env.JWT_PARTNER_SECRET as string, { sub: 'p1', kind: 'partner', mcp: false }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.partner).toEqual({ id: 'p1', name: 'Ravi', mobile: '9876543210', mustChangePassword: false, isOnline: false });
  });

  it('refuses a missing header and a malformed token', async () => {
    const { guard } = build(ACTIVE);
    await expect(guard.canActivate(ctx({}).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx({ authorization: 'Bearer nonsense' }).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx({ authorization: 'Basic abc' }).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a customer or admin token signed with the access secret', async () => {
    const { guard, jwt } = build(ACTIVE);
    const access = process.env.JWT_ACCESS_SECRET as string;
    await expect(guard.canActivate(ctx(await bearer(jwt, access, { sub: 'p1', kind: 'customer', roles: [] })).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx(await bearer(jwt, access, { sub: 'p1', kind: 'admin', roles: ['super_admin'] })).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx(await bearer(jwt, access, { sub: 'p1', kind: 'partner', mcp: false })).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an unknown or deactivated partner at once, even with a valid token', async () => {
    const claims = { sub: 'p1', kind: 'partner', mcp: false };
    const missing = build(null);
    await expect(missing.guard.canActivate(ctx(await bearer(missing.jwt, process.env.JWT_PARTNER_SECRET as string, claims)).context)).rejects.toBeInstanceOf(UnauthorizedException);
    const inactive = build({ ...ACTIVE, isActive: false });
    await expect(inactive.guard.canActivate(ctx(await bearer(inactive.jwt, process.env.JWT_PARTNER_SECRET as string, claims)).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('holds back a partner who must change the password, except on the change-password route', async () => {
    const { guard, jwt } = build({ ...ACTIVE, mustChangePassword: true });
    const headers = await bearer(jwt, process.env.JWT_PARTNER_SECRET as string, { sub: 'p1', kind: 'partner', mcp: false });
    const blocked = await guard.canActivate(ctx(headers).context).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(ForbiddenException);
    expect(((blocked as ForbiddenException).getResponse() as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
    await expect(guard.canActivate(ctx(headers, PasswordController).context)).resolves.toBe(true);
  });

  it('touches "last seen" only for an online partner who has not been seen for a minute', async () => {
    const claims = { sub: 'p1', kind: 'partner', mcp: false };
    const stale = build({ ...ACTIVE, isOnline: true, lastSeenAt: new Date(Date.now() - PRESENCE_TOUCH_MS - 1000) });
    await stale.guard.canActivate(ctx(await bearer(stale.jwt, process.env.JWT_PARTNER_SECRET as string, claims)).context);
    expect(stale.updates).toHaveLength(1);

    const fresh = build({ ...ACTIVE, isOnline: true, lastSeenAt: new Date() });
    await fresh.guard.canActivate(ctx(await bearer(fresh.jwt, process.env.JWT_PARTNER_SECRET as string, claims)).context);
    expect(fresh.updates).toHaveLength(0);

    const offline = build({ ...ACTIVE, isOnline: false, lastSeenAt: null });
    await offline.guard.canActivate(ctx(await bearer(offline.jwt, process.env.JWT_PARTNER_SECRET as string, claims)).context);
    expect(offline.updates).toHaveLength(0);
  });
});

describe('partner realm isolation (SP1)', () => {
  it('the customer/admin guard refuses a partner token, signed with either secret', async () => {
    const guard = new JwtAuthGuard(new Reflector(), new JwtService());
    const jwt = new JwtService();
    const signedWithPartnerSecret = await bearer(jwt, process.env.JWT_PARTNER_SECRET as string, { sub: 'p1', kind: 'partner', mcp: false });
    const forgedWithAccessSecret = await bearer(jwt, process.env.JWT_ACCESS_SECRET as string, { sub: 'p1', kind: 'partner', mcp: false });
    await expect(guard.canActivate(ctx(signedWithPartnerSecret).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx(forgedWithAccessSecret).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('the roles guard refuses a partner principal on an admin route', () => {
    class Admin {
      handle(): void {}
    }
    Reflect.defineMetadata('roles', ['order_manager'], Admin);
    const { context, request } = ctx({}, Admin);
    request.user = { sub: 'p1', kind: 'partner', roles: [] };
    expect(() => new RolesGuard(new Reflector()).canActivate(context)).toThrow(ForbiddenException);
  });

  it('the customer refresh endpoint never turns a partner refresh token into a customer session', async () => {
    const row = { id: 'x', principalId: 'p1', principalKind: 'partner', tokenHash: 'h', familyId: 'f', expiresAt: new Date(Date.now() + 1e6), revokedAt: null };
    const updates: unknown[] = [];
    const prisma = {
      refreshToken: { findUnique: async () => row, updateMany: async (a: unknown) => void updates.push(a), create: async () => row, update: async () => row },
    } as unknown as PrismaService;
    const tokens = new TokenService(new JwtService(), prisma);
    await expect(tokens.rotate('any-token')).rejects.toBeInstanceOf(UnauthorizedException);
    await tokens.revoke('any-token');
    expect(updates).toHaveLength(0);
  });
});
