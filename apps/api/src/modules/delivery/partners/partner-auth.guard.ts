import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ALLOW_PASSWORD_CHANGE_KEY } from './partner-auth.decorators';
import { PartnerTokenService } from './partner-token.service';

/** An online partner's "last seen" time is refreshed at most this often (BR-D8). */
export const PRESENCE_TOUCH_MS = 60_000;

/**
 * Authentication for the partner realm (SP1). Partner controllers are marked `@Public()` for
 * the global JwtAuthGuard (which only knows customer and admin tokens) and use this guard
 * instead. It verifies the token with JWT_PARTNER_SECRET, loads the partner from the database
 * on every request so deactivation takes effect at once, and holds back a partner who still
 * has to change their password (BR-D5).
 */
@Injectable()
export class PartnerAuthGuard implements CanActivate {
  private readonly logger = new Logger('PartnerAuthGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: PartnerTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing access token');

    let partnerId: string;
    try {
      partnerId = (await this.tokens.verifyAccess(header.slice(7))).sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, mobile: true, isActive: true, isOnline: true, mustChangePassword: true, lastSeenAt: true },
    });
    if (!partner || !partner.isActive) throw new UnauthorizedException('Invalid or expired token');

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [context.getHandler(), context.getClass()]);
    if (partner.mustChangePassword && !allowed) {
      throw new ForbiddenException({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please set a new password to continue' });
    }

    request.partner = {
      id: partner.id,
      name: partner.name,
      mobile: partner.mobile,
      mustChangePassword: partner.mustChangePassword,
      isOnline: partner.isOnline,
    };

    // Presence: any call by an online partner counts as a heartbeat. Never blocks the request.
    if (partner.isOnline && (!partner.lastSeenAt || Date.now() - partner.lastSeenAt.getTime() > PRESENCE_TOUCH_MS)) {
      this.prisma.deliveryPartner
        .update({ where: { id: partner.id }, data: { lastSeenAt: new Date() } })
        .catch((e: unknown) => this.logger.warn(`presence update failed: ${e instanceof Error ? e.message : String(e)}`));
    }
    return true;
  }
}
