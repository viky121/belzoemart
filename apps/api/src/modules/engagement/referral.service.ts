import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WalletService } from './wallet.service';

const REFERRER_REWARD = 10000; // ₹100 paise
const REFEREE_REWARD = 5000; // ₹50 paise

/**
 * Referral programme (FR-6.2, BR-7). Each customer has a unique code; when a
 * referred customer is rewarded (e.g. after first delivered order), both are
 * credited via the wallet using an idempotent ref.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  private code(): string {
    return `BELZO${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async getOrCreateCode(customerId: string): Promise<string> {
    const existing = await this.prisma.referral.findFirst({ where: { customerId, referredCustomerId: null } });
    if (existing) return existing.code;
    let code = this.code();
    // Ensure uniqueness.
    while (await this.prisma.referral.findUnique({ where: { code } })) code = this.code();
    const created = await this.prisma.referral.create({ data: { customerId, code } });
    return created.code;
  }

  /** Attribute a new customer to a referral code at signup. */
  async attribute(code: string, referredCustomerId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({ where: { code } });
    if (!referral || referral.customerId === referredCustomerId) return;
    await this.prisma.referral.create({
      data: { customerId: referral.customerId, code: `${code}-${referredCustomerId.slice(0, 6)}`, referredCustomerId },
    });
  }

  /** Reward both parties once (idempotent by referral id ref). */
  async reward(referralId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({ where: { id: referralId } });
    if (!referral || !referral.referredCustomerId || referral.rewardedAt) return;
    await this.wallet.earn(referral.customerId, REFERRER_REWARD, 'referral_reward', `ref:${referralId}:owner`);
    await this.wallet.earn(referral.referredCustomerId, REFEREE_REWARD, 'referral_bonus', `ref:${referralId}:referee`);
    await this.prisma.referral.update({ where: { id: referralId }, data: { rewardedAt: new Date() } });
  }
}
