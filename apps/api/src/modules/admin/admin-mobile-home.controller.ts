import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  festivalScheduleError,
  MOBILE_HOME_KEY,
  mobileHomeSchema,
  sanitizeMobileHome,
  type MobileHome,
} from '@belzo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { createZodDto } from '../identity/zod-dto';
import { SettingsService } from './settings.service';

class MobileHomeDto extends createZodDto(mobileHomeSchema) {}

/**
 * Admin "Mobile" module: the single JSON config (`mobile.home`) that drives the
 * mobile app home screen — hero banners, category icons/order, offer-banner rows
 * and the deals rail. Marketing (and super_admin) may edit it; the generic
 * /admin/settings endpoint stays super_admin-only.
 */
@ApiTags('admin-mobile-home')
@ApiBearerAuth()
@RequirePermission('mobile.edit')
@Controller('admin/mobile-home')
export class AdminMobileHomeController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get(): Promise<MobileHome> {
    return sanitizeMobileHome(await this.settings.get<unknown>(MOBILE_HOME_KEY));
  }

  @Put()
  async put(@CurrentUser() user: JwtPrincipal, @Body() dto: MobileHomeDto): Promise<MobileHome> {
    // The DTO is validated (strict) by the global zod pipe; store the sanitized form.
    const scheduleError = festivalScheduleError(dto.festivalStart, dto.festivalEnd);
    if (scheduleError) throw new BadRequestException(scheduleError);
    const value = sanitizeMobileHome(dto);
    await this.settings.set(user.sub, MOBILE_HOME_KEY, value);
    return value;
  }
}
