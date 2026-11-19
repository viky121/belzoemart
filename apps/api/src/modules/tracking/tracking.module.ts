import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminTrackingController } from './admin-tracking.controller';
import { TrackingController } from './tracking.controller';
import { TrackingForwarderService } from './tracking-forwarder.service';
import { TrackingSettingsService } from './tracking-settings.service';

/**
 * Server-side tracking for the mobile app: receives the app's events and forwards them to Google Analytics 4
 * and Meta using the secrets saved (encrypted) in Admin → Settings → Tracking.
 */
@Module({
  imports: [AdminModule],
  controllers: [TrackingController, AdminTrackingController],
  providers: [TrackingSettingsService, TrackingForwarderService],
})
export class TrackingModule {}
