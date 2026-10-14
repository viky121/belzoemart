import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrincipalKind } from '../../common/auth/jwt.types';

/**
 * Brute-force protection (BR-3, SECURITY-12). Records login attempts and locks
 * an identifier after too many recent failures.
 */
@Injectable()
export class LockoutService {
  private readonly maxFailures = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes

  constructor(private readonly prisma: PrismaService) {}

  async isLocked(identifier: string): Promise<boolean> {
    const since = new Date(Date.now() - this.windowMs);
    const failures = await this.prisma.loginAttempt.count({
      where: { identifier, succeeded: false, createdAt: { gte: since } },
    });
    return failures >= this.maxFailures;
  }

  async record(
    identifier: string,
    kind: PrincipalKind,
    succeeded: boolean,
    ip?: string,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { identifier, kind, succeeded, ip } });
  }
}
