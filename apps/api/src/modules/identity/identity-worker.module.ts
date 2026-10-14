import { Module } from '@nestjs/common';
import { QueueModule } from '../../common/queue/queue.module';
import { DataRequestService } from './data-request.service';
import { DpdpWorker } from './dpdp.worker';

/**
 * Worker-side identity module (U2). Registers the DPDP job processors that run
 * in the standalone worker process (export/deletion).
 */
@Module({
  imports: [QueueModule],
  providers: [DataRequestService, DpdpWorker],
})
export class IdentityWorkerModule {}
