import { Injectable } from '@nestjs/common';
import type { DeliveryJob } from '@prisma/client';
import type { DeliveryMove } from '@belzo/shared';
import { DeliveryError } from '../delivery-errors';
import type { Tx } from './job.repository';

/**
 * Extension points for rules that other parts of the delivery module add later (BR-D45, BR-D46).
 * With nothing registered, nothing is refused. U8.2 registers the payment and proof gates and the
 * "a collected payment must be voided first" guard.
 */

/** Runs before `reassigned`, `returned` and `cancelled`. Return a plain-language reason to refuse, or null to allow. */
export interface TransitionGuard {
  readonly name: string;
  check(tx: Tx, job: DeliveryJob, move: DeliveryMove): Promise<string | null>;
}

/** Runs before `delivered`, after the OTP rule has passed. Return a reason to refuse, or null to allow. */
export interface CompletionGate {
  readonly name: string;
  check(tx: Tx, job: DeliveryJob): Promise<string | null>;
}

/** Moves a TransitionGuard is asked about. */
export const GUARDED_MOVES: readonly DeliveryMove[] = ['reassigned', 'returned', 'cancelled'];

@Injectable()
export class DeliveryGateRegistry {
  private readonly guards: TransitionGuard[] = [];
  private readonly gates: CompletionGate[] = [];

  registerGuard(guard: TransitionGuard): void {
    if (!this.guards.some((g) => g.name === guard.name)) this.guards.push(guard);
  }

  registerGate(gate: CompletionGate): void {
    if (!this.gates.some((g) => g.name === gate.name)) this.gates.push(gate);
  }

  /** The first refusal wins; the transaction is rolled back by the error. */
  async runGuards(tx: Tx, job: DeliveryJob, move: DeliveryMove): Promise<void> {
    if (!GUARDED_MOVES.includes(move)) return;
    for (const g of this.guards) {
      const refusal = await g.check(tx, job, move);
      if (refusal) throw new DeliveryError(409, 'GUARD_REFUSED', refusal, { guard: g.name });
    }
  }

  async runGates(tx: Tx, job: DeliveryJob): Promise<void> {
    for (const g of this.gates) {
      const refusal = await g.check(tx, job);
      if (refusal) throw new DeliveryError(409, 'GATE_REFUSED', refusal, { gate: g.name });
    }
  }
}

/** What happened to a job, passed to the hook after the transaction has committed. */
export interface JobCommitted {
  jobId: string;
  orderId: string;
  move: DeliveryMove;
  from: DeliveryJob['status'];
  to: DeliveryJob['status'];
  actorKind: 'admin' | 'partner' | 'system';
  actorId: string | null;
}

/**
 * Called once after a job move (or an assignment) has committed. It does nothing in U8.1; U8.5 sends
 * the customer's e-mail and in-app message from here. It must never throw into the caller.
 */
@Injectable()
export class DeliveryJobHooks {
  async afterCommit(_event: JobCommitted): Promise<void> {
    // intentionally empty until U8.5
  }
}
