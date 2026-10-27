import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { AddressService } from './address.service';

interface Row {
  id: string; customerId: string; isDefault: boolean; createdAt: Date; label: string; fullName: string; phone: string;
  line1: string; line2: string | null; city: string; state: string; pincode: string;
}

function build(seed: Partial<Row>[] = []) {
  let n = 0;
  const rows: Row[] = seed.map((s) => ({
    id: `a${++n}`, customerId: 'c1', isDefault: false, createdAt: new Date(2026, 0, n), label: 'home', fullName: 'Asha', phone: '9876543210',
    line1: '12 MG Road', line2: null, city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', ...s,
  }));
  const tx = {
    address: {
      count: async ({ where }: { where: { customerId: string } }) => rows.filter((r) => r.customerId === where.customerId).length,
      updateMany: async ({ where, data }: { where: { customerId: string }; data: Partial<Row> }) => {
        rows.filter((r) => r.customerId === where.customerId).forEach((r) => Object.assign(r, data));
      },
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = { id: `a${++n}`, createdAt: new Date(2026, 0, n), line2: null, ...data } as Row;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => void rows.splice(rows.findIndex((r) => r.id === where.id), 1),
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { customerId: string } }) =>
        [...rows].filter((r) => r.customerId === where.customerId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };
  const prisma = { address: tx.address, $transaction: tx.$transaction } as unknown as PrismaService;
  return { svc: new AddressService(prisma), rows };
}

const input = (over: Record<string, unknown> = {}) => ({
  label: 'home' as const, fullName: 'Asha Rao', phone: '9876543210', line1: '5 Station Road', line2: 'Near park',
  city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', ...over,
});

describe('AddressService', () => {
  it('the first address becomes the default; a later one only when asked', async () => {
    const { svc, rows } = build();
    const first = await svc.add('c1', input());
    expect(first.isDefault).toBe(true);
    const second = await svc.add('c1', input({ line1: 'Second' }));
    expect(second.isDefault).toBe(false);
    const third = await svc.add('c1', input({ line1: 'Third' }), true);
    expect(third.isDefault).toBe(true);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it('editing saves every changed field, including the name on the address', async () => {
    const { svc, rows } = build([{ isDefault: true, line2: 'Old line 2' }]);
    await svc.update('c1', 'a1', input({ fullName: 'Mukesh Jain', line1: 'Shanti nagar', city: 'Tikamgarh' }));
    expect(rows[0]).toMatchObject({ fullName: 'Mukesh Jain', line1: 'Shanti nagar', line2: 'Near park' });
  });

  it('emptying "Address line 2" really clears it (omitted, empty or null)', async () => {
    for (const line2 of [undefined, null]) {
      const { svc, rows } = build([{ isDefault: true, line2: 'Old line 2' }]);
      await svc.update('c1', 'a1', input({ line2 }));
      expect(rows[0]!.line2).toBeNull();
    }
    const { svc, rows } = build([{ isDefault: true, line2: 'Old line 2' }]);
    await svc.update('c1', 'a1', input({ line2: '' }));
    expect(rows[0]!.line2).toBe('');
  });

  it('"make default" moves the default and keeps exactly one', async () => {
    const { svc, rows } = build([{ isDefault: true }, {}]);
    await svc.update('c1', 'a2', input(), true);
    expect(rows.map((r) => r.isDefault)).toEqual([false, true]);
  });

  it('deleting the default hands the default to the newest address left', async () => {
    const { svc, rows } = build([{}, { isDefault: true }, {}]);
    await svc.remove('c1', 'a2');
    expect(rows.map((r) => [r.id, r.isDefault])).toEqual([['a1', false], ['a3', true]]);
  });

  it('deleting a non-default address leaves the default alone, and deleting the last one is fine', async () => {
    const one = build([{ isDefault: true }, {}]);
    await one.svc.remove('c1', 'a2');
    expect(one.rows.map((r) => r.isDefault)).toEqual([true]);
    await one.svc.remove('c1', 'a1');
    expect(one.rows).toEqual([]);
  });

  it('only the owner can change or delete an address', async () => {
    const { svc } = build([{ customerId: 'someone-else' }]);
    await expect(svc.update('c1', 'a1', input())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove('c1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove('c1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
