import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import type { PartnerIssuedTokens, PartnerTokenClaims } from './partner-auth.types';

/**
 * Issues and rotates partner tokens (SP1, SP3). Access tokens are short-lived JWTs signed with
 * JWT_PARTNER_SECRET. Refresh tokens are opaque; only their SHA-256 hash is stored, and
 * presenting a revoked one revokes the whole family (reuse detection). Partner rows use
 * `principalKind = 'partner'` in the shared refresh-token table.
 */
@Injectable()
export class PartnerTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly security: DeliverySecurityEvents,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private secret(): string {
    return process.env.JWT_PARTNER_SECRET ?? '';
  }

  private accessTtl(): number {
    return Number(process.env.JWT_ACCESS_TTL ?? 900);
  }

  private refreshTtl(): number {
    return Number(process.env.PARTNER_REFRESH_TTL ?? 604_800);
  }

  signAccess(partnerId: string, mustChangePassword: boolean): Promise<string> {
    const claims: PartnerTokenClaims = { sub: partnerId, kind: 'partner', mcp: mustChangePassword };
    return this.jwt.signAsync(claims, { secret: this.secret(), expiresIn: this.accessTtl() });
  }

  /** Verify signature and expiry with the partner secret; fails for customer and admin tokens. */
  async verifyAccess(token: string): Promise<PartnerTokenClaims> {
    const claims = await this.jwt.verifyAsync<PartnerTokenClaims>(token, { secret: this.secret() });
    if (claims.kind !== 'partner' || !claims.sub) throw new Error('not a partner token');
    return claims;
  }

  /** A fresh access + refresh pair, in a new family unless one is given. */
  async issue(partnerId: string, mustChangePassword: boolean, familyId: string = randomUUID()): Promise<PartnerIssuedTokens> {
    const accessToken = await this.signAccess(partnerId, mustChangePassword);
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        principalId: partnerId,
        principalKind: 'partner',
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.accessTtl() };
  }

  /** Swap a refresh token for a new pair. Reuse of an old token revokes the family. */
  async rotate(refreshToken: string): Promise<PartnerIssuedTokens> {
    const tokenHash = this.hash(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.principalKind !== 'partner') throw new UnauthorizedException('Invalid refresh token');

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.security.record(SECURITY_EVENTS.TOKEN_REUSE, { partnerId: existing.principalId });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh token expired');

    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: existing.principalId },
      select: { isActive: true, mustChangePassword: true },
    });
    if (!partner || !partner.isActive) {
      await this.revokeFamily(existing.familyId);
      throw new ForbiddenException('Account is not active');
    }

    const next = await this.issue(existing.principalId, partner.mustChangePassword, existing.familyId);
    const replacement = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(next.refreshToken) } });
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date(), replacedById: replacement?.id },
    });
    return next;
  }

  /** Sign out: revoke the token's whole family. */
  async revoke(refreshToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(refreshToken) } });
    if (!existing || existing.principalKind !== 'partner') return;
    await this.revokeFamily(existing.familyId);
  }

  /** Sign a partner out everywhere (deactivation, password reset by an admin). */
  async revokeAllFor(partnerId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { principalId: partnerId, principalKind: 'partner', revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** After a password change: sign out every other device, keep the one that presented `keepRefreshToken`. */
  async revokeOthers(partnerId: string, keepRefreshToken?: string): Promise<void> {
    let keepFamily: string | undefined;
    if (keepRefreshToken) {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(keepRefreshToken) } });
      if (row && row.principalId === partnerId && row.principalKind === 'partner') keepFamily = row.familyId;
    }
    await this.prisma.refreshToken.updateMany({
      where: {
        principalId: partnerId,
        principalKind: 'partner',
        revokedAt: null,
        ...(keepFamily ? { familyId: { not: keepFamily } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
