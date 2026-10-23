import fc from 'fast-check';
import {
  DELIVERY_ACTOR_KINDS,
  DELIVERY_MOVES,
  DELIVERY_STATUSES,
  canMove,
  canRunMove,
  isFinalDeliveryStatus,
  moveTarget,
  nextMoves,
  type DeliveryActorKind,
  type DeliveryMove,
  type DeliveryStatus,
} from './status';
import { arbActorKind, arbCommandSequence, arbDeliveryStatus } from './testing/arbitraries';

/**
 * Property-based tests for the status machine (P1, P2, P3). The oracle in P3 is written out
 * by hand from BR-D20 and is NOT derived from the implementation's table.
 */

/** Every allowed (from > to : actor) triple, copied from BR-D20. */
const ORACLE = new Set<string>([
  ...['new'].flatMap((f) => ['admin', 'system'].map((a) => `${f}>assigned:${a}`)),
  ...['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'failed_attempt'].flatMap((f) =>
    ['admin', 'system'].map((a) => `${f}>assigned:${a}`),
  ),
  'assigned>accepted:partner',
  'assigned>new:partner',
  'assigned>new:system',
  'accepted>new:admin',
  'accepted>picked_up:partner',
  'picked_up>out_for_delivery:partner',
  'out_for_delivery>arrived:partner',
  'out_for_delivery>failed_attempt:partner',
  'arrived>failed_attempt:partner',
  'arrived>failed_attempt:admin',
  'arrived>delivered:partner',
  'failed_attempt>out_for_delivery:partner',
  'failed_attempt>returned:admin',
  ...['new', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'failed_attempt'].flatMap((f) =>
    ['admin', 'system'].map((a) => `${f}>cancelled:${a}`),
  ),
]);

/** Run one command against a status; an illegal command leaves the status unchanged. */
function step(status: DeliveryStatus, actor: DeliveryActorKind, move: DeliveryMove): DeliveryStatus {
  return canRunMove(move, status, actor) ? moveTarget(move) : status;
}

describe('delivery status machine (property tests)', () => {
  it('P1: a final status never changes, whatever sequence of commands is tried', () => {
    fc.assert(
      fc.property(arbCommandSequence, (commands) => {
        let status: DeliveryStatus = 'new';
        for (const { actor, move } of commands) {
          const next = step(status, actor, move);
          if (isFinalDeliveryStatus(status)) expect(next).toBe(status);
          status = next;
        }
      }),
    );
  });

  it('P1: no move at all can start from a final status', () => {
    fc.assert(
      fc.property(arbDeliveryStatus, arbActorKind, (status, actor) => {
        fc.pre(isFinalDeliveryStatus(status));
        expect(nextMoves(status, actor)).toEqual([]);
      }),
    );
  });

  it('P2: delivered is reachable only from arrived', () => {
    fc.assert(
      fc.property(arbDeliveryStatus, arbActorKind, (from, actor) => {
        if (canMove(from, 'delivered', actor)) expect(from).toBe('arrived');
      }),
    );
  });

  it('P2: delivered is never reachable by an admin or the system, on any path', () => {
    fc.assert(
      fc.property(arbCommandSequence, (commands) => {
        let status: DeliveryStatus = 'new';
        for (const { actor, move } of commands) {
          const next = step(status, actor, move);
          if (next === 'delivered' && status !== 'delivered') expect(actor).toBe('partner');
          status = next;
        }
      }),
    );
  });

  it('P3: canMove agrees with the hand-written oracle for every status pair and actor', () => {
    for (const from of DELIVERY_STATUSES) {
      for (const to of DELIVERY_STATUSES) {
        for (const actor of DELIVERY_ACTOR_KINDS) {
          expect(canMove(from, to, actor)).toBe(ORACLE.has(`${from}>${to}:${actor}`));
        }
      }
    }
  });

  it('P3: nextMoves lists exactly the moves canRunMove allows', () => {
    fc.assert(
      fc.property(arbDeliveryStatus, arbActorKind, (status, actor) => {
        const listed = nextMoves(status, actor);
        for (const m of DELIVERY_MOVES) expect(listed.includes(m)).toBe(canRunMove(m, status, actor));
      }),
    );
  });
});
