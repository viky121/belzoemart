import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportsService, istStamp } from './reports.service';

/** A small shop: two customers, two products, three sales orders over two India days. */
const T1 = new Date('2026-10-23T10:00:00Z'); // 23 Oct, 15:30 IST
const T2 = new Date('2026-10-23T19:00:00Z'); // 24 Oct, 00:30 IST (next India day)
const T3 = new Date('2026-10-24T05:00:00Z'); // 24 Oct, 10:30 IST

const item = (id: string, variantId: string, unitPrice: number, quantity: number, taxRatePct: number, costPrice: number | null) => ({
  id,
  variantId,
  title: variantId === 'v1' ? 'Atta 5kg' : 'Oil 1L',
  sku: variantId === 'v1' ? 'ATTA' : 'OIL',
  unitPrice,
  quantity,
  taxRatePct,
  costPrice,
});

// Prices include GST. o1: 2 x 250.00 @5% (cost saved 200.00), shipping 40.00.
// o2: 1 x 250.00 (cost not saved, today's cost 200.00) + 1 x 100.00 @0% (no cost anywhere). o3: Ravi, 1 x 250.00.
const orders = [
  { id: 'o1aaaaaa-0000', customerId: 'c1', createdAt: T1, subtotal: 50_000, discount: 0, shipping: 4_000, codFee: 0, tax: 2_381, grandTotal: 54_000, items: [item('i1', 'v1', 25_000, 2, 5, 20_000)] },
  { id: 'o2bbbbbb-0000', customerId: 'c1', createdAt: T2, subtotal: 35_000, discount: 0, shipping: 0, codFee: 0, tax: 1_190, grandTotal: 35_000, items: [item('i2', 'v1', 25_000, 1, 5, null), item('i3', 'v2', 10_000, 1, 0, null)] },
  { id: 'o3cccccc-0000', customerId: 'c2', createdAt: T3, subtotal: 25_000, discount: 0, shipping: 0, codFee: 0, tax: 1_190, grandTotal: 25_000, items: [item('i4', 'v1', 25_000, 1, 5, 20_000)] },
];

const variants = [
  { id: 'v1', costPrice: 20_000, product: { id: 'p1', title: 'Atta', category: { name: 'Staples' }, brand: { name: 'Aashirvaad' } } },
  { id: 'v2', costPrice: null, product: { id: 'p2', title: 'Oil', category: { name: 'Staples' }, brand: null } },
];

function makeService(over: { orders?: typeof orders; returned?: { orderItemId: string; quantity: number }[] } = {}) {
  const list = over.orders ?? orders;
  const prisma = {
    order: {
      findMany: jest.fn(async (args: { select: { payments?: unknown } }) =>
        args.select.payments
          ? list.map((o) => ({ ...o, status: 'delivered', items: o.items.map((i) => ({ quantity: i.quantity })), payments: [{ provider: 'cod', status: 'pending', method: null }] }))
          : list,
      ),
      count: jest.fn(async () => list.length),
      groupBy: jest.fn(async () => [{ status: 'delivered', _count: list.length, _sum: { grandTotal: list.reduce((s, o) => s + o.grandTotal, 0) } }]),
      aggregate: jest.fn(async () => ({ _count: 2, _sum: { grandTotal: 12_345 } })),
    },
    variant: { findMany: jest.fn(async () => variants) },
    returnItem: { findMany: jest.fn(async () => over.returned ?? []) },
    customer: {
      findMany: jest.fn(async (args: { select: { createdAt?: boolean; name?: boolean } }) =>
        args.select.name
          ? [
              { id: 'c1', name: 'Asha', phone: '9000000001', email: 'a@x.in', status: 'active', createdAt: new Date('2026-09-01T00:00:00Z') },
              { id: 'c2', name: 'Ravi', phone: null, email: null, status: 'active', createdAt: new Date('2026-10-24T01:00:00Z') },
            ]
          : [{ createdAt: new Date('2026-10-24T01:00:00Z') }],
      ),
      count: jest.fn(async (args?: { where?: unknown }) => (args?.where ? 1 : 40)),
    },
    payment: {
      findMany: jest.fn(async () => [
        { provider: 'razorpay', method: 'upi', status: 'captured', amount: 54_000 },
        { provider: 'razorpay', method: 'upi', status: 'failed', amount: 10_000 },
        { provider: 'cod', method: null, status: 'pending', amount: 35_000 },
        { provider: 'razorpay', method: 'card', status: 'refunded', amount: 5_000 },
      ]),
    },
  };
  return { svc: new ReportsService(prisma as never), prisma };
}

const Q = { from: '2026-10-20', to: '2026-10-24' };
const cardValue = (r: { cards: { label: string; value: unknown }[] }, label: string) => r.cards.find((c) => c.label === label)?.value;

describe('ReportsService', () => {
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-24T12:00:00Z'),
      doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'],
    });
  });
  afterAll(() => jest.useRealTimers());

  it('rejects an unknown report and keeps the profit report off the sales-staff route', async () => {
    const { svc } = makeService();
    await expect(svc.build('nope', Q)).rejects.toBeInstanceOf(NotFoundException);
    expect(() => svc.assertNotRestricted('profit-loss')).toThrow(ForbiddenException);
    expect(() => svc.assertNotRestricted('sales')).not.toThrow();
  });

  describe('sales', () => {
    it('adds up the orders and fills every day of the range, using India days', async () => {
      const { svc } = makeService();
      const r = await svc.build('sales', Q);
      expect(r.rows).toHaveLength(5);
      const d23 = r.rows.find((x) => x.date === '2026-10-23')!;
      const d24 = r.rows.find((x) => x.date === '2026-10-24')!;
      expect(d23.orders).toBe(1);
      expect(d24.orders).toBe(2); // o2 was placed at 00:30 IST on the 24th
      expect(r.rows.find((x) => x.date === '2026-10-21')).toMatchObject({ orders: 0, total: 0 });
      expect(cardValue(r, 'Orders')).toBe(3);
      expect(cardValue(r, 'Total collected')).toBe(114_000);
      expect(cardValue(r, 'GST collected')).toBe(4_761);
      expect(cardValue(r, 'Net sales (without GST)')).toBe(114_000 - 4_761);
      expect(r.rows.reduce((s, x) => s + (x.total as number), 0)).toBe(114_000);
    });
  });

  describe('orders', () => {
    it('lists orders with customer, payment and totals, paged', async () => {
      const { svc } = makeService();
      const r = await svc.build('orders', { ...Q, page: 1 });
      expect(r.page).toEqual({ page: 1, pageSize: 50, total: 3 });
      expect(r.rows[0]).toMatchObject({ order: 'O1AAAAAA', customer: 'Asha', status: 'delivered', payment: 'Cash on delivery · pending', items: 2, total: 54_000 });
    });

    it('returns every row (no page) for the CSV', async () => {
      const { svc } = makeService();
      expect((await svc.build('orders', Q, { all: true })).page).toBeUndefined();
    });
  });

  describe('users', () => {
    it('ranks customers by spend and counts repeat customers', async () => {
      const { svc } = makeService();
      const r = await svc.build('users', Q);
      expect(r.rows.map((x) => x.name)).toEqual(['Asha', 'Ravi']);
      expect(r.rows[0]).toMatchObject({ orders: 2, spent: 89_000, aov: 44_500 });
      expect(cardValue(r, 'Repeat customers')).toBe(1);
      expect(cardValue(r, 'Customers who ordered')).toBe(2);
      expect(cardValue(r, 'All customers')).toBe(40);
    });
  });

  describe('products, categories, brands, best sellers', () => {
    it('groups by product with units and sales without GST', async () => {
      const { svc } = makeService();
      const r = await svc.build('products', Q);
      const atta = r.rows.find((x) => x.product === 'Atta')!;
      expect(atta).toMatchObject({ category: 'Staples', brand: 'Aashirvaad', units: 4, orders: 3 });
      const oil = r.rows.find((x) => x.product === 'Oil')!;
      expect(oil).toMatchObject({ brand: 'No brand', units: 1, sales: 10_000 });
    });

    it('shares of a category or brand report add up to 100%', async () => {
      const { svc } = makeService();
      for (const id of ['categories', 'brands']) {
        const r = await svc.build(id, Q);
        const share = r.rows.reduce((s, x) => s + (x.share as number), 0);
        expect(Math.round(share)).toBe(100);
      }
    });

    it('best sellers are ordered by units', async () => {
      const { svc } = makeService();
      const r = await svc.build('best-sellers', Q);
      expect(r.rows.map((x) => [x.rank, x.product, x.units])).toEqual([[1, 'Atta', 4], [2, 'Oil', 1]]);
    });

    it('takes refunded returns out of units and sales', async () => {
      const { svc } = makeService({ returned: [{ orderItemId: 'i1', quantity: 1 }] });
      const r = await svc.build('products', Q);
      const atta = r.rows.find((x) => x.product === 'Atta')!;
      expect(atta).toMatchObject({ units: 3, returned: 1 });
    });
  });

  describe('a coupon order', () => {
    // A 109.98 product bought with a coupon that took 108.88 off: the customer paid 1.10 (GST 0.17 inside).
    const couponOrder = {
      id: 'o9ddddddd-0000', customerId: 'c1', createdAt: T3, subtotal: 10_998, discount: 10_888, shipping: 0, codFee: 0, tax: 17, grandTotal: 110,
      items: [item('i9', 'v1', 10_998, 1, 18, null)],
    };

    it('shows what the customer paid (without GST) and the discount given, not the shop price', async () => {
      const { svc } = makeService({ orders: [couponOrder] });
      const r = await svc.build('products', Q);
      const atta = r.rows.find((x) => x.product === 'Atta')!;
      expect(atta).toMatchObject({ units: 1, sales: 110 - 17, discount: 10_888 });
      expect(r.notes.join(' ')).toMatch(/coupon/i);
    });
  });

  describe('payments', () => {
    it('groups by method and separates received, waiting, refunded and failed', async () => {
      const { svc } = makeService();
      const r = await svc.build('payments', Q);
      expect(cardValue(r, 'Received online')).toBe(54_000);
      expect(cardValue(r, 'Waiting (COD and unpaid)')).toBe(35_000);
      expect(cardValue(r, 'Refunded')).toBe(5_000);
      expect(cardValue(r, 'Failed attempts')).toBe(1);
      expect(r.rows.find((x) => x.method === 'Cash on delivery')).toMatchObject({ payments: 1, pending: 35_000 });
      expect(r.rows.find((x) => x.method === 'Online · upi')).toMatchObject({ payments: 2, captured: 54_000, failed: 1 });
    });
  });

  describe('profit and loss', () => {
    it('works out profit from the saved cost, falls back to today\'s cost and flags missing cost', async () => {
      const { svc } = makeService();
      const r = await svc.build('profit-loss', Q);
      // Sales without GST per line: i1 47,619; i2 23,810; i3 10,000; i4 23,810 (GST at 5%).
      const itemSales = 47_619 + 23_810 + 10_000 + 23_810;
      expect(cardValue(r, 'Item sales')).toBe(itemSales);
      expect(cardValue(r, 'Delivery and COD fees')).toBe(4_000);
      // Cost: i1 2 x 20,000 (saved) + i2 1 x 20,000 (today's) + i3 none + i4 1 x 20,000 (saved).
      expect(cardValue(r, 'Cost of goods sold')).toBe(80_000);
      expect(cardValue(r, 'Revenue (without GST)')).toBe(itemSales + 4_000);
      expect(cardValue(r, 'Gross profit')).toBe(itemSales + 4_000 - 80_000);
      expect(cardValue(r, 'Items with no cost price')).toBe(1);
      expect(cardValue(r, 'Items using today\'s cost')).toBe(1);
      const oil = r.rows.find((x) => x.product === 'Oil')!;
      expect(oil.cost).toBe('Missing');
      const atta = r.rows.find((x) => x.product === 'Atta')!;
      expect(atta.cost).toBe("Estimated (today's cost)"); // one sale had no saved cost
    });

    it('product rows add up to the card totals, and the daily chart adds up to gross profit', async () => {
      const { svc } = makeService();
      const r = await svc.build('profit-loss', Q);
      const profit = cardValue(r, 'Gross profit') as number;
      const fees = cardValue(r, 'Delivery and COD fees') as number;
      expect(r.rows.reduce((s, x) => s + (x.profit as number), 0) + fees).toBe(profit);
      expect(r.chart!.points.reduce((s, p) => s + p.value, 0)).toBe(profit);
    });

    it('returned units reduce sales and cost', async () => {
      const { svc: base } = makeService();
      const before = await base.build('profit-loss', Q);
      const { svc } = makeService({ returned: [{ orderItemId: 'i1', quantity: 1 }] });
      const after = await svc.build('profit-loss', Q);
      expect(cardValue(after, 'Refunds')).toBe(Math.round(47_619 / 2));
      expect(cardValue(after, 'Cost of goods sold')).toBe((cardValue(before, 'Cost of goods sold') as number) - 20_000);
    });
  });

  describe('limits and CSV', () => {
    it('asks for a shorter period when there are too many orders', async () => {
      const { svc, prisma } = makeService();
      prisma.order.findMany.mockResolvedValueOnce(Array.from({ length: 20_001 }, () => orders[0]!) as never);
      await expect(svc.build('sales', Q)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes money in rupees with the column labels as headers', async () => {
      const { svc } = makeService();
      const csv = svc.toCsv(await svc.build('best-sellers', Q));
      const [header, first] = csv.split('\n');
      expect(header).toBe('#,Product,Units sold,Orders,Sales,Discount given (with GST)');
      expect(first).toBe('1,Atta,4,3,952.39,0.00');
    });

    it('formats a time in India time', () => {
      expect(istStamp(new Date('2026-10-23T19:00:00Z'))).toBe('2026-10-24 00:30');
    });
  });
});
