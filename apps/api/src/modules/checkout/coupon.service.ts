import { Injectable, NotFoundException } from '@nestjs/common';
import { couponDiscount, type CouponSpec, type Money } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CouponEvaluation {
  code: string;
  valid: boolean;
  reason?: string;
  spec?: CouponSpec;
  discount: Money;
}

/**
 * Coupon evaluation (BR-8, BR-9). Validates a coupon against a subtotal and
 * usage limits, delegating the money math to the shared pure `couponDiscount`.
 */
@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  private toSpec(c: {
    kind: string;
    value: number;
    minOrder: number;
    maxDiscount: number | null;
  }): CouponSpec {
    return {
      kind: c.kind as CouponSpec['kind'],
      value: c.value,
      minOrder: c.minOrder as Money,
      maxDiscount: c.maxDiscount == null ? undefined : (c.maxDiscount as Money),
    };
  }

  /** Evaluate a coupon code for a customer + subtotal. */
  async evaluate(code: string, subtotal: Money, customerId?: string): Promise<CouponEvaluation> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
    const zero = 0 as Money;
    if (!coupon || !coupon.isActive) return { code, valid: false, reason: 'Invalid coupon', discount: zero };

    const now = new Date();
    if (coupon.startsAt > now) return { code, valid: false, reason: 'Coupon not yet active', discount: zero };
    if (coupon.endsAt && coupon.endsAt < now) return { code, valid: false, reason: 'Coupon expired', discount: zero };
    if (subtotal < coupon.minOrder) {
      return { code, valid: false, reason: 'Order below minimum for this coupon', discount: zero };
    }

    if (coupon.usageLimit != null) {
      const used = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id } });
      if (used >= coupon.usageLimit) return { code, valid: false, reason: 'Coupon usage limit reached', discount: zero };
    }
    if (coupon.perUserLimit != null && customerId) {
      const usedByUser = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, customerId },
      });
      if (usedByUser >= coupon.perUserLimit) {
        return { code, valid: false, reason: 'Coupon already used', discount: zero };
      }
    }

    const spec = this.toSpec(coupon);
    return { code: coupon.code, valid: true, spec, discount: couponDiscount(spec, subtotal) };
  }

  /** Record a redemption when an order is placed with a coupon (BR-8 usage limits). */
  async redeem(code: string, orderId: string, customerId: string): Promise<void> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!coupon) return;
    await this.prisma.couponRedemption.create({ data: { couponId: coupon.id, orderId, customerId } });
  }

  // ---- Admin CRUD (FR-10 marketing / offers management) ----

  /** All coupons with redemption counts, newest first. */
  adminList() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async adminCreate(input: AdminCouponInput) {
    return this.prisma.coupon.create({ data: this.toData(input) });
  }

  async adminUpdate(id: string, input: Partial<AdminCouponInput>) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');
    const data: Record<string, unknown> = {};
    if (input.code !== undefined) data.code = input.code.toUpperCase().trim();
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.value !== undefined) data.value = input.value;
    if (input.minOrder !== undefined) data.minOrder = input.minOrder;
    if (input.maxDiscount !== undefined) data.maxDiscount = input.maxDiscount;
    if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.coupon.update({ where: { id }, data });
  }

  async adminRemove(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');
    await this.prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  }

  private toData(input: AdminCouponInput) {
    return {
      code: input.code.toUpperCase().trim(),
      kind: input.kind as CouponSpec['kind'],
      value: input.value,
      minOrder: input.minOrder ?? 0,
      maxDiscount: input.maxDiscount ?? null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive ?? true,
    };
  }
}

export interface AdminCouponInput {
  code: string;
  kind: 'flat' | 'percent' | 'free_shipping';
  value: number;
  minOrder?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}
