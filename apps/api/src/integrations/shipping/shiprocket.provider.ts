import { Injectable, Logger } from '@nestjs/common';
import { ResilientHttpService } from '../../common/http/resilient-http.service';
import { SettingsService } from '../../modules/admin/settings.service';
import type {
  AwbResult,
  ServiceabilityResult,
  ShipmentRequest,
  ShippingProvider,
  TrackingUpdate,
} from './shipping.provider';

/** Admin-configurable warehouse pickup PIN; falls back to the Bengaluru origin. */
const PICKUP_PINCODE_KEY = 'shipping.pickupPincode';
const DEFAULT_PICKUP_PINCODE = '560001';

/**
 * ShipRocket adapter (deploy-time). Authenticates and creates AWBs via the
 * ShipRocket API through the resilient HTTP client (timeout + circuit breaker).
 * Fully wired at deploy when SHIPPING_PROVIDER=live and credentials are set;
 * methods throw a clear error until then so misconfiguration is obvious.
 */
@Injectable()
export class ShipRocketProvider implements ShippingProvider {
  readonly kind = 'shiprocket' as const;
  private readonly logger = new Logger('ShipRocketProvider');
  private token?: string;

  constructor(
    private readonly http: ResilientHttpService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolve the warehouse pickup PIN from admin settings (`shipping.pickupPincode`),
   * falling back to the Bengaluru default when unset or not a valid 6-digit PIN.
   */
  private async resolvePickupPincode(): Promise<string> {
    const raw = await this.settings.get<unknown>(PICKUP_PINCODE_KEY);
    if (typeof raw === 'string' && /^[1-9]\d{5}$/.test(raw.trim())) return raw.trim();
    return DEFAULT_PICKUP_PINCODE;
  }

  private async auth(): Promise<string> {
    if (this.token) return this.token;
    const res = await this.http.request<{ token: string }>(
      'shiprocket',
      'https://apiv2.shiprocket.in/v1/external/auth/login',
      {
        method: 'POST',
        body: { email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD },
      },
    );
    this.token = res.token;
    return this.token;
  }

  async checkServiceability(pincode: string, weightGrams: number, cod: boolean): Promise<ServiceabilityResult> {
    const token = await this.auth();
    const pickupPincode = await this.resolvePickupPincode();
    const res = await this.http.request<{
      data?: { available_courier_companies?: { estimated_delivery_days?: string; rate?: number }[] };
    }>(
      'shiprocket',
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${pincode}&weight=${weightGrams / 1000}&cod=${cod ? 1 : 0}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const best = res.data?.available_courier_companies?.[0];
    return {
      serviceable: Boolean(best),
      codAvailable: cod,
      estimatedDays: Number(best?.estimated_delivery_days ?? 5),
      shippingCharge: Math.round((best?.rate ?? 49) * 100),
    };
  }

  async createAwb(req: ShipmentRequest): Promise<AwbResult> {
    // Wired at deploy: create order + assign AWB. Kept explicit until configured.
    if (!process.env.SHIPROCKET_EMAIL) {
      throw new Error('ShipRocket not configured — set SHIPPING_PROVIDER=mock for local dev');
    }
    const token = await this.auth();
    this.logger.log(`Creating ShipRocket AWB for order ${req.orderId}`);
    const res = await this.http.request<{ awb_code?: string; courier_name?: string }>(
      'shiprocket',
      'https://apiv2.shiprocket.in/v1/external/courier/assign/awb',
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { orderId: req.orderId } },
    );
    return { awb: res.awb_code ?? '', courier: res.courier_name ?? 'ShipRocket' };
  }

  async cancelShipment(awb: string): Promise<void> {
    if (!process.env.SHIPROCKET_EMAIL) {
      throw new Error('ShipRocket not configured — set SHIPPING_PROVIDER=mock for local dev');
    }
    const token = await this.auth();
    this.logger.log(`Cancelling ShipRocket shipment for AWB ${awb}`);
    await this.http.request(
      'shiprocket',
      'https://apiv2.shiprocket.in/v1/external/orders/cancel/shipment/awbs',
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { awbs: [awb] } },
    );
  }

  async getTracking(awb: string): Promise<TrackingUpdate[]> {
    const token = await this.auth();
    const res = await this.http.request<{
      tracking_data?: { shipment_track_activities?: { status?: string; activity?: string; location?: string; date?: string }[] };
    }>(
      'shiprocket',
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    return (res.tracking_data?.shipment_track_activities ?? []).map((a) => ({
      status: a.status ?? 'in_transit',
      description: a.activity ?? '',
      location: a.location,
      occurredAt: a.date ?? new Date().toISOString(),
    }));
  }
}
