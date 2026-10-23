import { QUEUES } from '../../common/queue/queue.constants';
import type { QueueService } from '../../common/queue/queue.service';

/** Order statuses that email the customer ("shipped", "delivered"). Others only update the order. */
const NOTIFY_STATUSES: ReadonlySet<string> = new Set(['shipped', 'delivered']);

/**
 * Queue the customer notification for an order reaching `status`. Best effort: the order update has
 * already happened, so a queue failure is swallowed rather than failing the admin/courier action.
 * The job id makes it idempotent (an admin click plus a courier sync mail the customer once).
 */
export async function notifyOrderStatus(
  queue: QueueService | undefined,
  orderId: string,
  status: string,
): Promise<void> {
  if (!queue || !NOTIFY_STATUSES.has(status)) return;
  const name = `order.${status}`;
  await queue.enqueue(QUEUES.NOTIFICATIONS, name, { orderId }, { jobId: `${name}-${orderId}` }).catch(() => undefined);
}
