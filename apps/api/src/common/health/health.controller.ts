import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { isWorkerAlive } from './worker-heartbeat';

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
    const checks: Record<string, boolean> = { database: false, redis: false, deliveryWorker: false };

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

    // The delivery worker must have written a heartbeat in the last 3 minutes. A soft check: it only
    // turns the status to "degraded" (the endpoint still answers 200), so a stopped worker is visible
    // without taking the API out of service.
    try {
      checks.deliveryWorker = await isWorkerAlive(this.redis.client, 'delivery');
    } catch {
      checks.deliveryWorker = false;
    }

    const healthy = Object.values(checks).every(Boolean);
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
