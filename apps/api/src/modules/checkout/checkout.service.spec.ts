import { BadRequestException, Logger } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CartService } from '../cart/cart.service';
import { PricingService } from './pricing.service';
import type { CouponService } from './coupon.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { SettingsService } from '../admin/settings.service';

/**
 * Verifies checkout idempotency (BR-11): placing an order twice with the same
 * idempotency key returns the existing order and does NOT reserve stock again.
 */
type CartLine = { unitPrice: number; quantity: number; taxRatePct: number; minQty?: number; maxQty?: number };

describe('CheckoutService.place — idempotency', () => {
  /** `opts` swaps in a real PricingService / cart line; defaults keep the original mock. */
  function build(existingOrder: unknown, opts: { pricing?: PricingService; line?: CartLine; cost?: number | null; costLookupFails?: boolean } = {}) {
    const reserveCalls: string[] = [];
    const orders: Record<string, unknown> = {};
    const created: Record<string, unknown>[] = [];
    const prisma = {
      order: {
        findUnique: async ({ where: { idempotencyKey } }: { where: { idempotencyKey: string } }) =>
          idempotencyKey === 'KEY-1' ? existingOrder : (orders[idempotencyKey] ?? null),
      },
      address: {
        findUnique: async () => ({ id: 'addr1', customerId: 'cust1', state: 'Karnataka', pincode: '560001' }),
      },
      ...(opts.cost !== undefined || opts.costLookupFails
        ? {
            variant: {
              findMany: async () => {
                if (opts.costLookupFails) throw new Error('db down');
                return [{ id: 'v1', costPrice: opts.cost ?? null }];
              },
            },
          }
        : {}),
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: { idempotencyKey: string } }) => {
              created.push(data);
              const o = { id: 'new-order', grandTotal: 100000, payments: [{ provider: 'mock' }], ...data };
              orders[data.idempotencyKey] = o;
              return o;
            },
          },
        }),
    } as unknown as PrismaService;

    const removePurchased = jest.fn().mockResolvedValue(1);
    const cart = {
      getCart: async () => ({
        cartId: 'c1',
        items: [
          {
            variantId: 'v1', title: 'X', sku: 'X-1',
            ...(opts.line ?? { unitPrice: 50000, quantity: 2, taxRatePct: 18 }),
            savedForLater: false, inStock: true,
          },
        ],
      }),
      removePurchased,
    } as unknown as CartService;

    const pricing =
      opts.pricing ??
      ({
        compute: () => ({
          subtotal: 100000, discount: 0, shipping: 0, codFee: 0, tax: 18000,
          gst: { cgst: 9000, sgst: 9000, igst: 0 }, grandTotal: 118000,
        }),
      } as unknown as PricingService);

    const coupons = { evaluate: async () => ({ valid: true, spec: undefined }), redeem: async () => undefined } as unknown as CouponService;
    const inventory = {
      reserve: async (variantId: string) => {
        reserveCalls.push(variantId);
      },
    } as unknown as InventoryService;
    // No serviceable-PIN config → delivery open everywhere (isServiceable true).
    const settings = { get: async () => undefined } as unknown as SettingsService;

    return {
      svc: new CheckoutService(prisma, cart, pricing, coupons, inventory, settings),
      reserveCalls,
      created,
      removePurchased,
    };
  }

  it('returns the existing order (reused) without reserving stock on repeat key', async () => {
    const existing = {
      id: 'order-1', grandTotal: 118000, payments: [{ provider: 'mock' }],
      subtotal: 100000, discount: 0, shipping: 0, codFee: 0, tax: 18000, cgst: 9000, sgst: 9000, igst: 0,
    };
    const { svc, reserveCalls } = build(existing);
    const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-1');
    expect(result.reused).toBe(true);
    expect(result.orderId).toBe('order-1');
    expect(reserveCalls).toHaveLength(0); // no double reservation
  });

  it('creates a new order and reserves stock for a fresh key', async () => {
    const { svc, reserveCalls } = build(null);
    const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-NEW');
    expect(result.reused).toBe(false);
    expect(result.orderId).toBe('new-order');
    expect(reserveCalls).toEqual(['v1']);
  });

  it('refuses to place an order whose quantity is outside the admin min/max, and reserves nothing', async () => {
    const tooFew = build(null, { line: { unitPrice: 50000, quantity: 2, taxRatePct: 18, minQty: 5, maxQty: 20 } });
    await expect(
      tooFew.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-MIN'),
    ).rejects.toThrow('The minimum order quantity for "X" is 5.');
    expect(tooFew.created).toHaveLength(0);
    expect(tooFew.reserveCalls).toHaveLength(0);

    const tooMany = build(null, { line: { unitPrice: 50000, quantity: 30, taxRatePct: 18, minQty: 5, maxQty: 20 } });
    await expect(
      tooMany.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-MAX'),
    ).rejects.toThrow('You can buy at most 20 of "X" per order.');
    expect(tooMany.created).toHaveLength(0);
  });

  it('places the order when the quantity sits inside the limits (or no limit is set)', async () => {
    const inside = build(null, { line: { unitPrice: 50000, quantity: 5, taxRatePct: 18, minQty: 5, maxQty: 20 } });
    expect((await inside.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-IN')).reused).toBe(false);
    const unlimited = build(null);
    expect((await unlimited.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-NONE')).reused).toBe(false);
  });

  it('saves the cost price on each order item for the P/L report', async () => {
    const { svc, created } = build(null, { cost: 18000 });
    await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-COST');
    const items = (created[0] as { items: { create: { costPrice: number | null }[] } }).items.create;
    expect(items.map((i) => i.costPrice)).toEqual([18000]);
  });

  it('saves no cost (null) when the variant has none, and never blocks the order when the lookup fails', async () => {
    const none = build(null, { cost: null });
    await none.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-NOCOST');
    expect((none.created[0] as { items: { create: { costPrice: number | null }[] } }).items.create[0]!.costPrice).toBeNull();

    const failing = build(null, { costLookupFails: true });
    const result = await failing.svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-FAILCOST');
    expect(result.reused).toBe(false);
    expect((failing.created[0] as { items: { create: { costPrice: number | null }[] } }).items.create[0]!.costPrice).toBeNull();
  });

  it('rejects placing an order without a customer (guest)', async () => {
    const { svc } = build(null);
    await expect(
      svc.place({ guestToken: 'g1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-X'),
    ).rejects.toThrow(/Login required/);
  });

  it('GST-inclusive: snapshots and charges ₹9,588 for a ₹9,588 @5% cart (real PricingService)', async () => {
    const { svc, created } = build(null, {
      pricing: new PricingService(),
      line: { unitPrice: 958800, quantity: 1, taxRatePct: 5 },
    });
    const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-GST');
    expect(created).toHaveLength(1);
    const data = created[0] as {
      grandTotal: number; tax: number; cgst: number; sgst: number; igst: number;
      payments: { create: { amount: number } };
    };
    expect(data.grandTotal).toBe(958800);
    expect(data.tax).toBe(45657);
    expect(data.cgst).toBe(22828);
    expect(data.sgst).toBe(22829);
    expect(data.igst).toBe(0);
    expect(data.payments.create.amount).toBe(958800);
    expect(result.payment.amount).toBe(958800);
    expect(result.breakup.grandTotal).toBe(958800);
  });

  describe('A4: clears purchased cart lines', () => {
    afterEach(() => jest.restoreAllMocks());

    it('a fresh COD order clears the purchased variants', async () => {
      const { svc, removePurchased } = build(null);
      const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'cod' }, 'KEY-COD');
      expect(result.reused).toBe(false);
      expect(removePurchased).toHaveBeenCalledTimes(1);
      expect(removePurchased).toHaveBeenCalledWith('cust1', ['v1']);
    });

    it('a fresh online (upi) order does not clear (cleared on capture instead)', async () => {
      const { svc, removePurchased } = build(null);
      await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-UPI');
      expect(removePurchased).not.toHaveBeenCalled();
    });

    it('a reused key does not clear', async () => {
      const existing = {
        id: 'order-1', grandTotal: 118000, payments: [{ provider: 'cod' }],
        subtotal: 100000, discount: 0, shipping: 0, codFee: 0, tax: 18000, cgst: 9000, sgst: 9000, igst: 0,
      };
      const { svc, removePurchased } = build(existing);
      const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'cod' }, 'KEY-1');
      expect(result.reused).toBe(true);
      expect(removePurchased).not.toHaveBeenCalled();
    });

    it('a removePurchased rejection still returns the order and logs a warning', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { svc, removePurchased } = build(null);
      removePurchased.mockRejectedValueOnce(new Error('db down'));
      const result = await svc.place({ customerId: 'cust1' }, { addressId: 'addr1', paymentMethod: 'cod' }, 'KEY-COD2');
      expect(result).toMatchObject({ orderId: 'new-order', reused: false });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cart clear failed for order new-order'));
    });
  });
});

describe('CheckoutService.preview — shippingWaived (display-only "You save")', () => {
  function build(unitPrice: number, spec: unknown) {
    const prisma = {
      address: {
        findUnique: async () => ({ id: 'addr1', customerId: 'cust1', state: 'Karnataka', pincode: '560001' }),
      },
    } as unknown as PrismaService;
    const cart = {
      getCart: async () => ({
        cartId: 'c1',
        items: [
          { variantId: 'v1', title: 'X', sku: 'X-1', unitPrice, quantity: 1, taxRatePct: 5, savedForLater: false, inStock: true },
        ],
      }),
    } as unknown as CartService;
    const coupons = {
      evaluate: async (code: string) => ({ code, valid: true, spec }),
    } as unknown as CouponService;
    return new CheckoutService(
      prisma,
      cart,
      new PricingService(),
      coupons,
      {} as InventoryService,
      { get: async () => undefined } as unknown as SettingsService,
    );
  }

  it('reports the waived ₹49 delivery for a free_shipping coupon below the threshold; totals unchanged', async () => {
    const res = await build(20000, { kind: 'free_shipping', value: 0 }).preview({ customerId: 'cust1' }, 'addr1', 'FREESHIP');
    expect(res.breakup.shipping).toBe(0);
    expect(res.shippingWaived).toBe(4900);
    expect(res.breakup.grandTotal).toBe(20000); // GST-inclusive, delivery waived
  });

  it('is 0 when delivery is already free (above threshold) or the coupon is not free_shipping', async () => {
    const above = await build(60000, { kind: 'free_shipping', value: 0 }).preview({ customerId: 'cust1' }, 'addr1', 'FREESHIP');
    expect(above.shippingWaived).toBe(0);
    const flat = await build(20000, { kind: 'flat', value: 1000 }).preview({ customerId: 'cust1' }, 'addr1', 'FLAT10');
    expect(flat.breakup.shipping).toBe(4900);
    expect(flat.shippingWaived).toBe(0);
    const none = await build(20000, undefined).preview({ customerId: 'cust1' }, 'addr1');
    expect(none.shippingWaived).toBe(0);
  });

  it('A6: preview with isCod=true includes the ₹39 COD fee in codFee and grandTotal', async () => {
    const svc = build(60000, undefined);
    const prepaid = await svc.preview({ customerId: 'cust1' }, 'addr1');
    const cod = await svc.preview({ customerId: 'cust1' }, 'addr1', undefined, true);
    expect(prepaid.breakup.codFee).toBe(0);
    expect(cod.breakup.codFee).toBe(3900);
    expect(cod.breakup.grandTotal).toBe(prepaid.breakup.grandTotal + 3900);
  });
});

describe('CheckoutService — removed variants in the cart', () => {
  it('blocks preview when a cart line is for a removed (unavailable) variant', async () => {
    const prisma = {
      address: {
        findUnique: async () => ({ id: 'addr1', customerId: 'cust1', state: 'Karnataka', pincode: '560001' }),
      },
    } as unknown as PrismaService;
    const cart = {
      getCart: async () => ({
        cartId: 'c1',
        items: [
          {
            variantId: 'v-gone', title: 'Oil', sku: 'OIL-500', unitPrice: 50000, quantity: 1,
            taxRatePct: 5, savedForLater: false, inStock: false, unavailable: true,
          },
        ],
      }),
    } as unknown as CartService;
    const svc = new CheckoutService(
      prisma,
      cart,
      {} as PricingService,
      {} as CouponService,
      {} as InventoryService,
      { get: async () => undefined } as unknown as SettingsService,
    );
    await expect(svc.preview({ customerId: 'cust1' }, 'addr1')).rejects.toThrow(
      /no longer available/,
    );
    await expect(svc.preview({ customerId: 'cust1' }, 'addr1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
