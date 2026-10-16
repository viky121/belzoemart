import { Module } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { SettingsService } from './settings.service';
import { AuditLogService } from './audit-log.service';
import { AdminController } from './admin.controller';
import { PublicSettingsController } from './public-settings.controller';
import { AdminMobileHomeController } from './admin-mobile-home.controller';

/**
 * Admin module (U7): reporting, settings, and audit log. The domain management
 * endpoints (catalogue, orders, users, engagement) live in their own modules
 * (U2–U6); this module adds cross-cutting admin capabilities and exports the
 * AuditLogService for other modules to record admin actions.
 */
@Module({
  controllers: [AdminController, AdminMobileHomeController, PublicSettingsController],
  providers: [ReportingService, SettingsService, AuditLogService],
  exports: [AuditLogService, SettingsService],
})
export class AdminModule {}
