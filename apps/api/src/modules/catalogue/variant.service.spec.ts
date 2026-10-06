import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VariantService } from './variant.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Unit tests for VariantService.upsert: duplicate-SKU 409 and that an update
 * writes back the slabs/attributes/weight/image it is given (the product
 * editor relies on this to avoid wiping bulk tiers).
 */
describe('VariantService.upsert', () => {
  interface FakeVariant { id: string; sku: string; productId: string }

  function build(existing: FakeVariant[] = []) {
    const variants: FakeVariant[] = [...existing];
    const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
    const creates: Record<string, unknown>[] = [];
    const inventory: { variantId: string; available: number }[] = [];
    let seq = variants.length;

    const prisma = {
      variant: {
        findUnique: async ({ where: { sku } }: { where: { sku: string } }) => {
          const v = variants.find((x) => x.sku === sku);
          return v ? { id: v.id } : null;
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return { id: args.where.id, ...args.data };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          const v = { id: `v${(seq += 1)}`, ...data };
          return v;
        },
      },
      inventory: {
        create: async ({ data }: { data: { variantId: string; available: number } }) => {
          inventory.push(data);
          return data;
        },
      },
    };

    const service = new VariantService(prisma as unknown as PrismaService);
    return { service, updates, creates, inventory };
  }

  const seeded: FakeVariant[] = [
    { id: 'v1', sku: 'TEA-1KG', productId: 'p1' },
    { id: 'v2', sku: 'TEA-500G', productId: 'p1' },
  ];

  it('rejects creating a variant with a SKU already taken', async () => {
    const { service, creates } = build(seeded);
    await expect(
      service.upsert({ productId: 'p1', sku: 'TEA-1KG', mrp: 1000, sellingPrice: 900 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(creates).toHaveLength(0);
  });

  it('rejects renaming a variant to a SKU owned by another variant', async () => {
    const { service, updates } = build(seeded);
    await expect(
      service.upsert({ id: 'v1', productId: 'p1', sku: 'TEA-500G', mrp: 1000, sellingPrice: 900 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('updates a variant keeping its own SKU and writes back slabs, attributes, weight and image', async () => {
    const { service, updates } = build(seeded);
    await expect(
      service.upsert({
        id: 'v1',
        productId: 'p1',
        sku: 'TEA-1KG',
        mrp: 1200,
        sellingPrice: 1000,
        priceSlabs: [{ minQty: 5, unitPrice: 900 }],
        attributes: { Size: '1 kg' },
        weightGrams: 1000,
        imageUrl: '/uploads/a.jpg',
      }),
    ).resolves.toBeDefined();
    expect(updates).toHaveLength(1);
    expect(updates[0].where).toEqual({ id: 'v1' });
    expect(updates[0].data).toMatchObject({
      sku: 'TEA-1KG',
      mrp: 1200,
      sellingPrice: 1000,
      priceSlabsJson: [{ minQty: 5, unitPrice: 900 }],
      attributesJson: { Size: '1 kg' },
      weightGrams: 1000,
      imageUrl: '/uploads/a.jpg',
    });
  });

  it('rejects a slab unit price above the selling price', async () => {
    const { service, updates } = build(seeded);
    await expect(
      service.upsert({
        id: 'v1',
        productId: 'p1',
        sku: 'TEA-1KG',
        mrp: 1000,
        sellingPrice: 800,
        priceSlabs: [{ minQty: 5, unitPrice: 900 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it('reports a clash with a removed (inactive) variant with a restore hint', async () => {
    const variants = [{ id: 'v9', sku: 'OLD-SKU', isActive: false }];
    const prisma = {
      variant: {
        findUnique: async ({ where: { sku } }: { where: { sku: string } }) =>
          variants.find((x) => x.sku === sku) ?? null,
      },
    };
    const service = new VariantService(prisma as unknown as PrismaService);
    const err = await service
      .upsert({ productId: 'p1', sku: 'OLD-SKU', mrp: 100, sellingPrice: 90 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toMatch(/removed variant/);
  });

  it('creates a new variant with a free SKU and a zeroed inventory row', async () => {
    const { service, creates, inventory } = build(seeded);
    const v = await service.upsert({ productId: 'p1', sku: 'TEA-250G', mrp: 300, sellingPrice: 250 });
    expect(creates).toHaveLength(1);
    expect(inventory).toEqual([{ variantId: v.id, available: 0 }]);
  });
});

/**
 * VariantService.remove: ordered variants are soft-deleted (kept for order history),
 * never-ordered ones hard-deleted; carts/wishlists are always cleaned; the last
 * active variant of a published product is protected.
 */
describe('VariantService.remove', () => {
  interface RV { id: string; sku: string; productId: string; isActive: boolean }
  interface RP { id: string; status: 'draft' | 'published' | 'archived' }

  function build(opts: {
    variants: RV[];
    products: RP[];
    orderItems?: { variantId: string }[];
    cartItems?: { id: string; variantId: string }[];
    wishlistItems?: { id: string; variantId: string }[];
  }) {
    const variants = opts.variants.map((v) => ({ ...v }));
    const orderItems = [...(opts.orderItems ?? [])];
    let cartItems = [...(opts.cartItems ?? [])];
    let wishlistItems = [...(opts.wishlistItems ?? [])];
    const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
    const deletes: { where: { id: string } }[] = [];

    const prisma = {
      variant: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const v = variants.find((x) => x.id === id);
          if (!v) return null;
          const product = opts.products.find((p) => p.id === v.productId)!;
          return { ...v, product: { id: product.id, status: product.status } };
        },
        count: async ({ where }: { where: { productId: string; isActive: boolean } }) =>
          variants.filter((v) => v.productId === where.productId && v.isActive === where.isActive)
            .length,
        update: async (args: { where: { id: string }; data: { isActive: boolean } }) => {
          updates.push(args);
          const v = variants.find((x) => x.id === args.where.id)!;
          Object.assign(v, args.data);
          return v;
        },
        delete: async (args: { where: { id: string } }) => {
          deletes.push(args);
          const i = variants.findIndex((x) => x.id === args.where.id);
          return variants.splice(i, 1)[0];
        },
      },
      orderItem: {
        count: async ({ where: { variantId } }: { where: { variantId: string } }) =>
          orderItems.filter((o) => o.variantId === variantId).length,
      },
      cartItem: {
        deleteMany: async ({ where: { variantId } }: { where: { variantId: string } }) => {
          const before = cartItems.length;
          cartItems = cartItems.filter((c) => c.variantId !== variantId);
          return { count: before - cartItems.length };
        },
      },
      wishlistItem: {
        deleteMany: async ({ where: { variantId } }: { where: { variantId: string } }) => {
          const before = wishlistItems.length;
          wishlistItems = wishlistItems.filter((w) => w.variantId !== variantId);
          return { count: before - wishlistItems.length };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };

    const service = new VariantService(prisma as unknown as PrismaService);
    return {
      service,
      variants,
      updates,
      deletes,
      carts: () => cartItems,
      wishlists: () => wishlistItems,
    };
  }

  // 200 ml / 500 ml / 1000 ml of one published product.
  const oil = (): RV[] => [
    { id: 'v200', sku: 'OIL-200', productId: 'p1', isActive: true },
    { id: 'v500', sku: 'OIL-500', productId: 'p1', isActive: true },
    { id: 'v1000', sku: 'OIL-1000', productId: 'p1', isActive: true },
  ];
  const published: RP[] = [{ id: 'p1', status: 'published' }];

  it('hard-deletes a never-ordered variant (500 ml out of 200/500/1000 ml)', async () => {
    const h = build({ variants: oil(), products: published });
    await expect(h.service.remove('v500')).resolves.toEqual({ removed: true, mode: 'deleted' });
    expect(h.deletes).toEqual([{ where: { id: 'v500' } }]);
    expect(h.updates).toHaveLength(0);
    expect(h.variants.map((v) => v.id)).toEqual(['v200', 'v1000']);
  });

  it('soft-deletes an ordered variant so order history keeps the row', async () => {
    const h = build({ variants: oil(), products: published, orderItems: [{ variantId: 'v500' }] });
    await expect(h.service.remove('v500')).resolves.toEqual({
      removed: true,
      mode: 'deactivated',
    });
    expect(h.updates).toEqual([{ where: { id: 'v500' }, data: { isActive: false } }]);
    expect(h.deletes).toHaveLength(0);
    expect(h.variants.find((v) => v.id === 'v500')?.isActive).toBe(false);
  });

  it.each([
    ['deleted', [] as { variantId: string }[]],
    ['deactivated', [{ variantId: 'v500' }]],
  ])('removes the variant from every cart and wishlist (%s)', async (mode, orderItems) => {
    const h = build({
      variants: oil(),
      products: published,
      orderItems,
      cartItems: [
        { id: 'c1', variantId: 'v500' },
        { id: 'c2', variantId: 'v200' },
        { id: 'c3', variantId: 'v500' },
      ],
      wishlistItems: [
        { id: 'w1', variantId: 'v500' },
        { id: 'w2', variantId: 'v1000' },
      ],
    });
    const res = await h.service.remove('v500');
    expect(res.mode).toBe(mode);
    expect(h.carts().map((c) => c.id)).toEqual(['c2']);
    expect(h.wishlists().map((w) => w.id)).toEqual(['w2']);
  });

  it('blocks removing the last active variant of a published product', async () => {
    const h = build({
      variants: [
        { id: 'v1', sku: 'A', productId: 'p1', isActive: true },
        { id: 'v2', sku: 'B', productId: 'p1', isActive: false },
      ],
      products: published,
      cartItems: [{ id: 'c1', variantId: 'v1' }],
    });
    const err = await h.service.remove('v1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/last active variant/);
    expect(h.deletes).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
    expect(h.carts()).toHaveLength(1);
  });

  it('allows removing the last variant of a draft product', async () => {
    const h = build({
      variants: [{ id: 'v1', sku: 'A', productId: 'p1', isActive: true }],
      products: [{ id: 'p1', status: 'draft' }],
    });
    await expect(h.service.remove('v1')).resolves.toEqual({ removed: true, mode: 'deleted' });
    expect(h.variants).toHaveLength(0);
  });

  it('allows removing one of two active variants of a published product', async () => {
    const h = build({
      variants: oil().filter((v) => v.id !== 'v1000'),
      products: published,
    });
    await expect(h.service.remove('v500')).resolves.toEqual({ removed: true, mode: 'deleted' });
    expect(h.variants.map((v) => v.id)).toEqual(['v200']);
  });

  it('404s for an unknown variant', async () => {
    const h = build({ variants: oil(), products: published });
    await expect(h.service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent for an already-deactivated variant (never hard-deletes it)', async () => {
    const h = build({
      variants: [
        { id: 'v1', sku: 'A', productId: 'p1', isActive: true },
        { id: 'v2', sku: 'B', productId: 'p1', isActive: false },
      ],
      products: published,
    });
    await expect(h.service.remove('v2')).resolves.toEqual({ removed: true, mode: 'deactivated' });
    expect(h.deletes).toHaveLength(0);
  });
});

describe('VariantService.listByProduct', () => {
  it('returns only active variants with inventory', async () => {
    const calls: unknown[] = [];
    const prisma = {
      variant: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [];
        },
      },
    };
    const service = new VariantService(prisma as unknown as PrismaService);
    await service.listByProduct('p1');
    expect(calls).toEqual([
      { where: { productId: 'p1', isActive: true }, include: { inventory: true } },
    ]);
  });
});
