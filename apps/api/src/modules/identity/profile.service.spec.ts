import { ConflictException, NotFoundException } from '@nestjs/common';
import { profilePatchSchema } from '@belzo/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ProfileService } from './profile.service';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null; gender: string | null; dob: Date | null;
  photoUrl: string | null; locale: string; status: string;
}

function build(extra: Customer[] = []) {
  const rows: Customer[] = [
    { id: 'c1', name: 'Belzo Customer', email: null, phone: '8802307657', gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' },
    ...extra,
  ];
  const prisma = {
    customer: {
      findUnique: async ({ where }: { where: { id?: string; email?: string; phone?: string } }) =>
        rows.find((r) => (where.id ? r.id === where.id : where.email ? r.email === where.email : r.phone === where.phone)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        for (const [k, v] of Object.entries(data)) if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
        return row;
      },
    },
  } as unknown as PrismaService;
  return { svc: new ProfileService(prisma), rows };
}

describe('ProfileService.update', () => {
  it('saves the name and shows it on the next read', async () => {
    const { svc } = build();
    expect(await svc.update('c1', { name: 'Rajesh Kumar' })).toMatchObject({ name: 'Rajesh Kumar' });
    expect(await svc.get('c1')).toMatchObject({ name: 'Rajesh Kumar' });
  });

  it('saves the profile photo address', async () => {
    const { svc } = build();
    const out = await svc.update('c1', { photoUrl: '/api/uploads/profile/3f2a.jpg' });
    expect(out.photoUrl).toBe('/api/uploads/profile/3f2a.jpg');
    expect(await svc.update('c1', { name: 'X Y' })).toMatchObject({ photoUrl: '/api/uploads/profile/3f2a.jpg' });
  });

  it('lowercases the email and refuses one that belongs to another customer', async () => {
    const other: Customer = { id: 'c2', name: 'B', email: 'taken@x.in', phone: null, gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' };
    const { svc } = build([other]);
    expect((await svc.update('c1', { email: ' Me@Shop.IN ' })).email).toBe('me@shop.in');
    await expect(svc.update('c1', { email: 'taken@x.in' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps 10 digits of a phone number and refuses one that belongs to another customer', async () => {
    const other: Customer = { id: 'c2', name: 'B', email: null, phone: '9000000001', gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' };
    const { svc } = build([other]);
    expect((await svc.update('c1', { phone: '+91 98765 43210' })).phone).toBe('9876543210');
    await expect(svc.update('c1', { phone: '9000000001' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 404 for an unknown customer', async () => {
    await expect(build().svc.update('nope', { name: 'X Y' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('profilePatchSchema photoUrl', () => {
  const ok = (photoUrl: string) => profilePatchSchema.safeParse({ photoUrl }).success;

  it('accepts what the upload endpoint returns, with or without a CDN', () => {
    expect(ok('/api/uploads/profile/3f2a1c9e-1111-2222-3333-444455556666.jpg')).toBe(true);
    expect(ok('https://cdn.belzoemart.com/api/uploads/profile/a.jpg')).toBe(true);
    expect(ok('http://localhost:4000/api/uploads/profile/a.jpg')).toBe(true);
  });

  it('refuses other schemes and paths', () => {
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/etc/passwd', '//evil.com/a.jpg', '/api/uploads/../secret', 'not a url', '']) {
      expect({ bad, ok: ok(bad) }).toEqual({ bad, ok: false });
    }
  });
});
