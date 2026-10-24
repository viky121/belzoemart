import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_JOB_OPTIONS, QUEUES, type QueueName } from './queue.constants';

/**
 * Thin wrapper over BullMQ queues. Producers enqueue jobs here; the worker
 * process consumes them. Decoupling external side effects via the queue is a
 * resiliency measure (RESILIENCY-10, NFR-3.4).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {
    for (const name of Object.values(QUEUES)) {
      this.queues.set(
        name,
        new Queue(name, {
          connection: this.redis.client,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
      );
    }
  }

  /**
   * `opts.jobId` makes the job idempotent: BullMQ ignores a second add with the same id while the
   * first is still retained, so a repeated trigger (e.g. an admin status click plus a courier sync)
   * does not email the customer twice.
   */
  async enqueue<T>(queue: QueueName, jobName: string, data: T, opts?: { jobId?: string }): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) throw new Error(`Unknown queue: ${queue}`);
    await q.add(jobName, data as object, opts?.jobId ? { jobId: opts.jobId } : undefined);
  }

  /**
   * Register a job that repeats every `everyMs`. The job id is fixed per job name, so calling
   * this on every worker start never creates a second schedule (idempotent).
   */
  async upsertScheduler(queue: QueueName, jobName: string, everyMs: number): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) throw new Error(`Unknown queue: ${queue}`);
    await q.add(jobName, {}, { repeat: { every: everyMs }, jobId: `scheduler:${jobName}` });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
