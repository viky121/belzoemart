import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { IdentityModule } from '../identity/identity.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminDeliverySettingsController } from './admin/admin-delivery-settings.controller';
import { AdminDeliveryController } from './admin/admin-delivery.controller';
import { AdminPartnersController } from './admin/admin-partners.controller';
import { AdminZonesController } from './admin/admin-zones.controller';
import { DeliveryGateRegistry, DeliveryJobHooks } from './jobs/gates';
import { JobQueryService } from './jobs/job-query.service';
import { JobRepository } from './jobs/job.repository';
import { JobService } from './jobs/job.service';
import { OrderSyncService } from './jobs/order-sync.service';
import { DeliveryOtpService } from './otp/delivery-otp.service';
import { PartnerAuthController } from './partners/partner-auth.controller';
import { PartnerAuthGuard } from './partners/partner-auth.guard';
import { PartnerAuthService } from './partners/partner-auth.service';
import { PartnerTokenService } from './partners/partner-token.service';
import { PartnerService } from './partners/partner.service';
import { ZoneService } from './partners/zone.service';
import { PartnerJobsController } from './partner-api/partner-jobs.controller';
import { PartnerMeController } from './partner-api/partner-me.controller';
import { DeliverySecurityEvents } from './security-events';
import { DeliverySettingsService } from './settings/delivery-settings.service';

/**
 * In-house delivery (U8). One module with a folder per concern (decision D1):
 * partners and their sign-in, jobs and the order sync, the delivery OTP, settings, and the admin and
 * partner HTTP APIs. The background consumer lives in DeliveryWorkerModule so it only runs in the worker.
 *
 * Depends on: AdminModule (settings, audit), IdentityModule (password hashing, lockout), OrdersModule
 * (cancel an undeliverable order). SMS, shipping, Prisma, Redis and the queue are global.
 */
@Module({
  imports: [AdminModule, IdentityModule, OrdersModule],
  controllers: [
    PartnerAuthController,
    PartnerMeController,
    PartnerJobsController,
    AdminPartnersController,
    AdminZonesController,
    AdminDeliveryController,
    AdminDeliverySettingsController,
  ],
  providers: [
    JobRepository,
    DeliverySettingsService,
    DeliverySecurityEvents,
    PartnerTokenService,
    PartnerAuthService,
    PartnerAuthGuard,
    PartnerService,
    ZoneService,
    DeliveryOtpService,
    OrderSyncService,
    DeliveryGateRegistry,
    DeliveryJobHooks,
    JobService,
    JobQueryService,
  ],
  exports: [
    JobRepository,
    JobService,
    JobQueryService,
    PartnerService,
    DeliveryOtpService,
    DeliverySettingsService,
    DeliverySecurityEvents,
    DeliveryGateRegistry,
    DeliveryJobHooks,
  ],
})
export class DeliveryModule {}
