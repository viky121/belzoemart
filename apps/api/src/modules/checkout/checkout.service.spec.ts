import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CartService } from '../cart/cart.service';
import type { PricingService } from './pricing.service';
import type { CouponService } from './coupon.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { SettingsService } from '../admin/settings.service';

/**
 * Verifies checkout idempotency (BR-11): placing an order twice with the same
 * idempotency key returns the existing order and does NOT reserve stock again.
 */
describe('CheckoutService.place — idempotency', () => {
  function build(existingOrder: unknown) {
    const reserveCalls: string[] = [];
    const orders: Record<string, unknown> = {};
    const prisma = {
      order: {
        findUnique: async ({ where: { idempotencyKey } }: { where: { idempotencyKey: string } }) =>
          idempotencyKey === 'KEY-1' ? existingOrder : (orders[idempotencyKey] ?? null),
      },
      address: {
        findUnique: async () => ({ id: 'addr1', customerId: 'cust1', state: 'Karnataka', pincode: '560001' }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: { idempotencyKey: string } }) => {
              const o = { id: 'new-order', grandTotal: 100000, payments: [{ provider: 'mock' }], ...data };
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

    const pricing = {
      compute: () => ({
        subtotal: 100000, discount: 0, shipping: 0, codFee: 0, tax: 18000,
        gst: { cgst: 9000, sgst: 9000, igst: 0 }, grandTotal: 118000,
      }),
    } as unknown as PricingService;

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

  it('rejects placing an order without a customer (guest)', async () => {
    const { svc } = build(null);
    await expect(
      svc.place({ guestToken: 'g1' }, { addressId: 'addr1', paymentMethod: 'upi' }, 'KEY-X'),
    ).rejects.toThrow(/Login required/);
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
