import { PaymentService } from './payment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type { PaymentProvider } from '../../integrations/payment/payment.provider';

/**
 * Cash on Delivery has no payment to wait for. These tests are about the one rule that was missing: a COD order
 * becomes confirmed (stock booked, fulfilment/messages/invoice told) the moment it is placed.
 */
function build(opts: { status?: string; provider?: string; claimCount?: number } = {}) {
  const order = {
    id: 'o1',
    customerId: 'cust1',
    status: opts.status ?? 'pending',
    items: [
      { variantId: 'v1', quantity: 1 },
      { variantId: 'v2', quantity: 3 },
    ],
    payments: [{ id: 'p1', provider: opts.provider ?? 'cod', status: 'pending' }],
  };
  const prisma = {
    order: {
      findUnique: jest.fn(async () => ({ ...order })),
      updateMany: jest.fn(async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
        const count = opts.claimCount ?? (order.status === where.status ? 1 : 0);
        if (count > 0) order.status = data.status;
        return { count };
      }),
    },
  } as unknown as PrismaService;
  const inventory = { confirmSale: jest.fn() };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const cart = { removePurchased: jest.fn().mockResolvedValue(0) };
  const svc = new PaymentService(
    prisma,
    inventory as unknown as InventoryService,
    queue as unknown as QueueService,
    { kind: 'mock' } as unknown as PaymentProvider,
    cart as unknown as CartService,
  );
  return { svc, order, prisma, inventory, queue, cart };
}

describe('PaymentService.confirmCodOrder', () => {
  it('confirms a pending Cash on Delivery order: stock becomes a sale and fulfilment, messages and invoice are told', async () => {
    const { svc, order, inventory, queue } = build();
    expect(await svc.confirmCodOrder('o1')).toBe(true);
    expect(order.status).toBe('confirmed');
    expect(inventory.confirmSale).toHaveBeenCalledTimes(2);
    expect(inventory.confirmSale).toHaveBeenCalledWith('v1', 1, 'o1');
    expect(inventory.confirmSale).toHaveBeenCalledWith('v2', 3, 'o1');
    expect(queue.enqueue.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ['shipments', 'order.confirmed', { orderId: 'o1' }],
      ['notifications', 'order.confirmed', { orderId: 'o1' }],
      ['invoices', 'order.confirmed', { orderId: 'o1' }],
    ]);
  });

  it('does not touch the cart (the lines were cleared when the order was placed)', async () => {
    const { svc, cart } = build();
    await svc.confirmCodOrder('o1');
    expect(cart.removePurchased).not.toHaveBeenCalled();
  });

  it('is safe to call twice: the second call does nothing', async () => {
    const { svc, inventory, queue } = build();
    expect(await svc.confirmCodOrder('o1')).toBe(true);
    expect(await svc.confirmCodOrder('o1')).toBe(false);
    expect(inventory.confirmSale).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
  });

  it('leaves an online order alone: it is confirmed by its payment', async () => {
    for (const provider of ['mock', 'razorpay']) {
      const { svc, order, inventory, queue } = build({ provider });
      expect(await svc.confirmCodOrder('o1')).toBe(false);
      expect(order.status).toBe('pending');
      expect(inventory.confirmSale).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    }
  });

  it('leaves an order that is not pending alone', async () => {
    for (const status of ['confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned']) {
      const { svc, order, inventory } = build({ status });
      expect(await svc.confirmCodOrder('o1')).toBe(false);
      expect(order.status).toBe(status);
      expect(inventory.confirmSale).not.toHaveBeenCalled();
    }
  });

  it('does nothing when another request confirmed it first', async () => {
    const { svc, inventory, queue } = build({ claimCount: 0 });
    expect(await svc.confirmCodOrder('o1')).toBe(false);
    expect(inventory.confirmSale).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('does nothing for an order that does not exist', async () => {
    const { svc, prisma, inventory } = build();
    (prisma.order.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect(await svc.confirmCodOrder('missing')).toBe(false);
    expect(inventory.confirmSale).not.toHaveBeenCalled();
  });
});
