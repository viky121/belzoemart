/**
 * Shipping provider port (FR-5.2, FR-9.5). Adapters: mock (dev) and ShipRocket
 * (deploy). Domain code depends only on this interface so the courier
 * aggregator can be swapped without changes.
 */
export interface ServiceabilityResult {
  serviceable: boolean;
  codAvailable: boolean;
  estimatedDays: number;
  shippingCharge: number; // paise
}

export interface AwbResult {
  awb: string;
  courier: string;
  labelUrl?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
}

export interface TrackingUpdate {
  status: string;
  description: string;
  location?: string;
  occurredAt: string;
}

export interface ShipmentRequest {
  orderId: string;
  pincode: string;
  weightGrams: number;
  cod: boolean;
  amount: number; // paise
}

/**
 * Optional context for a tracking pull. Real couriers ignore it; the mock uses
 * it to emit a timeline consistent with the order's current status.
 */
export interface TrackingContext {
  orderStatus?: string;
  /** ISO timestamp the shipment was created (timeline start). */
  since?: string;
}

export interface ShippingProvider {
  readonly kind: 'shiprocket' | 'mock';
  checkServiceability(pincode: string, weightGrams: number, cod: boolean): Promise<ServiceabilityResult>;
  createAwb(req: ShipmentRequest): Promise<AwbResult>;
  getTracking(awb: string, ctx?: TrackingContext): Promise<TrackingUpdate[]>;
  /**
   * Cancel a shipment with the courier by its AWB (e.g. when the order is
   * cancelled before dispatch). Must be idempotent/safe to call for a shipment
   * the courier may have already cancelled or picked up.
   */
  cancelShipment(awb: string): Promise<void>;
}

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');
