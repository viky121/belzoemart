/**
 * Self pickup against a real PostgreSQL with all migrations applied: place a pickup order for real (cart, stock
 * reservation, order row with the new columns), then take it through Ready for pickup and Picked up. The other
 * specs use fake databases; this one proves the Prisma queries, the new enum and columns really work.
 *
 * Skipped unless PICKUP_DB_TEST_URL is set:
 *
 *   createdb belzo_pickup_scratch && DATABASE_URL=<url> npx prisma migrate deploy
 *   PICKUP_DB_TEST_URL=<url> npx jest src/modules/checkout/checkout.pickup.db.spec.ts
 */
import { PICKUP_DEFAULTS, buildPickupDays } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../catalogue/inventory.service';
import { CartService } from '../cart/cart.service';
import { OrderService } from '../orders/order.service';
import type { FulfilmentService } from '../orders/fulfilment.service';
import type { PaymentService } from './payment.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { SettingsService } from '../admin/settings.service';
import { CheckoutService } from './checkout.service';
import { CouponService } from './coupon.service';
import { PricingService } from './pricing.service';

const URL = process.env.PICKUP_DB_TEST_URL;
const d = URL ? describe : describe.skip;

d('self pickup against a real database', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaService;
  let checkout: CheckoutService;
  let orders: OrderService;
  let cart: CartService;
  const queued: { name: string; data: unknown }[] = [];
  const suffix = Date.now().toString(36);
  const ids = { customer: '', variant: '', address: '' };
  let pickupOrderId = '';
  const settingsMap: Record<string, unknown> = {
    'store.state': 'Madhya Pradesh',
    'shipping.serviceablePincodes': ['472001'],
    'shipping.flatPaise': 4000,
    'shipping.freeThresholdPaise': 30000,
    'payment.codFeePaise': 3900,
  };
  // The last offered day always has slots, whatever time this runs.
  const SLOT = buildPickupDays(PICKUP_DEFAULTS, new Date()).at(-1)!.slots[0]!;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const settings = { get: async (k: string) => settingsMap[k] } as unknown as SettingsService;
    const inventory = new InventoryService(prisma);
    cart = new CartService(prisma);
    checkout = new CheckoutService(prisma, cart, new PricingService(), new CouponService(prisma), inventory, settings);
    const queue = { enqueue: async (_q: string, name: string, data: unknown) => void queued.push({ name, data }) } as unknown as QueueService;
    orders = new OrderService(prisma, inventory, {} as PaymentService, cart, {} as FulfilmentService, queue);

    const cat = await prisma.category.create({ data: { name: `Staples ${suffix}`, slug: `staples-${suffix}` } });
    const prod = await prisma.product.create({
      data: { title: `Atta ${suffix}`, slug: `atta-${suffix}`, categoryId: cat.id, taxRatePct: 5, status: 'published', hsnCode: '1101' },
    });
    const variant = await prisma.variant.create({ data: { productId: prod.id, sku: `ATTA-${suffix}`, mrp: 30_000, sellingPrice: 25_000 } });
    ids.variant = variant.id;
    await prisma.inventory.create({ data: { variantId: variant.id, available: 10, reserved: 0 } });
    const customer = await prisma.customer.create({ data: { name: 'Asha', email: `asha-${suffix}@example.test` } });
    ids.customer = customer.id;
    // A customer in another state, at a PIN code the shop does not deliver to.
    const address = await prisma.address.create({
      data: { customerId: customer.id, fullName: 'Asha', phone: '9000000001', line1: '1 Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    });
    ids.address = address.id;
    await cart.addItem({ customerId: customer.id }, variant.id, 2);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('home delivery to that PIN is refused, as before', async () => {
    await expect(
      checkout.place({ customerId: ids.customer }, { addressId: ids.address, paymentMethod: 'cod' }, `k-del-${suffix}`),
    ).rejects.toThrow(/don't deliver to PIN 560001/);
  });

  it('previews a pickup order: Rs. 0 delivery, no COD fee, CGST + SGST', async () => {
    const p = await checkout.preview({ customerId: ids.customer }, ids.address, undefined, true, 'pickup');
    expect(p).toMatchObject({ fulfilment: 'pickup', serviceable: true });
    expect(p.breakup).toMatchObject({ shipping: 0, codFee: 0, subtotal: 50_000, grandTotal: 50_000 });
    expect(p.breakup.gst.igst).toBe(0);
    expect(p.breakup.gst.cgst + p.breakup.gst.sgst).toBe(p.breakup.tax);
  });

  it('places the pickup order, saves it with the slot, and holds the stock', async () => {
    const res = await checkout.place(
      { customerId: ids.customer },
      { addressId: ids.address, paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: SLOT.start },
      `k-pick-${suffix}`,
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id: res.orderId }, include: { payments: true } });
    expect(row).toMatchObject({ fulfilment: 'pickup', status: 'pending', shipping: 0, codFee: 0, igst: 0, grandTotal: 50_000 });
    expect(row.pickupSlotStart?.toISOString()).toBe(SLOT.start);
    expect(row.pickupSlotEnd?.toISOString()).toBe(SLOT.end);
    expect(row.payments[0]).toMatchObject({ provider: 'cod', status: 'pending', amount: 50_000 });
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant } });
    expect(inv).toMatchObject({ available: 8, reserved: 2 });
    pickupOrderId = res.orderId;
  });

  it('shows the customer the pickup fields, in the list and in the detail', async () => {
    const id = pickupOrderId;
    const list = await orders.listForCustomer(ids.customer);
    expect(list.find((o) => o.id === id)).toMatchObject({ fulfilment: 'pickup' });
    const detail = await orders.getForCustomer(ids.customer, id);
    expect(detail.fulfilment).toBe('pickup');
    expect(detail.pickupSlotStart?.toISOString()).toBe(SLOT.start);
  });

  it('takes it through Confirmed, Ready for pickup and Picked up; the money paid at the shop is marked received', async () => {
    const id = pickupOrderId;
    await orders.transition(id, 'confirmed');
    await orders.transition(id, 'packed');
    expect(queued.map((q) => q.name)).toContain('order.ready_for_pickup');
    // A pickup order is never shipped.
    await expect(orders.transition(id, 'shipped')).rejects.toThrow(/Illegal transition/);
    await orders.transition(id, 'delivered');
    const row = await prisma.order.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    expect(row.status).toBe('delivered');
    expect(row.payments[0]).toMatchObject({ provider: 'cod', status: 'captured', method: 'pay_at_shop' });
  });

  it('refuses a slot that is not offered, writing nothing', async () => {
    const before = await prisma.order.count({ where: { customerId: ids.customer } });
    await cart.addItem({ customerId: ids.customer }, ids.variant, 1);
    await expect(
      checkout.place(
        { customerId: ids.customer },
        { addressId: ids.address, paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: new Date(Date.now() + 60_000).toISOString() },
        `k-bad-${suffix}`,
      ),
    ).rejects.toThrow(/no longer available/);
    expect(await prisma.order.count({ where: { customerId: ids.customer } })).toBe(before);
  });
});
