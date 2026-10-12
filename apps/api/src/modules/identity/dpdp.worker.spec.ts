import type { RedisService } from '../../common/redis/redis.service';
import type { DataRequestService } from './data-request.service';

type Processor = (job: { id?: string; name: string; data: unknown }) => Promise<unknown>;
const mockWorkers: { queueName: string; processor: Processor }[] = [];

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((queueName: string, processor: Processor) => {
    mockWorkers.push({ queueName, processor });
    return { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
  }),
}));

// Imported after the mock is registered.
import { DpdpWorker } from './dpdp.worker';

describe('DpdpWorker (A5)', () => {
  beforeEach(() => {
    mockWorkers.length = 0;
  });

  function start() {
    const dataRequests = {
      processExport: jest.fn().mockResolvedValue(undefined),
      processDeletion: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new DpdpWorker(
      { client: {} } as unknown as RedisService,
      dataRequests as unknown as DataRequestService,
    );
    worker.onModuleInit();
    expect(mockWorkers).toHaveLength(1);
    return { dataRequests, ...mockWorkers[0]! };
  }

  it("listens on the dedicated 'dpdp' queue", () => {
    expect(start().queueName).toBe('dpdp');
  });

  it('routes export and deletion jobs to DataRequestService', async () => {
    const { processor, dataRequests } = start();
    await processor({ name: 'dpdp.export', data: { dataRequestId: 'dr1', customerId: 'c1' } });
    await processor({ name: 'dpdp.deletion', data: { dataRequestId: 'dr2', customerId: 'c1' } });
    expect(dataRequests.processExport).toHaveBeenCalledWith('dr1');
    expect(dataRequests.processDeletion).toHaveBeenCalledWith('dr2');
  });

  it('throws for an unknown job name', async () => {
    const { processor, dataRequests } = start();
    await expect(processor({ name: 'order.confirmed', data: { orderId: 'o1' } })).rejects.toThrow(
      'Unknown DPDP job order.confirmed',
    );
    expect(dataRequests.processExport).not.toHaveBeenCalled();
    expect(dataRequests.processDeletion).not.toHaveBeenCalled();
  });
});
