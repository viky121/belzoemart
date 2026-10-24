import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CartService } from './cart.service';

/** "Shop 2000, get sugar 1 kg at 29": the cart sets the price and limits the pack on the server. */
describe('CartService special-price offers', () => {
  interface Item { id: string; cartId: string; variantId: string; quantity: number; savedForLater: boolean }
  interface OfferRow {
    id: string; name: string; isActive: boolean; startsAt: Date | null; endsAt: Date | null;
    minSpend: number; variantId: string; specialPrice: number; units: number; createdAt: Date;
  }

  const variant = (id: string, title: string, sellingPrice: number, over: Record<string, unknown> = {}) => ({
    id, sku: id.toUpperCase(), productId: `p-${id}`, isActive: true, mrp: sellingPrice + 500, sellingPrice,
    priceSlabsJson: [], attributesJson: {}, weightGrams: 1000, weightValue: 1, weightUnit: 'kg', imageUrl: null,
    minOrderQty: null, maxOrderQty: null, costPrice: null,
    inventory: { available: 50 }, product: { title, taxRatePct: 5, images: [] }, ...over,
  });
  const offer = (over: Partial<OfferRow> = {}): OfferRow => ({
    id: 'o1', name: 'Sugar at 29', isActive: true, startsAt: null, endsAt: null, minSpend: 200000,
    variantId: 'sugar', specialPrice: 2900, units: 1, createdAt: new Date('2026-10-01'), ...over,
  });

  function build(opts: { items?: Item[]; offers?: OfferRow[]; variants?: ReturnType<typeof variant>[]; offersBroken?: boolean } = {}) {
    const rows: Item[] = [...(opts.items ?? [])];
    const variants = opts.variants ?? [variant('sugar', 'Sugar', 4500), variant('rice', 'Rice', 50000)];
    const prisma = {
      cart: { findUnique: async () => ({ id: 'c1' }), create: async () => ({ id: 'c1' }) },
      cartItem: {
        findMany: async () => rows,
        findUnique: async ({ where }: { where: { cartId_variantId: { variantId: string } } }) =>
          rows.find((r) => r.variantId === where.cartId_variantId.variantId) ?? null,
        create: async ({ data }: { data: Omit<Item, 'id' | 'savedForLater'> }) => {
          rows.push({ id: `i${rows.length + 1}`, savedForLater: false, ...data });
        },
        update: async ({ where, data }: { where: { id?: string; cartId_variantId?: { variantId: string } }; data: Partial<Item> }) => {
          const r = rows.find((x) => (where.id ? x.id === where.id : x.variantId === where.cartId_variantId?.variantId));
          if (r) Object.assign(r, data);
        },
      },
      variant: {
        findUnique: async ({ where }: { where: { id: string } }) => variants.find((v) => v.id === where.id) ?? null,
        findMany: async ({ where }: { where: { id: { in: string[] } } }) => variants.filter((v) => where.id.in.includes(v.id)),
      },
      spendOffer: {
        findMany: async () => {
          if (opts.offersBroken) throw new Error('table missing');
          return opts.offers ?? [];
        },
      },
    } as unknown as PrismaService;
    return { svc: new CartService(prisma), rows };
  }

  const ref = { customerId: 'u1' };
  const item = (variantId: string, quantity: number, over: Partial<Item> = {}): Item => ({
    id: `i-${variantId}`, cartId: 'c1', variantId, quantity, savedForLater: false, ...over,
  });
  const lineOf = <T extends { variantId: string }>(cart: { items: T[] }, id: string) => cart.items.find((l) => l.variantId === id)!;

  describe('price', () => {
    it('charges 29 for the sugar once the rest of the cart is 2000', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [offer()] });
      const cart = await svc.getCart(ref);
      expect(lineOf(cart, 'sugar')).toMatchObject({ unitPrice: 2900, regularUnitPrice: 4500, offerId: 'o1', offerName: 'Sugar at 29' });
      expect(lineOf(cart, 'rice')).toMatchObject({ unitPrice: 50000, offerId: null });
    });

    it('charges the normal price one paisa below 2000', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 1)], offers: [offer({ minSpend: 50001 })] });
      const line = lineOf(await svc.getCart(ref), 'sugar');
      expect(line).toMatchObject({ unitPrice: 4500, offerId: null });
    });

    it('takes the offer away again when items are removed', async () => {
      const { svc, rows } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [offer()] });
      expect(lineOf(await svc.getCart(ref), 'sugar').unitPrice).toBe(2900);
      rows.find((r) => r.variantId === 'rice')!.quantity = 3;
      expect(lineOf(await svc.getCart(ref), 'sugar').unitPrice).toBe(4500);
    });

    it('does nothing without a live offer', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [] });
      const cart = await svc.getCart(ref);
      expect(lineOf(cart, 'sugar').unitPrice).toBe(4500);
      expect(cart.offers).toEqual([]);
    });

    it('a saved-for-later rice line does not unlock it', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4, { savedForLater: true })], offers: [offer()] });
      expect(lineOf(await svc.getCart(ref), 'sugar').unitPrice).toBe(4500);
    });

    it('the lower of the offer and the bulk price wins', async () => {
      const cheap = variant('sugar', 'Sugar', 4500, { priceSlabsJson: [{ minQty: 1, unitPrice: 2500 }] });
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [offer()], variants: [cheap, variant('rice', 'Rice', 50000)] });
      expect(lineOf(await svc.getCart(ref), 'sugar')).toMatchObject({ unitPrice: 2500, offerId: null });
    });

    it('a problem reading offers falls back to normal prices instead of breaking the cart', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [offer()], offersBroken: true });
      const cart = await svc.getCart(ref);
      expect(lineOf(cart, 'sugar').unitPrice).toBe(4500);
      expect(cart.offers).toEqual([]);
    });
  });

  describe('cart offers for the screen', () => {
    it('shows progress and what to add, even when the pack is not in the cart', async () => {
      const { svc } = build({ items: [item('rice', 2)], offers: [offer()] });
      const [o] = (await svc.getCart(ref)).offers;
      expect(o).toMatchObject({
        offerId: 'o1', title: 'Sugar', variantId: 'sugar', spend: 100000, remaining: 100000, unlocked: false,
        inCart: false, applied: false, regularPrice: 4500, specialPrice: 2900, minSpend: 200000,
      });
    });

    it('marks it unlocked and applied when it is in the cart', async () => {
      const { svc } = build({ items: [item('sugar', 1), item('rice', 4)], offers: [offer()] });
      expect((await svc.getCart(ref)).offers[0]).toMatchObject({ unlocked: true, inCart: true, applied: true, remaining: 0 });
    });

    it('hides an offer whose pack is out of stock or removed', async () => {
      const out = variant('sugar', 'Sugar', 4500, { inventory: { available: 0 } });
      const { svc } = build({ items: [item('rice', 4)], offers: [offer()], variants: [out, variant('rice', 'Rice', 50000)] });
      expect((await svc.getCart(ref)).offers).toEqual([]);
      const gone = variant('sugar', 'Sugar', 4500, { isActive: false });
      const b = build({ items: [item('rice', 4)], offers: [offer()], variants: [gone, variant('rice', 'Rice', 50000)] });
      expect((await b.svc.getCart(ref)).offers).toEqual([]);
    });
  });

  describe('only the offer units of the pack while the offer is on', () => {
    it('shows 1 as the most for the sugar line', async () => {
      const { svc } = build({ items: [item('sugar', 1)], offers: [offer()] });
      expect(lineOf(await svc.getCart(ref), 'sugar')).toMatchObject({ minQty: 1, maxQty: 1 });
    });

    it('refuses a second pack with a plain message', async () => {
      const { svc, rows } = build({ items: [item('sugar', 1)], offers: [offer()] });
      const err = await svc.addItem(ref, 'sugar', 1).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe('Only 1 of "Sugar" can be bought per order while this offer is on.');
      expect(rows[0]!.quantity).toBe(1);
    });

    it('refuses to raise the line to 2', async () => {
      const { svc } = build({ items: [item('sugar', 1)], offers: [offer()] });
      await expect(svc.updateItem(ref, 'sugar', 2)).rejects.toThrow(/Only 1 of "Sugar"/);
    });

    it('allows the offer units and no more when the offer has several units', async () => {
      const { svc, rows } = build({ items: [], offers: [offer({ units: 3 })] });
      await svc.addItem(ref, 'sugar', 3);
      expect(rows[0]!.quantity).toBe(3);
      await expect(svc.addItem(ref, 'sugar', 1)).rejects.toThrow(/Only 3 of "Sugar"/);
    });

    it('reorder (clamp) trims to the offer units', async () => {
      const { svc, rows } = build({ items: [], offers: [offer()] });
      await svc.addItem(ref, 'sugar', 5, { clamp: true });
      expect(rows[0]!.quantity).toBe(1);
    });

    it('does not touch other packs, and lifts the limit when the offer is off', async () => {
      const on = build({ items: [], offers: [offer()] });
      await on.svc.addItem(ref, 'rice', 5);
      expect(on.rows[0]!.quantity).toBe(5);
      const off = build({ items: [], offers: [] });
      await off.svc.addItem(ref, 'sugar', 4);
      expect(off.rows[0]!.quantity).toBe(4);
    });

    it('the product\'s own smaller maximum still wins', async () => {
      const capped = variant('sugar', 'Sugar', 4500, { maxOrderQty: 1 });
      const { svc } = build({ items: [], offers: [offer({ units: 3 })], variants: [capped, variant('rice', 'Rice', 50000)] });
      await expect(svc.addItem(ref, 'sugar', 2)).rejects.toThrow(/at most 1/);
    });

    it('a line saved for later is brought back inside the offer units', async () => {
      const { svc, rows } = build({ items: [item('sugar', 3, { savedForLater: true })], offers: [offer()] });
      await svc.saveForLater(ref, 'sugar', false);
      expect(rows[0]).toMatchObject({ quantity: 1, savedForLater: false });
    });

    it('a cart that already holds more is reported with the limit so checkout can stop it', async () => {
      const { svc } = build({ items: [item('sugar', 3)], offers: [offer()] });
      const l = lineOf(await svc.getCart(ref), 'sugar');
      expect(l).toMatchObject({ quantity: 3, maxQty: 1, unitPrice: 4500, offerId: null });
    });
  });
});
