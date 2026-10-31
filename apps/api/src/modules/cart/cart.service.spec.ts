import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * CartService and removed variants: an inactive/unknown variant cannot be
 * added, and a lingering line for one is reported as unavailable (checkout
 * blocks it) without unlocking another pack's bulk tier.
 */
describe('CartService — removed variants', () => {
  interface FakeItem {
    id: string;
    cartId: string;
    variantId: string;
    quantity: number;
    savedForLater: boolean;
  }

  const variant = (id: string, isActive: boolean, extra: Record<string, unknown> = {}) => ({
    id,
    sku: id.toUpperCase(),
    productId: 'p1',
    isActive,
    mrp: 1000,
    sellingPrice: 800,
    priceSlabsJson: [],
    attributesJson: {},
    weightGrams: 0,
    imageUrl: null,
    inventory: { available: 50 },
    product: { title: 'Oil', taxRatePct: 5, images: [] },
    ...extra,
  });

  function build(variants: ReturnType<typeof variant>[], items: FakeItem[] = []) {
    const cartItems = [...items];
    const creates: Record<string, unknown>[] = [];
    const prisma = {
      cart: {
        findUnique: async () => ({ id: 'c1' }),
        create: async () => ({ id: 'c1' }),
      },
      cartItem: {
        findUnique: async () => null,
        findMany: async () => cartItems,
        create: async ({ data }: { data: Omit<FakeItem, 'id' | 'savedForLater'> }) => {
          creates.push(data);
          const it = { id: `i${cartItems.length + 1}`, savedForLater: false, ...data };
          cartItems.push(it);
          return it;
        },
        update: async () => undefined,
      },
      variant: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          variants.find((v) => v.id === id) ?? null,
        findMany: async ({ where: { id } }: { where: { id: { in: string[] } } }) =>
          variants.filter((v) => id.in.includes(v.id)),
      },
    } as unknown as PrismaService;
    return { svc: new CartService(prisma), creates };
  }

  it('rejects adding an inactive (removed) variant and creates no cart item', async () => {
    const { svc, creates } = build([variant('v500', false)]);
    const err = await svc.addItem({ customerId: 'u1' }, 'v500', 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/no longer available/);
    expect(creates).toHaveLength(0);
  });

  it('rejects adding an unknown variant id', async () => {
    const { svc, creates } = build([]);
    await expect(svc.addItem({ customerId: 'u1' }, 'nope', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(creates).toHaveLength(0);
  });

  it('adds an active variant', async () => {
    const { svc, creates } = build([variant('v200', true)]);
    const cart = await svc.addItem({ customerId: 'u1' }, 'v200', 2);
    expect(creates).toEqual([{ cartId: 'c1', variantId: 'v200', quantity: 2 }]);
    expect(cart.items[0]).toMatchObject({ variantId: 'v200', unavailable: false, inStock: true });
  });

  it('marks a lingering inactive line unavailable and keeps it out of the tier quantity', async () => {
    const slabs = [{ minQty: 3, unitPrice: 700 }];
    const { svc } = build(
      [
        variant('v200', true, { priceSlabsJson: slabs }),
        variant('v500', false, { priceSlabsJson: slabs }),
      ],
      [
        { id: 'i1', cartId: 'c1', variantId: 'v200', quantity: 1, savedForLater: false },
        { id: 'i2', cartId: 'c1', variantId: 'v500', quantity: 2, savedForLater: false },
      ],
    );
    const cart = await svc.getCart({ customerId: 'u1' });
    const gone = cart.items.find((i) => i.variantId === 'v500');
    const ok = cart.items.find((i) => i.variantId === 'v200');
    expect(gone).toMatchObject({ unavailable: true, inStock: false, available: 0 });
    // 1 active unit only → the 3+ tier is NOT unlocked by the removed pack.
    expect(ok).toMatchObject({ unavailable: false, inStock: true, tierQty: 1, unitPrice: 800 });
  });

  it('never exposes the admin-only costPrice on a cart line', async () => {
    const { svc } = build(
      [variant('v200', true, { costPrice: 12345 })],
      [{ id: 'i1', cartId: 'c1', variantId: 'v200', quantity: 1, savedForLater: false }],
    );
    const cart = await svc.getCart({ customerId: 'u1' });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).not.toHaveProperty('costPrice');
    expect(JSON.stringify(cart)).not.toContain('12345');
  });
});

describe('CartService.removePurchased (A4)', () => {
  interface Line {
    cartId: string;
    variantId: string;
    savedForLater: boolean;
  }

  function build(opts: { hasCart: boolean }) {
    const lines: Line[] = [
      { cartId: 'c1', variantId: 'v1', savedForLater: false },
      { cartId: 'c1', variantId: 'v2', savedForLater: true },
      { cartId: 'c1', variantId: 'v3', savedForLater: false },
      { cartId: 'other', variantId: 'v1', savedForLater: false },
    ];
    const cartFind = jest.fn(async ({ where }: { where: { customerId?: string } }) =>
      opts.hasCart && where.customerId === 'u1' ? { id: 'c1' } : null,
    );
    const cartCreate = jest.fn();
    const deleteMany = jest.fn(
      async ({
        where,
      }: {
        where: { cartId: string; variantId: { in: string[] }; savedForLater: boolean };
      }) => {
        const before = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
          const l = lines[i]!;
          if (
            l.cartId === where.cartId &&
            where.variantId.in.includes(l.variantId) &&
            l.savedForLater === where.savedForLater
          ) {
            lines.splice(i, 1);
          }
        }
        return { count: before - lines.length };
      },
    );
    const prisma = {
      cart: { findUnique: cartFind, create: cartCreate },
      cartItem: { deleteMany },
    } as unknown as PrismaService;
    return { svc: new CartService(prisma), lines, cartFind, cartCreate, deleteMany };
  }

  it('deletes only the active lines for the given variants', async () => {
    const { svc, lines } = build({ hasCart: true });
    const count = await svc.removePurchased('u1', ['v1', 'v2']);
    expect(count).toBe(1);
    // Saved-for-later v2, the unpurchased v3 and another cart's v1 remain.
    expect(lines).toEqual([
      { cartId: 'c1', variantId: 'v2', savedForLater: true },
      { cartId: 'c1', variantId: 'v3', savedForLater: false },
      { cartId: 'other', variantId: 'v1', savedForLater: false },
    ]);
  });

  it('returns 0 without creating a cart when the customer has none', async () => {
    const { svc, cartCreate, deleteMany } = build({ hasCart: false });
    expect(await svc.removePurchased('u1', ['v1'])).toBe(0);
    expect(cartCreate).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('skips the database for an empty variant list', async () => {
    const { svc, cartFind, deleteMany } = build({ hasCart: true });
    expect(await svc.removePurchased('u1', [])).toBe(0);
    expect(cartFind).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('CartService cart creation when two requests arrive together', () => {
  const unique = Object.assign(new Error('Unique constraint failed on the fields: (`guestToken`)'), { code: 'P2002' });
  function make(findResults: unknown[], createImpl: () => Promise<unknown>) {
    const find = jest.fn();
    for (const r of findResults) find.mockResolvedValueOnce(r);
    const create = jest.fn(createImpl);
    const svc = new CartService({ cart: { findUnique: find, create } } as unknown as PrismaService);
    return { svc, find, create };
  }
  it('takes the cart the other request made instead of failing (guest)', async () => {
    const { svc, create } = make([null, { id: 'made-by-other' }], () => Promise.reject(unique));
    await expect(svc['findOrCreateCart']({ guestToken: 'guest-token-1' })).resolves.toEqual({ id: 'made-by-other' });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('does the same for a signed-in customer', async () => {
    const { svc } = make([null, { id: 'c9' }], () => Promise.reject(unique));
    await expect(svc['findOrCreateCart']({ customerId: 'u1' })).resolves.toEqual({ id: 'c9' });
  });
  it('creates the cart when none exists and nothing races', async () => {
    const { svc, create } = make([null], async () => ({ id: 'new' }));
    await expect(svc['findOrCreateCart']({ guestToken: 'guest-token-2' })).resolves.toEqual({ id: 'new' });
    expect(create).toHaveBeenCalledWith({ data: { guestToken: 'guest-token-2' } });
  });
  it('still fails on any other database error', async () => {
    const boom = Object.assign(new Error('connection lost'), { code: 'P1001' });
    const { svc } = make([null], () => Promise.reject(boom));
    await expect(svc['findOrCreateCart']({ guestToken: 'guest-token-3' })).rejects.toBe(boom);
  });
  it('fails when the unique error comes but the cart cannot be found afterwards', async () => {
    const { svc } = make([null, null], () => Promise.reject(unique));
    await expect(svc['findOrCreateCart']({ guestToken: 'guest-token-4' })).rejects.toBe(unique);
  });
});
