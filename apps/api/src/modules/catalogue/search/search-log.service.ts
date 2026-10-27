import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { cleanSearchTerm, productQuerySchema, type SearchSource } from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import type { JwtPrincipal } from '../../../common/auth/jwt.types';
import { SEARCH_PROVIDER, type SearchProvider } from './search.provider';

/** The same person searching the same words from the same place inside this time is saved once. */
export const SEARCH_DEDUPE_SECONDS = 30;
/** Searches older than this are deleted (kept for 12 months). */
export const SEARCH_RETENTION_DAYS = 365;
const PURGE_BATCH = 5_000;

export interface RecordSearchInput {
  q: unknown;
  source: SearchSource;
  /** The Authorization header, if the customer is logged in (the route itself is public). */
  authorization?: string;
  /** Network address, used only to tell two guests apart for the 30 second rule. Never saved. */
  ip?: string;
}

/**
 * Saves real customer searches for the Search terms report. It is called by the website and the app
 * AFTER a search (Enter, a tapped suggestion, the results page), so half-typed words are never saved.
 * Nothing here may break the search: every failure is logged and swallowed by `record`.
 */
@Injectable()
export class SearchLogService {
  private readonly logger = new Logger('SearchLogService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  /** Returns true when a row was saved. Never throws. */
  async record(input: RecordSearchInput): Promise<boolean> {
    try {
      const clean = cleanSearchTerm(input.q);
      if (!clean) return false;
      const customerId = await this.customerIdFrom(input.authorization);
      if (!(await this.firstInWindow(clean.termNorm, input.source, customerId ?? input.ip ?? 'unknown'))) return false;

      // The result count and the first product come from the same search the customer just ran.
      const found = await this.search.search(productQuerySchema.parse({ q: clean.term, page: '1', pageSize: '1' }));
      await this.prisma.searchLog.create({
        data: {
          term: clean.term,
          termNorm: clean.termNorm,
          source: input.source,
          resultCount: found.total,
          topProductId: found.items[0]?.id ?? null,
          customerId,
        },
      });
      void this.purgeOnceADay();
      return true;
    } catch (e) {
      this.logger.warn(`could not save a search: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** The logged-in customer, if the token is a valid customer token. Guests and bad tokens give null. */
  async customerIdFrom(authorization: string | undefined): Promise<string | null> {
    if (!authorization?.startsWith('Bearer ')) return null;
    try {
      const p = await this.jwt.verifyAsync<JwtPrincipal>(authorization.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
      return p.kind === 'customer' && typeof p.sub === 'string' ? p.sub : null;
    } catch {
      return null;
    }
  }

  /** True the first time this search is seen inside the window. */
  private async firstInWindow(termNorm: string, source: string, actor: string): Promise<boolean> {
    const key = `searchlog:${createHash('sha1').update(`${termNorm}|${source}|${actor}`).digest('hex')}`;
    const set = await this.redis.client.set(key, '1', 'EX', SEARCH_DEDUPE_SECONDS, 'NX');
    return set === 'OK';
  }

  /** Deletes searches older than 12 months, at most once a day (a Redis key guards it), in small batches. */
  private async purgeOnceADay(): Promise<void> {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const first = await this.redis.client.set(`searchlog:purged:${day}`, '1', 'EX', 90_000, 'NX');
      if (first !== 'OK') return;
      await this.purgeOlderThan(new Date(Date.now() - SEARCH_RETENTION_DAYS * 86_400_000));
    } catch (e) {
      this.logger.warn(`could not clean old searches: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Exposed for tests. Returns how many rows were deleted. */
  async purgeOlderThan(cutoff: Date): Promise<number> {
    let total = 0;
    for (let i = 0; i < 20; i += 1) {
      const rows = await this.prisma.searchLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: PURGE_BATCH });
      if (rows.length === 0) break;
      const res = await this.prisma.searchLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      total += res.count;
      if (rows.length < PURGE_BATCH) break;
    }
    return total;
  }
}
