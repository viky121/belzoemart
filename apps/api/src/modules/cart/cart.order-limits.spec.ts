import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/** Per-variant min/max order quantity, enforced when items are added, changed, moved back or merged. */
describe('CartService — min / max order quantity', () => {
  interface Item {
    id: string;
    cartId: string;
    variantId: string;
    quantity: number;
    savedForLater: boolean;
  }

  const variant = (over: Record<string, unknown> = {}) => ({
    id: 'v1',
    sku: 'RICE-1',
    productId: 'p1',
    isActive: true,
    mrp: 1000,
    sellingPrice: 800,
    priceSlabsJson: [],
    attributesJson: {},
    weightGrams: 0,
    imageUrl: null,
    minOrderQty: null,
    maxOrderQty: null,
    inventory: { available: 50 },
    product: { title: 'Rice', taxRatePct: 5, images: [] },
    ...over,
  });

  function build(v: ReturnType<typeof variant>, items: Item[] = [], guestItems: Item[] = []) {
    const rows = [...items];
    const updates: { data: Record<string, unknown> }[] = [];
    const creates: Record<string, unknown>[] = [];
    const prisma = {
      cart: {
        findUnique: async ({ where }: { where: { guestToken?: string } }) =>
          where.guestToken ? { id: 'g1', items: guestItems } : { id: 'c1' },
        create: async () => ({ id: 'c1' }),
        delete: async () => undefined,
      },
      cartItem: {
        findUnique: async ({ where }: { where: { cartId_variantId?: { cartId: string; variantId: string } } }) =>
          rows.find(
            (r) =>
              r.cartId === where.cartId_variantId?.cartId && r.variantId === where.cartId_variantId?.variantId,
          ) ?? null,
        findMany: async () => rows,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return data;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push({ data });
          return undefined;
        },
      },
      variant: {
        findUnique: async () => v,
        findMany: async () => [v],
      },
    } as unknown as PrismaService;
    return { svc: new CartService(prisma), updates, creates };
  }

  const ref = { customerId: 'u1' };
  const line = (quantity: number, over: Partial<Item> = {}): Item => ({
    id: 'i1',
    cartId: 'c1',
    variantId: 'v1',
    quantity,
    savedForLater: false,
    ...over,
  });

  it('starts a new line at the minimum when the client adds fewer', async () => {
    const { svc, creates } = build(variant({ minOrderQty: 5 }));
    await svc.addItem(ref, 'v1', 1);
    expect(creates).toEqual([{ cartId: 'c1', variantId: 'v1', quantity: 5 }]);
  });

  it('keeps the quantity when it is already inside the limits', async () => {
    const { svc, creates } = build(variant({ minOrderQty: 5, maxOrderQty: 20 }));
    await svc.addItem(ref, 'v1', 8);
    expect(creates).toEqual([{ cartId: 'c1', variantId: 'v1', quantity: 8 }]);
  });

  it('refuses to go over the maximum, with a clear message', async () => {
    const { svc, creates } = build(variant({ maxOrderQty: 10 }), [line(8)]);
    const err = await svc.addItem(ref, 'v1', 5).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('You can buy at most 10 of "Rice" per order.');
    expect(creates).toHaveLength(0);
  });

  it('adds up to the maximum', async () => {
    const { svc, updates } = build(variant({ maxOrderQty: 10 }), [line(8)]);
    await svc.addItem(ref, 'v1', 2);
    expect(updates[0]!.data).toMatchObject({ quantity: 10 });
  });

  it('clamp mode (reorder) trims into the limits instead of failing', async () => {
    const { svc, creates } = build(variant({ minOrderQty: 2, maxOrderQty: 6 }));
    await svc.addItem(ref, 'v1', 40, { clamp: true });
    expect(creates).toEqual([{ cartId: 'c1', variantId: 'v1', quantity: 6 }]);
  });

  it('rejects changing a line below the minimum or above the maximum', async () => {
    const { svc, updates } = build(variant({ minOrderQty: 5, maxOrderQty: 20 }), [line(6)]);
    await expect(svc.updateItem(ref, 'v1', 3)).rejects.toThrow('The minimum order quantity for "Rice" is 5.');
    await expect(svc.updateItem(ref, 'v1', 25)).rejects.toThrow('You can buy at most 20 of "Rice" per order.');
    expect(updates).toHaveLength(0);
    await svc.updateItem(ref, 'v1', 12);
    expect(updates[0]!.data).toMatchObject({ quantity: 12 });
  });

  it('puts a saved-for-later line back inside the limits when it is moved to the cart', async () => {
    const { svc, updates } = build(variant({ minOrderQty: 5, maxOrderQty: 8 }), [line(2, { savedForLater: true })]);
    await svc.saveForLater(ref, 'v1', false);
    expect(updates[0]!.data).toEqual({ savedForLater: false, quantity: 5 });
  });

  it('does not touch the quantity when saving for later', async () => {
    const { svc, updates } = build(variant({ minOrderQty: 5 }), [line(2)]);
    await svc.saveForLater(ref, 'v1', true);
    expect(updates[0]!.data).toEqual({ savedForLater: true });
  });

  it('trims a guest cart into the limits on merge instead of failing', async () => {
    const guest = [line(50, { id: 'g', cartId: 'g1' })];
    const { svc, creates } = build(variant({ minOrderQty: 2, maxOrderQty: 12 }), [], guest);
    await svc.merge('guest-token', 'u1');
    expect(creates).toEqual([{ cartId: 'c1', variantId: 'v1', quantity: 12 }]);
  });

  it('exposes the limits on each cart line and treats stock below the minimum as out of stock', async () => {
    const { svc } = build(variant({ minOrderQty: 6, maxOrderQty: 12, inventory: { available: 4 } }), [line(6)]);
    const cart = await svc.getCart(ref);
    expect(cart.items[0]).toMatchObject({ minQty: 6, maxQty: 12, available: 4, inStock: false });
  });

  it('reports the default limits for a variant with none set', async () => {
    const { svc } = build(variant(), [line(3)]);
    const cart = await svc.getCart(ref);
    expect(cart.items[0]).toMatchObject({ minQty: 1, maxQty: 99, inStock: true });
  });
});
