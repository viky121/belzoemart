import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { PartnerHeartbeatDto, PartnerOnlineDto } from '../dto';
import { CurrentPartner } from '../partners/partner-auth.decorators';
import { PartnerAuthGuard } from '../partners/partner-auth.guard';
import type { AuthenticatedPartner } from '../partners/partner-auth.types';
import { PartnerService } from '../partners/partner.service';

/**
 * The partner's own profile and presence (DL-1.4). `@Public()` only switches off the customer and
 * admin guard; PartnerAuthGuard authenticates every route here, and the partner id comes from the token.
 */
@ApiTags('partner')
@Public()
@UseGuards(PartnerAuthGuard)
@Controller('partner/me')
export class PartnerMeController {
  constructor(private readonly partners: PartnerService) {}

  @Get()
  me(@CurrentPartner() partner: AuthenticatedPartner) {
    return this.partners.me(partner.id);
  }

  @Post('online')
  @HttpCode(200)
  async online(@CurrentPartner() partner: AuthenticatedPartner, @Body() dto: PartnerOnlineDto) {
    await this.partners.setOnline(partner.id, dto.online);
    return { online: dto.online };
  }

  @Post('heartbeat')
  @HttpCode(200)
  async heartbeat(@CurrentPartner() partner: AuthenticatedPartner, @Body() dto: PartnerHeartbeatDto) {
    await this.partners.heartbeat(partner.id, dto.location);
    return { success: true };
  }
}
