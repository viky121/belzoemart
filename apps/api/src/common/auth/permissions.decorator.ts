import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@belzo/shared';

/**
 * Who may call an admin route. Function-level authorization is enforced server-side (SECURITY-08);
 * hiding a menu item in the admin panel is only for looks.
 *
 * `@RequirePermission('orders.view', 'orders.manage')` lets in an admin who has ANY of the listed permissions.
 * The Super Admin passes every check. A method-level decorator replaces the class-level one.
 */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...keys: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, keys);

/** Any signed-in, active admin may call this route (for example "who am I"). */
export const ANY_ADMIN_KEY = 'anyAdmin';
export const AnyAdmin = () => SetMetadata(ANY_ADMIN_KEY, true);
