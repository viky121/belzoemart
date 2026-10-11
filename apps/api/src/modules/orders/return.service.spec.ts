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

/** Receiving a return on a Cash-on-Delivery order credits the wallet once delivered. */
describe('ReturnService.adminUpdate(received) — COD wallet credit', () => {
  // subtotal 1,500.00 − discount 150.00 = goods 1,350.00; + shipping 40 + COD fee 20 = 1,410.00.
  const ITEMS = [
    { id: 'oi1', variantId: 'v1', unitPrice: 60000, quantity: 2 },
    { id: 'oi2', variantId: 'v2', unitPrice: 30000, quantity: 1 },
  ];
  type Line = { orderItemId: string; quantity: number };

  function setup(opts: {
    orderStatus?: string;
    resolution?: string;
    lines?: Line[];
    others?: { id: string; status: string; items: Line[] }[];
    entries?: { ref: string; delta: number }[];
    payments?: { provider: string; status: string; amount: number }[];
  } = {}) {
    const entries = [...(opts.entries ?? [])];
    const earned: { customerId: string; amount: number; ref: string }[] = [];
    const statuses: string[] = [];
    const gatewayRefunds: number[] = [];
    const ret = {
      id: 'r1',
      orderId: 'o1',
      resolution: opts.resolution ?? 'refund_wallet',
      items: opts.lines ?? [{ orderItemId: 'oi1', quantity: 1 }],
      order: {
        customerId: 'c1',
        status: opts.orderStatus ?? 'delivered',
        grandTotal: 141000,
        shipping: 4000,
        codFee: 2000,
        items: ITEMS,
        payments: opts.payments ?? [{ provider: 'cod', status: 'pending', amount: 141000 }],
      },
    };
    const prisma = {
      order: { findUnique: async () => ({ id: 'o1', customerId: 'c1' }) },
      returnRequest: {
        findUnique: async () => ret,
        findMany: async () => opts.others ?? [],
        update: async ({ data }: { data: { status: string } }) => {
          statuses.push(data.status);
          return ret;
        },
      },
      walletEntry: {
        findMany: async ({ where }: { where: { customerId: string; ref: { in: string[] } } }) =>
          entries.filter((e) => where.ref.in.includes(e.ref)),
      },
    } as unknown as PrismaService;
    const inventory = { adjust: async () => undefined } as unknown as InventoryService;
    const payments = {
      refund: async (_o: string, amount: number) => {
        gatewayRefunds.push(amount);
        return { status: 'processed' };
      },
    } as unknown as PaymentService;
    const wallet = {
      earn: async (customerId: string, amount: number, _reason: string, ref: string) => {
        if (entries.some((e) => e.ref === ref)) return { balance: 0, applied: false };
        earned.push({ customerId, amount, ref });
        entries.push({ ref, delta: amount });
        return { balance: amount, applied: true };
      },
    } as never;
    const svc = new ReturnService(prisma, inventory, payments, wallet, storage);
    return { svc, earned, statuses, gatewayRefunds };
  }

  it('delivered COD: credits the returned items share of the goods total and marks it refunded', async () => {
    const { svc, earned, statuses } = setup();
    await svc.adminUpdate('r1', 'received');
    // 1 × 600.00 of 1,500.00 line value → 40% of 1,350.00 goods = 540.00 (no shipping / COD fee).
    expect(earned).toEqual([{ customerId: 'c1', amount: 54000, ref: 'return:r1' }]);
    expect(statuses).toEqual(['refunded']);
  });

  it('re-processing the same return never credits twice', async () => {
    const { svc, earned, statuses } = setup();
    await svc.adminUpdate('r1', 'received');
    await svc.adminUpdate('r1', 'received');
    expect(earned).toHaveLength(1);
    expect(statuses).toEqual(['refunded', 'refunded']);
  });

  it('the last return of a fully returned order gets the remainder incl. shipping and COD fee', async () => {
    const { svc, earned } = setup({
      lines: [
        { orderItemId: 'oi1', quantity: 1 },
        { orderItemId: 'oi2', quantity: 1 },
      ],
      others: [{ id: 'r0', status: 'refunded', items: [{ orderItemId: 'oi1', quantity: 1 }] }],
      entries: [{ ref: 'return:r0', delta: 54000 }],
    });
    await svc.adminUpdate('r1', 'received');
    // 1,410.00 − 540.00 already credited = 870.00; total credit never exceeds grandTotal.
    expect(earned).toEqual([{ customerId: 'c1', amount: 87000, ref: 'return:r1' }]);
  });

  it('caps a partial return by what is left after earlier credits', async () => {
    const { svc, earned } = setup({
      others: [{ id: 'r0', status: 'requested', items: [] }],
      entries: [{ ref: 'return:r0', delta: 140000 }],
    });
    await svc.adminUpdate('r1', 'received');
    expect(earned).toEqual([{ customerId: 'c1', amount: 1000, ref: 'return:r1' }]);
  });

  it('COD order that never reached delivered: no credit and not marked refunded', async () => {
    for (const orderStatus of ['shipped', 'cancelled']) {
      const { svc, earned, statuses } = setup({ orderStatus });
      await svc.adminUpdate('r1', 'received');
      expect(earned).toEqual([]);
      expect(statuses).toEqual(['received']);
    }
  });

  it('COD replacement and legacy refund_source returns', async () => {
    const replace = setup({ resolution: 'replace' });
    await replace.svc.adminUpdate('r1', 'received');
    expect(replace.earned).toEqual([]);
    expect(replace.statuses).toEqual(['received']);

    // There is no gateway payment for COD: a legacy refund_source request is credited to the wallet.
    const legacy = setup({ resolution: 'refund_source' });
    await legacy.svc.adminUpdate('r1', 'received');
    expect(legacy.gatewayRefunds).toEqual([]);
    expect(legacy.earned).toEqual([{ customerId: 'c1', amount: 54000, ref: 'return:r1' }]);
  });

  it('prepaid path unchanged: wallet refund is unit price × qty clamped to the captured amount', async () => {
    const { svc, earned, statuses, gatewayRefunds } = setup({
      payments: [{ provider: 'razorpay', status: 'captured', amount: 141000 }],
    });
    await svc.adminUpdate('r1', 'received');
    expect(earned).toEqual([{ customerId: 'c1', amount: 60000, ref: 'return:r1' }]);
    expect(gatewayRefunds).toEqual([]);
    expect(statuses).toEqual(['refunded']);
  });
});

/** Server-side validation of return requests: items, quantities and photos. */
describe('ReturnService.request — validation', () => {
  const ITEM_A = '11111111-1111-4111-8111-111111111111';
  const ITEM_B = '22222222-2222-4222-8222-222222222222';
  const PHOTO = 'https://cdn.belzo.test/returns/0f8fad5b-d9cb-469f-a165-70867728950e.jpg';

  const COD = [{ provider: 'cod', method: null, status: 'pending' }];
  const PREPAID = [{ provider: 'razorpay', method: 'upi', status: 'captured' }];

  function build(
    previous: { status: string; items: { orderItemId: string; quantity: number }[] }[] = [],
    opts: { payments?: { provider: string; method: string | null; status: string }[]; returnable?: boolean } = {},
  ) {
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
          payments: opts.payments ?? COD,
        }),
      },
      variant: {
        findMany: async () => [{ product: { title: 'Herbal Tea', isReturnable: opts.returnable ?? true } }],
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
    // COD order without a chosen resolution defaults to the wallet (no gateway payment).
    expect(createdData[0]).toMatchObject({ imagesJson: [], reason: 'No longer needed', resolution: 'refund_wallet' });
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

  it('rejects the same order item listed twice', async () => {
    const { svc } = build();
    await expect(
      svc.request('c1', {
        orderId: 'o1',
        reason: 'No longer needed',
        items: [
          { orderItemId: ITEM_A, quantity: 1 },
          { orderItemId: ITEM_A, quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Each item can be listed only once');
  });

  it('rejects a non-returnable item', async () => {
    const { svc, createdData } = build([], { returnable: false });
    await expect(svc.request('c1', { ...base, reason: 'No longer needed' })).rejects.toThrow(
      '"Herbal Tea" is non-returnable and cannot be returned',
    );
    expect(createdData).toHaveLength(0);
  });

  it('requires photos for code-less free-text defect reasons', async () => {
    const { svc } = build();
    for (const reason of ['Damaged', 'Damaged/broken product', 'Wrong item', 'DEFECTIVE: not working']) {
      await expect(svc.request('c1', { ...base, reason })).rejects.toThrow(/photo/);
    }
  });

  it('allows a replacement only for reasons that offer one', async () => {
    const { svc, createdData } = build();
    await expect(
      svc.request('c1', { ...base, reasonCode: 'not_needed', reason: 'No longer needed', resolution: 'replace' }),
    ).rejects.toThrow('Replacement is not available for this return reason');
    await svc.request('c1', { ...base, reasonCode: 'size_fit', reason: 'Size / fit issue', resolution: 'replace' });
    expect(createdData[0]).toMatchObject({ resolution: 'replace' });
  });

  it('allows a refund to the original payment method only for prepaid orders', async () => {
    const cod = build([], { payments: COD });
    await expect(
      cod.svc.request('c1', { ...base, reasonCode: 'not_needed', reason: 'No longer needed', resolution: 'refund_source' }),
    ).rejects.toThrow(/only for prepaid orders/);
    const prepaid = build([], { payments: PREPAID });
    await prepaid.svc.request('c1', {
      ...base,
      reasonCode: 'not_needed',
      reason: 'No longer needed',
      resolution: 'refund_source',
    });
    expect(prepaid.createdData[0]).toMatchObject({ resolution: 'refund_source' });
  });

  it('requires at least 10 characters of comments for Other', async () => {
    const { svc, createdData } = build();
    const req = (reason: string) =>
      svc.request('c1', { ...base, reasonCode: 'other', reason, resolution: 'refund_wallet' });
    await expect(req('Other')).rejects.toThrow(/at least 10 characters/);
    await expect(req('Other: smells very odd')).resolves.toBeDefined();
    await expect(req('Other: short')).rejects.toThrow(/at least 10 characters/);
    expect(createdData).toHaveLength(1);
  });
});
