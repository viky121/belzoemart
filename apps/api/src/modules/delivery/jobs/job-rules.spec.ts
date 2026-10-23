import fc from 'fast-check';
import {
  DEFAULT_DELIVERY_SETTINGS,
  DELIVERY_EDGES,
  DELIVERY_MOVES,
  DELIVERY_STATUSES,
  FAIL_REASON_CODES,
  type DeliveryActorKind,
  type DeliveryMove,
  type DeliveryStatus,
} from '@belzo/shared';
import { applyPlan, isReplay, planMove, type Actor, type JobFacts, type MoveInput, type MovePlan, type PlanContext } from './job-rules';

const NOW = new Date('2026-10-23T10:00:00Z');
const OWNER = 'p1';
const OTHER = 'p2';
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  now: NOW,
  settings: DEFAULT_DELIVERY_SETTINGS,
  orderCancelled: false,
  otpVerifiedAt: null,
  ...over,
});
const job = (over: Partial<JobFacts> = {}): JobFacts => ({
  status: 'new',
  partnerId: null,
  attemptsUsed: 0,
  maxAttempts: 3,
  attention: null,
  ...over,
});
const partner = (id = OWNER): Actor => ({ kind: 'partner', id });
const admin: Actor = { kind: 'admin', id: 'admin-1' };
const system: Actor = { kind: 'system', id: null };
const owned = (status: DeliveryStatus, over: Partial<JobFacts> = {}) => job({ status, partnerId: OWNER, ...over });

function mustPlan(r: ReturnType<typeof planMove>): MovePlan {
  if (!r.ok || r.replay) throw new Error(`expected a plan, got ${JSON.stringify(r)}`);
  return r;
}
function mustFail(r: ReturnType<typeof planMove>) {
  if (r.ok) throw new Error(`expected a refusal, got ${JSON.stringify(r)}`);
  return r;
}

describe('planMove (example tests)', () => {
  it('assigns a new job: partner set, deadline = now + 15 minutes, open assignment', () => {
    const p = mustPlan(planMove(job(), 'assigned', admin, { targetPartnerId: OWNER }, ctx()));
    expect(p.to).toBe('assigned');
    expect(p.patch).toMatchObject({ status: 'assigned', partnerId: OWNER, attention: null });
    expect(p.patch.acceptDeadlineAt?.getTime()).toBe(NOW.getTime() + 15 * 60_000);
    expect(p.openAssignment).toEqual({ partnerId: OWNER, deadline: new Date(NOW.getTime() + 15 * 60_000) });
    expect(p.closeAssignment).toBeUndefined();
  });

  it('needs a target partner to assign', () => {
    expect(mustFail(planMove(job(), 'assigned', admin, {}, ctx())).code).toBe('INVALID_INPUT');
  });

  it('accept marks the assignment accepted and removes the deadline', () => {
    const p = mustPlan(planMove(owned('assigned'), 'accepted', partner(), {}, ctx()));
    expect(p.acceptAssignment).toBe(true);
    expect(p.patch.acceptDeadlineAt).toBeNull();
  });

  it('reject needs a reason, clears the partner and flags the job (BR-D18)', () => {
    expect(mustFail(planMove(owned('assigned'), 'rejected', partner(), {}, ctx())).code).toBe('INVALID_INPUT');
    expect(mustFail(planMove(owned('assigned'), 'rejected', partner(), { reason: 'no' }, ctx())).code).toBe('INVALID_INPUT');
    const p = mustPlan(planMove(owned('assigned'), 'rejected', partner(), { reason: 'bike broke down' }, ctx()));
    expect(p.patch).toMatchObject({ status: 'new', partnerId: null, attention: 'rejected' });
    expect(p.closeAssignment).toEqual({ outcome: 'rejected', reason: 'bike broke down' });
  });

  it('a timeout is done by the system, flags no reply, and a partner cannot do it', () => {
    const p = mustPlan(planMove(owned('assigned'), 'expired', system, {}, ctx()));
    expect(p.patch).toMatchObject({ status: 'new', partnerId: null, attention: 'no_reply' });
    expect(p.closeAssignment?.outcome).toBe('expired');
    expect(mustFail(planMove(owned('assigned'), 'expired', partner(), {}, ctx())).status).toBe(403);
  });

  it('start of route issues a new OTP for attempt attemptsUsed + 1', () => {
    const p = mustPlan(planMove(owned('picked_up', { attemptsUsed: 1 }), 'out_for_delivery', partner(), {}, ctx()));
    expect(p.issueOtp).toBe(true);
    expect(p.event.attemptNo).toBe(2);
  });

  it('a failed attempt needs a reason code, counts the attempt and retires the OTP', () => {
    expect(mustFail(planMove(owned('arrived'), 'failed_attempt', partner(), {}, ctx())).code).toBe('INVALID_INPUT');
    expect(mustFail(planMove(owned('arrived'), 'failed_attempt', partner(), { reasonCode: 'other' }, ctx())).code).toBe('INVALID_INPUT');
    const p = mustPlan(planMove(owned('arrived'), 'failed_attempt', partner(), { reasonCode: 'refused' }, ctx()));
    expect(p.patch.attemptsUsed).toBe(1);
    expect(p.patch.attention).toBeUndefined();
    expect(p.retireOtp).toBe(true);
    expect(p.event.reasonCode).toBe('refused');
  });

  it('the last allowed failure flags the job for the office (BR-D41)', () => {
    const p = mustPlan(planMove(owned('out_for_delivery', { attemptsUsed: 2 }), 'failed_attempt', partner(), { reasonCode: 'wrong_address' }, ctx()));
    expect(p.patch).toMatchObject({ attemptsUsed: 3, attention: 'max_attempts' });
  });

  it('retry is allowed while attempts remain and refused at the limit', () => {
    expect(mustPlan(planMove(owned('failed_attempt', { attemptsUsed: 2 }), 'retry', partner(), {}, ctx())).issueOtp).toBe(true);
    expect(mustFail(planMove(owned('failed_attempt', { attemptsUsed: 3 }), 'retry', partner(), {}, ctx())).code).toBe('MAX_ATTEMPTS_REACHED');
  });

  it('delivered needs a verified, fresh OTP (BR-D38)', () => {
    const j = owned('arrived');
    expect(mustFail(planMove(j, 'delivered', partner(), {}, ctx())).code).toBe('OTP_NOT_VERIFIED');
    expect(mustFail(planMove(j, 'delivered', partner(), {}, ctx({ otpVerifiedAt: new Date(NOW.getTime() - 31 * 60_000) }))).code).toBe('OTP_STALE');
    const p = mustPlan(planMove(j, 'delivered', partner(), {}, ctx({ otpVerifiedAt: new Date(NOW.getTime() - 5 * 60_000) })));
    expect(p.patch).toMatchObject({ status: 'delivered', deliveredAt: NOW, endedAt: NOW });
    expect(p.patch.trackingExpiresAt?.getTime()).toBe(NOW.getTime() + 30 * 24 * 3_600_000);
    expect(p.closeAssignment?.outcome).toBe('completed');
  });

  it('nobody but the partner can mark delivered, not even an admin or the system', () => {
    const verified = ctx({ otpVerifiedAt: NOW });
    expect(mustFail(planMove(owned('arrived'), 'delivered', admin, {}, verified)).status).toBe(403);
    expect(mustFail(planMove(owned('arrived'), 'delivered', system, {}, verified)).status).toBe(403);
  });

  it('reassign resets the attempts, retires the OTP and closes the old assignment (BR-D16)', () => {
    const p = mustPlan(planMove(owned('failed_attempt', { attemptsUsed: 3, attention: 'max_attempts' }), 'reassigned', admin, { targetPartnerId: OTHER, reason: 'rider ill' }, ctx()));
    expect(p.patch).toMatchObject({ status: 'assigned', partnerId: OTHER, attemptsUsed: 0, attention: null });
    expect(p.closeAssignment).toEqual({ outcome: 'reassigned', reason: 'rider ill' });
    expect(p.openAssignment?.partnerId).toBe(OTHER);
    expect(p.retireOtp).toBe(true);
  });

  it('return and cancel are final: they set the end time and tracking expiry', () => {
    const r = mustPlan(planMove(owned('failed_attempt'), 'returned', admin, { reason: 'customer gone' }, ctx()));
    expect(r.patch).toMatchObject({ status: 'returned', endedAt: NOW });
    expect(r.patch.trackingExpiresAt).toBeInstanceOf(Date);
    const c = mustPlan(planMove(owned('arrived'), 'cancelled', admin, { reason: 'order cancelled' }, ctx()));
    expect(c.patch.status).toBe('cancelled');
    expect(c.retireOtp).toBe(true);
    expect(mustFail(planMove(owned('arrived'), 'cancelled', admin, {}, ctx())).code).toBe('INVALID_INPUT');
  });

  it('nothing moves a final job', () => {
    for (const s of ['delivered', 'returned', 'cancelled'] as const) {
      expect(mustFail(planMove(owned(s), 'cancelled', admin, { reason: 'again' }, ctx())).code).toBe('INVALID_TRANSITION');
    }
  });

  it('a partner gets 404 for a job that is not theirs, whatever the move', () => {
    for (const move of ['accepted', 'picked_up', 'arrived'] as const) {
      expect(mustFail(planMove(owned('assigned'), move, partner(OTHER), {}, ctx())).status).toBe(404);
    }
    expect(mustFail(planMove(job({ status: 'new' }), 'accepted', partner(), {}, ctx())).status).toBe(404);
  });

  it('a partner cannot do admin moves (403) and an admin cannot do partner moves (403)', () => {
    expect(mustFail(planMove(owned('accepted'), 'unassigned', partner(), { reason: 'abc' }, ctx())).status).toBe(403);
    expect(mustFail(planMove(owned('assigned'), 'accepted', admin, {}, ctx())).status).toBe(403);
  });

  it('refuses a partner command once the order is cancelled (BR-D24) but lets the system cancel the job', () => {
    expect(mustFail(planMove(owned('out_for_delivery'), 'arrived', partner(), {}, ctx({ orderCancelled: true }))).code).toBe('ORDER_CANCELLED');
    expect(mustPlan(planMove(owned('out_for_delivery'), 'cancelled', system, { reason: 'Order cancelled' }, ctx({ orderCancelled: true }))).to).toBe('cancelled');
  });

  it('treats a repeated partner command as a replay (BR-D23)', () => {
    expect(planMove(owned('accepted'), 'accepted', partner(), {}, ctx())).toEqual({ ok: true, replay: true });
    expect(planMove(owned('out_for_delivery'), 'out_for_delivery', partner(), {}, ctx())).toEqual({ ok: true, replay: true });
    expect(isReplay(owned('assigned'), 'rejected', partner())).toBe(false);
    expect(isReplay(owned('accepted'), 'accepted', admin)).toBe(false);
  });

  it('rejects odd text in reasons and notes', () => {
    expect(mustFail(planMove(owned('assigned'), 'rejected', partner(), { reason: 'bad\u0007text' }, ctx())).code).toBe('INVALID_INPUT');
    expect(mustFail(planMove(owned('assigned'), 'rejected', partner(), { reason: 'x'.repeat(256) }, ctx())).code).toBe('INVALID_INPUT');
  });

  it('admin can force a failure only from arrived and gives a reason', () => {
    expect(mustFail(planMove(owned('out_for_delivery'), 'force_failed', admin, { reason: 'abc def' }, ctx())).code).toBe('INVALID_TRANSITION');
    const p = mustPlan(planMove(owned('arrived'), 'force_failed', admin, { reason: 'customer phone off' }, ctx()));
    expect(p.patch.attemptsUsed).toBe(1);
    expect(p.event.note).toBe('customer phone off');
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

/** A hand-written model of the same machine, used as the oracle for P4. It does not use the shared tables. */
interface Model {
  status: DeliveryStatus;
  partnerId: string | null;
  attemptsUsed: number;
  otpVerified: boolean;
}
const MODEL_RULES: Record<string, { from: string[]; to: DeliveryStatus; who: DeliveryActorKind[] }> = {
  assigned: { from: ['new'], to: 'assigned', who: ['admin', 'system'] },
  reassigned: { from: ['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'failed_attempt'], to: 'assigned', who: ['admin', 'system'] },
  accepted: { from: ['assigned'], to: 'accepted', who: ['partner'] },
  rejected: { from: ['assigned'], to: 'new', who: ['partner'] },
  expired: { from: ['assigned'], to: 'new', who: ['system'] },
  unassigned: { from: ['accepted'], to: 'new', who: ['admin'] },
  picked_up: { from: ['accepted'], to: 'picked_up', who: ['partner'] },
  out_for_delivery: { from: ['picked_up'], to: 'out_for_delivery', who: ['partner'] },
  arrived: { from: ['out_for_delivery'], to: 'arrived', who: ['partner'] },
  failed_attempt: { from: ['out_for_delivery', 'arrived'], to: 'failed_attempt', who: ['partner'] },
  force_failed: { from: ['arrived'], to: 'failed_attempt', who: ['admin'] },
  delivered: { from: ['arrived'], to: 'delivered', who: ['partner'] },
  retry: { from: ['failed_attempt'], to: 'out_for_delivery', who: ['partner'] },
  returned: { from: ['failed_attempt'], to: 'returned', who: ['admin'] },
  cancelled: { from: ['new', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'failed_attempt'], to: 'cancelled', who: ['admin', 'system'] },
};

function modelStep(m: Model, move: string, actor: Actor, target: string): Model {
  const rule = MODEL_RULES[move] as (typeof MODEL_RULES)[string];
  if (!rule.who.includes(actor.kind)) return m;
  if (actor.kind === 'partner' && (m.partnerId === null || m.partnerId !== actor.id)) return m;
  if (actor.kind === 'partner' && m.status === rule.to && move !== 'rejected') return m; // replay
  if (!rule.from.includes(m.status)) return m;
  if (move === 'delivered' && !m.otpVerified) return m;
  if (move === 'retry' && m.attemptsUsed >= 3) return m;
  const next: Model = { ...m, status: rule.to };
  if (move === 'assigned' || move === 'reassigned') next.partnerId = target;
  if (move === 'reassigned') next.attemptsUsed = 0;
  if (move === 'rejected' || move === 'expired' || move === 'unassigned') next.partnerId = null;
  if (move === 'failed_attempt' || move === 'force_failed') next.attemptsUsed = m.attemptsUsed + 1;
  if (['out_for_delivery', 'retry', 'failed_attempt', 'force_failed', 'returned', 'cancelled', 'reassigned'].includes(move)) next.otpVerified = false;
  return next;
}

type Cmd = { kind: 'move'; move: DeliveryMove; actor: Actor; target: string } | { kind: 'verifyOtp' };

const arbDeliveryStatus: fc.Arbitrary<DeliveryStatus> = fc.constantFrom(...DELIVERY_STATUSES);
const PARTNER_MOVES = DELIVERY_MOVES.filter((m) => DELIVERY_EDGES[m].actors.includes('partner'));
const arbActor: fc.Arbitrary<Actor> = fc.constantFrom<Actor>(admin, system, partner(OWNER), partner(OTHER));
const arbCmd: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 9, arbitrary: fc.record({ kind: fc.constant('move' as const), move: fc.constantFrom(...DELIVERY_MOVES), actor: arbActor, target: fc.constantFrom(OWNER, OTHER) }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'verifyOtp' as const }) },
);

const VALID_INPUT = (target: string): MoveInput => ({ reason: 'because it is needed', reasonCode: FAIL_REASON_CODES[1], targetPartnerId: target });

describe('planMove (property tests)', () => {
  it('P4: random command sequences agree with the hand-written model after every step', () => {
    fc.assert(
      fc.property(fc.array(arbCmd, { maxLength: 80 }), (cmds) => {
        let real: JobFacts = job();
        let model: Model = { status: 'new', partnerId: null, attemptsUsed: 0, otpVerified: false };
        let otpVerifiedAt: Date | null = null;
        for (const cmd of cmds) {
          if (cmd.kind === 'verifyOtp') {
            if (real.status === 'arrived') {
              otpVerifiedAt = NOW;
              model = { ...model, otpVerified: true };
            }
          } else {
            const plan = planMove(real, cmd.move, cmd.actor, VALID_INPUT(cmd.target), ctx({ otpVerifiedAt }));
            if (plan.ok && !plan.replay) {
              real = applyPlan(real, plan);
              if (plan.issueOtp || plan.retireOtp) otpVerifiedAt = null;
            }
            model = modelStep(model, cmd.move, cmd.actor, cmd.target);
          }
          expect({ status: real.status, partnerId: real.partnerId, attemptsUsed: real.attemptsUsed }).toEqual({
            status: model.status,
            partnerId: model.partnerId,
            attemptsUsed: model.attemptsUsed,
          });
          expect(otpVerifiedAt !== null).toBe(model.otpVerified);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('P1: a final job never changes, whoever asks and whatever they ask', () => {
    fc.assert(
      fc.property(fc.constantFrom<DeliveryStatus>('delivered', 'returned', 'cancelled'), fc.constantFrom(...DELIVERY_MOVES), arbActor, (status, move, actor) => {
        const j = owned(status);
        const r = planMove(j, move, actor, VALID_INPUT(OTHER), ctx({ otpVerifiedAt: NOW }));
        expect(r.ok && !r.replay).toBe(false);
      }),
    );
  });

  it('P2: delivered is never produced without a verified OTP, on any path', () => {
    fc.assert(
      fc.property(arbDeliveryStatus, arbActor, (status, actor) => {
        const r = planMove(job({ status, partnerId: OWNER }), 'delivered', actor, {}, ctx({ otpVerifiedAt: null }));
        expect(r.ok && !r.replay).toBe(false);
      }),
    );
  });

  it('P9: attempts never exceed the limit through any command sequence, and reassign resets them', () => {
    fc.assert(
      fc.property(fc.array(arbCmd, { maxLength: 100 }), (cmds) => {
        let real: JobFacts = job();
        for (const cmd of cmds) {
          if (cmd.kind !== 'move') continue;
          const plan = planMove(real, cmd.move, cmd.actor, VALID_INPUT(cmd.target), ctx({ otpVerifiedAt: NOW }));
          if (plan.ok && !plan.replay) {
            real = applyPlan(real, plan);
            if (plan.move === 'reassigned') expect(real.attemptsUsed).toBe(0);
          }
          expect(real.attemptsUsed).toBeLessThanOrEqual(real.maxAttempts);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('P10: a partner repeating a command never has a second effect', () => {
    const arbValidStart = fc
      .constantFrom(...PARTNER_MOVES)
      .chain((move) => fc.tuple(fc.constant(move), fc.constantFrom(...DELIVERY_EDGES[move].from), fc.integer({ min: 0, max: 2 })));
    fc.assert(
      fc.property(arbValidStart, ([move, status, attemptsUsed]) => {
        const start = job({ status, partnerId: OWNER, attemptsUsed });
        const c = ctx({ otpVerifiedAt: NOW });
        const first = planMove(start, move, partner(), VALID_INPUT(OTHER), c);
        expect(first.ok && !first.replay).toBe(true);
        const after = applyPlan(start, first as MovePlan);
        const second = planMove(after, move, partner(), VALID_INPUT(OTHER), c);
        // either a replay or a refusal: never a second change
        expect(second.ok && !second.replay).toBe(false);
      }),
    );
  });

  it('P12: a partner who does not hold the job is always told 404', () => {
    fc.assert(
      fc.property(arbDeliveryStatus, fc.constantFrom(...DELIVERY_MOVES), fc.constantFrom<string | null>(null, OTHER), (status, move, holder) => {
        const r = planMove(job({ status, partnerId: holder }), move, partner(OWNER), VALID_INPUT(OWNER), ctx({ otpVerifiedAt: NOW }));
        const allowedForPartner = ['accepted', 'rejected', 'picked_up', 'out_for_delivery', 'arrived', 'failed_attempt', 'delivered', 'retry'].includes(move);
        if (allowedForPartner) {
          expect(r.ok).toBe(false);
          expect((r as { status?: number }).status).toBe(404);
        }
      }),
    );
  });
});
