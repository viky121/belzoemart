import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYNC_TABLE, orderWalk, type DeliveryMove, type ShipmentStatusValue } from '@belzo/shared';
import { SHIPPING_PROVIDER, type ShippingProvider } from '../../../integrations/shipping/shipping.provider';
import { OrderService } from '../../orders/order.service';
import type { Tx } from './job.repository';

const FINAL_SHIPMENT: readonly string[] = ['delivered', 'cancelled', 'rto'];
/** Forward order of shipment statuses; `cancelled` and `rto` are end states handled separately. */
const SHIPMENT_FLOW: readonly string[] = ['created', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export const INHOUSE_PROVIDER = 'inhouse';
export const INHOUSE_COURIER = 'Belzo Delivery';

export interface SyncOutcome {
  /** The order must be cancelled as undeliverable once the transaction has committed (BR-D56). */
  cancelOrderAfterCommit: boolean;
}

/** A courier shipment that was taken over; the courier is told after commit. */
export interface TakenOverShipment {
  provider: string;
  awb: string | null;
}

/**
 * Keeps the order, its shipment and the customer's tracking timeline in step with a delivery job
 * (BR-D14, BR-D50 to BR-D57). All writes that can be done in the job's transaction are done there;
 * the two effects that call other services (telling a courier, cancelling an undeliverable order)
 * are returned for the caller to run after commit.
 */
@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger('OrderSyncService');

  constructor(
    @Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider,
    private readonly orders: OrderService,
  ) {}

  /**
   * Give the order an in-house shipment (BR-D14). A shipment that the mock or a courier made earlier
   * is taken over, so the customer sees one shipment and not a cancelled one next to a new one.
   * Any further open shipments are cancelled.
   */
  async attachInhouseShipment(tx: Tx, orderId: string, jobCode: string, now: Date): Promise<{ shipmentId: string; takenOver: TakenOverShipment[] }> {
    const open = await tx.shipment.findMany({
      where: { orderId, status: { notIn: FINAL_SHIPMENT as ('delivered' | 'cancelled' | 'rto')[] } },
      orderBy: { createdAt: 'desc' },
    });
    const takenOver: TakenOverShipment[] = [];
    const [keep, ...extra] = open;

    for (const s of extra) {
      takenOver.push({ provider: s.provider, awb: s.awb });
      await tx.shipment.update({ where: { id: s.id }, data: { status: 'cancelled' } });
      await tx.trackingEvent.create({ data: { shipmentId: s.id, status: 'cancelled', description: 'Shipment cancelled', occurredAt: now } });
    }

    if (keep) {
      if (keep.provider !== INHOUSE_PROVIDER) takenOver.push({ provider: keep.provider, awb: keep.awb });
      await tx.shipment.update({
        where: { id: keep.id },
        data: { provider: INHOUSE_PROVIDER, awb: jobCode, courier: INHOUSE_COURIER, status: 'packed', trackingUrl: null, labelUrl: null, manifestUrl: null },
      });
      return { shipmentId: keep.id, takenOver };
    }

    const created = await tx.shipment.create({
      data: { orderId, provider: INHOUSE_PROVIDER, awb: jobCode, courier: INHOUSE_COURIER, status: 'packed' },
    });
    return { shipmentId: created.id, takenOver };
  }

  /** After commit: tell a real courier that its shipment is no longer needed. Never throws (best effort, like order cancel). */
  async releaseCourierShipments(taken: TakenOverShipment[]): Promise<void> {
    for (const t of taken) {
      if (!t.awb || t.provider === 'mock' || t.provider === INHOUSE_PROVIDER) continue;
      try {
        await this.shipping.cancelShipment(t.awb);
      } catch (e) {
        this.logger.warn(`Courier cancel failed for awb ${t.awb}; reconcile manually: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /**
   * Write the effects of one move: a tracking event with the customer-safe text, the shipment status
   * and the order status (forward only). Runs inside the job's transaction.
   */
  async apply(tx: Tx, job: { orderId: string; shipmentId: string | null }, move: DeliveryMove, now: Date): Promise<SyncOutcome> {
    const row = SYNC_TABLE[move];

    if (job.shipmentId) {
      await tx.trackingEvent.create({
        data: { shipmentId: job.shipmentId, status: row.trackingStatus, description: row.trackingText, occurredAt: now },
      });
      if (row.shipmentStatus) await this.moveShipment(tx, job.shipmentId, row.shipmentStatus);
    }

    if (row.orderStatus) {
      const order = await tx.order.findUnique({ where: { id: job.orderId }, select: { status: true } });
      if (order) {
        const walk = orderWalk(order.status, row.orderStatus);
        const target = walk[walk.length - 1];
        if (target) await tx.order.update({ where: { id: job.orderId }, data: { status: target } });
      }
    }

    return { cancelOrderAfterCommit: row.orderEffect === 'cancel_undeliverable' };
  }

  /** After commit: cancel an order whose delivery failed for good. The reconcile sweep repeats it if this fails. */
  async cancelUndeliverableOrder(orderId: string): Promise<boolean> {
    try {
      await this.orders.cancelUndeliverable(orderId);
      return true;
    } catch (e) {
      this.logger.error(`Could not cancel undeliverable order ${orderId}; the sweep will retry: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private async moveShipment(tx: Tx, shipmentId: string, target: ShipmentStatusValue): Promise<void> {
    const shipment = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { status: true } });
    if (!shipment) return;
    const endState = target === 'cancelled' || target === 'rto';
    if (!endState) {
      if (FINAL_SHIPMENT.includes(shipment.status)) return;
      if (SHIPMENT_FLOW.indexOf(target) < SHIPMENT_FLOW.indexOf(shipment.status)) return;
    }
    if (shipment.status !== target) await tx.shipment.update({ where: { id: shipmentId }, data: { status: target } });
  }
}
