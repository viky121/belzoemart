import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../admin/settings.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import { CheckoutService } from './checkout.service';
import type { CouponService } from './coupon.service';
import { PricingService } from './pricing.service';

/** Special-offer lines at checkout: coupons ignore them and the order remembers the offer. */
describe('CheckoutService with a special-price offer line', () => {
  interface Line {
    variantId: string; title: string; sku: string; unitPrice: number; quantity: number; taxRatePct: number;
    offerId: string | null; offerName: string | null; maxQty?: number;
  }
  const rice: Line = { variantId: 'rice', title: 'Rice', sku: 'RICE', unitPrice: 100000, quantity: 3, taxRatePct: 5, offerId: null, offerName: null };
  const sugarOffer: Line = { variantId: 'sugar', title: 'Sugar 1 kg', sku: 'SUGAR', unitPrice: 2900, quantity: 1, taxRatePct: 5, offerId: 'o1', offerName: 'Sugar at 29' };

  function build(items: Line[]) {
    const created: { items: { create: Record<string, unknown>[] }; discount: number; subtotal: number; grandTotal: number }[] = [];
    const evaluated: number[] = [];
    const prisma = {
      order: { findUnique: async () => null },
      address: { findUnique: async () => ({ id: 'a1', customerId: 'c1', state: 'Karnataka', pincode: '560001' }) },
      variant: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: (typeof created)[number] }) => {
              created.push(data);
              return { id: 'order-1', grandTotal: data.grandTotal, payments: [{ provider: 'cod' }] };
            },
          },
        }),
    } as unknown as PrismaService;
    const cart = {
      getCart: async () => ({
        cartId: 'c1',
        items: items.map((i) => ({ ...i, savedForLater: false, inStock: true, unavailable: false, minQty: 1, maxQty: i.maxQty ?? 10 })),
      }),
      removePurchased: async () => 0,
    } as unknown as CartService;
    const coupons = {
      evaluate: async (_code: string, base: number) => {
        evaluated.push(base);
        return { code: 'TEN', valid: true, spec: { kind: 'percent', value: 10 } };
      },
      redeem: async () => undefined,
    } as unknown as CouponService;
    const inventory = { reserve: async () => undefined } as unknown as InventoryService;
    const settings = { get: async () => undefined } as unknown as SettingsService;
    return { svc: new CheckoutService(prisma, cart, new PricingService(), coupons, inventory, settings), created, evaluated };
  }

  it('works out the coupon on the other items only, and the offer line pays the full special price', async () => {
    const { svc, evaluated } = build([rice, sugarOffer]);
    const preview = await svc.preview({ customerId: 'c1' }, 'a1', 'TEN', true);
    expect(evaluated).toEqual([300000]); // the coupon sees 3000, not 3029
    expect(preview.breakup.subtotal).toBe(302900);
    expect(preview.breakup.discount).toBe(30000); // 10% of 3000
    expect(preview.items.find((i) => i.variantId === 'sugar')).toMatchObject({ unitPrice: 2900, offerName: 'Sugar at 29' });
  });

  it('saves the offer on the order item, with the special price as the sold price', async () => {
    const { svc, created } = build([rice, sugarOffer]);
    await svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod', couponCode: 'TEN' }, 'KEY-OFFER');
    const items = created[0]!.items.create;
    expect(items.find((i) => i.variantId === 'sugar')).toMatchObject({ unitPrice: 2900, quantity: 1, offerId: 'o1', offerName: 'Sugar at 29' });
    expect(items.find((i) => i.variantId === 'rice')).toMatchObject({ offerId: null, offerName: null });
    expect(created[0]!.discount).toBe(30000);
  });

  it('a coupon on a cart that only holds the offer item gives no discount', async () => {
    const { svc } = build([sugarOffer]);
    const preview = await svc.preview({ customerId: 'c1' }, 'a1', 'TEN', true);
    expect(preview.breakup.discount).toBe(0);
  });

  it('refuses a cart that holds more of the offer pack than the offer allows', async () => {
    // The real cart reports maxQty 1 for the sugar while the offer is on; checkout must stop a quantity of 2.
    const { svc, created } = build([rice, { ...sugarOffer, quantity: 2, maxQty: 1 }]);
    await expect(svc.place({ customerId: 'c1' }, { addressId: 'a1', paymentMethod: 'cod' }, 'KEY-2')).rejects.toThrow(/at most 1/);
    expect(created).toHaveLength(0);
  });
});
