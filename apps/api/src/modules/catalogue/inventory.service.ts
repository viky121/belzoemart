import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { adjust, confirmSale, InsufficientStockError, release, reserve } from './inventory.logic';

/**
 * DB-backed inventory (BR-6..BR-9). Wraps the pure inventory logic in
 * transactions, persisting the new counts and appending a StockMovement audit
 * row for every change. Used by U4 checkout (reserve), U5 orders
 * (confirm/return), and admin (adjust).
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getStock(variantId: string): Promise<number> {
    const inv = await this.prisma.inventory.findUnique({ where: { variantId } });
    return inv?.available ?? 0;
  }

  private async mutate(
    variantId: string,
    fn: (s: { available: number; reserved: number }) => { available: number; reserved: number },
    delta: number,
    reason: 'purchase' | 'sale' | 'return_' | 'adjustment' | 'reserve' | 'release',
    ref?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({ where: { variantId } });
      if (!inv) throw new NotFoundException('Inventory not found for variant');
      let next: { available: number; reserved: number };
      try {
        next = fn({ available: inv.available, reserved: inv.reserved });
      } catch (e) {
        if (e instanceof InsufficientStockError) {
          throw new BadRequestException('Insufficient stock');
        }
        throw e;
      }
      const updated = await tx.inventory.update({
        where: { variantId },
        data: { available: next.available, reserved: next.reserved },
      });
      await tx.stockMovement.create({ data: { variantId, delta, reason, ref } });
      return updated;
    });
  }

  reserve(variantId: string, qty: number, ref?: string) {
    return this.mutate(variantId, (s) => reserve(s, qty), -qty, 'reserve', ref);
  }

  release(variantId: string, qty: number, ref?: string) {
    return this.mutate(variantId, (s) => release(s, qty), qty, 'release', ref);
  }

  confirmSale(variantId: string, qty: number, ref?: string) {
    return this.mutate(variantId, (s) => confirmSale(s, qty), -qty, 'sale', ref);
  }

  adjust(variantId: string, delta: number, ref?: string) {
    return this.mutate(variantId, (s) => adjust(s, delta), delta, 'adjustment', ref);
  }
}
