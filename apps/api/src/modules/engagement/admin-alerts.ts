import type { Logger } from '@nestjs/common';
import { parseAlertEmails, type AdminAlertEvent, type AdminAlertsConfig } from '@belzo/shared';
import { QUEUES } from '../../common/queue/queue.constants';
import type { QueueService } from '../../common/queue/queue.service';

/** Job name on the ADMIN_ALERTS queue. */
export const ADMIN_ALERT_JOB = 'order.alert';

/** Who cancelled an order (shown in the cancellation alert). */
export type CancelledBy = 'customer' | 'admin' | 'system';

export interface AdminAlertJob {
  orderId: string;
  event: AdminAlertEvent;
  /** Cancellation only. */
  by?: CancelledBy;
  reason?: string | null;
}

/**
 * Queue an order alert for the shop. Never throws: an alert must not break placing, paying or cancelling an order.
 * The job id makes a repeated trigger (a replayed request, two sweeps) a no-op while the first job is kept; the
 * worker also keeps its own once-per-order record.
 */
export async function queueAdminAlert(queue: QueueService, job: AdminAlertJob, logger?: Logger): Promise<void> {
  try {
    await queue.enqueue(QUEUES.ADMIN_ALERTS, ADMIN_ALERT_JOB, job, { jobId: `admin-alert:${job.event}:${job.orderId}` });
  } catch (e) {
    logger?.warn(`Could not queue the ${job.event} alert for order ${job.orderId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The bare address from "Name <addr>" or "addr". */
function bareAddress(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  const m = /<([^>]+)>/.exec(v);
  return (m?.[1] ?? v).trim();
}

/**
 * Who gets the alerts: the addresses saved in Admin → Settings, else ADMIN_ALERT_EMAILS from the server environment,
 * else the shop's own sending address (EMAIL_FROM, then SMTP_USER). Empty when none is configured.
 */
export function resolveAdminAlertRecipients(config: AdminAlertsConfig, env: Record<string, string | undefined> = process.env): string[] {
  if (config.emails.length > 0) return config.emails;
  const fromEnv = parseAlertEmails(env.ADMIN_ALERT_EMAILS ?? '');
  if (fromEnv.length > 0) return fromEnv;
  return parseAlertEmails([bareAddress(env.EMAIL_FROM), bareAddress(env.SMTP_USER)]).slice(0, 1);
}
