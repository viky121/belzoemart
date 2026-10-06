import { BadRequestException, ConflictException } from '@nestjs/common';
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

  it('creates a new variant with a free SKU and a zeroed inventory row', async () => {
    const { service, creates, inventory } = build(seeded);
    const v = await service.upsert({ productId: 'p1', sku: 'TEA-250G', mrp: 300, sellingPrice: 250 });
    expect(creates).toHaveLength(1);
    expect(inventory).toEqual([{ variantId: v.id, available: 0 }]);
  });
});
