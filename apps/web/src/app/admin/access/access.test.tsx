import { renderToStaticMarkup } from 'react-dom/server';
import { GRANTABLE_PERMISSION_KEYS } from '@belzo/shared';
import { StaticAdminSession, makeCan, type AdminMe } from '../admin-session';
import { NoAccess, Welcome } from '../no-access';
import { PermissionPicker } from './permission-picker';
import { RoleEditor } from './roles-panel';
import { StaffPanel, passwordProblem } from './staff-panel';
import type { RoleRow, StaffRow } from './access-ui';

const me: AdminMe = { id: 'boss', name: 'Boss', email: 'boss@x.in', roles: ['super_admin'], isSuperAdmin: true, mfaEnabled: false, permissions: [] };
const role = (over: Partial<RoleRow> = {}): RoleRow => ({ id: 'r1', name: 'manager', description: 'Runs the shop', isSystem: false, permissions: ['orders.view'], staffCount: 0, ...over });
const person = (over: Partial<StaffRow> = {}): StaffRow => ({
  id: 's1', email: 'ravi@shop.in', name: 'Ravi', status: 'active', mfaEnabled: false, createdAt: '2026-10-01T00:00:00Z',
  role: { id: 'r1', name: 'manager' }, roleCount: 1, isSuperAdmin: false, ...over,
});

describe('PermissionPicker', () => {
  it('shows one tick box per grantable permission and none for staff.manage', () => {
    const html = renderToStaticMarkup(<PermissionPicker value={[]} />);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(GRANTABLE_PERMISSION_KEYS.length);
    expect(html).not.toContain('perm-staff.manage');
    expect(html).toContain('Profit and loss');
    expect(html).toContain('Sensitive');
  });

  it('ticks what is held', () => {
    const html = renderToStaticMarkup(<PermissionPicker value={['orders.view']} />);
    expect(html).toMatch(/<input[^>]*data-testid="perm-orders.view"[^>]*checked=""/);
    expect(html).not.toMatch(/<input[^>]*data-testid="perm-orders.manage"[^>]*checked=""/);
  });

  it('read-only mode disables the boxes and hides select all, and "all" ticks everything', () => {
    const html = renderToStaticMarkup(<PermissionPicker value={[]} readOnly all />);
    expect(html).not.toContain('Select all');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(GRANTABLE_PERMISSION_KEYS.length);
    expect((html.match(/checked=""/g) ?? []).length).toBe(GRANTABLE_PERMISSION_KEYS.length);
  });
});

describe('RoleEditor', () => {
  it('a new type starts empty with a disabled-until-valid save', () => {
    const html = renderToStaticMarkup(<RoleEditor role={null} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('New staff type');
    expect(html).toContain(`0 of ${GRANTABLE_PERMISSION_KEYS.length} permissions`);
    expect(html).toMatch(/data-testid="role-save"/);
  });

  it('editing shows the saved name and permissions, with Save off until something changes', () => {
    const html = renderToStaticMarkup(<RoleEditor role={role()} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('Edit Manager');
    expect(html).toContain('value="Manager"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="role-save"/);
  });

  it('the Super Admin type is read only with every box ticked and no Save button', () => {
    const html = renderToStaticMarkup(<RoleEditor role={role({ name: 'super_admin', isSystem: true })} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('cannot be changed or deleted');
    expect(html).not.toContain('data-testid="role-save"');
    expect((html.match(/checked=""/g) ?? []).length).toBe(GRANTABLE_PERMISSION_KEYS.length);
  });

  it('warns when a sensitive permission is ticked', () => {
    const html = renderToStaticMarkup(<RoleEditor role={role({ permissions: ['reports.view', 'reports.profit'] })} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('data-testid="role-sensitive"');
    expect(html).toContain('profit and loss');
  });
});

describe('StaffPanel', () => {
  const roles = [role({ id: 'super', name: 'super_admin', isSystem: true }), role()];

  it('lists staff with type, status and 2-step login, and marks you', () => {
    const html = renderToStaticMarkup(
      <StaticAdminSession me={me}>
        <StaffPanel
          staff={[person(), person({ id: 'boss', email: 'boss@x.in', name: 'Boss', role: { id: 'super', name: 'super_admin' }, isSuperAdmin: true }), person({ id: 's2', email: 'off@shop.in', name: 'Off', status: 'disabled', mfaEnabled: true })]}
          roles={roles}
          onChanged={() => undefined}
        />
      </StaticAdminSession>,
    );
    expect(html).toContain('Manager');
    expect(html).toContain('Super admin');
    expect(html).toContain('Switched off');
    expect(html).toMatch(/Boss<\/strong><em class="acc-badge">You/);
    expect(html).toContain('data-testid="staff-add"');
  });
});

describe('passwordProblem', () => {
  it('accepts a strong password and explains a weak one', () => {
    expect(passwordProblem('Belzo@2026')).toBeNull();
    expect(passwordProblem('short')).toEqual(expect.any(String));
    expect(passwordProblem('alllowercase1!')).toEqual(expect.any(String));
  });
});

describe('NoAccess and Welcome', () => {
  it('says plainly that there is no access and lists what can be opened', () => {
    const html = renderToStaticMarkup(<NoAccess can={makeCan({ ...me, isSuperAdmin: false, permissions: ['orders.view'] })} />);
    expect(html).toContain('You do not have access');
    expect(html).toContain('href="/admin/orders"');
    expect(html).not.toContain('href="/admin/settings"');
  });

  it('welcomes someone without dashboard access with their own pages', () => {
    const html = renderToStaticMarkup(<Welcome name="Asha" can={makeCan({ ...me, isSuperAdmin: false, permissions: ['customers.view'] })} />);
    expect(html).toContain('Welcome, Asha');
    expect(html).toContain('href="/admin/customers"');
  });

  it('tells someone with no pages at all to ask the Super Admin', () => {
    const html = renderToStaticMarkup(<Welcome name="Asha" can={makeCan({ ...me, isSuperAdmin: false, permissions: [] })} />);
    expect(html).toContain('Ask the Super Admin');
  });
});
