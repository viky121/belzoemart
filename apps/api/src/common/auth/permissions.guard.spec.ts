import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAccessService, type AdminAccess } from './admin-access.service';
import type { JwtPrincipal } from './jwt.types';
import { AnyAdmin, RequirePermission } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { Public } from './public.decorator';

// Real decorated classes, so the guard reads real metadata (method rules replace class rules).
@RequirePermission('products.view')
class ProductsLike {
  inherits() {}
  @RequirePermission('products.edit')
  overrides() {}
  @RequirePermission('orders.view', 'orders.manage')
  anyOf() {}
  @AnyAdmin()
  anyAdmin() {}
  @Public()
  open() {}
}
class NoRules {
  plain() {}
}

const access = (over: Partial<AdminAccess> = {}): AdminAccess => ({
  adminId: 'a1',
  status: 'active',
  roles: ['manager'],
  isSuperAdmin: false,
  permissions: new Set<string>(),
  ...over,
});

function run(opts: {
  klass: new () => object;
  method: string;
  user?: JwtPrincipal;
  url?: string;
  found?: AdminAccess | null;
}) {
  const reflector = new Reflector();
  const lookup = jest.fn(async () => (opts.found === undefined ? access() : opts.found));
  const guard = new PermissionsGuard(reflector, { get: lookup } as unknown as AdminAccessService);
  const request: { user?: JwtPrincipal; originalUrl: string; adminAccess?: AdminAccess } = {
    user: opts.user,
    originalUrl: opts.url ?? '/api/v1/admin/things',
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (opts.klass.prototype as Record<string, () => void>)[opts.method],
    getClass: () => opts.klass,
  } as unknown as ExecutionContext;
  return { call: () => guard.canActivate(ctx), request, lookup };
}

const admin: JwtPrincipal = { sub: 'a1', kind: 'admin', roles: [] };
const customer: JwtPrincipal = { sub: 'c1', kind: 'customer', roles: [] };

describe('PermissionsGuard (SECURITY-08 function-level authz)', () => {
  it('lets a public route through without looking anything up', async () => {
    const t = run({ klass: ProductsLike, method: 'open' });
    await expect(t.call()).resolves.toBe(true);
    expect(t.lookup).not.toHaveBeenCalled();
  });

  it('lets a customer route with no rule through, but never an admin route with no rule (fail closed)', async () => {
    await expect(run({ klass: NoRules, method: 'plain', user: customer, url: '/api/v1/orders' }).call()).resolves.toBe(true);
    await expect(run({ klass: NoRules, method: 'plain', user: admin, url: '/api/v1/admin/forgotten?x=1' }).call()).rejects.toThrow(/no access rule/);
    await expect(run({ klass: NoRules, method: 'plain', user: customer, url: '/api/v1/admin' }).call()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not treat a look-alike path as the admin area', async () => {
    await expect(run({ klass: NoRules, method: 'plain', user: customer, url: '/api/v1/administration/x' }).call()).resolves.toBe(true);
  });

  it('refuses a customer and a request with no user on an admin rule', async () => {
    await expect(run({ klass: ProductsLike, method: 'inherits', user: customer }).call()).rejects.toThrow(/Admin privileges required/);
    await expect(run({ klass: ProductsLike, method: 'inherits' }).call()).rejects.toThrow(/Admin privileges required/);
  });

  it('refuses an admin who no longer exists (401) and one who is switched off (403)', async () => {
    await expect(run({ klass: ProductsLike, method: 'inherits', user: admin, found: null }).call()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      run({ klass: ProductsLike, method: 'inherits', user: admin, found: access({ status: 'disabled', permissions: new Set(['products.view']) }) }).call(),
    ).rejects.toThrow(/Account disabled/);
  });

  it('allows an admin who holds the permission, and hands the access to the handler', async () => {
    const t = run({ klass: ProductsLike, method: 'inherits', user: admin, found: access({ permissions: new Set(['products.view']) }) });
    await expect(t.call()).resolves.toBe(true);
    expect(t.request.adminAccess?.adminId).toBe('a1');
  });

  it('refuses an admin who lacks the permission', async () => {
    await expect(run({ klass: ProductsLike, method: 'inherits', user: admin, found: access({ permissions: new Set(['orders.view']) }) }).call()).rejects.toThrow(
      /do not have permission/,
    );
  });

  it('a method rule replaces the class rule (view is not enough for an edit route)', async () => {
    const viewer = access({ permissions: new Set(['products.view']) });
    await expect(run({ klass: ProductsLike, method: 'overrides', user: admin, found: viewer }).call()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ klass: ProductsLike, method: 'overrides', user: admin, found: access({ permissions: new Set(['products.edit']) }) }).call()).resolves.toBe(true);
  });

  it('several permissions on one route mean ANY of them', async () => {
    await expect(run({ klass: ProductsLike, method: 'anyOf', user: admin, found: access({ permissions: new Set(['orders.manage']) }) }).call()).resolves.toBe(true);
    await expect(run({ klass: ProductsLike, method: 'anyOf', user: admin, found: access({ permissions: new Set(['payments.view']) }) }).call()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the Super Admin passes every rule', async () => {
    const sa = access({ isSuperAdmin: true, roles: ['super_admin'] });
    await expect(run({ klass: ProductsLike, method: 'overrides', user: admin, found: sa }).call()).resolves.toBe(true);
    await expect(run({ klass: ProductsLike, method: 'anyOf', user: admin, found: sa }).call()).resolves.toBe(true);
  });

  it('AnyAdmin lets in any active admin (even with no permissions), but still not a customer or a switched-off admin', async () => {
    await expect(run({ klass: ProductsLike, method: 'anyAdmin', user: admin, found: access() }).call()).resolves.toBe(true);
    await expect(run({ klass: ProductsLike, method: 'anyAdmin', user: customer }).call()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ klass: ProductsLike, method: 'anyAdmin', user: admin, found: access({ status: 'disabled' }) }).call()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
