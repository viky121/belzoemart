import {
  GRANTABLE_PERMISSION_KEYS,
  normalizePermissions,
  permissionGroups,
  withoutPermission,
  type PermissionDef,
} from '@belzo/shared';

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  staffCount: number;
}

export interface StaffRow {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  mfaEnabled: boolean;
  createdAt: string;
  role: { id: string; name: string } | null;
  roleCount: number;
  isSuperAdmin: boolean;
}

/** Tick or untick one permission. Ticking adds what it needs; unticking removes what needs it. */
export function togglePermission(current: readonly string[], key: string, on: boolean): string[] {
  return on ? normalizePermissions([...current, key]) : withoutPermission(current, key);
}

/** The groups a staff type can be given (the Super Admin only ones are not offered). */
export function editableGroups(): { group: string; items: PermissionDef[] }[] {
  return permissionGroups()
    .map((g) => ({ group: g.group, items: g.items.filter((i) => !i.superAdminOnly) }))
    .filter((g) => g.items.length > 0);
}

/** Tick every permission of a group, or clear the group. */
export function setGroup(current: readonly string[], items: readonly PermissionDef[], on: boolean): string[] {
  if (on) return normalizePermissions([...current, ...items.map((i) => i.key)]);
  return items.reduce<string[]>((acc, i) => withoutPermission(acc, i.key), [...current]);
}

export function groupState(current: readonly string[], items: readonly PermissionDef[]): 'none' | 'some' | 'all' {
  const n = items.filter((i) => current.includes(i.key)).length;
  return n === 0 ? 'none' : n === items.length ? 'all' : 'some';
}

/** "12 of 29 permissions" for the list and the editor footer. */
export function permissionSummary(keys: readonly string[]): string {
  const total = GRANTABLE_PERMISSION_KEYS.length;
  const held = keys.filter((k) => (GRANTABLE_PERMISSION_KEYS as readonly string[]).includes(k)).length;
  return `${held} of ${total} permissions`;
}

/** Sensitive permissions that are ticked, for the warning line in the editor. */
export function sensitiveTicked(current: readonly string[]): PermissionDef[] {
  return editableGroups().flatMap((g) => g.items).filter((i) => i.sensitive && current.includes(i.key));
}

/** Types in the order the staff dropdown shows them: not the Super Admin type, alphabetical. */
export function assignableRoles(roles: readonly RoleRow[]): RoleRow[] {
  return roles.filter((r) => !r.isSystem).sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether two permission lists hold the same keys (to know if the editor has unsaved changes). */
export function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((k, i) => k === [...b].sort()[i]);
}
