import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import fc from 'fast-check';
import { TokenService } from './token.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtPrincipal } from '../../common/auth/jwt.types';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-32-characters!';
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '1209600';

/** Minimal in-memory fake of the RefreshToken table for rotation tests. */
interface Row {
  id: string;
  principalId: string;
  principalKind: 'customer' | 'admin';
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/**
 * `customers` overrides the status per id; any id not listed is an `active`
 * customer. Map an id to `null` to simulate a missing customer.
 */
function makeFakePrisma(
  customers: Record<string, { status: string } | null> = {},
  customerLookups: string[] = [],
): PrismaService {
  const rows: Row[] = [];
  let seq = 0;
  return {
    customer: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        customerLookups.push(id);
        if (id in customers) return customers[id] ?? null;
        return { status: 'active' };
      },
    },
    refreshToken: {
      create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt' | 'replacedById'> }) => {
        const row: Row = { id: `t${seq++}`, revokedAt: null, replacedById: null, ...data };
        rows.push(row);
        return row;
      },
      findUnique: async ({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
        rows.find((r) => r.tokenHash === tokenHash) ?? null,
      update: async ({
        where: { tokenHash },
        data,
      }: {
        where: { tokenHash: string };
        data: Partial<Row>;
      }) => {
        const row = rows.find((r) => r.tokenHash === tokenHash)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { familyId: string; revokedAt: null };
        data: Partial<Row>;
      }) => {
        let count = 0;
        for (const r of rows) {
          if (r.familyId === where.familyId && r.revokedAt === null) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaService;
}

describe('TokenService', () => {
  const jwt = new JwtService();

  it('PBT-02: access token sign → verify round-trips sub/kind/roles', async () => {
    const svc = new TokenService(jwt, makeFakePrisma());
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom<'customer' | 'admin'>('customer', 'admin'),
        fc.subarray(['super_admin', 'order_manager', 'marketing', 'support'] as const),
        async (sub, kind, roles) => {
          const principal: JwtPrincipal = { sub, kind, roles: roles as never };
          const token = await svc.signAccess(principal);
          const decoded = await svc.verifyAccess(token);
          expect(decoded.sub).toBe(sub);
          expect(decoded.kind).toBe(kind);
          expect(decoded.roles).toEqual(roles);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('BR-5: a refresh token can be rotated exactly once (reuse rejected)', async () => {
    const svc = new TokenService(jwt, makeFakePrisma());
    const first = await svc.issue('user-1', 'customer');

    const rotated = await svc.rotate(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // Re-using the original (now revoked) token must fail.
    await expect(svc.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('BR-5: reuse of a revoked token revokes the whole family', async () => {
    const svc = new TokenService(jwt, makeFakePrisma());
    const first = await svc.issue('user-2', 'customer');
    const second = await svc.rotate(first.refreshToken);

    // Attempt to reuse the first (revoked) token → family compromised.
    await expect(svc.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    // The legitimately-rotated token is now also revoked.
    await expect(svc.rotate(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown refresh token', async () => {
    const svc = new TokenService(jwt, makeFakePrisma());
    await expect(svc.rotate('does-not-exist')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A2: a blocked customer is rejected with 403 and the family is revoked', async () => {
    const customers: Record<string, { status: string } | null> = {};
    const svc = new TokenService(jwt, makeFakePrisma(customers));
    const first = await svc.issue('user-3', 'customer');
    const second = await svc.rotate(first.refreshToken); // active → fine

    customers['user-3'] = { status: 'blocked' };
    const p = svc.rotate(second.refreshToken);
    await expect(p).rejects.toBeInstanceOf(ForbiddenException);
    await expect(p).rejects.toThrow('Account is blocked');

    // The family is revoked: even once unblocked, a sibling token cannot rotate.
    customers['user-3'] = { status: 'active' };
    await expect(svc.rotate(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A2: a missing customer is rejected', async () => {
    const svc = new TokenService(jwt, makeFakePrisma({ 'user-4': null }));
    const first = await svc.issue('user-4', 'customer');
    await expect(svc.rotate(first.refreshToken)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('A2: an admin principal is never looked up as a customer', async () => {
    const lookups: string[] = [];
    const svc = new TokenService(jwt, makeFakePrisma({}, lookups));
    const first = await svc.issue('admin-1', 'admin');
    const next = await svc.rotate(first.refreshToken, async () => ['super_admin']);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(lookups).toEqual([]);
  });
});
