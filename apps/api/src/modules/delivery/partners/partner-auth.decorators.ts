import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPartner } from './partner-auth.types';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChange';

/** Lets a partner who must change their password reach this route (only the change-password route needs it). */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

/**
 * The partner behind the request, set by PartnerAuthGuard. Controllers take the partner id from
 * here and never from the URL or body (SP2).
 */
export const CurrentPartner = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedPartner => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.partner as AuthenticatedPartner;
});
