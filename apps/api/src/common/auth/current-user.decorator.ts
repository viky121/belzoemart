import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPrincipal } from './jwt.types';

/**
 * Injects the authenticated principal (set by JwtAuthGuard) into a handler
 * parameter. Throws nothing — routes behind the guard always have a user; use
 * @Public() routes without this decorator.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPrincipal => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as JwtPrincipal;
  },
);
