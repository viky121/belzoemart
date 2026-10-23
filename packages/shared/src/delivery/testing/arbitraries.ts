import fc from 'fast-check';
import { ORDER_STATUSES, type OrderStatus } from '../../constants';
import { JOB_CODE_ALPHABET, JOB_CODE_LENGTH } from '../format';
import {
  DELIVERY_ACTOR_KINDS,
  DELIVERY_MOVES,
  DELIVERY_STATUSES,
  type DeliveryActorKind,
  type DeliveryMove,
  type DeliveryStatus,
} from '../status';

/**
 * Reusable generators for delivery property tests (PBT-07). They respect the domain rules
 * (valid Indian mobiles, 6-digit pincodes, 8-character job codes) and include boundary values.
 */

export const arbDeliveryStatus: fc.Arbitrary<DeliveryStatus> = fc.constantFrom(...DELIVERY_STATUSES);
export const arbActorKind: fc.Arbitrary<DeliveryActorKind> = fc.constantFrom(...DELIVERY_ACTOR_KINDS);
export const arbMove: fc.Arbitrary<DeliveryMove> = fc.constantFrom(...DELIVERY_MOVES);
export const arbOrderStatus: fc.Arbitrary<OrderStatus> = fc.constantFrom(...ORDER_STATUSES);

/** A command: who tries which move. */
export const arbCommand: fc.Arbitrary<{ actor: DeliveryActorKind; move: DeliveryMove }> = fc.record({
  actor: arbActorKind,
  move: arbMove,
});

/** A sequence of commands, from empty to long. */
export const arbCommandSequence = fc.array(arbCommand, { minLength: 0, maxLength: 60 });

/** A clean 10-digit Indian mobile (starts with 6 to 9). */
export const arbMobile: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom('6', '7', '8', '9'), fc.stringMatching(/^[0-9]{9}$/))
  .map(([first, rest]) => `${first}${rest}`);

/** The same mobile written the way people type it. */
export const arbMessyMobile: fc.Arbitrary<{ mobile: string; typed: string }> = fc
  .tuple(arbMobile, fc.constantFrom('', '+91', '91', '0', '+91 ', '+91-'), fc.constantFrom('', ' ', '-'))
  .map(([mobile, prefix, sep]) => ({
    mobile,
    typed: `${prefix}${mobile.slice(0, 5)}${sep}${mobile.slice(5)}`,
  }));

export const arbPincode: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom('1', '2', '3', '4', '5', '6', '7', '8', '9'), fc.stringMatching(/^[0-9]{5}$/))
  .map(([first, rest]) => `${first}${rest}`);

export const arbJobChars: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...JOB_CODE_ALPHABET.split('')), { minLength: JOB_CODE_LENGTH, maxLength: JOB_CODE_LENGTH })
  .map((a) => a.join(''));

export const arbOtpCode: fc.Arbitrary<string> = fc.stringMatching(/^[0-9]{6}$/);

/** Attempts used and allowed, including the boundary (0, limit - 1, limit). */
export const arbAttempts: fc.Arbitrary<{ attemptsUsed: number; maxAttempts: number }> = fc
  .integer({ min: 1, max: 10 })
  .chain((maxAttempts) =>
    fc.record({
      attemptsUsed: fc.oneof(fc.constant(0), fc.constant(maxAttempts - 1), fc.constant(maxAttempts), fc.integer({ min: 0, max: maxAttempts })),
      maxAttempts: fc.constant(maxAttempts),
    }),
  );
