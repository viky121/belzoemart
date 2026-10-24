/**
 * Runs the admin reports against a real PostgreSQL with all migrations applied, so the Prisma queries
 * (relation filters, groupBy, aggregates) are checked for real, not only against mocks.
 *
 * Skipped unless REPORTS_DB_TEST_URL is set:
 *
 *   createdb belzo_reports_scratch && DATABASE_URL=<url> npx prisma migrate deploy
 *   REPORTS_DB_TEST_URL=<url> npx jest src/modules/admin/reports.db.spec.ts
 */
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportsService } from './reports.service';

const URL = process.env.REPORTS_DB_TEST_URL;
const d = URL ? describe : describe.skip;

d('admin reports against a real database', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaService;
  let svc: ReportsService;
  const suffix = Date.now().toString(36);
  const ids = { cat: '', prod: '', variant: '', c1: '', c2: '', addr: '', o1: '', o2: '', o3: '', i1: '', i2: '', i3: '' };
  const Q = { from: '2026-10-20', to: '2026-10-24' };

  beforeAll(async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-24T12:00:00Z'),
      doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'],
    });
    process.env.DATABASE_URL = URL;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    svc = new ReportsService(prisma);

    const cat = await prisma.category.create({ data: { name: `Staples ${suffix}`, slug: `staples-${suffix}` } });
    ids.cat = cat.id;
    const prod = await prisma.product.create({
      data: { title: `Atta ${suffix}`, slug: `atta-${suffix}`, categoryId: cat.id, taxRatePct: 5, status: 'published' },
    });
    ids.prod = prod.id;
    const variant = await prisma.variant.create({
      data: { productId: prod.id, sku: `ATTA-${suffix}`, mrp: 30_000, sellingPrice: 25_000, costPrice: 20_000 },
    });
    ids.variant = variant.id;
    const c1 = await prisma.customer.create({ data: { name: 'Asha', email: `asha-${suffix}@example.test`, createdAt: new Date('2026-10-22T05:00:00Z') } });
    const c2 = await prisma.customer.create({ data: { name: 'Ravi', email: `ravi-${suffix}@example.test`, createdAt: new Date('2026-10-23T05:00:00Z') } });
    ids.c1 = c1.id;
    ids.c2 = c2.id;
    const addr = await prisma.address.create({
      data: { customerId: c1.id, fullName: 'Asha', phone: '9000000001', line1: '1 Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    });
    ids.addr = addr.id;

    const mk = async (customerId: string, createdAt: Date, qty: number, status: 'delivered' | 'cancelled', cost: number | null) => {
      const subtotal = 25_000 * qty;
      const tax = Math.round((subtotal * 5) / 105);
      const o = await prisma.order.create({
        data: {
          customerId,
          addressId: addr.id,
          idempotencyKey: `k-${suffix}-${createdAt.getTime()}-${qty}`,
          status,
          subtotal,
          discount: 0,
          shipping: 4_000,
          codFee: 0,
          tax,
          cgst: Math.floor(tax / 2),
          sgst: tax - Math.floor(tax / 2),
          igst: 0,
          grandTotal: subtotal + 4_000,
          createdAt,
          items: { create: [{ variantId: variant.id, title: 'Atta 5kg', sku: variant.sku, unitPrice: 25_000, quantity: qty, taxRatePct: 5, costPrice: cost }] },
          payments: { create: { provider: 'cod', amount: subtotal + 4_000, status: 'pending' } },
        },
        include: { items: true },
      });
      return o;
    };
    const o1 = await mk(c1.id, new Date('2026-10-23T10:00:00Z'), 2, 'delivered', 20_000);
    const o2 = await mk(c1.id, new Date('2026-10-23T19:00:00Z'), 1, 'delivered', null); // 24 Oct in India, no saved cost
    const o3 = await mk(c2.id, new Date('2026-10-24T05:00:00Z'), 1, 'cancelled', 20_000); // not a sale
    ids.o1 = o1.id;
    ids.o2 = o2.id;
    ids.o3 = o3.id;
    ids.i1 = o1.items[0]!.id;

    // One unit of o1 came back and was refunded.
    const ret = await prisma.returnRequest.create({
      data: { orderId: o1.id, customerId: c1.id, status: 'refunded', reason: 'Damaged', items: { create: { orderItemId: ids.i1, quantity: 1 } } },
    });
    expect(ret.id).toBeTruthy();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.returnRequest.deleteMany({ where: { orderId: { in: [ids.o1, ids.o2, ids.o3] } } });
      await prisma.order.deleteMany({ where: { id: { in: [ids.o1, ids.o2, ids.o3] } } });
      await prisma.address.deleteMany({ where: { id: ids.addr } });
      await prisma.customer.deleteMany({ where: { id: { in: [ids.c1, ids.c2] } } });
      await prisma.variant.deleteMany({ where: { id: ids.variant } });
      await prisma.product.deleteMany({ where: { id: ids.prod } });
      await prisma.category.deleteMany({ where: { id: ids.cat } });
      await prisma.onModuleDestroy();
    }
    jest.useRealTimers();
  });

  const card = (r: { cards: { label: string; value: unknown }[] }, label: string) => r.cards.find((c) => c.label === label)?.value;

  it('sales: counts only confirmed-or-later orders, by India day', async () => {
    const r = await svc.build('sales', Q);
    expect(card(r, 'Orders')).toBe(2);
    expect(card(r, 'Total collected')).toBe(54_000 + 29_000);
    expect(r.rows.find((x) => x.date === '2026-10-24')).toMatchObject({ orders: 1 });
    expect(card(r, 'Cancelled or returned orders')).toBeGreaterThanOrEqual(1);
  });

  it('orders: lists every status, pages and filters', async () => {
    const all = await svc.build('orders', Q);
    expect(all.page?.total).toBeGreaterThanOrEqual(3);
    const cancelled = await svc.build('orders', { ...Q, status: 'cancelled' });
    expect(cancelled.rows.every((x) => x.status === 'cancelled')).toBe(true);
    expect(cancelled.rows.some((x) => x.customer === 'Ravi')).toBe(true);
    const csv = svc.toCsv(await svc.build('orders', Q, { all: true }));
    expect(csv.split('\n')[0]).toContain('Placed (India time)');
  });

  it('users, products, categories, brands, best sellers and payments run and agree', async () => {
    const users = await svc.build('users', Q);
    expect(users.rows.find((x) => x.name === 'Asha')).toMatchObject({ orders: 2 });
    expect(card(users, 'Repeat customers')).toBeGreaterThanOrEqual(1);

    const products = await svc.build('products', Q);
    const atta = products.rows.find((x) => String(x.product).startsWith('Atta'));
    // 3 units sold over two orders; one came back through a refunded return.
    expect(atta).toMatchObject({ units: 2, returned: 1, orders: 2, brand: 'No brand' });

    for (const id of ['categories', 'brands', 'best-sellers']) {
      const r = await svc.build(id, Q);
      expect(r.rows.length).toBeGreaterThan(0);
    }
    const pay = await svc.build('payments', Q);
    expect(pay.rows.some((x) => x.method === 'Cash on delivery')).toBe(true);
  });

  it('profit and loss: saved cost, today\'s cost as an estimate, and the refund taken out', async () => {
    const r = await svc.build('profit-loss', Q);
    // o1: 2 x 250 @5% = 47,619 ex GST, 1 unit refunded -> 23,810 back; cost 2 x 200 saved, 1 unit back on the shelf.
    // o2: 1 x 250 = 23,810 ex GST; cost not saved, today's 200.
    expect(card(r, 'Item sales')).toBe(47_619 + 23_810);
    expect(card(r, 'Refunds')).toBe(Math.round(47_619 / 2));
    expect(card(r, 'Delivery and COD fees')).toBe(8_000);
    expect(card(r, 'Cost of goods sold')).toBe(20_000 + 20_000); // o1 keeps 1 unit, o2 has 1 (today's cost)
    expect(card(r, 'Items using today\'s cost')).toBe(1);
    expect(r.rows.find((x) => String(x.product).startsWith('Atta'))?.cost).toBe("Estimated (today's cost)");
  });
});
