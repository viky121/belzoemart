import type { RedisService } from '../../common/redis/redis.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { NotificationService } from './notification.service';

type Processor = (job: { id?: string; name: string; data: unknown }) => Promise<unknown>;
const mockWorkers: { queueName: string; processor: Processor }[] = [];

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((queueName: string, processor: Processor) => {
    mockWorkers.push({ queueName, processor });
    return { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
  }),
}));

// Imported after the mock is registered.
import { NotificationWorker } from './notification.worker';

describe('NotificationWorker (A5)', () => {
  beforeEach(() => {
    mockWorkers.length = 0;
  });

  function start() {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', customerId: 'c1' }) },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', locale: 'hi', email: 'a@x.in', phone: null }),
      },
    };
    const notifications = { send: jest.fn().mockResolvedValue(undefined) };
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const worker = new NotificationWorker(
      { client: {} } as unknown as RedisService,
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationService,
      queue as unknown as QueueService,
    );
    worker.onModuleInit();
    expect(mockWorkers).toHaveLength(1);
    return { notifications, queue, ...mockWorkers[0]! };
  }

  it("listens on the 'notifications' queue", () => {
    expect(start().queueName).toBe('notifications');
  });

  it('forwards a legacy dpdp.* job to the dpdp queue with identical data', async () => {
    const { processor, queue, notifications } = start();
    const data = { dataRequestId: 'dr1', customerId: 'c1' };
    await processor({ id: 'j1', name: 'dpdp.deletion', data });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith('dpdp', 'dpdp.deletion', data);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('still sends order notifications', async () => {
    const { processor, queue, notifications } = start();
    await processor({ id: 'j2', name: 'order.confirmed', data: { orderId: 'o1' } });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith({
      customerId: 'c1',
      type: 'order.confirmed',
      data: { orderId: 'o1' },
      locale: 'hi',
      contact: { email: 'a@x.in', phone: undefined },
    });
  });
});
