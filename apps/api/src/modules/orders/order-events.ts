import { QUEUES } from '../../common/queue/queue.constants';
import type { QueueService } from '../../common/queue/queue.service';

/** Order statuses that email the customer ("shipped", "delivered"). Others only update the order. */
const NOTIFY_STATUSES: ReadonlySet<string> = new Set(['shipped', 'delivered']);

/**
 * Queue the customer notification for an order reaching `status`. Best effort: the order update has
 * already happened, so a queue failure is swallowed rather than failing the admin/courier action.
 * The job id makes it idempotent (an admin click plus a courier sync mail the customer once).
 *
 * A self pickup order is never shipped; when the shop packs it ("Ready for pickup") the customer is told
 * to come and collect it.
 */
export async function notifyOrderStatus(
  queue: QueueService | undefined,
  orderId: string,
  status: string,
  fulfilment: 'delivery' | 'pickup' = 'delivery',
): Promise<void> {
  if (!queue) return;
  const readyForPickup = fulfilment === 'pickup' && status === 'packed';
  if (!readyForPickup && !NOTIFY_STATUSES.has(status)) return;
  const name = readyForPickup ? 'order.ready_for_pickup' : `order.${status}`;
  await queue.enqueue(QUEUES.NOTIFICATIONS, name, { orderId }, { jobId: `${name}-${orderId}` }).catch(() => undefined);
}
