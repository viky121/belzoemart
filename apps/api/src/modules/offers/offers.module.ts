import { Module } from '@nestjs/common';
import { AuditLogService } from '../admin/audit-log.service';
import { AdminOffersController, OffersController } from './offers.controller';
import { OffersService } from './offers.service';

/** Special-price "spend and get" offers: admin setup and the public list. The cart reads them directly. */
@Module({
  controllers: [OffersController, AdminOffersController],
  providers: [OffersService, AuditLogService],
  exports: [OffersService],
})
export class OffersModule {}
