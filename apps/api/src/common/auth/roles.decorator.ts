import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@belzo/shared';

/**
 * Restricts a route to the given admin roles. Function-level authorization is
 * enforced server-side (SECURITY-08) — never rely on client-side hiding.
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
