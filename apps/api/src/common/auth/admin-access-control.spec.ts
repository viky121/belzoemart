import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_PERMISSION_KEYS, isPermissionKey } from '@belzo/shared';
import { ANY_ADMIN_KEY, PERMISSIONS_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * A safety net for the whole admin panel (SECURITY-08): every route under /admin must say which permission it
 * needs. A new admin route added without a rule fails this test (and would also be refused at run time).
 */
type Fn = (...a: never[]) => unknown;
interface Route {
  where: string;
  url: string;
  method: string;
  rule: string[] | 'any-admin' | 'public' | 'none';
}

const meta = <T>(key: string, target: object): T | undefined => Reflect.getMetadata(key, target) as T | undefined;
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return /\.controller\.ts$/.test(e.name) ? [full] : [];
  });
}

function collect(): Route[] {
  const out: Route[] = [];
  for (const file of files(path.join(__dirname, '../../'))) {
    const mod = require(file) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (typeof value !== 'function') continue;
      const base = meta<string | string[]>('path', value);
      if (base === undefined) continue; // not a controller
      const basePath = String(Array.isArray(base) ? base[0] : base);
      for (const name of Object.getOwnPropertyNames(value.prototype)) {
        if (name === 'constructor') continue;
        const handler = (value.prototype as Record<string, Fn>)[name];
        if (typeof handler !== 'function') continue;
        const sub = meta<string>('path', handler);
        const method = meta<number>('method', handler);
        if (sub === undefined || method === undefined) continue;
        const isPublic = meta<boolean>(IS_PUBLIC_KEY, handler) ?? meta<boolean>(IS_PUBLIC_KEY, value) ?? false;
        const anyAdmin = meta<boolean>(ANY_ADMIN_KEY, handler) === true;
        const perms = meta<string[]>(PERMISSIONS_KEY, handler) ?? meta<string[]>(PERMISSIONS_KEY, value);
        out.push({
          where: `${value.name}.${name}`,
          url: `/${[basePath, sub].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`,
          method: METHODS[method] ?? String(method),
          rule: isPublic ? 'public' : anyAdmin ? 'any-admin' : perms && perms.length > 0 ? perms : 'none',
        });
      }
    }
  }
  return out;
}

const routes = collect();
const adminRoutes = routes.filter((r) => /^\/admin(\/|$)/.test(r.url));
const find = (method: string, url: string) => adminRoutes.find((r) => r.method === method && r.url === url);

describe('admin access control', () => {
  it('finds the admin routes (so the checks below are not empty)', () => {
    expect(adminRoutes.length).toBeGreaterThan(100);
    expect(new Set(adminRoutes.map((r) => r.where.split('.')[0])).size).toBeGreaterThan(15);
  });

  it('every admin route has an access rule, or is one of the sign-in routes', () => {
    const missing = adminRoutes.filter((r) => r.rule === 'none').map((r) => `${r.method} ${r.url} (${r.where})`);
    expect(missing).toEqual([]);
  });

  it('only login, refresh and logout are open to the public in the admin area', () => {
    const open = adminRoutes.filter((r) => r.rule === 'public').map((r) => `${r.method} ${r.url}`).sort();
    expect(open).toEqual(['POST /admin/auth/login', 'POST /admin/auth/logout', 'POST /admin/auth/refresh']);
  });

  it('every permission named on a route is a real one', () => {
    for (const r of adminRoutes) {
      if (Array.isArray(r.rule)) for (const k of r.rule) expect({ route: r.where, key: k, real: isPermissionKey(k) }).toEqual({ route: r.where, key: k, real: true });
    }
  });

  it('every permission in the list guards at least one route (reports.export is checked inside the report handlers)', () => {
    const used = new Set(adminRoutes.flatMap((r) => (Array.isArray(r.rule) ? r.rule : [])));
    const unused = ALL_PERMISSION_KEYS.filter((k) => !used.has(k) && k !== 'reports.export');
    expect(unused).toEqual([]);
  });

  it('the only route open to any signed-in admin is "who am I"', () => {
    expect(adminRoutes.filter((r) => r.rule === 'any-admin').map((r) => `${r.method} ${r.url}`)).toEqual(['GET /admin/auth/me']);
  });

  describe('sensitive routes stay behind the right permission', () => {
    const only = (method: string, url: string, expected: string[]) => {
      const r = find(method, url);
      expect({ route: `${method} ${url}`, rule: r?.rule }).toEqual({ route: `${method} ${url}`, rule: expected });
    };

    it('staff and staff types: staff.manage only', () => {
      for (const [m, u] of [
        ['GET', '/admin/users'], ['POST', '/admin/users'], ['PATCH', '/admin/users/:id'], ['POST', '/admin/users/:id/password'],
        ['POST', '/admin/users/:id/mfa'], ['DELETE', '/admin/users/:id/mfa'], ['GET', '/admin/roles'], ['POST', '/admin/roles'],
        ['PATCH', '/admin/roles/:id'], ['DELETE', '/admin/roles/:id'],
      ] as const) only(m, u, ['staff.manage']);
    });

    it('payment and SMS keys: gateway.edit only', () => {
      for (const [m, u] of [
        ['GET', '/admin/payment-gateway/status'], ['PUT', '/admin/payment-gateway/credentials'], ['DELETE', '/admin/payment-gateway/credentials'],
        ['POST', '/admin/payment-gateway/test'], ['GET', '/admin/sms-gateway/status'], ['PUT', '/admin/sms-gateway/credentials'],
      ] as const) only(m, u, ['gateway.edit']);
    });

    it('settings, serviceability, audit log, profit report and delivery settings', () => {
      only('GET', '/admin/settings', ['settings.edit']);
      only('PUT', '/admin/settings', ['settings.edit']);
      only('PUT', '/admin/serviceability', ['serviceability.edit']);
      only('GET', '/admin/audit', ['audit.view']);
      only('GET', '/admin/report/profit-loss', ['reports.profit']);
      only('PUT', '/admin/delivery/settings', ['delivery.settings']);
    });

    it('viewing and changing are separate: orders, products and customers', () => {
      only('GET', '/admin/orders', ['orders.view']);
      only('PATCH', '/admin/orders/:id/status', ['orders.manage']);
      only('POST', '/admin/orders/:id/cancel', ['orders.manage']);
      only('PATCH', '/admin/orders/returns/:returnId', ['returns.manage']);
      only('POST', '/admin/products', ['products.edit']);
      only('POST', '/admin/products/bulk-v2', ['products.bulk']);
      only('POST', '/admin/inventory/:variantId/adjust', ['stock.adjust']);
      only('PATCH', '/admin/customers/:id/status', ['customers.block']);
      only('GET', '/admin/customers', ['customers.view']);
    });

    it('the legacy reports routes and the new report route are guarded by report permissions', () => {
      only('GET', '/admin/report/:id', ['reports.view']);
      only('GET', '/admin/reports/gst', ['reports.view']);
      only('GET', '/admin/payments', ['payments.view']);
    });
  });
});
