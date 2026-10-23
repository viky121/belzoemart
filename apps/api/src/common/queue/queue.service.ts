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

  async enqueue<T>(queue: QueueName, jobName: string, data: T): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) throw new Error(`Unknown queue: ${queue}`);
    await q.add(jobName, data as object);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
