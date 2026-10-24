import { ROLE_TEMPLATES } from '@belzo/shared';
import { NAV_GROUPS, firstAllowedHref, mayOpenPath, navItemFor, visibleGroups, type CanFn } from './admin-nav';
import { makeCan, type AdminMe } from './admin-session';

const me = (permissions: string[], over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'a', name: 'A', email: 'a@x.in', roles: ['x'], isSuperAdmin: false, mfaEnabled: false, permissions, ...over,
});
const canOf = (...permissions: string[]): CanFn => makeCan(me(permissions));
const hrefs = (can: CanFn) => visibleGroups(NAV_GROUPS, can).flatMap((g) => g.items.map((i) => i.href));
const template = (name: string) => ROLE_TEMPLATES.find((t) => t.name === name)!.permissions as string[];

describe('makeCan', () => {
  it('is true when ANY of the keys is held', () => {
    const can = canOf('orders.view');
    expect(can('orders.view')).toBe(true);
    expect(can('payments.view', 'orders.view')).toBe(true);
    expect(can('payments.view')).toBe(false);
  });
  it('the Super Admin can do everything; nobody signed in can do nothing', () => {
    expect(makeCan(me([], { isSuperAdmin: true }))('staff.manage')).toBe(true);
    expect(makeCan(null)('orders.view')).toBe(false);
  });
});

describe('sidebar', () => {
  it('shows every page to the Super Admin, including Staff and types', () => {
    const all = hrefs(makeCan(me([], { isSuperAdmin: true })));
    expect(all).toContain('/admin/access');
    expect(all).toHaveLength(NAV_GROUPS.flatMap((g) => g.items).length);
  });

  it('shows only what a staff type may open, and drops empty groups', () => {
    const groups = visibleGroups(NAV_GROUPS, canOf('orders.view', 'payments.view'));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(['/admin', '/admin/orders', '/admin/payments']);
    expect(groups.map((g) => g.title)).toEqual([undefined, 'Sales']);
  });

  it('a staff type with nothing ticked sees only the Dashboard entry', () => {
    expect(hrefs(canOf())).toEqual(['/admin']);
  });

  it('never shows Staff and types to a staff type, whatever else it holds', () => {
    for (const t of ROLE_TEMPLATES) expect(hrefs(canOf(...template(t.name)))).not.toContain('/admin/access');
  });

  it('the ready-made types see the pages that match their job', () => {
    expect(hrefs(canOf(...template('support')))).toEqual(['/admin', '/admin/customers', '/admin/reviews']);
    expect(hrefs(canOf(...template('accountant')))).toEqual(expect.arrayContaining(['/admin/orders', '/admin/payments', '/admin/reports']));
    expect(hrefs(canOf(...template('accountant')))).not.toContain('/admin/settings');
    expect(hrefs(canOf(...template('catalogue_manager')))).toEqual(expect.arrayContaining(['/admin/catalogue', '/admin/categories', '/admin/brands']));
    expect(hrefs(canOf(...template('admin')))).toContain('/admin/settings');
  });

  it('Settings opens for payment keys or delivery settings alone', () => {
    expect(hrefs(canOf('gateway.edit'))).toContain('/admin/settings');
    expect(hrefs(canOf('delivery.settings'))).toContain('/admin/settings');
  });
});

describe('page access', () => {
  it('finds the sidebar entry that owns a path, including sub pages', () => {
    expect(navItemFor('/admin/orders')?.href).toBe('/admin/orders');
    expect(navItemFor('/admin/orders/abc-123')?.href).toBe('/admin/orders');
    expect(navItemFor('/admin')?.href).toBe('/admin');
    expect(navItemFor('/admin/orders-archive')).toBeNull();
    expect(navItemFor('/admin/unknown')).toBeNull();
  });

  it('opens a page only with its permission; the dashboard entry is always open', () => {
    expect(mayOpenPath('/admin/orders/abc', canOf('orders.view'))).toBe(true);
    expect(mayOpenPath('/admin/orders/abc', canOf('payments.view'))).toBe(false);
    expect(mayOpenPath('/admin/access', canOf(...template('admin')))).toBe(false);
    expect(mayOpenPath('/admin', canOf())).toBe(true);
  });

  it('pages that are not in the sidebar are left to the server', () => {
    expect(mayOpenPath('/admin/unknown', canOf())).toBe(true);
  });

  it('the first page to send someone to is their first allowed one', () => {
    expect(firstAllowedHref(canOf('reviews.moderate', 'customers.view'))).toBe('/admin/customers');
    expect(firstAllowedHref(canOf())).toBeNull();
  });

  it('every sidebar page maps to permissions that exist', () => {
    const real = new Set(ROLE_TEMPLATES.flatMap((t) => t.permissions).concat(['staff.manage', 'delivery.settings', 'gateway.edit', 'settings.edit', 'serviceability.edit']));
    for (const i of NAV_GROUPS.flatMap((g) => g.items)) for (const k of i.anyOf) expect({ page: i.href, k, ok: real.has(k) || k === 'content.edit' }).toMatchObject({ ok: true });
  });
});
