import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthTokens } from '@belzo/shared';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { CustomerAuthService } from './customer-auth.service';
import {
  EmailLoginDto,
  GoogleLoginDto,
  IdentifierLoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordResetDto,
  PhoneLoginDto,
  RegisterAccountDto,
} from './dto';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from './refresh-cookie';
import { isMobileClient, readMobileLogoutToken, readMobileRefreshToken } from './client-platform';

/**
 * Customer authentication endpoints (FR-1.1-1.3). All public (pre-auth). The
 * refresh token is delivered as an httpOnly/secure/sameSite cookie; the access
 * token is returned in the body for the SPA to hold in memory (SECURITY-12).
 * Native clients sending `X-Client-Platform: mobile` get the refresh token in
 * the body instead (and send it back in the body to refresh/logout); no cookie
 * is set or cleared for them.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp({ phone: dto.phone, email: dto.email }, dto.purpose);
  }

  /** Check a code WITHOUT signing in; returns a signed proof for sign-up / password reset. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/prove')
  proveOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.proveOtp(dto.requestId, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.verifyOtp(dto.requestId, dto.code);
    return this.deliver(req, res, tokens, customer);
  }

  /** Create an account: name, email, mobile (both verified by OTP) and a strong password entered twice. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.registerAccount(dto);
    return this.deliver(req, res, tokens, customer);
  }

  /** Sign in with mobile number + password. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/phone')
  async loginPhone(
    @Body() dto: PhoneLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.loginPhone(dto.phone, dto.password, req.ip);
    return this.deliver(req, res, tokens, customer);
  }

  /** Sign in with mobile number OR email, plus the password. This is what the login screens use. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/identifier')
  async loginIdentifier(
    @Body() dto: IdentifierLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.loginIdentifier(dto.identifier, dto.password, req.ip);
    return this.deliver(req, res, tokens, customer);
  }

  /** Forgot password: set a new one after verifying the mobile number by OTP (`otp/prove`). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  resetPassword(@Body() dto: PasswordResetDto) {
    return this.auth.resetPassword(dto.proof, dto.password);
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
    return this.deliver(req, res, tokens, customer);
  }

  @Public()
  @Post('google')
  async google(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, customer } = await this.auth.loginGoogle(dto.idToken);
    return this.deliver(req, res, tokens, customer);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (isMobileClient(req)) {
      const bodyToken = readMobileRefreshToken(req);
      const rotated = await this.auth.refresh(bodyToken);
      return {
        accessToken: rotated.accessToken,
        expiresIn: rotated.expiresIn,
        refreshToken: rotated.refreshToken,
      };
    }
    const token = readRefreshCookie(req);
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (isMobileClient(req)) {
      const bodyToken = readMobileLogoutToken(req);
      if (bodyToken) await this.auth.logout(bodyToken);
      return { success: true };
    }
    const token = readRefreshCookie(req, false);
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res);
    return { success: true };
  }

  /** Mobile: refresh token in the body, no cookie. Web: cookie + body without it (unchanged). */
  private deliver<C>(req: Request, res: Response, tokens: AuthTokens, customer: C) {
    if (isMobileClient(req)) {
      return {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        refreshToken: tokens.refreshToken,
        customer,
      };
    }
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, customer };
  }
}
