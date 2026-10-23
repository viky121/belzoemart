import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdminRole, AuthTokens } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { LockoutService } from './lockout.service';
import { verifyTotp } from './totp.util';

interface AdminSummary {
  id: string;
  name: string;
  email: string;
  roles: AdminRole[];
}

/**
 * Admin authentication (BR-3, BR-7). Verifies email/password (argon2), enforces
 * brute-force lockout, requires a valid TOTP code when MFA is enabled, and
 * issues tokens carrying the admin's roles for RBAC.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
  ) {}

  async login(
    email: string,
    password: string,
    mfaCode?: string,
    ip?: string,
  ): Promise<{ tokens: AuthTokens; admin: AdminSummary }> {
    if (await this.lockout.isLocked(email)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    const ok = admin && (await this.passwords.verify(admin.passwordHash, password));
    if (!admin || !ok) {
      await this.lockout.record(email, 'admin', false, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.status === 'disabled') throw new ForbiddenException('Account disabled');

    if (admin.mfaEnabled) {
      if (!mfaCode || !admin.mfaSecret || !verifyTotp(admin.mfaSecret, mfaCode)) {
        await this.lockout.record(email, 'admin', false, ip);
        throw new UnauthorizedException('Invalid or missing MFA code');
      }
    }

    const roles = admin.roles.map((r) => r.role.name as AdminRole);
    await this.lockout.record(email, 'admin', true, ip);
    const t = await this.tokens.issue(admin.id, 'admin', roles);
    return {
      tokens: { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn },
      admin: { id: admin.id, name: admin.name, email: admin.email, roles },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    // Roles are re-resolved on rotation so revoked/added roles take effect.
    const t = await this.tokens.rotate(refreshToken, (id) => this.rolesFor(id));
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
  }

  private async rolesFor(adminUserId: string): Promise<AdminRole[]> {
    const rows = await this.prisma.adminUserRole.findMany({
      where: { adminUserId },
      include: { role: true },
    });
    return rows.map((r) => r.role.name as AdminRole);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }
}
