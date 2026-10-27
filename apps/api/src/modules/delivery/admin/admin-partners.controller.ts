import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../../common/auth/jwt.types';
import { RequirePermission } from '../../../common/auth/permissions.decorator';
import {
  AdminPartnersQueryDto,
  CreatePartnerDto,
  PartnerZonesDto,
  ResetPartnerPasswordDto,
  SetPartnerActiveDto,
  UpdatePartnerDto,
} from '../dto';
import { PartnerService } from '../partners/partner.service';
import { ZoneService } from '../partners/zone.service';

/** Delivery partner accounts for staff (DL-1.1). `order_manager` and `super_admin` (D3). */
@ApiTags('admin-delivery')
@RequirePermission('delivery.partners')
@Controller('admin/delivery/partners')
export class AdminPartnersController {
  constructor(
    private readonly partners: PartnerService,
    private readonly zones: ZoneService,
  ) {}

  @Get()
  list(@Query() query: AdminPartnersQueryDto) {
    return this.partners.list(query);
  }

  @Post()
  create(@CurrentUser() user: JwtPrincipal, @Body() dto: CreatePartnerDto) {
    return this.partners.create(user.sub, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.get(id);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartnerDto) {
    return this.partners.update(user.sub, id, dto);
  }

  @Post(':id/active')
  @HttpCode(200)
  setActive(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPartnerActiveDto) {
    return this.partners.setActive(user.sub, id, dto.active);
  }

  @Post(':id/password')
  @HttpCode(200)
  async resetPassword(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPartnerPasswordDto) {
    await this.partners.resetPassword(user.sub, id, dto.password);
    return { success: true };
  }

  @Put(':id/zones')
  async setZones(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PartnerZonesDto) {
    return { zoneIds: await this.zones.setPartnerZones(user.sub, id, dto.zoneIds) };
  }
}
