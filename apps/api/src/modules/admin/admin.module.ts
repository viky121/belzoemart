import { Module } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { SettingsService } from './settings.service';
import { AuditLogService } from './audit-log.service';
import { AdminController } from './admin.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PublicSettingsController } from './public-settings.controller';
import { AdminMobileHomeController } from './admin-mobile-home.controller';
import { HomeDesignController } from './home-design.controller';
import { HomeDesignService } from './home-design.service';

/**
 * Admin module (U7): reporting, settings, and audit log. The domain management
 * endpoints (catalogue, orders, users, engagement) live in their own modules
 * (U2–U6); this module adds cross-cutting admin capabilities and exports the
 * AuditLogService for other modules to record admin actions.
 */
@Module({
  controllers: [AdminController, ReportsController, AdminMobileHomeController, HomeDesignController, PublicSettingsController],
  providers: [ReportingService, ReportsService, SettingsService, AuditLogService, HomeDesignService],
  exports: [AuditLogService, SettingsService],
})
export class AdminModule {}
