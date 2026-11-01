import { PICKUP_DEFAULTS, buildPickupDays } from '@belzo/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../admin/settings.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import { CheckoutService } from './checkout.service';
import type { CouponService } from './coupon.service';
import { PricingService } from './pricing.service';

/** Self pickup at checkout: no PIN check, no delivery charge, no COD fee, CGST + SGST, a valid slot. */
describe('CheckoutService with self pickup', () => {
  // A customer in another state, with a PIN code the shop does not deliver to.
  const ADDRESS = { id: 'a1', customerId: 'c1', state: 'Karnataka', pincode: '560001' };
  const ITEM = { variantId: 'v1', title: 'Rice', sku: 'RICE', unitPrice: 10000, quantity: 1, taxRatePct: 5, offerId: null, offerName: null };

  // The last offered day always has slots, so this stays valid whatever time the test runs.
  const SLOT = buildPickupDays(PICKUP_DEFAULTS, new Date()).at(-1)!.slots[0]!;

  function build(settingsMap: Record<string, unknown> = {}) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      order: { findUnique: async () => null },
      address: { findUnique: async () => ADDRESS },
      variant: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              created.push(data);
              return { id: 'order-1', grandTotal: data.grandTotal, payments: [{ provider: 'cod' }] };
            },
          },
        }),
    } as unknown as PrismaService;
    const cart = {
      getCart: async () => ({ cartId: 'c1', items: [{ ...ITEM, savedForLater: false, inStock: true, unavailable: false, minQty: 1, maxQty: 10 }] }),
      removePurchased: async () => 0,
    } as unknown as CartService;
    const coupons = { evaluate: async () => ({ code: 'X', valid: false }), redeem: async () => undefined } as unknown as CouponService;
    const reserve = jest.fn(async () => undefined);
    const inventory = { reserve } as unknown as InventoryService;
    const defaults: Record<string, unknown> = {
      'store.state': 'Madhya Pradesh',
      'shipping.serviceablePincodes': ['472001'],
      'shipping.flatPaise': 4000,
      'shipping.freeThresholdPaise': 30000,
      'payment.codFeePaise': 3900,
    };
    const map = { ...defaults, ...settingsMap };
    const settings = { get: async (k: string) => map[k] } as unknown as SettingsService;
    return { svc: new CheckoutService(prisma, cart, new PricingService(), coupons, inventory, settings), created, reserve };
  }

  describe('preview', () => {
    it('has no delivery charge, no COD fee, splits GST as CGST + SGST, and ignores the PIN list', async () => {
      const { svc } = build();
      const p = await svc.preview({ customerId: 'c1' }, 'a1', undefined, true, 'pickup');
      expect(p.fulfilment).toBe('pickup');
      expect(p.serviceable).toBe(true);
      expect(p.breakup.shipping).toBe(0);
      expect(p.breakup.codFee).toBe(0);
      expect(p.breakup.gst.igst).toBe(0);
      expect(p.breakup.gst.cgst + p.breakup.gst.sgst).toBe(p.breakup.tax);
      expect(p.breakup.grandTotal).toBe(10000); // prices include GST
    });
    it('home delivery to the same address is unchanged: not serviceable, delivery charge, COD fee, IGST', async () => {
      const { svc } = build();
      const p = await svc.preview({ customerId: 'c1' }, 'a1', undefined, true);
      expect(p.fulfilment).toBe('delivery');
      expect(p.serviceable).toBe(false);
      expect(p.breakup.shipping).toBe(4000);
      expect(p.breakup.codFee).toBe(3900);
      expect(p.breakup.gst.igst).toBe(p.breakup.tax);
    });
    it('is refused while self pickup is switched off', async () => {
      const { svc } = build({ 'pickup.enabled': false });
      await expect(svc.preview({ customerId: 'c1' }, 'a1', undefined, false, 'pickup')).rejects.toThrow(/Self pickup is not available/);
    });
  });

  describe('place', () => {
    it('saves a pickup order with its slot, Rs. 0 delivery and no COD fee, to a PIN we do not deliver to', async () => {
      const { svc, created, reserve } = build();
      const res = await svc.place(
        { customerId: 'c1' },
        { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: SLOT.start },
        'KEY-P1',
      );
      expect(res.orderId).toBe('order-1');
      expect(created[0]).toMatchObject({ fulfilment: 'pickup', shipping: 0, codFee: 0, igst: 0 });
      expect(created[0]!.pickupSlotStart).toEqual(new Date(SLOT.start));
      expect(created[0]!.pickupSlotEnd).toEqual(new Date(SLOT.end));
      expect(reserve).toHaveBeenCalledTimes(1);
    });
    it('works with online payment too', async () => {
      const { svc, created } = build();
      await svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'upi', fulfilment: 'pickup', pickupSlotStart: SLOT.start }, 'KEY-P2');
      expect(created[0]).toMatchObject({ fulfilment: 'pickup', shipping: 0 });
    });
    it('needs a slot', async () => {
      const { svc, created } = build();
      await expect(svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup' }, 'KEY-P3')).rejects.toThrow(
        /choose a pickup day and time/,
      );
      expect(created).toHaveLength(0);
    });
    it('refuses a time that is not an offered slot (too soon, off the grid, past)', async () => {
      const { svc, created } = build();
      for (const bad of ['2020-01-01T04:30:00.000Z', new Date(Date.now() + 10 * 60_000).toISOString(), new Date(Date.parse(SLOT.start) + 7 * 60_000).toISOString()]) {
        await expect(
          svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: bad }, `KEY-${bad}`),
        ).rejects.toThrow(/no longer available/);
      }
      expect(created).toHaveLength(0);
    });
    it('is refused while self pickup is switched off', async () => {
      const { svc, created } = build({ 'pickup.enabled': false });
      await expect(
        svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: SLOT.start }, 'KEY-P4'),
      ).rejects.toThrow(/Self pickup is not available/);
      expect(created).toHaveLength(0);
    });
    it('follows the shop slot settings', async () => {
      // Closing at 14:00 leaves no 7 PM slot.
      const { svc } = build({ 'pickup.closeTime': '14:00' });
      const evening = buildPickupDays({ ...PICKUP_DEFAULTS }, new Date()).at(-1)!.slots.at(-1)!;
      await expect(
        svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: evening.start }, 'KEY-P5'),
      ).rejects.toThrow(/no longer available/);
    });
    it('home delivery to a PIN we do not deliver to is still refused, and a slot sent with it is ignored', async () => {
      const { svc, created } = build();
      await expect(
        svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', pickupSlotStart: SLOT.start }, 'KEY-D1'),
      ).rejects.toThrow(/don't deliver to PIN 560001/);
      expect(created).toHaveLength(0);
    });
    it('a delivery order is saved as delivery with no slot', async () => {
      const { svc, created } = build({ 'shipping.serviceablePincodes': [] });
      await svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod' }, 'KEY-D2');
      expect(created[0]).toMatchObject({ fulfilment: 'delivery', pickupSlotStart: null, pickupSlotEnd: null, shipping: 4000, codFee: 3900 });
    });
    it('Cash on Delivery switched off also stops pay at shop', async () => {
      const { svc } = build({ 'payment.codEnabled': false });
      await expect(
        svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: SLOT.start }, 'KEY-P6'),
      ).rejects.toThrow(/Cash on Delivery is currently unavailable/);
    });
  });
});
