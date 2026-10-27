import { Logger } from '@nestjs/common';
import { isOfferLive, type SpendOfferRule } from '@belzo/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';

const logger = new Logger('LiveOffers');

/**
 * The special-price offers that are on right now, as plain rules for the cart. A problem reading them must
 * never stop a customer from shopping, so any failure means "no offers" (normal prices) and is logged.
 */
export async function liveOfferRules(prisma: PrismaService, now: Date = new Date()): Promise<SpendOfferRule[]> {
  try {
    const rows = await prisma.spendOffer.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .filter((r) => isOfferLive(r, now))
      .map((r) => ({
        id: r.id,
        name: r.name,
        variantId: r.variantId,
        minSpend: r.minSpend,
        specialPrice: r.specialPrice,
        units: Math.max(1, r.units),
      }));
  } catch (e) {
    logger.warn(`Could not read offers, using normal prices: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
