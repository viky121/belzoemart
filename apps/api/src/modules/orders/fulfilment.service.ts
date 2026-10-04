import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { canTransition, type OrderStatus } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../admin/settings.service';
import {
  SHIPPING_PROVIDER,
  type ServiceabilityResult,
  type ShippingProvider,
} from '../../integrations/shipping/shipping.provider';

/** Admin-configurable fallback item weight (grams) when a variant has none set. */
const DEFAULT_ITEM_WEIGHT_KEY = 'shipping.defaultItemWeightGrams';
const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/**
 * Fulfilment (BR-6, BR-7, FR-5.2). Creates a shipment/AWB via the shipping port
 * and advances the order state as tracking updates arrive. All external calls
 * go through the resilient HTTP client inside the adapter.
 */
@Injectable()
export class FulfilmentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolve the fallback per-item weight from admin settings
   * (`shipping.defaultItemWeightGrams`), defaulting to 500g when unset or when
   * the stored value is not a positive integer number of grams.
   */
  private async resolveDefaultItemWeightGrams(): Promise<number> {
    const raw = await this.settings.get<unknown>(DEFAULT_ITEM_WEIGHT_KEY);
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
    return DEFAULT_ITEM_WEIGHT_GRAMS;
  }

  serviceability(pincode: string, weightGrams: number, cod: boolean): Promise<ServiceabilityResult> {
    return this.shipping.checkServiceability(pincode, weightGrams, cod);
  }

  /** Create a shipment for a confirmed order and move it to `packed` (BR-6). */
  async createShipment(orderId: string): Promise<{ shipmentId: string; awb: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const existing = await this.prisma.shipment.findFirst({ where: { orderId } });
    if (existing?.awb) return { shipmentId: existing.id, awb: existing.awb };

    const address = await this.prisma.address.findUnique({ where: { id: order.addressId } });

    // Prefer each line's real variant weight; fall back to the admin-configurable
    // default (default 500g) when a variant has no weight recorded.
    const defaultWeight = await this.resolveDefaultItemWeightGrams();
    const variantIds = [...new Set(order.items.map((i) => i.variantId))];
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, weightGrams: true },
    });
    const weightByVariant = new Map(variants.map((v) => [v.id, v.weightGrams]));
    const weight = order.items.reduce((s, i) => {
      const variantWeight = weightByVariant.get(i.variantId) ?? 0;
      const perItem = variantWeight > 0 ? variantWeight : defaultWeight;
      return s + perItem * i.quantity;
    }, 0);
    const awb = await this.shipping.createAwb({
      orderId,
      pincode: address?.pincode ?? '000000',
      weightGrams: weight,
      cod: order.codFee > 0,
      amount: order.grandTotal,
    });

    const shipment = await this.prisma.shipment.create({
      data: {
        orderId,
        provider: this.shipping.kind,
        awb: awb.awb,
        courier: awb.courier,
        status: 'packed',
        trackingUrl: awb.trackingUrl,
        labelUrl: awb.labelUrl,
        estimatedDelivery: awb.estimatedDelivery ? new Date(awb.estimatedDelivery) : null,
      },
    });

    if (canTransition(order.status, 'packed')) {
      await this.prisma.order.update({ where: { id: orderId }, data: { status: 'packed' } });
    }
    return { shipmentId: shipment.id, awb: awb.awb };
  }

  /** Pull tracking updates and advance the order state (BR-6). */
  async syncTracking(shipmentId: string): Promise<void> {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment?.awb) return;
    const updates = await this.shipping.getTracking(shipment.awb);

    for (const u of updates) {
      await this.prisma.trackingEvent.create({
        data: {
          shipmentId,
          status: u.status,
          description: u.description,
          location: u.location,
          occurredAt: new Date(u.occurredAt),
        },
      });
    }

    // Map the latest tracking status onto the order state machine.
    const latest = updates[updates.length - 1]?.status;
    const map: Record<string, OrderStatus> = {
      shipped: 'shipped',
      out_for_delivery: 'out_for_delivery',
      delivered: 'delivered',
    };
    const target = latest ? map[latest] : undefined;
    if (target) {
      const order = await this.prisma.order.findFirst({ where: { id: shipment.orderId } });
      if (order && canTransition(order.status, target)) {
        await this.prisma.order.update({ where: { id: shipment.orderId }, data: { status: target } });
      }
    }
  }

  getTimeline(orderId: string) {
    return this.prisma.shipment.findMany({
      where: { orderId },
      include: { events: { orderBy: { occurredAt: 'asc' } } },
    });
  }
}
