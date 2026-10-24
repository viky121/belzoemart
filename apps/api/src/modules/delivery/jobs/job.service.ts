import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { Prisma, type DeliveryJob } from '@prisma/client';
import {
  DELIVERY_ACTIVE_STATUSES,
  JOB_CODE_ALPHABET,
  JOB_CODE_LENGTH,
  formatJobCode,
  isValidPincode,
  normalizeMobile,
  type DeliveryActorKind,
  type DeliveryLocation,
  type DeliveryMove,
  type DeliverySettings,
  type DeliveryStatus,
  type FailReasonCode,
} from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../admin/audit-log.service';
import { DeliveryError, toDeliveryError } from '../delivery-errors';
import { DeliveryOtpService, type IssuedOtp } from '../otp/delivery-otp.service';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { writeEvent } from './event-writer';
import { DeliveryGateRegistry, DeliveryJobHooks } from './gates';
import { planMove, type Actor, type MoveInput, type MovePlan } from './job-rules';
import { JobRepository, type Tx } from './job.repository';
import { OrderSyncService, type TakenOverShipment } from './order-sync.service';

/** Orders an admin may hand to a partner (D9, BR-D10). Pending orders are confirmed first, as today. */
export const ASSIGNABLE_ORDER_STATUSES = ['confirmed', 'packed', 'shipped', 'out_for_delivery'] as const;

const ACTIVE = DELIVERY_ACTIVE_STATUSES as DeliveryStatus[];

/** GPS points on events are kept this long (NQ2 = A). */
export const GPS_RETENTION_DAYS = 90;

/** Work to do once the transaction has committed. Each step is best effort and never undoes the move. */
interface AfterCommit {
  issuedOtp?: IssuedOtp;
  cancelOrderId?: string;
  takenOver?: TakenOverShipment[];
  committed: { jobId: string; orderId: string; move: DeliveryMove; from: DeliveryStatus; to: DeliveryStatus };
}

interface Executed {
  job: DeliveryJob;
  replay: boolean;
  after?: AfterCommit;
}

export interface CommandResult {
  jobId: string;
  replay: boolean;
}

/**
 * Commands on delivery jobs (component C4). Every status change goes through `execute`, which runs
 * in one transaction: lock the job row, let the pure rules decide (`planMove`), carry out the plan,
 * write the event and sync the order, shipment and timeline. Anything that calls another service
 * (SMS, courier, order cancel) runs after the commit (RP2).
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger('JobService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: JobRepository,
    private readonly settings: DeliverySettingsService,
    private readonly otp: DeliveryOtpService,
    private readonly sync: OrderSyncService,
    private readonly gates: DeliveryGateRegistry,
    private readonly hooks: DeliveryJobHooks,
    private readonly audit: AuditLogService,
    private readonly security: DeliverySecurityEvents,
  ) {}

  // ───────────────────────── admin commands ─────────────────────────

  /** Hand an order to a partner (BR-D10 to BR-D15). Creates the job if the order has none. */
  async assign(adminId: string, orderId: string, partnerId: string, note?: string): Promise<CommandResult> {
    const settings = await this.settings.get();
    const actor: Actor = { kind: 'admin', id: adminId };

    const executed = await this.repo.transaction(async (tx) => {
      const now = await this.repo.now(tx);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payments: true },
      });
      if (!order) throw new DeliveryError(404, 'NOT_FOUND', 'Order not found');
      if (!(ASSIGNABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new DeliveryError(409, 'ORDER_NOT_ASSIGNABLE', `An order that is ${order.status.replace(/_/g, ' ')} cannot be given to a delivery partner`, { status: order.status });
      }

      const existing = await this.repo.findActiveByOrder(tx, orderId);
      if (existing && existing.status !== 'new') {
        throw new DeliveryError(409, 'JOB_ALREADY_ACTIVE', 'This order is already with a delivery partner. Use reassign to change the partner.', { jobId: existing.id });
      }

      const address = await tx.address.findUnique({ where: { id: order.addressId } });
      const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { phone: true } });
      const dest = this.readDestination(address, customer?.phone ?? null);
      const zone = await tx.deliveryZonePincode.findUnique({ where: { pincode: dest.destPincode }, select: { zoneId: true } });
      const cod = order.payments.some((p) => p.provider === 'cod');
      const snapshot = {
        ...dest,
        paymentMode: cod ? ('cod' as const) : ('prepaid' as const),
        codAmount: cod ? order.grandTotal : 0,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        zoneId: zone?.zoneId ?? null,
        maxAttempts: settings.maxAttempts,
      };

      let job: DeliveryJob;
      if (existing) {
        const locked = await this.repo.lockJob(tx, existing.id);
        if (!locked || locked.status !== 'new') throw new DeliveryError(409, 'JOB_ALREADY_ACTIVE', 'This order was just assigned by someone else');
        job = await tx.deliveryJob.update({ where: { id: locked.id }, data: snapshot });
      } else {
        job = await this.createJob(tx, orderId, snapshot);
      }

      const attached = await this.sync.attachInhouseShipment(tx, orderId, job.code, now);
      if (job.shipmentId !== attached.shipmentId) {
        job = await tx.deliveryJob.update({ where: { id: job.id }, data: { shipmentId: attached.shipmentId } });
      }

      const run = await this.execute(tx, job, 'assigned', actor, { targetPartnerId: partnerId, ...(note ? { note } : {}) }, { settings, now, orderCancelled: false });
      run.after = { ...(run.after as AfterCommit), takenOver: attached.takenOver };
      return run;
    });

    await this.afterCommit(executed, actor);
    await this.audit.record(adminId, 'delivery.assign', executed.job.id, undefined, { orderId, partnerId });
    return { jobId: executed.job.id, replay: false };
  }

  reassign(adminId: string, jobId: string, partnerId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'reassigned', { kind: 'admin', id: adminId }, { targetPartnerId: partnerId, reason }, 'delivery.reassign', { partnerId, reason });
  }

  unassign(adminId: string, jobId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'unassigned', { kind: 'admin', id: adminId }, { reason }, 'delivery.unassign', { reason });
  }

  cancel(adminId: string, jobId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'cancelled', { kind: 'admin', id: adminId }, { reason }, 'delivery.cancel', { reason });
  }

  markReturned(adminId: string, jobId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'returned', { kind: 'admin', id: adminId }, { reason }, 'delivery.return', { reason });
  }

  forceFail(adminId: string, jobId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'force_failed', { kind: 'admin', id: adminId }, { reason }, 'delivery.force_fail', { reason });
  }

  // ───────────────────────── partner commands ─────────────────────────

  accept(partnerId: string, jobId: string): Promise<CommandResult> {
    return this.command(jobId, 'accepted', { kind: 'partner', id: partnerId }, {});
  }

  reject(partnerId: string, jobId: string, reason: string): Promise<CommandResult> {
    return this.command(jobId, 'rejected', { kind: 'partner', id: partnerId }, { reason });
  }

  pickUp(partnerId: string, jobId: string, location?: DeliveryLocation): Promise<CommandResult> {
    return this.command(jobId, 'picked_up', { kind: 'partner', id: partnerId }, { location });
  }

  /** Start the route; the customer gets the delivery OTP (BR-D31). */
  start(partnerId: string, jobId: string, location?: DeliveryLocation): Promise<CommandResult> {
    return this.command(jobId, 'out_for_delivery', { kind: 'partner', id: partnerId }, { location });
  }

  arrive(partnerId: string, jobId: string, location?: DeliveryLocation): Promise<CommandResult> {
    return this.command(jobId, 'arrived', { kind: 'partner', id: partnerId }, { location });
  }

  fail(partnerId: string, jobId: string, input: { reasonCode: FailReasonCode; note?: string; location?: DeliveryLocation }): Promise<CommandResult> {
    return this.command(jobId, 'failed_attempt', { kind: 'partner', id: partnerId }, input);
  }

  retry(partnerId: string, jobId: string, location?: DeliveryLocation): Promise<CommandResult> {
    return this.command(jobId, 'retry', { kind: 'partner', id: partnerId }, { location });
  }

  /** Mark delivered. Needs the verified OTP (BR-D38) and every registered completion gate. */
  complete(partnerId: string, jobId: string, location?: DeliveryLocation): Promise<CommandResult> {
    return this.command(jobId, 'delivered', { kind: 'partner', id: partnerId }, { location });
  }

  // ───────────────────────── system commands (worker) ─────────────────────────

  /** Return one `assigned` job whose deadline passed back to `new` (BR-D19). */
  async expire(jobId: string): Promise<boolean> {
    try {
      await this.command(jobId, 'expired', { kind: 'system', id: null }, {}, undefined, undefined, (job, now) => {
        if (!job.acceptDeadlineAt || job.acceptDeadlineAt.getTime() > now.getTime()) {
          throw new DeliveryError(409, 'INVALID_TRANSITION', 'The partner still has time to answer');
        }
      });
      return true;
    } catch (e) {
      if (e instanceof DeliveryError && (e.code === 'INVALID_TRANSITION' || e.code === 'NOT_FOUND')) return false;
      throw e;
    }
  }

  /** Every `assigned` job past its deadline goes back to `new`. Bounded per run. */
  async expireUnanswered(limit = 100): Promise<number> {
    const now = await this.repo.now(this.prisma);
    const ids = await this.repo.findExpiredAssigned(this.prisma, now, limit);
    let done = 0;
    for (const id of ids) {
      try {
        if (await this.expire(id)) done += 1;
      } catch (e) {
        this.logger.error({ jobId: id, error: e instanceof Error ? e.message : String(e) }, 'could not expire job; will retry on the next run');
      }
    }
    return done;
  }

  /** The Belzo order was cancelled: stop its job (BR-D58). No job, or an ended one, means nothing to do. */
  async cancelForOrder(orderId: string): Promise<boolean> {
    const job = await this.repo.findActiveByOrder(this.prisma, orderId);
    if (!job) return false;
    try {
      await this.command(job.id, 'cancelled', { kind: 'system', id: null }, { reason: 'Order cancelled' });
      return true;
    } catch (e) {
      if (e instanceof DeliveryError && e.code === 'INVALID_TRANSITION') return false;
      throw e;
    }
  }

  /**
   * Privacy (NQ2 = A, SP7): clear the GPS point on events older than 90 days. The event itself stays;
   * the database trigger allows exactly this change and nothing else on an event. Returns how many were cleared.
   */
  async clearOldGps(now: Date, days = GPS_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 24 * 3_600_000);
    const r = await this.prisma.deliveryEvent.updateMany({
      where: { createdAt: { lt: cutoff }, OR: [{ lat: { not: null } }, { lng: { not: null } }] },
      data: { lat: null, lng: null },
    });
    return r.count;
  }

  /** Cancel orders of jobs that ended `returned` but whose order was not cancelled yet (after a crash or a failed refund). */
  async reconcileReturned(limit = 50): Promise<number> {
    const rows = await this.prisma.deliveryJob.findMany({
      where: { status: 'returned', order: { status: { notIn: ['cancelled', 'delivered', 'returned'] } } },
      select: { orderId: true },
      take: limit,
    });
    let fixed = 0;
    for (const r of rows) if (await this.sync.cancelUndeliverableOrder(r.orderId)) fixed += 1;
    return fixed;
  }

  // ───────────────────────── the engine ─────────────────────────

  /** Lock the job, run one move in a transaction, then do the after-commit work. */
  private async command(
    jobId: string,
    move: DeliveryMove,
    actor: Actor,
    input: MoveInput,
    auditAction?: string,
    auditAfter?: unknown,
    precheck?: (job: DeliveryJob, now: Date) => void,
  ): Promise<CommandResult> {
    const settings = await this.settings.get();
    let executed: Executed;
    try {
      executed = await this.repo.transaction(async (tx) => {
        const job = await this.repo.lockJob(tx, jobId);
        if (!job) throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
        const now = await this.repo.now(tx);
        precheck?.(job, now);
        const order = await tx.order.findUnique({ where: { id: job.orderId }, select: { status: true } });
        return this.execute(tx, job, move, actor, input, { settings, now, orderCancelled: order?.status === 'cancelled' });
      });
    } catch (e) {
      if (e instanceof DeliveryError && e.code === 'NOT_FOUND' && actor.kind === 'partner') {
        await this.security.record(SECURITY_EVENTS.ACCESS_DENIED, { partnerId: actor.id, jobId, move });
      }
      throw e;
    }

    if (!executed.replay) {
      await this.afterCommit(executed, actor);
      if (auditAction && actor.kind === 'admin' && actor.id) {
        await this.audit.record(actor.id, auditAction, jobId, { status: executed.after?.committed.from }, { status: executed.after?.committed.to, ...(auditAfter as object) });
      }
    }
    return { jobId, replay: executed.replay };
  }

  /**
   * Carry out one move inside the caller's transaction. The job row must already be locked.
   * Throws a DeliveryError for any refusal, which rolls the whole transaction back.
   */
  private async execute(
    tx: Tx,
    job: DeliveryJob,
    move: DeliveryMove,
    actor: Actor,
    input: MoveInput,
    env: { settings: DeliverySettings; now: Date; orderCancelled: boolean },
  ): Promise<Executed> {
    const { settings, now } = env;
    const otpVerifiedAt = move === 'delivered' ? await this.otp.latestVerifiedAt(tx, job) : null;

    const plan = planMove(
      { status: job.status, partnerId: job.partnerId, attemptsUsed: job.attemptsUsed, maxAttempts: job.maxAttempts, attention: job.attention },
      move,
      actor,
      input,
      { now, settings, orderCancelled: env.orderCancelled, otpVerifiedAt },
    );
    if (!plan.ok) throw toDeliveryError(plan);
    if (plan.replay) return { job, replay: true };

    await this.gates.runGuards(tx, job, move);
    if (move === 'delivered') await this.gates.runGates(tx, job);

    let currentAssignmentId: string | null | undefined;
    if (plan.openAssignment) {
      await this.assertPartnerCanTake(tx, plan.openAssignment.partnerId, job);
    }
    if (plan.acceptAssignment) {
      await tx.deliveryAssignment.updateMany({ where: { jobId: job.id, outcome: 'pending' }, data: { outcome: 'accepted', respondedAt: now } });
    }
    if (plan.closeAssignment) {
      await tx.deliveryAssignment.updateMany({
        where: { jobId: job.id, outcome: { in: ['pending', 'accepted'] } },
        data: { outcome: plan.closeAssignment.outcome, respondedAt: now, ...(plan.closeAssignment.reason ? { reason: plan.closeAssignment.reason } : {}) },
      });
      if (plan.patch.partnerId === null) currentAssignmentId = null;
    }
    if (plan.openAssignment) {
      const created = await tx.deliveryAssignment.create({
        data: {
          jobId: job.id,
          partnerId: plan.openAssignment.partnerId,
          assignedByKind: actor.kind as DeliveryActorKind,
          assignedById: actor.id,
          responseDeadlineAt: plan.openAssignment.deadline,
        },
      });
      currentAssignmentId = created.id;
    }
    if (plan.retireOtp) {
      await tx.deliveryOtp.updateMany({ where: { jobId: job.id, status: 'active' }, data: { status: 'superseded' } });
    }

    const data: Prisma.DeliveryJobUncheckedUpdateManyInput = {
      ...plan.patch,
      ...(currentAssignmentId !== undefined ? { currentAssignmentId } : {}),
    };
    const changed = await tx.deliveryJob.updateMany({ where: { id: job.id, status: job.status }, data });
    if (changed.count !== 1) throw new DeliveryError(409, 'INVALID_TRANSITION', 'This delivery was changed by someone else. Please refresh.');
    const updated = await tx.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });

    let issuedOtp: IssuedOtp | undefined;
    if (plan.issueOtp) issuedOtp = await this.otp.issueInTx(tx, updated, now, settings);

    await writeEvent(tx, {
      jobId: job.id,
      event: plan.event.event,
      fromStatus: plan.from,
      toStatus: plan.to,
      actorKind: actor.kind,
      actorId: actor.id,
      reasonCode: plan.event.reasonCode,
      note: plan.event.note,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
      attemptNo: plan.event.attemptNo,
    });

    const synced = await this.sync.apply(tx, { orderId: updated.orderId, shipmentId: updated.shipmentId }, move, now);

    return {
      job: updated,
      replay: false,
      after: {
        ...(issuedOtp ? { issuedOtp } : {}),
        ...(synced.cancelOrderAfterCommit ? { cancelOrderId: updated.orderId } : {}),
        committed: { jobId: updated.id, orderId: updated.orderId, move, from: plan.from, to: plan.to },
      },
    };
  }

  /** After commit: send the OTP, release courier shipments, cancel an undeliverable order, call the hook. */
  private async afterCommit(executed: Executed, actor: Actor): Promise<void> {
    const after = executed.after;
    if (!after) return;
    if (after.issuedOtp) await this.otp.deliver(after.issuedOtp);
    if (after.takenOver?.length) await this.sync.releaseCourierShipments(after.takenOver);
    if (after.cancelOrderId) await this.sync.cancelUndeliverableOrder(after.cancelOrderId);
    try {
      await this.hooks.afterCommit({ ...after.committed, actorKind: actor.kind, actorId: actor.id });
    } catch (e) {
      this.logger.error({ jobId: after.committed.jobId, error: e instanceof Error ? e.message : String(e) }, 'job hook failed');
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  /** The partner must be active and below their limit (BR-D11), and not the partner who already has it. */
  private async assertPartnerCanTake(tx: Tx, partnerId: string, job: DeliveryJob): Promise<void> {
    const partner = await tx.deliveryPartner.findUnique({ where: { id: partnerId }, select: { isActive: true, maxActiveJobs: true } });
    if (!partner || !partner.isActive) throw new DeliveryError(409, 'PARTNER_UNAVAILABLE', 'This delivery partner is not available');
    // Giving a job back to the partner who has it is pointless, except after a failed attempt where it
    // lets the office grant a fresh set of attempts (reassign resets them, BR-D16).
    if (job.partnerId === partnerId && job.status !== 'failed_attempt') {
      throw new DeliveryError(409, 'INVALID_TRANSITION', 'This delivery is already with that partner');
    }
    const busy = await tx.deliveryJob.count({ where: { partnerId, status: { in: ACTIVE }, id: { not: job.id } } });
    if (busy >= partner.maxActiveJobs) {
      throw new DeliveryError(409, 'PARTNER_AT_CAPACITY', 'This delivery partner already has as many deliveries as they can take', { maxActiveJobs: partner.maxActiveJobs });
    }
  }

  /** Snapshot of the delivery address, with the number the OTP goes to (BR-D12, BR-D30). */
  private readDestination(
    address: { fullName: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string } | null,
    accountPhone: string | null,
  ) {
    if (!address) throw new DeliveryError(409, 'ADDRESS_INCOMPLETE', 'This order has no delivery address');
    if (!isValidPincode(address.pincode) || !address.line1.trim() || !address.city.trim() || !address.state.trim()) {
      throw new DeliveryError(409, 'ADDRESS_INCOMPLETE', 'The delivery address is incomplete (street, city, state and a 6-digit pincode are needed)');
    }
    const otpPhone = normalizeMobile(address.phone) ?? normalizeMobile(accountPhone);
    if (!otpPhone) throw new DeliveryError(409, 'ADDRESS_INCOMPLETE', 'There is no valid mobile number to send the delivery code to');
    return {
      destName: address.fullName.trim() || 'Customer',
      destPhone: normalizeMobile(address.phone) ?? otpPhone,
      destLine1: address.line1.trim(),
      destLine2: address.line2?.trim() || null,
      destCity: address.city.trim(),
      destState: address.state.trim(),
      destPincode: address.pincode,
      otpPhone,
    };
  }

  /** Create a job in `new` with a unique code and tracking token. Retries on the rare code clash. */
  private async createJob(
    tx: Tx,
    orderId: string,
    snapshot: Omit<Prisma.DeliveryJobUncheckedCreateInput, 'orderId' | 'code' | 'trackingToken'>,
  ): Promise<DeliveryJob> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newJobCode();
      const exists = await tx.deliveryJob.findUnique({ where: { code }, select: { id: true } });
      if (exists) continue;
      return tx.deliveryJob.create({
        data: { ...snapshot, orderId, code, trackingToken: newTrackingToken() },
      });
    }
    throw new DeliveryError(409, 'JOB_ALREADY_ACTIVE', 'Could not make a delivery code. Please try again.');
  }

}

/** 32 random bytes as URL-safe text (43 characters): the only thing that opens the public tracking page. */
export function newTrackingToken(): string {
  return randomBytes(32).toString('base64url');
}

/** `DLV-` + 8 characters without look-alikes, from a strong random source. */
export function newJobCode(): string {
  let chars = '';
  for (let i = 0; i < JOB_CODE_LENGTH; i += 1) chars += JOB_CODE_ALPHABET[randomInt(0, JOB_CODE_ALPHABET.length)];
  return formatJobCode(chars);
}

export type { MovePlan };
