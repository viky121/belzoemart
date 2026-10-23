import fc from 'fast-check';
import { resolvePermissions, isAuthorized } from './rbac.logic';

/**
 * Property-based tests for RBAC permission resolution (BR-9).
 * These test the pure logic (PBT-05 oracle / PBT-03 invariant); the service
 * that loads roles from the DB is integration-tested separately.
 */
const ALL = [
  'catalogue.read',
  'catalogue.write',
  'order.read',
  'order.write',
  'marketing.write',
  'report.read',
] as const;

const roleGrants = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.subarray([...ALL]),
);

describe('RBAC logic', () => {
  it('PBT-03: resolved permissions equal the union of assigned role grants', () => {
    fc.assert(
      fc.property(roleGrants, fc.array(fc.string({ minLength: 1, maxLength: 8 })), (grants, assigned) => {
        const resolved = resolvePermissions(assigned, grants, ALL as unknown as string[]);
        const expected = new Set<string>();
        for (const role of assigned) {
          const granted = Object.prototype.hasOwnProperty.call(grants, role)
            ? grants[role]
            : undefined;
          for (const p of granted ?? []) expected.add(p);
        }
        expect(new Set(resolved)).toEqual(expected);
      }),
    );
  });

  it('PBT-03: super_admin authorizes every permission regardless of grants', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL), (perm) => {
        expect(isAuthorized(['super_admin'], {}, ALL as unknown as string[], perm)).toBe(true);
      }),
    );
  });

  it('denies a permission not granted by any assigned role', () => {
    const grants = { support: ['order.read'] };
    expect(isAuthorized(['support'], grants, ALL as unknown as string[], 'order.write')).toBe(false);
    expect(isAuthorized(['support'], grants, ALL as unknown as string[], 'order.read')).toBe(true);
  });
});
