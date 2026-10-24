import {
  DELIVERY_EDGES,
  DELIVERY_FINAL_STATUSES,
  DELIVERY_MOVES,
  DELIVERY_STATUSES,
  canMove,
  canRetry,
  canRunMove,
  isFinalDeliveryStatus,
  moveTarget,
  nextMoves,
  requirementsFor,
} from './status';

describe('delivery status machine (example tests)', () => {
  it('has the 10 statuses and 15 moves of the design', () => {
    expect(DELIVERY_STATUSES).toHaveLength(10);
    expect(DELIVERY_MOVES).toHaveLength(15);
  });

  it('lets a partner accept an assigned job and then pick it up', () => {
    expect(canRunMove('accepted', 'assigned', 'partner')).toBe(true);
    expect(canRunMove('picked_up', 'accepted', 'partner')).toBe(true);
    expect(canRunMove('picked_up', 'assigned', 'partner')).toBe(false);
  });

  it('sends a rejected or expired job back to new', () => {
    expect(moveTarget('rejected')).toBe('new');
    expect(moveTarget('expired')).toBe('new');
    expect(canRunMove('rejected', 'assigned', 'partner')).toBe(true);
    expect(canRunMove('expired', 'assigned', 'system')).toBe(true);
    expect(canRunMove('expired', 'assigned', 'partner')).toBe(false);
  });

  it('can only deliver from arrived, and only a partner can do it (BR-D38)', () => {
    expect(canMove('arrived', 'delivered', 'partner')).toBe(true);
    expect(canMove('arrived', 'delivered', 'admin')).toBe(false);
    expect(canMove('arrived', 'delivered', 'system')).toBe(false);
    expect(canMove('out_for_delivery', 'delivered', 'partner')).toBe(false);
  });

  it('lets an admin force a failure only from arrived', () => {
    expect(canRunMove('force_failed', 'arrived', 'admin')).toBe(true);
    expect(canRunMove('force_failed', 'out_for_delivery', 'admin')).toBe(false);
  });

  it('allows a retry only from failed_attempt, by the partner', () => {
    expect(canRunMove('retry', 'failed_attempt', 'partner')).toBe(true);
    expect(canRunMove('retry', 'failed_attempt', 'admin')).toBe(false);
    expect(canRunMove('retry', 'arrived', 'partner')).toBe(false);
  });

  it('allows cancel from every active status including arrived, but not from final ones', () => {
    for (const s of ['new', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'failed_attempt'] as const) {
      expect(canRunMove('cancelled', s, 'admin')).toBe(true);
    }
    for (const s of DELIVERY_FINAL_STATUSES) expect(canRunMove('cancelled', s, 'admin')).toBe(false);
  });

  it('allows reassign from five statuses, not from new or arrived', () => {
    expect(DELIVERY_EDGES.reassigned.from).toEqual(['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'failed_attempt']);
    expect(canRunMove('reassigned', 'new', 'admin')).toBe(false);
    expect(canRunMove('reassigned', 'arrived', 'admin')).toBe(false);
  });

  it('lists the moves available to a partner from out_for_delivery', () => {
    expect(nextMoves('out_for_delivery', 'partner').sort()).toEqual(['arrived', 'failed_attempt']);
  });

  it('marks delivered, returned and cancelled as final', () => {
    expect(isFinalDeliveryStatus('delivered')).toBe(true);
    expect(isFinalDeliveryStatus('failed_attempt')).toBe(false);
  });

  it('states what each move needs', () => {
    expect(requirementsFor('rejected').reason).toBe(true);
    expect(requirementsFor('failed_attempt').reasonCode).toBe(true);
    expect(requirementsFor('delivered').otpVerified).toBe(true);
    expect(requirementsFor('accepted')).toEqual({ reason: false, reasonCode: false, otpVerified: false });
  });

  it('lets a partner retry only while attempts remain (BR-D41)', () => {
    expect(canRetry(2, 3)).toBe(true);
    expect(canRetry(3, 3)).toBe(false);
    expect(canRetry(0, 1)).toBe(true);
  });
});
