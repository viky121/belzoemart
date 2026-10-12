import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { QUEUES } from '../../common/queue/queue.constants';

/**
 * DPDP Act flows (BR-13, BR-14, NFR-2.2): a customer can request an export of
 * their personal data or deletion of their account. Both create a DataRequest
 * and enqueue an async job; the worker performs the heavy compilation /
 * anonymisation so the request returns quickly.
 */
@Injectable()
export class DataRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async requestExport(customerId: string): Promise<{ jobId: string }> {
    const req = await this.prisma.dataRequest.create({
      data: { customerId, type: 'export' },
    });
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'dpdp.export', {
      dataRequestId: req.id,
      customerId,
    });
    return { jobId: req.id };
  }

  async requestDeletion(customerId: string): Promise<{ jobId: string }> {
    const req = await this.prisma.dataRequest.create({
      data: { customerId, type: 'deletion' },
    });
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'dpdp.deletion', {
      dataRequestId: req.id,
      customerId,
    });
    return { jobId: req.id };
  }

  status(customerId: string) {
    return this.prisma.dataRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deletion processing (BR-14): anonymise PII while preserving legally-required
   * order/invoice records. In U2 (no orders yet) this scrubs the customer's
   * direct PII and marks the request completed. U5 extends this to keep order
   * history under an anonymised customer reference.
   */
  async processDeletion(dataRequestId: string): Promise<void> {
    const req = await this.prisma.dataRequest.findUnique({ where: { id: dataRequestId } });
    if (!req) throw new NotFoundException('Data request not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.dataRequest.update({ where: { id: dataRequestId }, data: { status: 'processing' } });
      await tx.address.deleteMany({ where: { customerId: req.customerId } });
      await tx.customer.update({
        where: { id: req.customerId },
        data: {
          name: 'Deleted User',
          email: null,
          phone: null,
          passwordHash: null,
          gender: null,
          dob: null,
          photoUrl: null,
          status: 'blocked',
        },
      });
      // End every live session of the deleted account (refresh rotation is
      // also rejected for blocked customers in TokenService.rotate).
      await tx.refreshToken.updateMany({
        where: { principalId: req.customerId, principalKind: 'customer', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.dataRequest.update({
        where: { id: dataRequestId },
        data: { status: 'completed', completedAt: new Date() },
      });
    });
  }

  /**
   * Export processing (BR-13): compile the customer's data into a document and
   * attach a result URL. In U2 the payload is the profile + addresses; storage
   * upload is wired via the storage port in U3+. Here we mark completed with an
   * inline data URL placeholder.
   */
  async processExport(dataRequestId: string): Promise<void> {
    const req = await this.prisma.dataRequest.findUnique({ where: { id: dataRequestId } });
    if (!req) throw new NotFoundException('Data request not found');
    const [customer, addresses] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: req.customerId } }),
      this.prisma.address.findMany({ where: { customerId: req.customerId } }),
    ]);
    const payload = JSON.stringify({ customer, addresses }, null, 2);
    const resultUrl = `data:application/json;base64,${Buffer.from(payload).toString('base64')}`;
    await this.prisma.dataRequest.update({
      where: { id: dataRequestId },
      data: { status: 'completed', resultUrl, completedAt: new Date() },
    });
  }
}
