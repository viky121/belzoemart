import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditLogService } from './audit-log.service';

const CACHE_PREFIX = 'setting:';
const CACHE_TTL = 300;

/**
 * Typed key/value store settings (FR-13.2-13.5, BR-7). Reads are cached in
 * Redis; writes invalidate the cache and are audit-logged (BR-8).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
  ) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const cached = await this.redis.getJson<T>(`${CACHE_PREFIX}${key}`);
    if (cached !== null) return cached;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return null;
    await this.redis.setJson(`${CACHE_PREFIX}${key}`, row.valueJson, CACHE_TTL);
    return row.valueJson as T;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.valueJson]));
  }

  async set(actorId: string, key: string, value: unknown): Promise<void> {
    const before = await this.prisma.setting.findUnique({ where: { key } });
    await this.prisma.setting.upsert({
      where: { key },
      update: { valueJson: value as object },
      create: { key, valueJson: value as object },
    });
    await this.redis.del(`${CACHE_PREFIX}${key}`);
    await this.audit.record(actorId, 'settings.update', key, before?.valueJson, value);
  }
}
