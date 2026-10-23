import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminSmsGatewayController } from './sms-gateway.controller';
import { SmsSettingsService } from './sms-settings.service';

/**
 * Admin view and editor for the Fast2SMS settings. The adapter itself lives in
 * integrations/sms; this module keeps the encrypted admin override in the settings table
 * and feeds it to the adapter (via the global SmsCredentials holder).
 */
@Module({
  imports: [AdminModule],
  controllers: [AdminSmsGatewayController],
  providers: [SmsSettingsService],
  exports: [SmsSettingsService],
})
export class SmsGatewayModule {}
