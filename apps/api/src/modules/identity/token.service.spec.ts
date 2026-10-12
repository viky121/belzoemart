import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
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

function makeFakePrisma(): PrismaService {
  const rows: Row[] = [];
  let seq = 0;
  return {
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
});
