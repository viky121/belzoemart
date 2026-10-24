import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditLogService } from '../admin/audit-log.service';
import { OffersService, offerStatusLabel, type OfferInput } from './offers.service';

interface Row {
  id: string; name: string; isActive: boolean; startsAt: Date | null; endsAt: Date | null;
  minSpend: number; variantId: string; specialPrice: number; units: number; createdAt: Date; variant: Record<string, unknown>;
}

const sugar = {
  id: 'sugar', productId: 'p1', sku: 'SUGAR-1', isActive: true, sellingPrice: 4500, mrp: 5000, costPrice: 4000,
  minOrderQty: null, maxOrderQty: null, weightGrams: 1000, weightValue: 1, weightUnit: 'kg', attributesJson: {}, imageUrl: null,
  inventory: { available: 20 }, product: { title: 'Sugar', images: [{ url: '/s.png' }] },
};

function build(opts: { rows?: Row[]; variants?: Record<string, unknown>[]; sold?: { offerId: string; qty: number }[] } = {}) {
  const rows: Row[] = [...(opts.rows ?? [])];
  const variants = opts.variants ?? [sugar];
  const prisma = {
    variant: {
      findUnique: async ({ where }: { where: { id: string } }) => variants.find((v) => v.id === where.id) ?? null,
      findMany: async () => variants,
    },
    spendOffer: {
      findMany: async () => rows,
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { variantId: string; id?: { not: string } } }) =>
        rows.find((r) => r.variantId === where.variantId && r.isActive && r.id !== where.id?.not) ?? null,
      create: async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'variant'> }) => {
        const row: Row = { id: `o${rows.length + 1}`, createdAt: new Date(), variant: variants.find((v) => v.id === data.variantId)!, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data, { variant: variants.find((v) => v.id === (data.variantId ?? r.variantId)) });
        return r;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        rows.splice(rows.findIndex((r) => r.id === where.id), 1);
      },
    },
    orderItem: {
      groupBy: async () => (opts.sold ?? []).map((s) => ({ offerId: s.offerId, _sum: { quantity: s.qty } })),
    },
  } as unknown as PrismaService;
  const audit = { record: jest.fn(async () => undefined) };
  return { svc: new OffersService(prisma, audit as unknown as AuditLogService), rows, audit };
}

const good = (over: Partial<OfferInput> = {}): OfferInput => ({
  name: 'Sugar at 29', minSpend: 200000, variantId: 'sugar', specialPrice: 2900, units: 1, isActive: true, startsAt: null, endsAt: null, ...over,
});

describe('OffersService (admin)', () => {
  it('saves an offer and returns it with its pack and status', async () => {
    const { svc, audit } = build();
    const made = await svc.create('admin1', good());
    expect(made).toMatchObject({
      name: 'Sugar at 29', status: 'live', minSpend: 200000, specialPrice: 2900, units: 1, belowCost: true, soldUnits: 0,
      variant: { id: 'sugar', title: 'Sugar', unit: expect.any(String), sellingPrice: 4500, available: 20, imageUrl: '/s.png' },
    });
    expect(audit.record).toHaveBeenCalledWith('admin1', 'offer.create', made.id, undefined, expect.objectContaining({ specialPrice: 2900 }));
  });

  it('warns "below cost" only when the special price is under the cost price', async () => {
    const { svc } = build();
    expect((await svc.create('a', good({ specialPrice: 4100 }))).belowCost).toBe(false);
  });

  describe('rules', () => {
    it.each([
      ['an empty name', { name: '  ' }, /name/],
      ['a spend amount under 1 rupee', { minSpend: 99 }, /spend amount/],
      ['a special price under 1 rupee', { specialPrice: 50 }, /at least/],
      ['units of 0', { units: 0 }, /between 1 and 10/],
      ['units of 11', { units: 11 }, /between 1 and 10/],
      ['an end before the start', { startsAt: new Date('2026-11-02'), endsAt: new Date('2026-11-01') }, /end date/],
    ])('refuses %s', async (_label, over, message) => {
      const { svc, rows } = build();
      await expect(svc.create('a', good(over as Partial<OfferInput>))).rejects.toThrow(message as RegExp);
      expect(rows).toHaveLength(0);
    });

    it('refuses a special price that is not lower than the normal price, saying what it is', async () => {
      const { svc } = build();
      await expect(svc.create('a', good({ specialPrice: 4500 }))).rejects.toThrow('The special price must be lower than the normal price (₹45).');
    });

    it('refuses a pack that is not on sale', async () => {
      await expect(build({ variants: [] }).svc.create('a', good())).rejects.toBeInstanceOf(BadRequestException);
      await expect(build({ variants: [{ ...sugar, isActive: false }] }).svc.create('a', good())).rejects.toThrow(/on sale/);
    });

    it('refuses units below the pack\'s minimum order quantity', async () => {
      const { svc } = build({ variants: [{ ...sugar, minOrderQty: 2 }] });
      await expect(svc.create('a', good({ units: 1 }))).rejects.toThrow(/needs at least 2/);
    });

    it('allows only one live offer per pack, but a switched-off one does not block', async () => {
      const { svc } = build();
      await svc.create('a', good());
      await expect(svc.create('a', good({ name: 'Second' }))).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.create('a', good({ name: 'Second', isActive: false }))).resolves.toMatchObject({ status: 'off' });
    });
  });

  describe('change and delete', () => {
    it('changes some fields and keeps the rest', async () => {
      const { svc, audit } = build();
      const made = await svc.create('a', good());
      const out = await svc.update('a', made.id, { specialPrice: 2500, units: 2 });
      expect(out).toMatchObject({ name: 'Sugar at 29', specialPrice: 2500, units: 2, minSpend: 200000 });
      expect(audit.record).toHaveBeenLastCalledWith('a', 'offer.update', made.id, expect.objectContaining({ specialPrice: 2900 }), expect.objectContaining({ specialPrice: 2500 }));
    });

    it('may keep its own pack when saved again, but not take over another live offer\'s pack', async () => {
      const rice = { ...sugar, id: 'rice', sellingPrice: 50000, product: { title: 'Rice', images: [] } };
      const { svc } = build({ variants: [sugar, rice] });
      const a = await svc.create('a', good());
      await svc.create('a', good({ name: 'Rice', variantId: 'rice', specialPrice: 40000, minSpend: 300000 }));
      await expect(svc.update('a', a.id, { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' });
      await expect(svc.update('a', a.id, { variantId: 'rice', specialPrice: 40000 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-checks the rules on change', async () => {
      const { svc } = build();
      const made = await svc.create('a', good());
      await expect(svc.update('a', made.id, { specialPrice: 9999 })).rejects.toThrow(/lower than the normal price/);
    });

    it('switches an offer off and on', async () => {
      const { svc } = build();
      const made = await svc.create('a', good());
      expect((await svc.update('a', made.id, { isActive: false })).status).toBe('off');
      expect((await svc.update('a', made.id, { isActive: true })).status).toBe('live');
    });

    it('answers 404 for an unknown offer', async () => {
      const { svc } = build();
      await expect(svc.update('a', 'nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.remove('a', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes and records it', async () => {
      const { svc, rows, audit } = build();
      const made = await svc.create('a', good());
      await svc.remove('admin1', made.id);
      expect(rows).toHaveLength(0);
      expect(audit.record).toHaveBeenLastCalledWith('admin1', 'offer.delete', made.id, expect.objectContaining({ name: 'Sugar at 29' }));
    });
  });

  it('counts the units sold through each offer', async () => {
    const { svc } = build({ sold: [{ offerId: 'o1', qty: 7 }] });
    const made = await svc.create('a', good());
    expect(made.id).toBe('o1');
    expect((await svc.list())[0]!.soldUnits).toBe(7);
  });

  it('the picker needs two letters and returns pack details', async () => {
    const { svc } = build();
    expect(await svc.searchPacks('s')).toEqual([]);
    expect(await svc.searchPacks('sug')).toEqual([expect.objectContaining({ variantId: 'sugar', title: 'Sugar', sellingPrice: 4500, available: 20, minOrderQty: 1 })]);
  });
});

describe('offerStatusLabel', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  it('tells live, scheduled, ended and off apart', () => {
    expect(offerStatusLabel({ isActive: true, startsAt: null, endsAt: null }, now)).toBe('live');
    expect(offerStatusLabel({ isActive: false, startsAt: null, endsAt: null }, now)).toBe('off');
    expect(offerStatusLabel({ isActive: true, startsAt: new Date('2026-10-25'), endsAt: null }, now)).toBe('scheduled');
    expect(offerStatusLabel({ isActive: true, startsAt: null, endsAt: new Date('2026-10-24T12:00:00Z') }, now)).toBe('ended');
  });
});

describe('public list', () => {
  it('lists only offers that are on right now', async () => {
    const live: Row = { id: 'o1', name: 'A', isActive: true, startsAt: null, endsAt: null, minSpend: 200000, variantId: 'sugar', specialPrice: 2900, units: 1, createdAt: new Date(), variant: { productId: 'p1' } };
    const later: Row = { ...live, id: 'o2', startsAt: new Date('2099-01-01'), variant: { productId: 'p1' } };
    const ended: Row = { ...live, id: 'o3', endsAt: new Date('2000-01-01'), variant: { productId: 'p1' } };
    const { svc } = build({ rows: [live, later, ended] });
    expect(await svc.publicActive()).toEqual([{ id: 'o1', name: 'A', variantId: 'sugar', productId: 'p1', minSpend: 200000, specialPrice: 2900, units: 1 }]);
  });
});
