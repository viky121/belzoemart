import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AdminRole } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtPrincipal, PrincipalKind } from '../../common/auth/jwt.types';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues and rotates authentication tokens (BR-4, BR-5).
 *
 * - Access tokens are short-lived signed JWTs.
 * - Refresh tokens are opaque random strings; only their SHA-256 hash is
 *   persisted (never the raw token). Presenting a refresh token issues a new
 *   pair and revokes the old one (rotation). Presenting an already-revoked
 *   token triggers reuse detection: the whole token family is revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtl(): number {
    return Number(process.env.JWT_ACCESS_TTL ?? 900);
  }

  private refreshTtl(): number {
    return Number(process.env.JWT_REFRESH_TTL ?? 1_209_600);
  }

  async signAccess(principal: JwtPrincipal): Promise<string> {
    return this.jwt.signAsync(principal, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtl(),
    });
  }

  async verifyAccess(token: string): Promise<JwtPrincipal> {
    return this.jwt.verifyAsync<JwtPrincipal>(token, { secret: process.env.JWT_ACCESS_SECRET });
  }

  /** Issue a fresh access+refresh pair, creating a new rotation family. */
  async issue(
    principalId: string,
    kind: PrincipalKind,
    roles: AdminRole[] = [],
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const accessToken = await this.signAccess({ sub: principalId, kind, roles });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        principalId,
        principalKind: kind,
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.accessTtl() };
  }

  /** Sign a principal out everywhere: revokes all of their live refresh tokens (e.g. after a password reset). */
  async revokeAllFor(principalId: string, kind: PrincipalKind): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { principalId, principalKind: kind, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Rotate a refresh token. Verifies it exists, is unexpired and unrevoked.
   * On success revokes it and issues a new pair in the same family. On reuse of
   * a revoked token, revokes the entire family and rejects (BR-5).
   */
  async rotate(
    refreshToken: string,
    resolveRoles?: (principalId: string) => Promise<AdminRole[]>,
  ): Promise<IssuedTokens> {
    const tokenHash = this.hash(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) throw new UnauthorizedException('Invalid refresh token');

    if (existing.revokedAt) {
      // Reuse detected — nuke the family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // A blocked (or deleted) customer must not keep a session alive by rotating.
    if (existing.principalKind === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: existing.principalId },
        select: { status: true },
      });
      if (!customer || customer.status === 'blocked') {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new ForbiddenException('Account is blocked');
      }
    }

    // Re-resolve roles on rotation so role changes take effect (admins only).
    const roles =
      existing.principalKind === 'admin' && resolveRoles
        ? await resolveRoles(existing.principalId)
        : [];
    const next = await this.issue(
      existing.principalId,
      existing.principalKind,
      roles,
      existing.familyId,
    );
    const nextHash = this.hash(next.refreshToken);
    const replacement = await this.prisma.refreshToken.findUnique({ where: { tokenHash: nextHash } });
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date(), replacedById: replacement?.id },
    });
    return next;
  }

  /** Revoke a refresh token and its family (logout). */
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.hash(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
