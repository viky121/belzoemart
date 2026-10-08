import { BadRequestException } from '@nestjs/common';
import { paise, type PriceLine } from '@belzo/shared';
import { PricingService } from './pricing.service';
import { CheckoutService } from './checkout.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CartService } from '../cart/cart.service';
import type { CouponService } from './coupon.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { SettingsService } from '../admin/settings.service';

/**
 * Proves the admin-settings read side wired through PricingService.compute()
 * and the checkout COD gate:
 *   (a) resolved overrides flow into the computed breakup,
 *   (b) seller/buyer state drives CGST+SGST vs IGST,
 *   (c) place() rejects COD when payment.codEnabled === false,
 *   (d) absent keys reproduce today's hardcoded defaults.
 */
describe('PricingService — settings overrides flow through compute()', () => {
  const svc = new PricingService();
  // Subtotal ₹100 (below the ₹500 default free-shipping threshold).
  const lines: PriceLine[] = [{ unitPrice: paise(10000), quantity: 1, taxRatePct: 18 }];

  it('(d) unset overrides reproduce the hardcoded defaults', () => {
    const b = svc.compute({ lines, buyerState: 'Karnataka', isCod: true });
    expect(b.shipping).toBe(4900); // ₹49 flat (below ₹500 threshold)
    expect(b.codFee).toBe(3900); // ₹39 default COD fee
    // GST-inclusive: 10000 × 18/118 = 1525.42 → 1525 is inside the price.
    expect(b.tax).toBe(1525);
    expect(b.gst).toEqual({ cgst: 762, sgst: 763, igst: 0 });
    expect(b.grandTotal).toBe(10000 + 4900 + 3900); // 18800
  });

  it('GST-inclusive: ₹9,588 @5% is charged ₹9,588 (intra / inter / COD)', () => {
    const rice: PriceLine[] = [{ unitPrice: paise(958800), quantity: 1, taxRatePct: 5 }];
    const intra = svc.compute({ lines: rice, buyerState: 'Karnataka', isCod: false });
    expect(intra.shipping).toBe(0); // above the ₹500 threshold
    expect(intra.tax).toBe(45657);
    expect(intra.gst).toEqual({ cgst: 22828, sgst: 22829, igst: 0 });
    expect(intra.grandTotal).toBe(958800);

    const inter = svc.compute({ lines: rice, buyerState: 'Maharashtra', isCod: false });
    expect(inter.gst).toEqual({ cgst: 0, sgst: 0, igst: 45657 });
    expect(inter.grandTotal).toBe(958800);

    const cod = svc.compute({ lines: rice, buyerState: 'Karnataka', isCod: true });
    expect(cod.grandTotal).toBe(958800 + 3900);
  });

  it('GST-inclusive: grandTotal = subtotal − discount + shipping + codFee with a coupon', () => {
    const b = svc.compute({ lines, buyerState: 'Karnataka', isCod: true, coupon: { kind: 'percent', value: 10 } });
    expect(b.discount).toBe(1000);
    expect(b.grandTotal).toBe(b.subtotal - b.discount + b.shipping + b.codFee);
    expect(b.tax).toBe(1373); // 9000 × 18/118 = 1372.88
  });

  it('(a) free-shipping threshold override zeroes shipping above the cutoff', () => {
    const b = svc.compute({
      lines,
      buyerState: 'Karnataka',
      isCod: false,
      freeShippingThresholdPaise: paise(5000), // ₹50 < ₹100 subtotal
    });
    expect(b.shipping).toBe(0);
  });

  it('(a) flat-shipping override changes the shipping charged below the threshold', () => {
    const b = svc.compute({
      lines,
      buyerState: 'Karnataka',
      isCod: false,
      flatShippingPaise: paise(9900), // ₹99
    });
    expect(b.shipping).toBe(9900);
  });

  it('(a) COD-fee override flows into the breakup total', () => {
    const def = svc.compute({ lines, buyerState: 'Karnataka', isCod: true });
    const b = svc.compute({
      lines,
      buyerState: 'Karnataka',
      isCod: true,
      codFeePaise: paise(10000), // ₹100
    });
    expect(b.codFee).toBe(10000);
    expect(b.grandTotal).toBe(def.grandTotal - 3900 + 10000);
  });

  it('(b) buyer state == seller state yields CGST+SGST (intra-state)', () => {
    const b = svc.compute({ lines, buyerState: 'Karnataka', isCod: false });
    expect(b.gst.igst).toBe(0);
    expect(b.gst.cgst).toBeGreaterThan(0);
    expect(b.gst.cgst + b.gst.sgst).toBe(b.tax);
  });

  it('(b) buyer state != seller state yields IGST (inter-state)', () => {
    const b = svc.compute({ lines, buyerState: 'Maharashtra', isCod: false });
    expect(b.gst.cgst).toBe(0);
    expect(b.gst.sgst).toBe(0);
    expect(b.gst.igst).toBe(b.tax);
    expect(b.gst.igst).toBe(1525);
  });

  it('(b) sellerState override flips an otherwise inter-state order to intra-state', () => {
    const b = svc.compute({
      lines,
      buyerState: 'Maharashtra',
      isCod: false,
      sellerState: 'Maharashtra',
    });
    expect(b.gst.igst).toBe(0);
    expect(b.gst.cgst + b.gst.sgst).toBe(b.tax);
  });
});

describe('CheckoutService — COD enablement gate', () => {
  function build(settingsMap: Record<string, unknown>) {
    const reserveCalls: string[] = [];
    const orders: Record<string, unknown> = {};
    const prisma = {
      order: {
        findUnique: async ({ where: { idempotencyKey } }: { where: { idempotencyKey: string } }) =>
          orders[idempotencyKey] ?? null,
      },
      address: {
        findUnique: async () => ({ id: 'addr1', customerId: 'cust1', state: 'Karnataka', pincode: '560001' }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: { idempotencyKey: string } }) => {
              const o = { id: 'new-order', grandTotal: 100000, payments: [{ provider: 'cod' }], ...data };
              orders[data.idempotencyKey] = o;
              return o;
            },
          },
        }),
    } as unknown as PrismaService;

    const cart = {
      getCart: async () => ({
        cartId: 'c1',
        items: [
          { variantId: 'v1', title: 'X', sku: 'X-1', unitPrice: 50000, quantity: 2, taxRatePct: 18, savedForLater: false, inStock: true },
        ],
      }),
    } as unknown as CartService;

    const pricing = new PricingService();
    const coupons = { evaluate: async () => ({ valid: true, spec: undefined }), redeem: async () => undefined } as unknown as CouponService;
    const inventory = {
      reserve: async (variantId: string) => {
        reserveCalls.push(variantId);
      },
    } as unknown as InventoryService;
    const settings = { get: async (key: string) => settingsMap[key] } as unknown as SettingsService;

    return { svc: new CheckoutService(prisma, cart, pricing, coupons, inventory, settings), reserveCalls };
  }

  it('(c) rejects a COD order when payment.codEnabled === false', async () => {
    const { svc, reserveCalls } = build({ 'payment.codEnabled': false });
    await expect(
      svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'cod' }, 'KEY-COD-OFF'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reserveCalls).toHaveLength(0); // never got to reservation
  });

  it('(d) allows a COD order when the key is unset (defaults to enabled)', async () => {
    const { svc, reserveCalls } = build({});
    const result = await svc.place(
      { customerId: 'cust1' },
      { addressId: 'addr1', paymentMethod: 'cod' },
      'KEY-COD-ON',
    );
    expect(result.reused).toBe(false);
    expect(reserveCalls).toEqual(['v1']);
  });

  it('preview surfaces codEnabled=false when disabled', async () => {
    const { svc } = build({ 'payment.codEnabled': false });
    const preview = await svc.preview({ customerId: 'cust1' }, 'addr1');
    expect(preview.codEnabled).toBe(false);
  });
});
