import { BadRequestException } from '@nestjs/common';
import { ReturnService } from './return.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../integrations/storage/storage.provider';
import type { InventoryService } from '../catalogue/inventory.service';
import type { PaymentService } from '../checkout/payment.service';

const storage = { getUrl: (k: string) => `https://cdn.belzo.test/${k}` } as unknown as StorageProvider;

/**
 * Verifies return processing (BR-9, BR-10): delivered-only requests, restock on
 * receipt, and refund amount clamped to the captured payment amount.
 */
describe('ReturnService', () => {
  it('BR-9: rejects a return for a non-delivered order', async () => {
    const prisma = {
      order: { findUnique: async () => ({ id: 'o1', customerId: 'c1', status: 'shipped', items: [] }) },
    } as unknown as PrismaService;
    const svc = new ReturnService(prisma, {} as InventoryService, {} as PaymentService, {} as never, storage);
    await expect(svc.request('c1', { orderId: 'o1', reason: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BR-10: on received, restocks and refunds clamped to captured amount', async () => {
    const adjusted: { v: string; q: number }[] = [];
    let refundedAmount = 0;
    const ret = {
      id: 'r1',
      orderId: 'o1',
      resolution: 'refund_source',
      items: [{ orderItemId: 'oi1', quantity: 2 }],
      order: {
        grandTotal: 100000,
        items: [{ id: 'oi1', variantId: 'v1', unitPrice: 60000, quantity: 2 }],
        payments: [{ status: 'captured', amount: 100000 }],
      },
    };
    const prisma = {
      returnRequest: {
        findUnique: async () => ret,
        update: async () => ret,
      },
    } as unknown as PrismaService;
    const inventory = {
      adjust: async (v: string, q: number) => { adjusted.push({ v, q }); },
    } as unknown as InventoryService;
    const payments = {
      refund: async (_orderId: string, amount: number) => { refundedAmount = amount; return { status: 'processed' }; },
    } as unknown as PaymentService;

    const wallet = { earn: async () => ({ balance: 0, applied: true }) } as never;
    const svc = new ReturnService(prisma, inventory, payments, wallet, storage);
    await svc.adminUpdate('r1', 'received');

    expect(adjusted).toEqual([{ v: 'v1', q: 2 }]);
    // 2 × 60000 = 120000 requested, but captured is 100000 → clamped.
    expect(refundedAmount).toBe(100000);
  });
});

/** Server-side validation of return requests: items, quantities and photos. */
describe('ReturnService.request — validation', () => {
  const ITEM_A = '11111111-1111-4111-8111-111111111111';
  const ITEM_B = '22222222-2222-4222-8222-222222222222';
  const PHOTO = 'https://cdn.belzo.test/returns/0f8fad5b-d9cb-469f-a165-70867728950e.jpg';

  function build(previous: { status: string; items: { orderItemId: string; quantity: number }[] }[] = []) {
    const createdData: Record<string, unknown>[] = [];
    const prisma = {
      order: {
        findUnique: async () => ({
          id: 'o1',
          customerId: 'c1',
          status: 'delivered',
          items: [
            { id: ITEM_A, variantId: 'v1', title: 'Herbal Tea', quantity: 2 },
            { id: ITEM_B, variantId: 'v2', title: 'Honey', quantity: 1 },
          ],
        }),
      },
      variant: {
        findMany: async () => [{ product: { title: 'Herbal Tea', isReturnable: true } }],
      },
      returnRequest: {
        // Mirrors the `status: { not: 'rejected' }` filter.
        findMany: async () => previous.filter((r) => r.status !== 'rejected'),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return { id: 'r1', ...data };
        },
      },
    } as unknown as PrismaService;
    const svc = new ReturnService(prisma, {} as InventoryService, {} as PaymentService, {} as never, storage);
    return { svc, createdData };
  }

  const base = { orderId: 'o1', items: [{ orderItemId: ITEM_A, quantity: 1 }] };

  it('rejects a photo-required reason (by text) without photos', async () => {
    const { svc } = build();
    await expect(svc.request('c1', { ...base, reason: 'Damaged / broken product: cracked' })).rejects.toThrow(/photo/);
  });

  it('rejects a photo-required reason (by code) without photos', async () => {
    const { svc } = build();
    const p = svc.request('c1', { ...base, reasonCode: 'damaged', reason: 'cracked' });
    await expect(p).rejects.toBeInstanceOf(BadRequestException);
    await expect(p).rejects.toThrow(/photo/);
  });

  it('accepts a photo-required reason with one own photo', async () => {
    const { svc, createdData } = build();
    await svc.request('c1', {
      ...base,
      reasonCode: 'damaged',
      reason: 'Damaged / broken product: cracked',
      images: [PHOTO, ` ${PHOTO} `],
    });
    expect(createdData[0]).toMatchObject({
      imagesJson: [PHOTO],
      items: { create: [{ orderItemId: ITEM_A, quantity: 1 }] },
    });
  });

  it('rejects photos from another host or another folder', async () => {
    const { svc } = build();
    const reason = 'Damaged / broken product';
    await expect(
      svc.request('c1', { ...base, reason, images: ['https://evil.example/returns/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'] }),
    ).rejects.toThrow(/Invalid photo/);
    await expect(
      svc.request('c1', { ...base, reason, images: ['https://cdn.belzo.test/reviews/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'] }),
    ).rejects.toThrow(/Invalid photo/);
  });

  it('accepts "No longer needed" without photos', async () => {
    const { svc, createdData } = build();
    await svc.request('c1', { ...base, reasonCode: 'not_needed', reason: 'No longer needed' });
    expect(createdData[0]).toMatchObject({ imagesJson: [], reason: 'No longer needed' });
  });

  it('rejects an item that is not in the order', async () => {
    const { svc } = build();
    await expect(
      svc.request('c1', {
        orderId: 'o1',
        reason: 'No longer needed',
        items: [{ orderItemId: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
      }),
    ).rejects.toThrow('Item does not belong to this order');
  });

  it('rejects a quantity above what remains after an earlier return', async () => {
    const { svc } = build([
      { status: 'requested', items: [{ orderItemId: ITEM_A, quantity: 1 }] },
      { status: 'rejected', items: [{ orderItemId: ITEM_A, quantity: 2 }] },
    ]);
    await expect(
      svc.request('c1', { orderId: 'o1', reason: 'No longer needed', items: [{ orderItemId: ITEM_A, quantity: 2 }] }),
    ).rejects.toThrow('Only 1 of "Herbal Tea" can still be returned');
    // The remaining 1 is still accepted.
    await expect(
      svc.request('c1', { orderId: 'o1', reason: 'No longer needed', items: [{ orderItemId: ITEM_A, quantity: 1 }] }),
    ).resolves.toBeDefined();
  });
});
