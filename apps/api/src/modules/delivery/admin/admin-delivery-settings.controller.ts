import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../../common/auth/jwt.types';
import { RequirePermission } from '../../../common/auth/permissions.decorator';
import { DeliverySettingsPatchDto } from '../dto';
import { DeliverySettingsService } from '../settings/delivery-settings.service';

/** Delivery rules (accept time, attempts, OTP limits). `super_admin` only (D3). Every change is audited. */
@ApiTags('admin-delivery')
@RequirePermission('delivery.settings')
@Controller('admin/delivery/settings')
export class AdminDeliverySettingsController {
  constructor(private readonly settings: DeliverySettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  update(@CurrentUser() user: JwtPrincipal, @Body() dto: DeliverySettingsPatchDto) {
    return this.settings.update(user.sub, dto);
  }
}
