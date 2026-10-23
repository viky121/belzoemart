import { Module } from '@nestjs/common';
import { SmsModule } from '../../integrations/sms/sms.module';
import { NotificationsIntegrationModule } from '../../integrations/notifications/notifications-integration.module';
import { NotificationService } from './notification.service';
import { NotificationWorker } from './notification.worker';

/**
 * Worker-side engagement module (U6). Registers the NotificationDispatcher that
 * consumes the NOTIFICATIONS queue in the standalone worker process.
 */
@Module({
  imports: [SmsModule, NotificationsIntegrationModule],
  providers: [NotificationService, NotificationWorker],
})
export class EngagementWorkerModule {}
