import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { createZodDto } from '../identity/zod-dto';
import { SmsSettingsService } from './sms-settings.service';

const settingsSchema = z
  .object({
    apiKey: z.string().trim().max(120).optional(),
    route: z.enum(['otp', 'dlt', 'smart']).optional(),
    senderId: z.string().trim().max(10).optional(),
    dltMessageId: z.string().trim().max(30).optional(),
    otpId: z.string().trim().max(50).optional(),
    otpIdRegister: z.string().trim().max(50).optional(),
    otpIdReset: z.string().trim().max(50).optional(),
    otpIdDelivery: z.string().trim().max(50).optional(),
  })
  .strict();
class SmsSettingsDto extends createZodDto(settingsSchema) {}

const testSmsSchema = z.object({ phone: z.string().trim().min(10).max(16) }).strict();
class TestSmsDto extends createZodDto(testSmsSchema) {}

/** Admin: Fast2SMS (OTP SMS) setup. Super admin only; the API key is write-only. */
@ApiTags('sms-gateway')
@ApiBearerAuth()
@RequirePermission('gateway.edit')
@Controller('admin/sms-gateway')
export class AdminSmsGatewayController {
  constructor(private readonly sms: SmsSettingsService) {}

  @Get('status')
  status() {
    return this.sms.status();
  }

  /** Save settings. The key is encrypted at rest, verified with Fast2SMS first, and never returned. */
  @Put('credentials')
  async save(@CurrentUser() user: JwtPrincipal, @Body() dto: SmsSettingsDto) {
    await this.sms.save(user.sub, dto);
    return this.sms.status();
  }

  /** Forget the settings saved in the admin panel and use the server environment's. */
  @Delete('credentials')
  async reset(@CurrentUser() user: JwtPrincipal) {
    await this.sms.reset(user.sub);
    return this.sms.status();
  }

  /** Check the key in use (free wallet lookup, sends no SMS). */
  @Post('test')
  @HttpCode(200)
  test() {
    return this.sms.testCurrent();
  }

  /** Send one real test SMS (costs one SMS). Limited to 3 per minute. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('test-sms')
  @HttpCode(200)
  testSms(@Body() dto: TestSmsDto) {
    return this.sms.sendTest(dto.phone);
  }
}
