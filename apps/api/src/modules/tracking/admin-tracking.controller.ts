import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { createZodDto } from '../identity/zod-dto';
import { TrackingSettingsService } from './tracking-settings.service';

// Empty string removes a stored value; omitting a field keeps it.
const serverTrackingSchema = z
  .object({
    ga4ApiSecret: z.string().trim().max(120).optional(),
    metaAccessToken: z.string().trim().max(700).optional(),
    metaTestEventCode: z.string().trim().max(40).optional(),
  })
  .strict();
class ServerTrackingDto extends createZodDto(serverTrackingSchema) {}

/**
 * Admin: server-side tracking secrets for the mobile app (Google Analytics API secret, Meta access token).
 * Same permission as the other store settings. The secrets are write-only: no endpoint returns them.
 */
@ApiTags('tracking')
@ApiBearerAuth()
@RequirePermission('settings.edit')
@Controller('admin/tracking')
export class AdminTrackingController {
  constructor(private readonly tracking: TrackingSettingsService) {}

  @Get('server')
  status() {
    return this.tracking.status();
  }

  @Put('server')
  async save(@CurrentUser() user: JwtPrincipal, @Body() dto: ServerTrackingDto) {
    await this.tracking.save(user.sub, dto);
    return this.tracking.status();
  }

  @Delete('server')
  async reset(@CurrentUser() user: JwtPrincipal) {
    await this.tracking.reset(user.sub);
    return this.tracking.status();
  }

  /** Send one test event to Meta (only while a Test event code is saved). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('server/test')
  @HttpCode(200)
  test() {
    return this.tracking.testMeta();
  }
}
