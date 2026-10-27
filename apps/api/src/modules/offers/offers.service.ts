import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { effectiveOrderLimits, isOfferLive, variantUnitLabel, type ActiveOfferView } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';

export type OfferStatusLabel = 'live' | 'scheduled' | 'ended' | 'off';

export interface OfferInput {
  name: string;
  /** Spend needed on the other items, paise. */
  minSpend: number;
  variantId: string;
  /** Price of the pack once unlocked, paise. */
  specialPrice: number;
  units: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface AdminOfferView {
  id: string;
  name: string;
  isActive: boolean;
  status: OfferStatusLabel;
  startsAt: Date | null;
  endsAt: Date | null;
  minSpend: number;
  specialPrice: number;
  units: number;
  variant: {
    id: string;
    productId: string;
    title: string;
    unit: string;
    sellingPrice: number;
    imageUrl: string | null;
    available: number;
  };
  /** The special price is below what the pack costs the shop (cost is admin only). */
  belowCost: boolean;
  /** Units sold through this offer in orders that were not cancelled. */
  soldUnits: number;
}

export interface OfferPack {
  variantId: string;
  productId: string;
  title: string;
  unit: string;
  sellingPrice: number;
  imageUrl: string | null;
  available: number;
  minOrderQty: number;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function offerStatusLabel(o: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): OfferStatusLabel {
  if (!o.isActive) return 'off';
  if (o.endsAt && o.endsAt.getTime() <= now.getTime()) return 'ended';
  if (o.startsAt && o.startsAt.getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

/**
 * Special-price offers: the admin side (list, add, change, delete) and the public list the product page uses.
 * The cart reads the live offers through `liveOfferRules`; this service never prices a cart.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // ----- storefront -----

  /** Live offers on active packs of published products, for "Shop X and get this at Y" on the product page. */
  async publicActive(now: Date = new Date()): Promise<ActiveOfferView[]> {
    const rows = await this.prisma.spendOffer.findMany({
      where: { isActive: true, variant: { isActive: true, product: { status: 'published' } } },
      include: { variant: { select: { productId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .filter((r) => isOfferLive(r, now))
      .map((r) => ({
        id: r.id,
        name: r.name,
        variantId: r.variantId,
        productId: r.variant.productId,
        minSpend: r.minSpend,
        specialPrice: r.specialPrice,
        units: r.units,
      }));
  }

  // ----- admin -----

  async list(now: Date = new Date()): Promise<AdminOfferView[]> {
    const rows = await this.prisma.spendOffer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        variant: {
          include: { inventory: true, product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
        },
      },
    });
    const sold = rows.length
      ? await this.prisma.orderItem.groupBy({
          by: ['offerId'],
          where: { offerId: { in: rows.map((r) => r.id) }, order: { status: { notIn: ['cancelled'] } } },
          _sum: { quantity: true },
        })
      : [];
    const soldById = new Map(sold.map((s) => [s.offerId, s._sum.quantity ?? 0]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      status: offerStatusLabel(r, now),
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      minSpend: r.minSpend,
      specialPrice: r.specialPrice,
      units: r.units,
      variant: {
        id: r.variant.id,
        productId: r.variant.productId,
        title: r.variant.product.title,
        unit: variantUnitLabel(r.variant) ?? '',
        sellingPrice: r.variant.sellingPrice,
        imageUrl: r.variant.product.images[0]?.url ?? r.variant.imageUrl ?? null,
        available: r.variant.inventory?.available ?? 0,
      },
      belowCost: typeof r.variant.costPrice === 'number' && r.specialPrice < r.variant.costPrice,
      soldUnits: soldById.get(r.id) ?? 0,
    }));
  }

  /** Packs the admin can pick for an offer: active packs of published products matching the search. */
  async searchPacks(search: string): Promise<OfferPack[]> {
    const term = search.trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.variant.findMany({
      where: {
        isActive: true,
        product: { status: 'published' },
        OR: [
          { product: { title: { contains: term, mode: 'insensitive' } } },
          { sku: { contains: term, mode: 'insensitive' } },
        ],
      },
      include: { inventory: true, product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
      orderBy: { product: { title: 'asc' } },
      take: 20,
    });
    return rows.map((v) => ({
      variantId: v.id,
      productId: v.productId,
      title: v.product.title,
      unit: variantUnitLabel(v) ?? '',
      sellingPrice: v.sellingPrice,
      imageUrl: v.product.images[0]?.url ?? v.imageUrl ?? null,
      available: v.inventory?.available ?? 0,
      minOrderQty: effectiveOrderLimits(v).min,
    }));
  }

  async create(actorId: string, input: OfferInput): Promise<AdminOfferView> {
    await this.validate(input);
    const created = await this.prisma.spendOffer.create({ data: this.data(input) });
    await this.audit.record(actorId, 'offer.create', created.id, undefined, this.snapshot(input));
    return this.one(created.id);
  }

  async update(actorId: string, id: string, patch: Partial<OfferInput>): Promise<AdminOfferView> {
    const current = await this.prisma.spendOffer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Offer not found');
    const before: OfferInput = {
      name: current.name,
      minSpend: current.minSpend,
      variantId: current.variantId,
      specialPrice: current.specialPrice,
      units: current.units,
      isActive: current.isActive,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
    };
    const next: OfferInput = { ...before, ...patch };
    await this.validate(next, id);
    await this.prisma.spendOffer.update({ where: { id }, data: this.data(next) });
    await this.audit.record(actorId, 'offer.update', id, this.snapshot(before), this.snapshot(next));
    return this.one(id);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const current = await this.prisma.spendOffer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Offer not found');
    await this.prisma.spendOffer.delete({ where: { id } });
    await this.audit.record(actorId, 'offer.delete', id, { name: current.name, specialPrice: current.specialPrice });
  }

  private async one(id: string): Promise<AdminOfferView> {
    const all = await this.list();
    const found = all.find((o) => o.id === id);
    if (!found) throw new NotFoundException('Offer not found');
    return found;
  }

  private data(i: OfferInput) {
    return {
      name: i.name.trim(),
      isActive: i.isActive,
      startsAt: i.startsAt,
      endsAt: i.endsAt,
      minSpend: i.minSpend,
      variantId: i.variantId,
      specialPrice: i.specialPrice,
      units: i.units,
    };
  }

  private snapshot(i: OfferInput) {
    return { name: i.name, minSpend: i.minSpend, variantId: i.variantId, specialPrice: i.specialPrice, units: i.units, isActive: i.isActive };
  }

  /** The rules an offer must follow before it is saved. Messages are written for the admin. */
  private async validate(i: OfferInput, exceptId?: string): Promise<void> {
    if (i.name.trim().length < 1 || i.name.trim().length > 80) throw new BadRequestException('Give the offer a name (up to 80 letters).');
    if (!Number.isInteger(i.minSpend) || i.minSpend < 100) throw new BadRequestException('The spend amount must be at least ₹1.');
    if (!Number.isInteger(i.specialPrice) || i.specialPrice < 100) throw new BadRequestException('The special price must be at least ₹1.');
    if (!Number.isInteger(i.units) || i.units < 1 || i.units > 10) throw new BadRequestException('Units per order must be between 1 and 10.');
    if (i.startsAt && i.endsAt && i.endsAt.getTime() <= i.startsAt.getTime()) {
      throw new BadRequestException('The end date must be after the start date.');
    }
    const variant = await this.prisma.variant.findUnique({
      where: { id: i.variantId },
      select: { id: true, isActive: true, sellingPrice: true, minOrderQty: true, maxOrderQty: true, product: { select: { title: true } } },
    });
    if (!variant || !variant.isActive) throw new BadRequestException('Pick a product pack that is on sale.');
    if (i.specialPrice >= variant.sellingPrice) {
      throw new BadRequestException(`The special price must be lower than the normal price (${rupees(variant.sellingPrice)}).`);
    }
    const min = effectiveOrderLimits(variant).min;
    if (i.units < min) {
      throw new BadRequestException(`"${variant.product.title}" needs at least ${min} per order, so units per order cannot be lower than ${min}.`);
    }
    if (i.isActive) {
      const clash = await this.prisma.spendOffer.findFirst({
        where: { variantId: i.variantId, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { name: true },
      });
      if (clash) {
        throw new ConflictException(`This pack already has an offer ("${clash.name}"). Switch that one off or change it instead.`);
      }
    }
  }
}
