import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { DataRequestService } from './data-request.service';

interface DpdpJobData {
  dataRequestId: string;
  customerId: string;
}

/**
 * BullMQ consumer for DPDP jobs (export/deletion). Runs in the worker process.
 * Job retries/backoff are configured on the producer side (RESILIENCY-10).
 */
@Injectable()
export class DpdpWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DpdpWorker');
  private worker?: Worker;

  constructor(
    private readonly redis: RedisService,
    private readonly dataRequests: DataRequestService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUES.NOTIFICATIONS,
      async (job) => {
        const data = job.data as DpdpJobData;
        if (job.name === 'dpdp.export') {
          await this.dataRequests.processExport(data.dataRequestId);
        } else if (job.name === 'dpdp.deletion') {
          await this.dataRequests.processDeletion(data.dataRequestId);
        }
      },
      { connection: this.redis.client },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error({ jobId: job?.id, err }, 'DPDP job failed'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
