import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { CustomerAuthService } from './customer-auth.service';
import { EmailLoginDto, EmailRegisterDto, GoogleLoginDto, OtpRequestDto, OtpVerifyDto } from './dto';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from './refresh-cookie';

/**
 * Customer authentication endpoints (FR-1.1-1.3). All public (pre-auth). The
 * refresh token is delivered as an httpOnly/secure/sameSite cookie; the access
 * token is returned in the body for the SPA to hold in memory (SECURITY-12).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp({ phone: dto.phone, email: dto.email });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(@Body() dto: OtpVerifyDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, customer } = await this.auth.verifyOtp(dto.requestId, dto.code);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, customer };
  }

  @Public()
  @Post('register')
  async register(@Body() dto: EmailRegisterDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, customer } = await this.auth.registerEmail(dto.name, dto.email, dto.password);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, customer };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: EmailLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.loginEmail(dto.email, dto.password, req.ip);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, customer };
  }

  @Public()
  @Post('google')
  async google(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, customer } = await this.auth.loginGoogle(dto.idToken);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, customer };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req);
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req, false);
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res);
    return { success: true };
  }
}
