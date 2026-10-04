import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from './refresh-cookie';

/** Admin authentication endpoints (FR-13.1). */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, admin } = await this.auth.login(dto.email, dto.password, dto.mfaCode, req.ip);
    setRefreshCookie(res, tokens.refreshToken, 'admin');
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, admin };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req, true, 'admin');
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken, 'admin');
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req, false, 'admin');
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res, 'admin');
    return { success: true };
  }
}
