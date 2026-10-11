import { Injectable } from '@nestjs/common';
import { progressRank } from '@belzo/shared';
import type {
  AwbResult,
  ServiceabilityResult,
  ShipmentRequest,
  ShippingProvider,
  TrackingContext,
  TrackingUpdate,
} from './shipping.provider';

const MOCK_STEPS: readonly { status: string; description: string; location: string }[] = [
  { status: 'packed', description: 'Shipment packed', location: 'Warehouse' },
  { status: 'shipped', description: 'Handed to courier', location: 'Bengaluru' },
  { status: 'out_for_delivery', description: 'Out for delivery', location: 'Destination hub' },
  { status: 'delivered', description: 'Delivered to customer', location: 'Destination' },
];
const STEP_GAP_MS = 30 * 60_000;

/**
 * Deterministic mock shipping provider for local dev/tests. Serviceable
 * everywhere with a flat estimate; produces a synthetic AWB and a tracking
 * timeline that follows the order status passed in the tracking context
 * (packed → shipped → out_for_delivery → delivered, never ahead of the order),
 * so the fulfilment flow is demoable without a courier.
 */
@Injectable()
export class MockShippingProvider implements ShippingProvider {
  readonly kind = 'mock' as const;

  async checkServiceability(_pincode: string, _weightGrams: number, cod: boolean): Promise<ServiceabilityResult> {
    return { serviceable: true, codAvailable: cod, estimatedDays: 4, shippingCharge: 4900 };
  }

  async createAwb(req: ShipmentRequest): Promise<AwbResult> {
    const awb = `MOCKAWB${req.orderId.slice(0, 8).toUpperCase()}`;
    return {
      awb,
      courier: 'Belzo Express (Mock)',
      trackingUrl: `/track/${awb}`,
      estimatedDelivery: new Date(Date.now() + 4 * 86_400_000).toISOString(),
    };
  }

  async getTracking(_awb: string, ctx?: TrackingContext): Promise<TrackingUpdate[]> {
    const now = Date.now();
    const status = ctx?.orderStatus === 'returned' ? 'delivered' : ctx?.orderStatus;
    // Pending/confirmed/cancelled/unknown/no context → the shipment is only packed.
    const reach = Math.max(progressRank(status), progressRank('packed'));
    const start = (ctx?.since ? Date.parse(ctx.since) : NaN) || now;
    return MOCK_STEPS.filter((s) => progressRank(s.status) <= reach).map((s, i) => ({
      status: s.status,
      description: s.description,
      location: s.location,
      occurredAt: new Date(Math.min(start + i * STEP_GAP_MS, now)).toISOString(),
    }));
  }
}
