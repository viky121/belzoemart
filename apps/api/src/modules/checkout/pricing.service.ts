import { Injectable } from '@nestjs/common';
import {
  computeTotals,
  paise,
  type CouponSpec,
  type Money,
  type PriceBreakup,
  type PriceLine,
} from '@belzo/shared';

/**
 * Application pricing service (BR-4..BR-7). Wraps the shared pure engine with
 * store rules: shipping threshold, COD fee, and seller-state determination for
 * the GST split. Seller state is configured (SETTINGS in U7); a sensible
 * default is used here.
 *
 * Prices are GST-inclusive (the engine extracts GST from the price; grandTotal
 * = subtotal − discount + shipping + codFee). The free-shipping threshold
 * compares the pre-discount subtotal, as before.
 */
@Injectable()
export class PricingService {
  private readonly freeShippingThreshold = paise(50000); // ₹500
  private readonly flatShipping = paise(4900); // ₹49
  private readonly codFee = paise(3900); // ₹39
  private readonly sellerState = process.env.STORE_STATE ?? 'Karnataka';

  shippingFor(subtotal: Money): Money {
    return subtotal >= this.freeShippingThreshold ? paise(0) : this.flatShipping;
  }

  codFeeFor(isCod: boolean): Money {
    return isCod ? this.codFee : paise(0);
  }

  /**
   * Compute the full breakup for a set of lines + optional coupon + payment mode.
   *
   * The four store-config values (free-shipping threshold, flat shipping, COD
   * fee, seller state) can be supplied by the caller — resolved from admin
   * settings in `CheckoutService` — and each defaults to the current class
   * constant when omitted, so callers that pass none behave exactly as before.
   * This keeps `compute()` pure and synchronous (used by both preview and place).
   */
  compute(input: {
    lines: PriceLine[];
    buyerState: string;
    isCod: boolean;
    coupon?: CouponSpec;
    freeShippingThresholdPaise?: Money;
    flatShippingPaise?: Money;
    codFeePaise?: Money;
    sellerState?: string;
  }): PriceBreakup {
    const freeThreshold = input.freeShippingThresholdPaise ?? this.freeShippingThreshold;
    const flat = input.flatShippingPaise ?? this.flatShipping;
    const codFee = input.codFeePaise ?? this.codFee;
    const sellerState = input.sellerState ?? this.sellerState;

    const subtotal = input.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const shipping = paise(subtotal) >= freeThreshold ? paise(0) : flat;
    return computeTotals({
      lines: input.lines,
      sameState: input.buyerState.trim().toLowerCase() === sellerState.trim().toLowerCase(),
      shipping,
      codFee: input.isCod ? codFee : paise(0),
      coupon: input.coupon,
    });
  }
}
