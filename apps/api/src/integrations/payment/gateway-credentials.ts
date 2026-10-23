import { Injectable } from '@nestjs/common';

export interface GatewayCreds {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/** Where the credentials in use come from. */
export type CredsSource = 'admin' | 'env';

/**
 * The Razorpay credentials the payment provider uses right now.
 *
 * They start as the server environment (RAZORPAY_*). An admin can override them from
 * the Payments page; the override is loaded here by the payment-gateway module (it
 * keeps the encrypted copy in the database). Reads are synchronous because webhook and
 * signature checks are, so this is a small in-memory holder.
 *
 * Each value falls back to the environment on its own, so overriding only the webhook
 * secret keeps using the environment's API keys.
 */
@Injectable()
export class GatewayCredentials {
  private override: Partial<GatewayCreds> = {};

  /** Replace the admin override (an empty object clears it). */
  setOverride(o: Partial<GatewayCreds>): void {
    this.override = {
      ...(o.keyId ? { keyId: o.keyId } : {}),
      ...(o.keySecret ? { keySecret: o.keySecret } : {}),
      ...(o.webhookSecret ? { webhookSecret: o.webhookSecret } : {}),
    };
  }

  get(): GatewayCreds {
    return {
      keyId: this.override.keyId ?? process.env.RAZORPAY_KEY_ID ?? '',
      keySecret: this.override.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? '',
      webhookSecret: this.override.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    };
  }

  /** Which of the three values currently come from the admin override. */
  overridden(): { keyId: boolean; keySecret: boolean; webhookSecret: boolean } {
    return {
      keyId: Boolean(this.override.keyId),
      keySecret: Boolean(this.override.keySecret),
      webhookSecret: Boolean(this.override.webhookSecret),
    };
  }
}
