import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../../common/auth/jwt.types';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateZoneDto, UpdateZoneDto, ZonePincodesDto } from '../dto';
import { ZoneService } from '../partners/zone.service';

/** Delivery zones for staff (DL-1.5). */
@ApiTags('admin-delivery')
@Roles('order_manager')
@Controller('admin/delivery/zones')
export class AdminZonesController {
  constructor(private readonly zones: ZoneService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Post()
  create(@CurrentUser() user: JwtPrincipal, @Body() dto: CreateZoneDto) {
    return this.zones.create(user.sub, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.zones.get(id);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.zones.remove(user.sub, id);
    return { success: true };
  }

  @Put(':id/pincodes')
  setPincodes(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ZonePincodesDto) {
    return this.zones.setPincodes(user.sub, id, dto.pincodes);
  }
}
