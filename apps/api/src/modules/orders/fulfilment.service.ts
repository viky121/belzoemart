import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ORDER_PROGRESS_STEPS, canTransition, progressRank, type OrderStatus } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { SettingsService } from '../admin/settings.service';
import { notifyOrderStatus } from './order-events';
import {
  SHIPPING_PROVIDER,
  type ServiceabilityResult,
  type ShippingProvider,
} from '../../integrations/shipping/shipping.provider';

/** Admin-configurable fallback item weight (grams) when a variant has none set. */
const DEFAULT_ITEM_WEIGHT_KEY = 'shipping.defaultItemWeightGrams';
const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/** ShipmentStatus values a tracking pull may move a shipment to. */
const SHIPMENT_PROGRESS_STATUSES: readonly OrderStatus[] = ['packed', 'shipped', 'out_for_delivery', 'delivered'];
/** Courier statuses that advance the order (as before: shipped and beyond). */
const ORDER_MOVING_STATUSES: readonly OrderStatus[] = ['shipped', 'out_for_delivery', 'delivered'];

/**
 * Fulfilment (BR-6, BR-7, FR-5.2). Creates a shipment/AWB via the shipping port
 * and advances the order state as tracking updates arrive. All external calls
 * go through the resilient HTTP client inside the adapter.
 */
@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger('FulfilmentService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider,
    private readonly settings: SettingsService,
    @Optional() private readonly queue?: QueueService,
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

    // An order that is in the hands of an in-house delivery partner has its own Shipment; never
    // create a courier or mock shipment behind its back (U8, BR-D59).
    const activeJob = await this.prisma.deliveryJob.findFirst({
      where: { orderId, status: { notIn: ['delivered', 'returned', 'cancelled'] } },
      select: { shipmentId: true },
    });
    if (activeJob) {
      const own = activeJob.shipmentId ? await this.prisma.shipment.findUnique({ where: { id: activeJob.shipmentId } }) : null;
      return { shipmentId: own?.id ?? '', awb: own?.awb ?? '' };
    }

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

  /**
   * Cancel the courier shipment(s) for an order being cancelled (BR-2/BR-3).
   * The order cancellation is authoritative, so the courier call is
   * best-effort: a failure is logged for manual reconciliation but never
   * blocks the cancel. Shipments already delivered/cancelled/returned (rto)
   * are skipped. Our shipment is marked `cancelled` with a tracking event so
   * the timeline stays consistent with the order.
   */
  async cancelShipmentsForOrder(orderId: string): Promise<void> {
    const shipments = await this.prisma.shipment.findMany({ where: { orderId } });
    for (const s of shipments) {
      if (s.status === 'delivered' || s.status === 'cancelled' || s.status === 'rto') continue;
      // In-house shipments have no courier to call; their AWB is just the delivery job code.
      if (s.awb && s.provider !== 'inhouse') {
        try {
          await this.shipping.cancelShipment(s.awb);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `Courier cancel failed for shipment ${s.id} (awb ${s.awb}); order ${orderId} is still cancelled. Reconcile manually: ${reason}`,
          );
        }
      }
      await this.prisma.shipment.update({ where: { id: s.id }, data: { status: 'cancelled' } });
      await this.prisma.trackingEvent.create({
        data: {
          shipmentId: s.id,
          status: 'cancelled',
          description: 'Shipment cancelled',
          location: null,
          occurredAt: new Date(),
        },
      });
    }
  }

  /**
   * Pull tracking updates and advance the order state (BR-6). Stores only
   * events not already recorded, moves the shipment status forward, and walks
   * the order through each legal transition up to the furthest courier status
   * (e.g. packed → shipped → out_for_delivery), written as a single update.
   */
  async syncTracking(shipmentId: string): Promise<void> {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment?.awb) return;
    // In-house shipments are updated by the delivery module itself; there is no courier to ask.
    if (shipment.provider === 'inhouse') return;
    const order = await this.prisma.order.findUnique({ where: { id: shipment.orderId } });
    if (!order) return;
    const updates = await this.shipping.getTracking(shipment.awb, {
      orderStatus: order.status,
      since: shipment.createdAt.toISOString(),
    });

    const eventKey = (e: { status: string; description: string; location?: string | null }) =>
      `${e.status}|${e.description}|${e.location ?? ''}`;
    const existing = await this.prisma.trackingEvent.findMany({ where: { shipmentId } });
    const stored = new Set(existing.map(eventKey));
    for (const u of updates) {
      const key = eventKey(u);
      if (stored.has(key)) continue;
      stored.add(key);
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

    // Furthest progress step reported by the courier.
    const furthestRank = updates.reduce((max, u) => Math.max(max, progressRank(u.status)), -1);
    const furthest = ORDER_PROGRESS_STEPS[furthestRank];
    if (!furthest) return;

    if (SHIPMENT_PROGRESS_STATUSES.includes(furthest) && furthestRank > progressRank(shipment.status)) {
      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: { status: furthest as 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' },
      });
    }

    // Only courier movement (shipped and beyond) advances the order; never
    // confirm a pending order or touch a terminal one.
    if (!ORDER_MOVING_STATUSES.includes(furthest) || order.status === 'pending') return;
    let current: OrderStatus = order.status;
    for (;;) {
      const next: OrderStatus | undefined = ORDER_PROGRESS_STEPS[progressRank(current) + 1];
      if (!next || progressRank(next) > furthestRank || !canTransition(current, next)) break;
      current = next;
    }
    if (current !== order.status) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: current } });
      // Email the customer for the milestones this sync just crossed (one mail each, even if the
      // courier jumped straight from packed to delivered).
      if (progressRank(order.status) < progressRank('shipped') && progressRank(current) >= progressRank('shipped')) {
        await notifyOrderStatus(this.queue, order.id, 'shipped');
      }
      if (current === 'delivered') await notifyOrderStatus(this.queue, order.id, 'delivered');
    }
  }

  getTimeline(orderId: string) {
    return this.prisma.shipment.findMany({
      where: { orderId },
      include: { events: { orderBy: { occurredAt: 'asc' } } },
    });
  }
}
