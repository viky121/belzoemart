import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { PaymentService } from '../checkout/payment.service';
import type { CartService } from '../cart/cart.service';
import type { FulfilmentService } from './fulfilment.service';

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
    const cancelledShipmentsFor: string[] = [];
    const fulfilment = {
      cancelShipmentsForOrder: async (orderId: string) => { cancelledShipmentsFor.push(orderId); },
    } as unknown as FulfilmentService;
    return {
      svc: new OrderService(prisma, inventory, payments, cart, fulfilment),
      updates,
      released,
      cancelledShipmentsFor,
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

  it('BR-2: customer can cancel a packed order and its courier shipment is cancelled', async () => {
    const ctx = build({
      id: 'o1',
      status: 'packed',
      customerId: 'c1',
      grandTotal: 100000,
      items: [{ variantId: 'v1', quantity: 1 }],
      payments: [{ status: 'captured' }],
    });
    const res = await ctx.svc.cancel('o1', { customerId: 'c1' }, 'changed mind');
    expect(res).toMatchObject({ status: 'cancelled' });
    expect(ctx.updates[0]).toMatchObject({ status: 'cancelled' });
    expect(ctx.cancelledShipmentsFor).toEqual(['o1']);
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
    returns: [],
    invoice: null,
  };

  function build(variants: Record<string, unknown>[]) {
    const added: string[] = [];
    const prisma = {
      order: { findUnique: async () => order },
      address: { findUnique: async () => null },
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
    const svc = new OrderService(prisma, {} as InventoryService, {} as PaymentService, cart, {} as FulfilmentService);
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

/** Order detail payload: reconciled tracking, address, returnability, attributes, returns. */
describe('OrderService.getForCustomer — detail payload', () => {
  const order = {
    id: 'o1',
    customerId: 'c1',
    addressId: 'a1',
    status: 'delivered',
    updatedAt: new Date('2025-01-02T09:00:00.000Z'),
    items: [
      { id: 'i1', variantId: 'v1', title: 'Tea 250 g', sku: 'TEA-250', quantity: 1, unitPrice: 30000 },
      { id: 'i2', variantId: 'v-gone', title: 'Honey', sku: 'HONEY', quantity: 1, unitPrice: 20000 },
    ],
    payments: [],
    invoice: null,
    shipments: [
      {
        id: 's1',
        status: 'packed',
        createdAt: new Date('2025-01-01T09:00:00.000Z'),
        events: [
          { status: 'packed', description: 'Shipment packed', location: null, occurredAt: new Date('2025-01-01T10:00:00.000Z') },
          { status: 'shipped', description: 'Handed to courier', location: 'Bengaluru', occurredAt: new Date('2025-01-01T11:00:00.000Z') },
          { status: 'out_for_delivery', description: 'Out for delivery', location: null, occurredAt: new Date('2025-01-01T12:00:00.000Z') },
        ],
      },
    ],
    returns: [
      {
        id: 'r1',
        status: 'requested',
        reason: 'Damaged / broken product: cracked',
        resolution: 'replace',
        imagesJson: ['https://cdn.belzo.test/returns/x.jpg', 42],
        items: [{ id: 'ri1', returnRequestId: 'r1', orderItemId: 'i1', quantity: 1 }],
        createdAt: new Date('2025-01-03T00:00:00.000Z'),
        updatedAt: new Date('2025-01-03T00:00:00.000Z'),
      },
    ],
  };

  function build(address: Record<string, unknown> | null) {
    const prisma = {
      order: { findUnique: async () => order },
      address: { findUnique: async () => address },
      variant: {
        findMany: async () => [
          {
            id: 'v1',
            imageUrl: null,
            attributesJson: { size: '250 g', colour: 'Green', nested: { x: 1 } },
            product: { slug: 'tea', isReturnable: false, images: [] },
          },
        ],
      },
    } as unknown as PrismaService;
    return new OrderService(prisma, {} as InventoryService, {} as PaymentService, {} as CartService, {} as FulfilmentService);
  }

  const ownAddress = {
    id: 'a1',
    customerId: 'c1',
    fullName: 'Test User',
    phone: '9000000000',
    line1: '1 Main Road',
    line2: null,
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
  };

  it('reconciles a stale packed shipment with the delivered order', async () => {
    const res = await build(ownAddress).getForCustomer('c1', 'o1');
    expect(res.tracking.latestStatus).toBe('delivered');
    expect(res.shipments[0]!.status).toBe('delivered');
    expect(res.tracking.shipments[0]!.providerStatus).toBe('packed');
    expect(res.tracking.shipments[0]!.events[0]).toMatchObject({ status: 'delivered', derived: true });
  });

  it('exposes item returnability/attributes, the owned address and return requests', async () => {
    const res = await build(ownAddress).getForCustomer('c1', 'o1');
    expect(res.items[0]).toMatchObject({ isReturnable: false, attributes: { size: '250 g', colour: 'Green' } });
    expect(res.items[0]!.attributes).not.toHaveProperty('nested');
    expect(res.items[1]).toMatchObject({ isReturnable: true, attributes: {} });
    expect(res.address).toEqual({
      fullName: 'Test User',
      phone: '9000000000',
      line1: '1 Main Road',
      line2: null,
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });
    expect(res.returns).toEqual([
      expect.objectContaining({
        id: 'r1',
        status: 'requested',
        resolution: 'replace',
        images: ['https://cdn.belzo.test/returns/x.jpg'],
        items: [{ orderItemId: 'i1', quantity: 1 }],
      }),
    ]);
  });

  it('returns a null address when it belongs to someone else', async () => {
    const res = await build({ ...ownAddress, customerId: 'other' }).getForCustomer('c1', 'o1');
    expect(res.address).toBeNull();
  });

  it('still rejects another customer', async () => {
    await expect(build(ownAddress).getForCustomer('c2', 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
