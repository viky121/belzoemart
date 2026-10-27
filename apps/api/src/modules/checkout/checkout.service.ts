import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  discountableSubtotal,
  effectiveOrderLimits,
  orderLimitsMessage,
  paise,
  type Money,
  type PaymentMethod,
  type PriceBreakup,
  type PriceLine,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../catalogue/inventory.service';
import { CartService, type CartRef } from '../cart/cart.service';
import { CouponService } from './coupon.service';
import { PricingService } from './pricing.service';
import { SettingsService } from '../admin/settings.service';

/** Settings key holding the list of serviceable PIN codes (string[]). */
const SERVICEABLE_PINCODES_KEY = 'shipping.serviceablePincodes';

/** Admin-configurable pricing keys (mirror the admin settings UI). */
const FREE_THRESHOLD_KEY = 'shipping.freeThresholdPaise';
const FLAT_SHIPPING_KEY = 'shipping.flatPaise';
const COD_FEE_KEY = 'payment.codFeePaise';
const STORE_STATE_KEY = 'store.state';
const COD_ENABLED_KEY = 'payment.codEnabled';

/**
 * Resolved pricing overrides passed into `PricingService.compute()`. Only
 * present/valid settings are included; absent fields fall back to the pricing
 * service's own constant defaults.
 */
interface PricingConfig {
  overrides: {
    freeShippingThresholdPaise?: Money;
    flatShippingPaise?: Money;
    codFeePaise?: Money;
    sellerState?: string;
  };
  /** COD is enabled unless the setting is explicitly `false` (default ON). */
  codEnabled: boolean;
}

export interface CheckoutPreviewResult {
  breakup: PriceBreakup;
  coupon: { code: string; valid: boolean; reason?: string } | null;
  items: { variantId: string; title: string; quantity: number; unitPrice: number; offerName?: string | null }[];
  /** False when the delivery address PIN is outside the serviceable list. */
  serviceable: boolean;
  /** Whether Cash on Delivery is currently offered (admin-configurable). */
  codEnabled: boolean;
  /**
   * Delivery charge waived by a free_shipping coupon, in paise (0 otherwise).
   * Display-only (the "You save" figure); never part of any stored total.
   */
  shippingWaived: number;
}

export interface PlaceOrderResult {
  orderId: string;
  reused: boolean;
  breakup: PriceBreakup;
  payment: { provider: string; amount: number; clientConfig?: Record<string, unknown> };
}

/**
 * Checkout orchestration (BR-10..BR-14). Preview is side-effect-free; place is
 * idempotent by key, reserves stock, snapshots items+prices, and creates the
 * order + payment intent in a single transaction.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('CheckoutService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Serviceability (admin-configurable). Returns the list of PINs we deliver
   * to. An empty/unset list means "no restriction" (deliver everywhere) so a
   * missing config never accidentally blocks all orders.
   */
  private async serviceablePincodes(): Promise<string[]> {
    const raw = await this.settings.get<unknown>(SERVICEABLE_PINCODES_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.map((p) => String(p).trim()).filter(Boolean);
  }

  private async isServiceable(pincode: string): Promise<boolean> {
    const list = await this.serviceablePincodes();
    if (list.length === 0) return true; // not configured → serviceable everywhere
    return list.includes(pincode.trim());
  }

  /**
   * Resolve admin-configurable pricing config (same pattern as
   * `serviceablePincodes()`): read each key with a safe fallback to the current
   * default. A missing/malformed paise value is omitted so `compute()` uses its
   * own class constant — the single source of truth for defaults stays in
   * `PricingService`. `store.state` is used only when it is a non-empty string.
   * COD is treated as enabled unless the setting is explicitly `false`.
   */
  private async resolvePricingConfig(): Promise<PricingConfig> {
    const [freeThreshold, flat, codFee, state, codEnabledRaw] = await Promise.all([
      this.settings.get<unknown>(FREE_THRESHOLD_KEY),
      this.settings.get<unknown>(FLAT_SHIPPING_KEY),
      this.settings.get<unknown>(COD_FEE_KEY),
      this.settings.get<unknown>(STORE_STATE_KEY),
      this.settings.get<unknown>(COD_ENABLED_KEY),
    ]);

    const overrides: PricingConfig['overrides'] = {};
    const freeThresholdPaise = this.toPaise(freeThreshold);
    if (freeThresholdPaise !== undefined) overrides.freeShippingThresholdPaise = freeThresholdPaise;
    const flatPaise = this.toPaise(flat);
    if (flatPaise !== undefined) overrides.flatShippingPaise = flatPaise;
    const codFeePaise = this.toPaise(codFee);
    if (codFeePaise !== undefined) overrides.codFeePaise = codFeePaise;
    if (typeof state === 'string' && state.trim().length > 0) overrides.sellerState = state;

    return { overrides, codEnabled: codEnabledRaw !== false };
  }

  /** Coerce a raw setting into branded Money, or undefined if not a valid non-negative integer paise. */
  private toPaise(value: unknown): Money | undefined {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return paise(value);
    return undefined;
  }

  private async buildLines(ref: CartRef): Promise<{
    lines: PriceLine[];
    snapshot: {
      variantId: string;
      title: string;
      sku: string;
      unitPrice: number;
      quantity: number;
      taxRatePct: number;
      offerId: string | null;
      offerName: string | null;
      mrp: number | null;
    }[];
  }> {
    const cart = await this.cart.getCart(ref);
    const active = cart.items.filter((i) => !i.savedForLater);
    if (active.length === 0) throw new BadRequestException('Cart is empty');

    const lines: PriceLine[] = [];
    const snapshot = [];
    for (const item of active) {
      if (item.unavailable) {
        throw new BadRequestException(
          `"${item.title}" is no longer available — remove it from your cart`,
        );
      }
      if (!item.inStock) throw new BadRequestException(`"${item.title}" is out of stock`);
      // The admin's min/max per order. A cart saved before the limits changed is caught here, so the
      // customer fixes the quantity before paying. (A missing limit means no limit.)
      const limits = effectiveOrderLimits({ minOrderQty: item.minQty, maxOrderQty: item.maxQty });
      if (item.quantity < limits.min || item.quantity > limits.max) {
        throw new BadRequestException(orderLimitsMessage(item.title, limits, item.quantity));
      }
      // A line sold through a special-price offer is never discounted by a coupon.
      lines.push({ unitPrice: item.unitPrice, quantity: item.quantity, taxRatePct: item.taxRatePct, noDiscount: item.offerId != null });
      snapshot.push({
        variantId: item.variantId,
        title: item.title,
        sku: item.sku,
        offerId: item.offerId,
        offerName: item.offerName,
        mrp: typeof item.mrp === 'number' && item.mrp > 0 ? item.mrp : null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        taxRatePct: item.taxRatePct,
      });
    }
    return { lines, snapshot };
  }

  /**
   * Cost of one unit per variant, saved on the order items so the P/L report stays right when the cost
   * price changes later. A problem here must never stop an order, so it falls back to "no cost saved".
   */
  private async costsFor(variantIds: string[]): Promise<Map<string, number>> {
    try {
      const rows = await this.prisma.variant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, costPrice: true },
      });
      const out = new Map<string, number>();
      for (const r of rows) if (typeof r.costPrice === 'number') out.set(r.id, r.costPrice);
      return out;
    } catch {
      return new Map();
    }
  }

  async preview(
    ref: CartRef,
    addressId: string,
    couponCode?: string,
    isCod = false,
  ): Promise<CheckoutPreviewResult> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException('Address not found');

    const { lines, snapshot } = await this.buildLines(ref);
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    let couponResult: CheckoutPreviewResult['coupon'] = null;
    let spec;
    if (couponCode) {
      const evalResult = await this.coupons.evaluate(couponCode, discountableSubtotal(lines) as never, ref.customerId);
      couponResult = { code: evalResult.code, valid: evalResult.valid, reason: evalResult.reason };
      if (evalResult.valid) spec = evalResult.spec;
    }

    const { overrides, codEnabled } = await this.resolvePricingConfig();
    const breakup = this.pricing.compute({
      lines,
      buyerState: address.state,
      isCod,
      coupon: spec,
      ...overrides,
    });
    // Display-only: what delivery would have cost without the free_shipping coupon.
    let shippingWaived = 0;
    if (spec?.kind === 'free_shipping') {
      const withoutCoupon = this.pricing.compute({ lines, buyerState: address.state, isCod, ...overrides });
      shippingWaived = Math.max(0, withoutCoupon.shipping - breakup.shipping);
    }
    return {
      breakup,
      coupon: couponResult,
      serviceable: await this.isServiceable(address.pincode),
      codEnabled,
      shippingWaived,
      items: snapshot.map((s) => ({
        offerName: s.offerName,
        variantId: s.variantId,
        title: s.title,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
      })),
    };
  }

  /**
   * Place an order. Idempotent by `idempotencyKey`: a repeated call with the
   * same key returns the existing order without re-reserving stock (BR-11).
   */
  async place(
    ref: CartRef,
    input: { addressId: string; paymentMethod: PaymentMethod; couponCode?: string },
    idempotencyKey: string,
  ): Promise<PlaceOrderResult> {
    if (!ref.customerId) throw new BadRequestException('Login required to place an order');

    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: { payments: true },
    });
    if (existing) {
      const pay = existing.payments[0];
      return {
        orderId: existing.id,
        reused: true,
        breakup: this.toBreakup(existing),
        payment: { provider: pay?.provider ?? 'cod', amount: existing.grandTotal },
      };
    }

    const address = await this.prisma.address.findUnique({ where: { id: input.addressId } });
    if (!address || address.customerId !== ref.customerId) {
      throw new BadRequestException('Invalid address');
    }

    // Serviceability gate (BR): reject orders for PINs we don't deliver to.
    if (!(await this.isServiceable(address.pincode))) {
      throw new BadRequestException(
        `Sorry, we don't deliver to PIN ${address.pincode} yet. Please choose a serviceable delivery address.`,
      );
    }

    const { lines, snapshot } = await this.buildLines(ref);
    const costs = await this.costsFor(snapshot.map((x) => x.variantId));
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const isCod = input.paymentMethod === 'cod';

    const { overrides, codEnabled } = await this.resolvePricingConfig();
    // COD gate (#6): reject COD orders when the merchant has disabled it.
    if (isCod && !codEnabled) {
      throw new BadRequestException('Cash on Delivery is currently unavailable.');
    }

    let spec;
    if (input.couponCode) {
      const evalResult = await this.coupons.evaluate(input.couponCode, discountableSubtotal(lines) as never, ref.customerId);
      if (!evalResult.valid) throw new BadRequestException(evalResult.reason ?? 'Invalid coupon');
      spec = evalResult.spec;
    }
    const breakup = this.pricing.compute({
      lines,
      buyerState: address.state,
      isCod,
      coupon: spec,
      ...overrides,
    });

    // Reserve stock, then create the order + items + payment in a transaction.
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          customerId: ref.customerId!,
          addressId: input.addressId,
          idempotencyKey,
          couponCode: input.couponCode?.toUpperCase().trim(),
          subtotal: breakup.subtotal,
          discount: breakup.discount,
          shipping: breakup.shipping,
          codFee: breakup.codFee,
          tax: breakup.tax,
          cgst: breakup.gst.cgst,
          sgst: breakup.gst.sgst,
          igst: breakup.gst.igst,
          grandTotal: breakup.grandTotal,
          items: {
            create: snapshot.map((s) => ({
              variantId: s.variantId,
              title: s.title,
              sku: s.sku,
              unitPrice: s.unitPrice,
              quantity: s.quantity,
              taxRatePct: s.taxRatePct,
              costPrice: costs.get(s.variantId) ?? null,
              offerId: s.offerId,
              offerName: s.offerName,
              mrp: s.mrp,
            })),
          },
          payments: {
            create: {
              provider: isCod ? 'cod' : (process.env.PAYMENT_PROVIDER === 'live' ? 'razorpay' : 'mock'),
              amount: breakup.grandTotal,
              status: isCod ? 'pending' : 'created',
            },
          },
        },
        include: { payments: true },
      });
      return created;
    });

    // Reserve stock outside the order transaction (each reserve is itself
    // transactional + audited). On failure the order remains pending and can be
    // cancelled by the reconciliation flow.
    for (const s of snapshot) {
      await this.inventory.reserve(s.variantId, s.quantity, order.id);
    }

    if (input.couponCode) {
      await this.coupons.redeem(input.couponCode, order.id, ref.customerId);
    }

    // COD orders are final at place, so clear the purchased lines now. Online
    // orders are cleared on payment capture (PaymentService.markCaptured), so a
    // failed payment leaves the cart intact for a retry. Non-fatal: the order exists.
    if (isCod) {
      try {
        await this.cart.removePurchased(ref.customerId, snapshot.map((s) => s.variantId));
      } catch (e) {
        this.logger.warn(`Cart clear failed for order ${order.id}: ${String(e)}`);
      }
    }

    const pay = order.payments[0];
    return {
      orderId: order.id,
      reused: false,
      breakup,
      payment: { provider: pay?.provider ?? 'cod', amount: order.grandTotal },
    };
  }

  private toBreakup(o: {
    subtotal: number;
    discount: number;
    shipping: number;
    codFee: number;
    tax: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
  }): PriceBreakup {
    return {
      subtotal: o.subtotal,
      discount: o.discount,
      shipping: o.shipping,
      codFee: o.codFee,
      tax: o.tax,
      gst: { cgst: o.cgst, sgst: o.sgst, igst: o.igst },
      grandTotal: o.grandTotal,
    };
  }
}


