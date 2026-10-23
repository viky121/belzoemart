import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { PartnerTokenService } from './partner-token.service';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import type { PrismaService } from '../../../common/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'access-secret-for-tests-0123456789abcdef';
process.env.JWT_PARTNER_SECRET = 'partner-secret-for-tests-0123456789abcdef';
process.env.JWT_ACCESS_TTL = '900';
process.env.PARTNER_REFRESH_TTL = '604800';

interface TokenRow {
  id: string;
  principalId: string;
  principalKind: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/** A tiny in-memory refresh-token table that understands the filters the service uses. */
function build(partners: Record<string, { isActive: boolean; mustChangePassword: boolean }> = { p1: { isActive: true, mustChangePassword: false } }) {
  const rows: TokenRow[] = [];
  let seq = 0;
  const matches = (r: TokenRow, where: Record<string, any>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'not' in v) return (r as any)[k] !== v.not;
      return (r as any)[k] === v;
    });
  const prisma = {
    refreshToken: {
      create: async ({ data }: any) => {
        const row: TokenRow = { id: `rt${++seq}`, revokedAt: null, replacedById: null, ...data };
        rows.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.tokenHash === where.tokenHash) as TokenRow;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    deliveryPartner: {
      findUnique: async ({ where }: any) => partners[where.id] ?? null,
    },
  } as unknown as PrismaService;
  const events: string[] = [];
  const security = { record: async (e: string) => void events.push(e) } as unknown as DeliverySecurityEvents;
  const service = new PartnerTokenService(new JwtService(), prisma, security);
  return { service, rows, events, partners };
}

describe('PartnerTokenService', () => {
  it('issues an access token signed with the partner secret only', async () => {
    const { service } = build();
    const t = await service.issue('p1', false);
    const claims = await service.verifyAccess(t.accessToken);
    expect(claims.sub).toBe('p1');
    expect(claims.kind).toBe('partner');
    await expect(new JwtService().verifyAsync(t.accessToken, { secret: process.env.JWT_ACCESS_SECRET })).rejects.toBeDefined();
  });

  it('refuses a token signed with the access secret, or without the partner kind', async () => {
    const { service } = build();
    const jwt = new JwtService();
    const forged = await jwt.signAsync({ sub: 'p1', kind: 'partner', mcp: false }, { secret: process.env.JWT_ACCESS_SECRET });
    await expect(service.verifyAccess(forged)).rejects.toBeDefined();
    const wrongKind = await jwt.signAsync({ sub: 'p1', kind: 'admin', roles: ['super_admin'] }, { secret: process.env.JWT_PARTNER_SECRET });
    await expect(service.verifyAccess(wrongKind)).rejects.toBeDefined();
  });

  it('stores only a hash of the refresh token', async () => {
    const { service, rows } = build();
    const t = await service.issue('p1', false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(createHash('sha256').update(t.refreshToken).digest('hex'));
    expect(JSON.stringify(rows)).not.toContain(t.refreshToken);
    expect(rows[0]?.principalKind).toBe('partner');
  });

  it('rotates: new pair in the same family, old token revoked', async () => {
    const { service, rows } = build();
    const first = await service.issue('p1', false);
    const second = await service.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.familyId).toBe(rows[1]?.familyId);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(rows[1]?.revokedAt).toBeNull();
  });

  it('detects reuse of an old token, revokes the whole family and records the event', async () => {
    const { service, rows, events } = build();
    const first = await service.issue('p1', false);
    const second = await service.rotate(first.refreshToken);
    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(events).toContain(SECURITY_EVENTS.TOKEN_REUSE);
    await expect(service.rotate(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown, expired and non-partner refresh tokens', async () => {
    const { service, rows } = build();
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    const t = await service.issue('p1', false);
    (rows[0] as TokenRow).expiresAt = new Date(Date.now() - 1000);
    await expect(service.rotate(t.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    const t2 = await service.issue('p1', false);
    (rows[1] as TokenRow).principalKind = 'customer';
    await expect(service.rotate(t2.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to rotate for a deactivated partner and revokes the family', async () => {
    const { service, rows, partners } = build();
    const t = await service.issue('p1', false);
    (partners.p1 as { isActive: boolean }).isActive = false;
    await expect(service.rotate(t.refreshToken)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  it('logout revokes the family; revokeAllFor signs out every device', async () => {
    const { service, rows } = build();
    const a = await service.issue('p1', false);
    await service.revoke(a.refreshToken);
    expect(rows[0]?.revokedAt).not.toBeNull();
    await service.issue('p1', false);
    await service.issue('p1', false);
    await service.revokeAllFor('p1');
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('revokeOthers keeps the device that changed the password', async () => {
    const { service, rows } = build();
    const mine = await service.issue('p1', false);
    await service.issue('p1', false);
    await service.revokeOthers('p1', mine.refreshToken);
    expect(rows[0]?.revokedAt).toBeNull();
    expect(rows[1]?.revokedAt).not.toBeNull();
    await service.revokeOthers('p1');
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
