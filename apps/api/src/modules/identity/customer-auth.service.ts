import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthTokens, OtpPurpose, RegisterAccount } from '@belzo/shared';
import { readProof, requireProof, signProof, type ProofKind } from './otp-proof';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { QueueService } from '../../common/queue/queue.service';
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
    @Optional() private readonly queue?: QueueService,
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

  /**
   * Send an OTP. `register` refuses a number/email that already has a password account (no SMS is
   * wasted on it); `reset` and `login` only go to existing accounts. Without a purpose it behaves as before.
   */
  async requestOtp(target: { phone?: string; email?: string }, purpose?: OtpPurpose) {
    if (purpose) {
      const existing = await this.findByIdentifier(target);
      if (purpose === 'register' && existing?.passwordHash && existing.phone) {
        throw new ConflictException(
          target.phone
            ? 'This mobile number is already registered. Please sign in.'
            : 'This email is already registered. Please sign in.',
        );
      }
      if ((purpose === 'reset' || purpose === 'login') && !existing) {
        throw new NotFoundException(
          target.phone
            ? 'No account found for this mobile number. Please create an account first.'
            : 'No account found for this email. Please create an account first.',
        );
      }
      if (existing) this.ensureActive(existing.status);
    }
    return this.otp.request(target, purpose);
  }

  /**
   * Whether this mobile number / email already belongs to a finished account (password + mobile), the
   * same rule `requestOtp('register')` and `registerAccount` use. The sign-up form asks this as soon as a
   * number or email is typed, so the customer is told to sign in before any OTP is sent.
   */
  async isRegistered(target: { phone?: string; email?: string }): Promise<boolean> {
    const existing = await this.findByIdentifier(target);
    return Boolean(existing?.passwordHash && existing.phone);
  }

  private findByIdentifier(target: { phone?: string; email?: string }) {
    if (target.phone) {
      return this.prisma.customer.findUnique({ where: { phone: OtpService.normalizePhone(target.phone) } });
    }
    if (target.email) {
      return this.prisma.customer.findUnique({ where: { email: target.email.trim().toLowerCase() } });
    }
    return Promise.resolve(null);
  }

  /** Sign in with a code sent to an EXISTING account's mobile/email. Accounts are created through `registerAccount`. */
  async verifyOtp(
    requestId: string,
    code: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const { email, phone } = await this.otp.verify(requestId, code);
    const customer = await this.findByIdentifier({ phone: phone ?? undefined, email: email ?? undefined });
    if (!customer) {
      throw new NotFoundException('No account found. Please create an account first.');
    }
    this.ensureActive(customer.status);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  /**
   * Check an OTP without signing in and hand back a signed proof that this mobile number or email
   * was verified. Sign-up and password reset ask for the proof.
   */
  async proveOtp(requestId: string, code: string): Promise<{ proof: string; kind: ProofKind; value: string }> {
    const { email, phone } = await this.otp.verify(requestId, code);
    const kind: ProofKind = phone ? 'phone' : 'email';
    const value = (phone ?? email) as string;
    return { proof: signProof(kind, value), kind, value };
  }

  /**
   * Create an account from a verified mobile number + verified email. A number that only ever
   * signed in by OTP (no password yet) is completed instead of rejected.
   */
  async registerAccount(input: RegisterAccount): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const phone = OtpService.normalizePhone(input.phone);
    // The email is optional; when it is given it must have been verified by OTP.
    const email = input.email ? input.email.trim().toLowerCase() : null;
    requireProof(input.phoneProof, 'phone', phone);
    if (email) requireProof(input.emailProof ?? '', 'email', email);

    const [byPhone, byEmail] = await Promise.all([
      this.prisma.customer.findUnique({ where: { phone } }),
      email ? this.prisma.customer.findUnique({ where: { email } }) : Promise.resolve(null),
    ]);
    if (byPhone && byEmail && byPhone.id !== byEmail.id) {
      throw new ConflictException('This mobile number and email already belong to different accounts.');
    }
    const existing = byPhone ?? byEmail;
    // A finished account (password + mobile) cannot be re-registered. An older account that signed up
    // with email only, or by OTP only, is completed instead: the customer just proved ownership of both.
    if (existing?.passwordHash && existing.phone) {
      throw new ConflictException(
        byPhone ? 'This mobile number is already registered. Please sign in.' : 'This email is already registered. Please sign in.',
      );
    }
    const passwordHash = await this.passwords.hash(input.password);
    const name = input.name.trim();
    let customer;
    if (existing) {
      this.ensureActive(existing.status);
      // Never wipe an email the account already has when the form left it empty.
      customer = await this.prisma.customer.update({
        where: { id: existing.id },
        data: { name, phone, passwordHash, ...(email ? { email } : {}) },
      });
    } else {
      try {
        customer = await this.prisma.customer.create({ data: { name, phone, passwordHash, ...(email ? { email } : {}) } });
      } catch {
        // A parallel sign-up won the race for the same number or email.
        throw new ConflictException('This mobile number or email is already registered. Please sign in.');
      }
    }
    // Welcome email (only when there is an email). Best effort: a queue hiccup must never fail a sign-up
    // that already succeeded.
    if (customer.email) {
      await this.queue
        ?.enqueue(QUEUES.NOTIFICATIONS, 'customer.welcome', { customerId: customer.id }, { jobId: `welcome-${customer.id}` })
        .catch(() => undefined);
    }
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  /** Sign in with mobile number + password (5 wrong tries lock the number for 15 minutes). */
  async loginPhone(
    phoneInput: string,
    password: string,
    ip?: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const phone = OtpService.normalizePhone(phoneInput);
    const key = `phone:${phone}`;
    if (await this.lockout.isLocked(key)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    const ok = customer?.passwordHash && (await this.passwords.verify(customer.passwordHash, password));
    if (!customer || !ok) {
      await this.lockout.record(key, 'customer', false, ip);
      throw new UnauthorizedException('Invalid mobile number or password');
    }
    this.ensureActive(customer.status);
    await this.lockout.record(key, 'customer', true, ip);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  /**
   * Sign in with mobile number OR email plus the password. The same generic error is returned for an
   * unknown account, a wrong password and an account that has no password yet (5 wrong tries lock it for 15 minutes).
   */
  async loginIdentifier(
    identifier: string,
    password: string,
    ip?: string,
  ): Promise<{ tokens: AuthTokens; customer: CustomerSummary }> {
    const raw = identifier.trim();
    const byEmail = raw.includes('@');
    const email = byEmail ? raw.toLowerCase() : null;
    const phone = byEmail ? null : OtpService.normalizePhone(raw);
    const key = byEmail ? (email as string) : `phone:${phone}`;
    if (await this.lockout.isLocked(key)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const customer = await this.prisma.customer.findUnique({
      where: byEmail ? { email: email as string } : { phone: phone as string },
    });
    const ok = customer?.passwordHash && (await this.passwords.verify(customer.passwordHash, password));
    if (!customer || !ok) {
      await this.lockout.record(key, 'customer', false, ip);
      throw new UnauthorizedException('Invalid mobile number / email or password');
    }
    this.ensureActive(customer.status);
    await this.lockout.record(key, 'customer', true, ip);
    return { tokens: await this.issueFor(customer.id), customer: this.toSummary(customer) };
  }

  /** Set a new password for the account whose mobile number (or email) was just verified by OTP. */
  async resetPassword(proof: string, password: string): Promise<{ success: true }> {
    const { kind, value } = readProof(proof);
    const customer = await this.findByIdentifier(kind === 'phone' ? { phone: value } : { email: value });
    if (!customer) throw new NotFoundException('No account found. Please create an account first.');
    this.ensureActive(customer.status);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: await this.passwords.hash(password) },
    });
    // Anyone who knew the old password must be signed out everywhere.
    await this.tokens.revokeAllFor(customer.id, 'customer');
    return { success: true };
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
