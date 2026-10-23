import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { JwtPrincipal } from './jwt.types';

function contextWith(user: JwtPrincipal | undefined, required: string[] | undefined): {
  ctx: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

const admin = (roles: string[]): JwtPrincipal => ({ sub: 'a1', kind: 'admin', roles: roles as never });
const customer: JwtPrincipal = { sub: 'c1', kind: 'customer', roles: [] };

describe('RolesGuard (SECURITY-08 function-level authz)', () => {
  it('allows when no roles are required', () => {
    const { ctx, reflector } = contextWith(customer, undefined);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies a customer on an admin-only route', () => {
    const { ctx, reflector } = contextWith(customer, ['order_manager']);
    expect(() => new RolesGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows an admin holding the required role', () => {
    const { ctx, reflector } = contextWith(admin(['order_manager']), ['order_manager']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('super_admin satisfies any role requirement', () => {
    const { ctx, reflector } = contextWith(admin(['super_admin']), ['marketing']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies an admin lacking the required role', () => {
    const { ctx, reflector } = contextWith(admin(['support']), ['catalogue_manager']);
    expect(() => new RolesGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });
});
