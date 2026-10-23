import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../common/auth/public.decorator';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../identity/refresh-cookie';
import { PartnerChangePasswordDto, PartnerLoginDto } from '../dto';
import { AllowPasswordChange, CurrentPartner } from './partner-auth.decorators';
import { PartnerAuthGuard } from './partner-auth.guard';
import { PartnerAuthService } from './partner-auth.service';
import type { AuthenticatedPartner } from './partner-auth.types';

/**
 * Partner sign-in endpoints (DL-1.2). The refresh token travels only in an httpOnly,
 * SameSite=Strict cookie limited to /api/v1/partner.
 */
@ApiTags('partner-auth')
@Controller('partner/auth')
export class PartnerAuthController {
  constructor(private readonly auth: PartnerAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: PartnerLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokens, partner } = await this.auth.login(dto.mobile, dto.password, req.ip);
    setRefreshCookie(res, tokens.refreshToken, 'partner');
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, partner };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req, true, 'partner');
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken, 'partner');
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req, false, 'partner');
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res, 'partner');
    return { success: true };
  }

  @Public()
  @UseGuards(PartnerAuthGuard)
  @AllowPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentPartner() partner: AuthenticatedPartner, @Body() dto: PartnerChangePasswordDto, @Req() req: Request) {
    await this.auth.changePassword(partner.id, dto.currentPassword, dto.newPassword, readRefreshCookie(req, false, 'partner') || undefined);
    return { success: true };
  }
}
