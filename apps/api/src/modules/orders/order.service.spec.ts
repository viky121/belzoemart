import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { PaymentService } from '../checkout/payment.service';
import type { CartService } from '../cart/cart.service';

/**
 * Unit tests for OrderService transition + cancel rules (BR-1, BR-2).
 */
describe('OrderService', () => {
  function build(order: Record<string, unknown> | null) {
    const updates: Record<string, unknown>[] = [];
    const released: string[] = [];
    let refunded = false;
    const prisma = {
      order: {
        findUnique: async () => order,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...(order ?? {}), ...data };
        },
      },
    } as unknown as PrismaService;
    const inventory = {
      release: async (v: string) => { released.push(v); },
      adjust: async (v: string) => { released.push(v); },
    } as unknown as InventoryService;
    const payments = { refund: async () => { refunded = true; return { status: 'processed' }; } } as unknown as PaymentService;
    const cart = {} as CartService;
    return {
      svc: new OrderService(prisma, inventory, payments, cart),
      updates,
      released,
      get refunded() { return refunded; },
    };
  }

  it('BR-1: rejects an illegal transition', async () => {
    const { svc } = build({ id: 'o1', status: 'pending' });
    await expect(svc.transition('o1', 'delivered')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BR-1: allows a legal transition (confirmed → packed)', async () => {
    const { svc, updates } = build({ id: 'o1', status: 'confirmed' });
    await svc.transition('o1', 'packed');
    expect(updates[0]).toMatchObject({ status: 'packed' });
  });

  it('BR-2: customer cannot cancel a shipped order', async () => {
    const { svc } = build({ id: 'o1', status: 'shipped', customerId: 'c1', items: [], payments: [] });
    await expect(svc.cancel('o1', { customerId: 'c1' }, 'changed mind')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BR-2: customer cannot cancel someone else\u2019s order', async () => {
    const { svc } = build({ id: 'o1', status: 'pending', customerId: 'other', items: [], payments: [] });
    await expect(svc.cancel('o1', { customerId: 'c1' }, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('BR-3: cancelling a paid confirmed order restocks and refunds', async () => {
    const ctx = build({
      id: 'o1',
      status: 'confirmed',
      customerId: 'c1',
      grandTotal: 100000,
      items: [{ variantId: 'v1', quantity: 2 }],
      payments: [{ status: 'captured' }],
    });
    await ctx.svc.cancel('o1', { customerId: 'c1' }, 'defective');
    expect(ctx.updates[0]).toMatchObject({ status: 'cancelled' });
    expect(ctx.released).toContain('v1');
    expect(ctx.refunded).toBe(true);
  });
});

/** Orders that contain a removed variant keep working (history + reorder). */
describe('OrderService — removed variants', () => {
  const order = {
    id: 'o1',
    customerId: 'c1',
    status: 'delivered',
    items: [
      { id: 'i1', variantId: 'v-gone', title: 'Oil 500 ml', sku: 'OIL-500', quantity: 1, unitPrice: 30000 },
      { id: 'i2', variantId: 'v-ok', title: 'Oil 1 L', sku: 'OIL-1000', quantity: 2, unitPrice: 55000 },
    ],
    payments: [],
    shipments: [],
    invoice: null,
  };

  function build(variants: Record<string, unknown>[]) {
    const added: string[] = [];
    const prisma = {
      order: { findUnique: async () => order },
      variant: {
        findMany: async ({ where: { id } }: { where: { id: { in: string[] } } }) =>
          variants.filter((v) => id.in.includes(v.id as string)),
      },
    } as unknown as PrismaService;
    const cart = {
      addItem: async (_ref: unknown, variantId: string) => {
        if (variantId === 'v-gone') {
          throw new BadRequestException('This product option is no longer available');
        }
        added.push(variantId);
      },
      getCart: async () => ({ cartId: 'cart1', items: added.map((variantId) => ({ variantId })) }),
    } as unknown as CartService;
    const svc = new OrderService(prisma, {} as InventoryService, {} as PaymentService, cart);
    return { svc, added };
  }

  it('order detail still shows the snapshot title/sku of a deactivated variant', async () => {
    const { svc } = build([
      {
        id: 'v-gone', isActive: false, imageUrl: null,
        product: { slug: 'oil', images: [{ url: '/uploads/oil.jpg' }] },
      },
      { id: 'v-ok', isActive: true, imageUrl: null, product: { slug: 'oil', images: [] } },
    ]);
    const res = await svc.getForCustomer('c1', 'o1');
    expect(res.items[0]).toMatchObject({
      title: 'Oil 500 ml',
      sku: 'OIL-500',
      imageUrl: '/uploads/oil.jpg',
    });
  });

  it('order detail survives a hard-deleted variant (no image, snapshot kept)', async () => {
    const { svc } = build([]);
    const res = await svc.getForCustomer('c1', 'o1');
    expect(res.items[0]).toMatchObject({ title: 'Oil 500 ml', sku: 'OIL-500', imageUrl: null });
  });

  it('reorder skips a removed variant and still adds the rest', async () => {
    const { svc, added } = build([]);
    const cart = await svc.reorder('c1', 'o1');
    expect(added).toEqual(['v-ok']);
    expect(cart).toMatchObject({ cartId: 'cart1' });
  });
});
