import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Health checks (RESILIENCY-06).
 * - /health/live  : shallow — process is up.
 * - /health/ready : deep — verifies DB and Redis connectivity.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = { database: false, redis: false };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      const pong = await this.redis.client.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    }

    const healthy = Object.values(checks).every(Boolean);
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
