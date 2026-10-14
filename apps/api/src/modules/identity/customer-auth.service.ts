import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthTokens } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { LockoutService } from './lockout.service';
import { OtpService } from './otp.service';
import { SocialAuthService } from './social-auth.service';

interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
}

/**
 * Orchestrates customer authentication (BR-1..BR-6, BR-12): OTP, email/password
 * and social login, applying brute-force lockout and issuing rotating tokens.
 */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly otp: OtpService,
    private readonly social: SocialAuthService,
  ) {}

  private toSummary(c: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    locale: string;
  }): CustomerSummary {
    return { id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale };
  }

  private async issueFor(customerId: string): Promise<AuthTokens> {
    const t = await this.tokens.issue(customerId, 'customer');
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
  }

  private ensureActive(status: string): void {
    if (status === 'blocked') throw new ForbiddenException('Account is blocked');
  }

  requestOtp(target: { phone?: string; email?: string }) {
    return this.otp.request(target);
  }

  async verifyOtp(
    requestId: string,
    code: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const { email, phone } = await this.otp.verify(requestId, code);
    // Find or create the customer for this identifier (OTP-first signup).
    let customer = null;
    if (phone) {
      customer = await this.prisma.customer.findUnique({ where: { phone } });
      customer ??= await this.prisma.customer.create({ data: { phone, name: 'Belzo Customer' } });
    } else if (email) {
      customer = await this.prisma.customer.findUnique({ where: { email } });
      customer ??= await this.prisma.customer.create({ data: { email, name: 'Belzo Customer' } });
    }
    if (!customer) throw new BadRequestException('Invalid OTP request');
    this.ensureActive(customer.status);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  async registerEmail(
    name: string,
    email: string,
    password: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const existing = await this.prisma.customer.findUnique({ where: { email } });
    if (existing) throw new UnauthorizedException('Email already registered');
    const customer = await this.prisma.customer.create({
      data: { email, name, passwordHash: await this.passwords.hash(password) },
    });
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  async loginEmail(
    email: string,
    password: string,
    ip?: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    if (await this.lockout.isLocked(email)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    const ok =
      customer?.passwordHash && (await this.passwords.verify(customer.passwordHash, password));
    if (!customer || !ok) {
      await this.lockout.record(email, 'customer', false, ip);
      throw new UnauthorizedException('Invalid email or password');
    }
    this.ensureActive(customer.status);
    await this.lockout.record(email, 'customer', true, ip);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  async loginGoogle(idToken: string): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const profile = await this.social.verifyGoogle(idToken);
    let customer = await this.prisma.customer.findUnique({ where: { email: profile.email } });
    customer ??= await this.prisma.customer.create({
      data: { email: profile.email, name: profile.name },
    });
    this.ensureActive(customer.status);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const t = await this.tokens.rotate(refreshToken);
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }
}
