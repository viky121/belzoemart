import { GRANTABLE_PERMISSION_KEYS, permissionDef } from '@belzo/shared';
import {
  assignableRoles,
  editableGroups,
  groupState,
  permissionSummary,
  samePermissions,
  sensitiveTicked,
  setGroup,
  togglePermission,
  type RoleRow,
} from './access-ui';

describe('togglePermission', () => {
  it('ticking edit also ticks view', () => {
    expect(togglePermission([], 'products.edit', true)).toEqual(['products.view', 'products.edit']);
  });
  it('unticking view also unticks what needs it', () => {
    expect(togglePermission(['products.view', 'products.edit', 'orders.view'], 'products.view', false)).toEqual(['orders.view']);
  });
  it('unticking something that is not ticked changes nothing', () => {
    expect(togglePermission(['orders.view'], 'products.edit', false)).toEqual(['orders.view']);
  });
});

describe('groups', () => {
  it('offers every grantable permission and never the Super Admin only ones', () => {
    const keys = editableGroups().flatMap((g) => g.items.map((i) => i.key));
    expect(keys.sort()).toEqual([...GRANTABLE_PERMISSION_KEYS].sort());
    expect(keys).not.toContain('staff.manage');
  });

  it('selects and clears a whole group, keeping dependencies right', () => {
    const products = editableGroups().find((g) => g.group === 'Products')!.items;
    const all = setGroup(['orders.view'], products, true);
    expect(all).toEqual(expect.arrayContaining(['orders.view', 'products.view', 'products.edit', 'products.bulk', 'stock.adjust']));
    expect(groupState(all, products)).toBe('all');
    const cleared = setGroup(all, products, false);
    expect(cleared).toEqual(['orders.view']);
    expect(groupState(cleared, products)).toBe('none');
    expect(groupState(['products.view'], products)).toBe('some');
  });
});

describe('summaries and warnings', () => {
  it('counts permissions out of those that can be given', () => {
    expect(permissionSummary([])).toBe(`0 of ${GRANTABLE_PERMISSION_KEYS.length} permissions`);
    expect(permissionSummary(['orders.view', 'staff.manage', 'nope'])).toBe(`1 of ${GRANTABLE_PERMISSION_KEYS.length} permissions`);
  });

  it('lists the sensitive permissions that are ticked', () => {
    expect(sensitiveTicked(['orders.view'])).toEqual([]);
    expect(sensitiveTicked(['reports.view', 'reports.profit', 'gateway.edit']).map((p) => p.key)).toEqual(['reports.profit', 'gateway.edit']);
    expect(permissionDef('reports.profit')?.sensitive).toBe(true);
  });

  it('notices unsaved changes whatever the order', () => {
    expect(samePermissions(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(samePermissions(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('assignableRoles', () => {
  const role = (name: string, isSystem = false): RoleRow => ({ id: name, name, description: '', isSystem, permissions: [], staffCount: 0 });
  it('leaves out the Super Admin type and sorts by name', () => {
    expect(assignableRoles([role('super_admin', true), role('marketing'), role('accountant')]).map((r) => r.name)).toEqual(['accountant', 'marketing']);
  });
});
