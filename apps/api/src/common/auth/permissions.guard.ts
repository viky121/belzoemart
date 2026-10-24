import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PermissionKey } from '@belzo/shared';
import { AdminAccessService, type AdminAccess } from './admin-access.service';
import { ANY_ADMIN_KEY, PERMISSIONS_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

declare module 'express' {
  interface Request {
    /** Set by PermissionsGuard on admin routes: what this admin may do right now. */
    adminAccess?: AdminAccess;
  }
}

/** Every admin route lives under this path. A route there with no access rule is refused (fail closed). */
const ADMIN_AREA = /^\/api\/v1\/admin(\/|$)/;

/**
 * Function-level authorization (SECURITY-08). An admin route must say which permission it needs. The admin's
 * CURRENT access is read from the database (briefly cached), so switching a staff member off or changing a
 * staff type applies on the next request, not at the next login. The Super Admin passes every rule.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AdminAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    // @AnyAdmin() on the method wins over a permission on the class (a method rule replaces a class rule).
    const anyAdmin = this.reflector.getAllAndOverride<boolean | undefined>(ANY_ADMIN_KEY, targets) === true;
    const methodAnyAdmin = this.reflector.get<boolean | undefined>(ANY_ADMIN_KEY, context.getHandler()) === true;
    const required = methodAnyAdmin
      ? []
      : (this.reflector.getAllAndOverride<PermissionKey[] | undefined>(PERMISSIONS_KEY, targets) ?? []);
    const request = context.switchToHttp().getRequest<Request>();

    if (required.length === 0 && !anyAdmin) {
      // Customer routes carry no rule. An admin route with no rule is a mistake: never leave it open.
      if (ADMIN_AREA.test((request.originalUrl ?? request.url ?? '').split('?')[0] ?? '')) {
        throw new ForbiddenException('This admin route has no access rule');
      }
      return true;
    }

    const user = request.user;
    if (!user || user.kind !== 'admin') throw new ForbiddenException('Admin privileges required');

    const access = await this.access.get(user.sub);
    if (!access) throw new UnauthorizedException('Admin account not found');
    if (access.status !== 'active') throw new ForbiddenException('Account disabled');
    request.adminAccess = access;

    if (required.length === 0) return true; // AnyAdmin
    if (access.isSuperAdmin || required.some((k) => access.permissions.has(k))) return true;
    throw new ForbiddenException('You do not have permission for this');
  }
}
