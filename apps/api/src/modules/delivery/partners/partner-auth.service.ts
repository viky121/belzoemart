import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PasswordService } from '../../identity/password.service';
import { LockoutService } from '../../identity/lockout.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import { PartnerTokenService } from './partner-token.service';
import type { PartnerIssuedTokens } from './partner-auth.types';

export interface PartnerSession {
  id: string;
  name: string;
  mobile: string;
  mustChangePassword: boolean;
}

/** Lock-out is tracked per mobile but kept apart from customers who may share the number. */
export const partnerLoginKey = (mobile: string): string => `partner:${mobile}`;

/**
 * Partner login, refresh, logout and password change (BR-D2 to BR-D6, SP3).
 * Unknown mobile, wrong password and inactive partner all answer the same 401, and a
 * dummy hash is checked for unknown mobiles so response time does not give the answer away.
 */
@Injectable()
export class PartnerAuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly lockout: LockoutService,
    private readonly tokens: PartnerTokenService,
    private readonly security: DeliverySecurityEvents,
  ) {}

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }

  async login(mobile: string, password: string, ip?: string): Promise<{ tokens: PartnerIssuedTokens; partner: PartnerSession }> {
    const key = partnerLoginKey(mobile);
    if (await this.lockout.isLocked(key)) {
      await this.security.record(SECURITY_EVENTS.LOGIN_LOCKED, { mobile, ip });
      throw new HttpException('Too many attempts. Please try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const partner = await this.prisma.deliveryPartner.findUnique({ where: { mobile } });
    const passwordOk = await this.passwords.verify(partner?.passwordHash ?? (await this.getDummyHash()), password);

    if (!partner || !passwordOk || !partner.isActive) {
      await this.lockout.record(key, 'partner', false, ip);
      await this.security.record(SECURITY_EVENTS.LOGIN_FAILED, { mobile, ip });
      throw new UnauthorizedException('Invalid mobile or password');
    }

    await this.lockout.record(key, 'partner', true, ip);
    const tokens = await this.tokens.issue(partner.id, partner.mustChangePassword);
    return {
      tokens,
      partner: { id: partner.id, name: partner.name, mobile: partner.mobile, mustChangePassword: partner.mustChangePassword },
    };
  }

  refresh(refreshToken: string): Promise<PartnerIssuedTokens> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  /**
   * Change the partner's own password. The new password's strength and difference from the old
   * one are checked by the request schema; here the current password is verified. Other devices
   * are signed out; the one that presented `currentRefreshToken` stays.
   */
  async changePassword(partnerId: string, currentPassword: string, newPassword: string, currentRefreshToken?: string): Promise<void> {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { id: partnerId } });
    if (!partner || !partner.isActive) throw new UnauthorizedException('Invalid or expired token');
    // A stolen access token must not be able to guess the current password: same lockout as login.
    const key = partnerLoginKey(partner.mobile);
    if (await this.lockout.isLocked(key)) {
      await this.security.record(SECURITY_EVENTS.LOGIN_LOCKED, { mobile: partner.mobile, context: 'change-password' });
      throw new HttpException('Too many attempts. Please try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await this.passwords.verify(partner.passwordHash, currentPassword))) {
      await this.lockout.record(key, 'partner', false);
      await this.security.record(SECURITY_EVENTS.LOGIN_FAILED, { mobile: partner.mobile, context: 'change-password' });
      throw new UnauthorizedException('Current password is not correct');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.deliveryPartner.update({ where: { id: partnerId }, data: { passwordHash, mustChangePassword: false } });
    await this.tokens.revokeOthers(partnerId, currentRefreshToken);
  }
}
