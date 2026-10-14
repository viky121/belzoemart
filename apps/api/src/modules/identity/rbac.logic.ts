/**
 * Pure RBAC logic (BR-9), separated from the DB-backed service so it can be
 * property-tested in isolation.
 *
 * - `super_admin` implicitly holds every permission.
 * - Otherwise the effective permission set is the union of the permissions
 *   granted by each assigned role.
 */
export const SUPER_ADMIN_ROLE = 'super_admin';

/** Resolve the effective permission set for a set of assigned roles. */
export function resolvePermissions(
  assignedRoles: string[],
  roleGrants: Record<string, string[]>,
  allPermissions: string[],
): string[] {
  if (assignedRoles.includes(SUPER_ADMIN_ROLE)) {
    return [...allPermissions];
  }
  const set = new Set<string>();
  for (const role of assignedRoles) {
    // Use hasOwn to avoid inheriting Object.prototype members when a role name
    // collides with a built-in (e.g. "constructor", "toString").
    const granted = Object.prototype.hasOwnProperty.call(roleGrants, role)
      ? roleGrants[role]
      : undefined;
    for (const perm of granted ?? []) set.add(perm);
  }
  return [...set];
}

/** True if the assigned roles authorize `permission`. */
export function isAuthorized(
  assignedRoles: string[],
  roleGrants: Record<string, string[]>,
  allPermissions: string[],
  permission: string,
): boolean {
  if (assignedRoles.includes(SUPER_ADMIN_ROLE)) return true;
  return resolvePermissions(assignedRoles, roleGrants, allPermissions).includes(permission);
}
