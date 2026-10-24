import fc from 'fast-check';
import {
  ALL_PERMISSION_KEYS,
  GRANTABLE_PERMISSION_KEYS,
  PERMISSION_DEFS,
  ROLE_TEMPLATES,
  isPermissionKey,
  normalizePermissions,
  permissionDef,
  permissionGroups,
  roleLabel,
  validRoleName,
  withoutPermission,
  type PermissionDef,
} from './permissions';

const defs = PERMISSION_DEFS as readonly PermissionDef[];

describe('permission catalogue', () => {
  it('has unique keys written as area.action', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z]+\.[a-z]+$/);
  });

  it('every "requires" points at a real permission of the same area, never at itself', () => {
    for (const d of defs) {
      for (const r of d.requires ?? []) {
        expect(isPermissionKey(r)).toBe(true);
        expect(r).not.toBe(d.key);
      }
    }
  });

  it('only staff.manage is kept back for the Super Admin', () => {
    expect(ALL_PERMISSION_KEYS.filter((k) => !GRANTABLE_PERMISSION_KEYS.includes(k))).toEqual(['staff.manage']);
  });

  it('flags the permissions that show cost, profit, settings or keys as sensitive', () => {
    const sensitive = defs.filter((d) => d.sensitive).map((d) => d.key);
    expect(sensitive).toEqual(expect.arrayContaining(['reports.profit', 'settings.edit', 'gateway.edit', 'audit.view', 'delivery.settings', 'staff.manage']));
  });

  it('groups for the editor keep catalogue order and lose nothing', () => {
    const flat = permissionGroups().flatMap((g) => g.items.map((i) => i.key));
    expect([...flat].sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    expect(permissionGroups()[0]!.group).toBe('Dashboard');
    expect(permissionDef('orders.manage')?.requires).toEqual(['orders.view']);
  });
});

describe('normalizePermissions / withoutPermission', () => {
  it('adds what a permission needs', () => {
    expect(normalizePermissions(['products.bulk'])).toEqual(['products.view', 'products.edit', 'products.bulk']);
    expect(normalizePermissions(['orders.manage'])).toEqual(['orders.view', 'orders.manage']);
  });

  it('drops unknown keys, duplicates and keys that cannot be granted', () => {
    expect(normalizePermissions(['nope', 'orders.view', 'orders.view', 'staff.manage'])).toEqual(['orders.view']);
    expect(normalizePermissions(['staff.manage'], { allowSuperAdminOnly: true })).toEqual(['staff.manage']);
  });

  it('unticking a view also unticks what needs it', () => {
    expect(withoutPermission(['products.view', 'products.edit', 'products.bulk', 'orders.view'], 'products.view')).toEqual(['orders.view']);
    expect(withoutPermission(['products.view', 'products.edit'], 'products.edit')).toEqual(['products.view']);
  });

  it('PBT: the result is grantable, closed under "requires", in catalogue order and stable', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.constantFrom(...ALL_PERMISSION_KEYS), fc.string()), { maxLength: 40 }), (input) => {
        const out = normalizePermissions(input);
        for (const k of out) {
          expect(GRANTABLE_PERMISSION_KEYS).toContain(k);
          for (const need of permissionDef(k)?.requires ?? []) expect(out).toContain(need);
        }
        expect(normalizePermissions(out)).toEqual(out);
        expect(out).toEqual(ALL_PERMISSION_KEYS.filter((k) => out.includes(k)));
      }),
    );
  });

  it('PBT: unticking never leaves a permission without what it needs', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...GRANTABLE_PERMISSION_KEYS), { maxLength: 30 }), fc.constantFrom(...GRANTABLE_PERMISSION_KEYS), (input, drop) => {
        const out = withoutPermission(normalizePermissions(input), drop);
        expect(out).not.toContain(drop);
        for (const k of out) for (const need of permissionDef(k)?.requires ?? []) expect(out).toContain(need);
      }),
    );
  });
});

describe('ready-made staff types', () => {
  it('has the five old types and the three new starters', () => {
    expect(ROLE_TEMPLATES.map((t) => t.name)).toEqual([
      'admin', 'manager', 'accountant', 'catalogue_manager', 'order_manager', 'marketing', 'support',
    ]);
  });

  it('only grants real, grantable permissions and is closed under "requires"', () => {
    for (const t of ROLE_TEMPLATES) {
      expect(t.permissions.length).toBeGreaterThan(0);
      expect(normalizePermissions(t.permissions)).toEqual(t.permissions);
    }
  });

  it('Admin gets everything except staff, payment and SMS keys and the audit log', () => {
    const admin = ROLE_TEMPLATES.find((t) => t.name === 'admin')!;
    expect(ALL_PERMISSION_KEYS.filter((k) => !admin.permissions.includes(k)).sort()).toEqual(['audit.view', 'gateway.edit', 'staff.manage']);
  });

  it('Accountant can read the money side including profit and loss, and edit nothing', () => {
    const acc = ROLE_TEMPLATES.find((t) => t.name === 'accountant')!;
    expect(acc.permissions).toEqual(expect.arrayContaining(['reports.view', 'reports.export', 'reports.profit', 'payments.view', 'orders.view']));
    expect(acc.permissions.filter((k) => /\.(edit|manage|bulk|adjust|block|moderate)$/.test(k))).toEqual([]);
  });

  it('keeps the old types close to what they could do before', () => {
    const by = (n: string) => ROLE_TEMPLATES.find((t) => t.name === n)!.permissions;
    expect(by('support')).toEqual(['customers.view', 'reviews.moderate']);
    expect(by('order_manager')).toEqual(expect.arrayContaining(['orders.manage', 'returns.manage', 'delivery.jobs', 'delivery.partners']));
    expect(by('order_manager')).not.toContain('reports.profit');
    expect(by('marketing')).toEqual(expect.arrayContaining(['coupons.edit', 'content.edit', 'mobile.edit']));
    expect(by('catalogue_manager')).toEqual(expect.arrayContaining(['products.edit', 'taxonomy.edit', 'stock.adjust']));
  });

  it('no starter holds a Super Admin only permission', () => {
    for (const t of ROLE_TEMPLATES) expect(t.permissions).not.toContain('staff.manage');
  });
});

describe('role names', () => {
  it('accepts normal names and tidies spaces', () => {
    expect(validRoleName('  Store   Manager ')).toBe('Store Manager');
    expect(validRoleName('Accounts & Finance')).toBe('Accounts & Finance');
  });

  it('refuses empty, too long, odd and reserved names', () => {
    expect(validRoleName('A')).toBeNull();
    expect(validRoleName('x'.repeat(41))).toBeNull();
    expect(validRoleName('<script>')).toBeNull();
    expect(validRoleName('Super Admin')).toBeNull();
    expect(validRoleName('super-admin')).toBeNull();
    expect(validRoleName('SUPER_ADMIN')).toBeNull();
  });

  it('shows old snake_case names nicely and leaves nice names alone', () => {
    expect(roleLabel('order_manager')).toBe('Order manager');
    expect(roleLabel('support')).toBe('Support');
    expect(roleLabel('Store Manager')).toBe('Store Manager');
  });
});
