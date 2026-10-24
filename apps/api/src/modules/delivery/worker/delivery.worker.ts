import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { HEARTBEAT_INTERVAL_MS, writeHeartbeat } from '../../../common/health/worker-heartbeat';
import { QUEUES } from '../../../common/queue/queue.constants';
import { QueueService } from '../../../common/queue/queue.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { JobRepository } from '../jobs/job.repository';
import { JobService } from '../jobs/job.service';
import { DeliveryOtpService } from '../otp/delivery-otp.service';
import { PartnerService } from '../partners/partner.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';

/** Name used for the worker's heartbeat key and the health check. */
export const DELIVERY_WORKER_NAME = 'delivery';

/** The repeatable jobs and how often they run (DL-8.1). Each has a fixed id, so a restart never doubles them. */
export const DELIVERY_SCHEDULES: readonly { name: string; everyMs: number }[] = [
  { name: 'accept-timeout', everyMs: 60_000 },
  { name: 'partner-stale', everyMs: 60_000 },
  { name: 'reconcile-returned', everyMs: 300_000 },
  { name: 'otp-cleanup', everyMs: 3_600_000 },
];

export interface DeliveryJobData {
  orderId?: string;
}

/**
 * Background work for the delivery module (component C12, RP3): accept timeouts, partner presence,
 * OTP clean-up, the "order was cancelled" hook, and the repair sweep for returned jobs.
 * Every job is safe to run twice and does a bounded amount of work.
 */
@Injectable()
export class DeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DeliveryWorker');
  private worker?: Worker;
  private beat?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly repo: JobRepository,
    private readonly jobs: JobService,
    private readonly partners: PartnerService,
    private readonly otp: DeliveryOtpService,
    private readonly settings: DeliverySettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(QUEUES.DELIVERY, (job) => this.handle(job), { connection: this.redis.client, concurrency: 2 });
    this.worker.on('failed', (job, err) => this.logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'delivery job failed'));

    for (const s of DELIVERY_SCHEDULES) await this.queue.upsertScheduler(QUEUES.DELIVERY, s.name, s.everyMs);

    await this.heartbeat();
    this.beat = setInterval(() => void this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.beat.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.beat) clearInterval(this.beat);
    await this.worker?.close();
  }

  private async heartbeat(): Promise<void> {
    try {
      await writeHeartbeat(this.redis.client, DELIVERY_WORKER_NAME);
    } catch (e) {
      this.logger.warn(`could not write the worker heartbeat: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Run one job. Returns a small summary for the logs. Exposed for tests. */
  async handle(job: Pick<Job<DeliveryJobData>, 'name' | 'data'>): Promise<unknown> {
    switch (job.name) {
      case 'accept-timeout':
        return { expired: await this.jobs.expireUnanswered(100) };
      case 'partner-stale': {
        const s = await this.settings.get();
        return { offline: await this.partners.markStaleOffline(await this.repo.now(this.prisma), s.offlineAfterMinutes) };
      }
      case 'otp-cleanup': {
        // The hourly clean-up: old OTP rows, and GPS points past their retention period.
        const now = await this.repo.now(this.prisma);
        return { ...(await this.otp.purgeExpired(now)), gpsCleared: await this.jobs.clearOldGps(now) };
      }
      case 'reconcile-returned':
        return { fixed: await this.jobs.reconcileReturned(50) };
      case 'order.cancelled': {
        const orderId = job.data?.orderId;
        if (!orderId) return { skipped: 'no order id' };
        return { cancelled: await this.jobs.cancelForOrder(orderId) };
      }
      default:
        this.logger.warn(`unknown delivery job: ${job.name}`);
        return { skipped: job.name };
    }
  }
}
