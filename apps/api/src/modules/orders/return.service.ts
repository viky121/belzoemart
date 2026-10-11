import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { clampRefund, findReturnReason, returnReasonRequiresPhotos } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { InventoryService } from '../catalogue/inventory.service';
import { PaymentService } from '../checkout/payment.service';
import { WalletService } from '../engagement/wallet.service';
import { RETURN_MEDIA_FOLDER, isOwnReturnImageUrl } from './return-images';

type ReturnResolution = 'refund_source' | 'refund_wallet' | 'replace';

/**
 * Returns & refunds (BR-9, BR-10, BR-11, FR-5.5, FR-5.6). A return can be
 * requested only for delivered orders; on receipt, stock is restocked and a
 * refund is initiated (clamped to the captured amount).
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly wallet: WalletService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Customer requests a return for a delivered order (BR-9). Validates that the
   * items/quantities belong to the order and are not already being returned,
   * that photos are attached for defect-type reasons, and that every photo was
   * uploaded through the return-photo endpoint.
   */
  async request(
    customerId: string,
    input: {
      orderId: string;
      reason: string;
      reasonCode?: string;
      images?: string[];
      resolution?: ReturnResolution;
      items?: { orderItemId: string; quantity: number }[];
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) throw new ForbiddenException('Not your order');
    if (order.status !== 'delivered') throw new BadRequestException('Only delivered orders can be returned');

    if (input.items) {
      const ids = new Set<string>();
      for (const it of input.items) {
        if (ids.has(it.orderItemId)) throw new BadRequestException('Each item can be listed only once');
        ids.add(it.orderItemId);
        if (!order.items.some((oi) => oi.id === it.orderItemId)) {
          throw new BadRequestException('Item does not belong to this order');
        }
      }
    }
    const items = input.items ?? order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));

    // Quantity still returnable = ordered − already requested in non-rejected returns.
    const previous = await this.prisma.returnRequest.findMany({
      where: { orderId: order.id, status: { not: 'rejected' } },
      include: { items: true },
    });
    const alreadyRequested = new Map<string, number>();
    for (const r of previous) {
      for (const ri of r.items) {
        alreadyRequested.set(ri.orderItemId, (alreadyRequested.get(ri.orderItemId) ?? 0) + ri.quantity);
      }
    }
    for (const it of items) {
      const orderItem = order.items.find((oi) => oi.id === it.orderItemId)!;
      const remaining = Math.max(0, orderItem.quantity - (alreadyRequested.get(it.orderItemId) ?? 0));
      if (it.quantity > remaining) {
        throw new BadRequestException(`Only ${remaining} of "${orderItem.title}" can still be returned`);
      }
    }

    // Reject if any returned line belongs to a non-returnable product (e.g. food).
    const returningItemIds = new Set(items.map((it) => it.orderItemId));
    const variantIds = order.items
      .filter((i) => returningItemIds.has(i.id))
      .map((i) => i.variantId);
    if (variantIds.length > 0) {
      const variants = await this.prisma.variant.findMany({
        where: { id: { in: variantIds } },
        select: { product: { select: { title: true, isReturnable: true } } },
      });
      const blocked = variants.find((v) => v.product && !v.product.isReturnable);
      if (blocked) {
        throw new BadRequestException(
          `"${blocked.product!.title}" is non-returnable and cannot be returned`,
        );
      }
    }

    // Photos: required for defect-type reasons (stricter of code and text wins),
    // and only URLs produced by the return-photo upload are accepted.
    const images = [...new Set((input.images ?? []).map((u) => u.trim()).filter(Boolean))];
    if (images.length === 0 && returnReasonRequiresPhotos({ reasonCode: input.reasonCode, reason: input.reason })) {
      const label =
        findReturnReason(input.reasonCode)?.label ?? findReturnReason(input.reason)?.label ?? input.reason;
      throw new BadRequestException(
        `Please add at least one photo of the product - photos are required for "${label}" returns`,
      );
    }
    const prefix = this.storage.getUrl(`${RETURN_MEDIA_FOLDER}/`);
    if (images.some((u) => !isOwnReturnImageUrl(u, prefix))) {
      throw new BadRequestException('Invalid photo - please upload photos using the return form');
    }

    return this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        customerId,
        reason: input.reason,
        imagesJson: images,
        resolution: input.resolution ?? 'refund_source',
        items: { create: items.map((it) => ({ orderItemId: it.orderItemId, quantity: it.quantity })) },
      },
      include: { items: true },
    });
  }

  /** All return requests for admin moderation, newest first. */
  adminList() {
    return this.prisma.returnRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        order: { select: { id: true, grandTotal: true, status: true } },
      },
    });
  }

  listForCustomer(customerId: string) {
    return this.prisma.returnRequest.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin advances a return; on `received`, restock + refund (BR-10). */
  async adminUpdate(returnId: string, status: 'approved' | 'picked' | 'received' | 'rejected') {
    const ret = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { items: true, order: { include: { items: true, payments: true } } },
    });
    if (!ret) throw new NotFoundException('Return not found');

    if (status === 'received') {
      await this.processReceived(ret);
      return this.prisma.returnRequest.findUnique({ where: { id: returnId }, include: { items: true } });
    }
    return this.prisma.returnRequest.update({ where: { id: returnId }, data: { status } });
  }

  private async processReceived(ret: {
    id: string;
    orderId: string;
    resolution: string;
    items: { orderItemId: string; quantity: number }[];
    order: {
      grandTotal: number;
      items: { id: string; variantId: string; unitPrice: number; quantity: number }[];
      payments: { status: string; amount: number }[];
    };
  }): Promise<void> {
    // Restock the returned quantities.
    let refundAmount = 0;
    for (const ri of ret.items) {
      const orderItem = ret.order.items.find((oi) => oi.id === ri.orderItemId);
      if (!orderItem) continue;
      await this.inventory.adjust(orderItem.variantId, ri.quantity, `return:${ret.id}`);
      refundAmount += orderItem.unitPrice * ri.quantity;
    }

    const captured = ret.order.payments.find((p) => p.status === 'captured');
    const capturedAmount = captured?.amount ?? 0;
    const toRefund = clampRefund(refundAmount, capturedAmount);

    await this.prisma.returnRequest.update({
      where: { id: ret.id },
      data: { status: ret.resolution === 'replace' ? 'received' : 'refunded' },
    });

    if (ret.resolution === 'refund_source' && toRefund > 0 && captured) {
      await this.payments.refund(ret.orderId, toRefund);
    } else if (ret.resolution === 'refund_wallet' && toRefund > 0) {
      // Credit the refund to the customer's wallet (idempotent by return id).
      await this.wallet.earn(
        (await this.prisma.order.findUnique({ where: { id: ret.orderId } }))!.customerId,
        toRefund,
        'return_refund',
        `return:${ret.id}`,
      );
    }
  }
}
