import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AdminRole } from '@belzo/shared';
import { ROLES_KEY } from './roles.decorator';

/**
 * Function-level authorization (SECURITY-08). Enforces that the authenticated
 * principal is an admin holding one of the required roles. `super_admin`
 * implicitly satisfies every role requirement.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user || user.kind !== 'admin') {
      throw new ForbiddenException('Admin privileges required');
    }
    if (user.roles.includes('super_admin')) return true;
    const ok = required.some((r) => user.roles.includes(r));
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
