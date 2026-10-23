import type { Prisma } from '@prisma/client';
import type { DeliveryActorKind, DeliveryStatus } from '@belzo/shared';
import type { Tx } from './job.repository';

export interface EventInput {
  jobId: string;
  /** A move name (`assigned`, `accepted`, ...) or a note such as `otp_sent`, `otp_verified`, `otp_locked`. */
  event: string;
  fromStatus?: DeliveryStatus | null;
  toStatus?: DeliveryStatus | null;
  actorKind: DeliveryActorKind;
  actorId?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  attemptNo?: number | null;
  meta?: Prisma.InputJsonValue | null;
}

/** Add a row to the append-only job log (BR-D81). Never put an OTP, password or token in `note` or `meta`. */
export function writeEvent(tx: Tx, e: EventInput) {
  return tx.deliveryEvent.create({
    data: {
      jobId: e.jobId,
      event: e.event,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      actorKind: e.actorKind,
      actorId: e.actorId ?? null,
      reasonCode: e.reasonCode ?? null,
      note: e.note ?? null,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      attemptNo: e.attemptNo ?? null,
      ...(e.meta ? { meta: e.meta } : {}),
    },
  });
}
