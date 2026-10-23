import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { QUEUES } from '../../common/queue/queue.constants';

/**
 * Abandoned-cart recovery (FR-10.5). Finds user carts with items untouched
 * beyond a threshold and enqueues a recovery notification. Intended to run on a
 * schedule (invoked by a cron/scheduler in Operations); exposed as a method so
 * it can also be triggered manually by admin.
 */
@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger('AbandonedCartService');
  private readonly idleHours = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async sweep(): Promise<{ queued: number }> {
    const cutoff = new Date(Date.now() - this.idleHours * 3600_000);
    const carts = await this.prisma.cart.findMany({
      where: { customerId: { not: null }, updatedAt: { lt: cutoff }, items: { some: { savedForLater: false } } },
      select: { customerId: true },
    });
    let queued = 0;
    for (const cart of carts) {
      if (!cart.customerId) continue;
      await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'abandoned_cart', { customerId: cart.customerId });
      queued++;
    }
    this.logger.log(`Abandoned-cart sweep queued ${queued} reminders`);
    return { queued };
  }
}
