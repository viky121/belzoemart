import { BadRequestException, Injectable } from '@nestjs/common';
import { applyEntry, canRedeem, InsufficientBalanceError } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Wallet / loyalty (FR-6.2, BR-4..BR-6). Balance never negative; earn/redeem
 * idempotent by `ref` (unique per customer); every change appends a ledger
 * entry with the resulting balanceAfter. Uses the shared pure `applyEntry`.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(customerId: string): Promise<number> {
    const account = await this.prisma.walletAccount.findUnique({ where: { customerId } });
    return account?.balance ?? 0;
  }

  ledger(customerId: string) {
    return this.prisma.walletEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mutate(customerId: string, kind: 'earn' | 'redeem', amount: number, reason: string, ref: string) {
    return this.prisma.$transaction(async (tx) => {
      // Idempotency: if this ref was already applied for the customer, no-op.
      const existing = await tx.walletEntry.findUnique({
        where: { customerId_ref: { customerId, ref } },
      });
      if (existing) {
        const account = await tx.walletAccount.findUnique({ where: { customerId } });
        return { balance: account?.balance ?? 0, applied: false };
      }

      const account = await tx.walletAccount.upsert({
        where: { customerId },
        update: {},
        create: { customerId, balance: 0 },
      });

      let newBalance: number;
      try {
        newBalance = applyEntry(account.balance, { kind, amount, ref });
      } catch (e) {
        if (e instanceof InsufficientBalanceError) throw new BadRequestException('Insufficient wallet balance');
        throw e;
      }

      await tx.walletAccount.update({ where: { customerId }, data: { balance: newBalance } });
      await tx.walletEntry.create({
        data: { customerId, delta: kind === 'earn' ? amount : -amount, reason, ref, balanceAfter: newBalance },
      });
      return { balance: newBalance, applied: true };
    });
  }

  earn(customerId: string, amount: number, reason: string, ref: string) {
    return this.mutate(customerId, 'earn', amount, reason, ref);
  }

  async redeem(customerId: string, amount: number, reason: string, ref: string) {
    const balance = await this.getBalance(customerId);
    if (!canRedeem(balance, amount)) throw new BadRequestException('Insufficient wallet balance');
    return this.mutate(customerId, 'redeem', amount, reason, ref);
  }
}
