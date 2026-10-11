import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  OTHER_REASON_MIN_CHARS,
  clampRefund,
  findReturnReason,
  reasonComments,
  returnReasonRequiresPhotos,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { InventoryService } from '../catalogue/inventory.service';
import { PaymentService } from '../checkout/payment.service';
import { WalletService } from '../engagement/wallet.service';
import { codReturnCredit } from './cod-return-credit';
import { RETURN_MEDIA_FOLDER, isOwnReturnImageUrl } from './return-images';

type ReturnResolution = 'refund_source' | 'refund_wallet' | 'replace';

/** Payment states that mean money was taken online (mirrors the storefront's "prepaid"). */
const SETTLED_PAYMENT_STATUSES = ['captured', 'refunded', 'partially_refunded'];

/** A return being marked received, with its order (as loaded by adminUpdate). */
interface ReceivedReturn {
  id: string;
  orderId: string;
  resolution: string;
  items: { orderItemId: string; quantity: number }[];
  order: {
    customerId: string;
    status: string;
    grandTotal: number;
    shipping: number;
    codFee: number;
    items: { id: string; variantId: string; unitPrice: number; quantity: number }[];
    payments: { provider: string; status: string; amount: number }[];
  };
}

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
      include: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) throw new ForbiddenException('Not your order');
    if (order.status !== 'delivered') throw new BadRequestException('Only delivered orders can be returned');

    // Same reason/resolution rules as the storefront return form.
    const reasonDef = findReturnReason(input.reasonCode) ?? findReturnReason(input.reason);
    if (input.resolution === 'replace' && !reasonDef?.allowReplace) {
      throw new BadRequestException('Replacement is not available for this return reason');
    }
    const prepaid = order.payments.some(
      (p) => p.provider !== 'cod' && p.method !== 'cod' && SETTLED_PAYMENT_STATUSES.includes(p.status),
    );
    if (input.resolution === 'refund_source' && !prepaid) {
      throw new BadRequestException('Refund to the original payment method is available only for prepaid orders');
    }
    if (reasonDef?.commentRequired && reasonComments(reasonDef, input.reason).length < OTHER_REASON_MIN_CHARS) {
      throw new BadRequestException(`Please describe the issue (at least ${OTHER_REASON_MIN_CHARS} characters)`);
    }

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
        // No gateway payment to refund (e.g. COD): default to the wallet.
        resolution: input.resolution ?? (prepaid ? 'refund_source' : 'refund_wallet'),
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

  private async processReceived(ret: ReceivedReturn): Promise<void> {
    // Restock the returned quantities.
    let refundAmount = 0;
    for (const ri of ret.items) {
      const orderItem = ret.order.items.find((oi) => oi.id === ri.orderItemId);
      if (!orderItem) continue;
      await this.inventory.adjust(orderItem.variantId, ri.quantity, `return:${ret.id}`);
      refundAmount += orderItem.unitPrice * ri.quantity;
    }

    const captured = ret.order.payments.find((p) => p.status === 'captured');

    // COD: no gateway payment exists, so the refund always goes to the wallet.
    if (!captured && ret.order.payments.some((p) => p.provider === 'cod')) {
      await this.processCodReceived(ret);
      return;
    }

    const capturedAmount = captured?.amount ?? 0;
    const toRefund = clampRefund(refundAmount, capturedAmount);
    const refunds =
      (ret.resolution === 'refund_source' && toRefund > 0 && Boolean(captured)) ||
      (ret.resolution === 'refund_wallet' && toRefund > 0);

    // 'refunded' only when money is actually returned.
    await this.prisma.returnRequest.update({
      where: { id: ret.id },
      data: { status: refunds ? 'refunded' : 'received' },
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

  /**
   * COD return received: once the order was delivered (cash collected), credit
   * the returned items' share to the wallet (ref `return:<id>`, idempotent),
   * capped by what is left after earlier credits for the order. The return is
   * marked 'refunded' only when a credit exists for it.
   */
  private async processCodReceived(ret: ReceivedReturn): Promise<void> {
    const ref = `return:${ret.id}`;
    const delivered = ret.order.status === 'delivered' || ret.order.status === 'returned';
    let credited = false;

    if (ret.resolution !== 'replace' && delivered) {
      const others = await this.prisma.returnRequest.findMany({
        where: { orderId: ret.orderId, id: { not: ret.id } },
        include: { items: true },
      });
      const entries = await this.prisma.walletEntry.findMany({
        where: { customerId: ret.order.customerId, ref: { in: [ref, ...others.map((o) => `return:${o.id}`)] } },
        select: { ref: true, delta: true },
      });
      if (entries.some((e) => e.ref === ref)) {
        credited = true; // Already credited on an earlier run: never credit twice.
      } else {
        const amount = codReturnCredit({
          grandTotal: ret.order.grandTotal,
          shipping: ret.order.shipping,
          codFee: ret.order.codFee,
          items: ret.order.items,
          returning: ret.items,
          previouslyRefunded: others.filter((o) => o.status === 'refunded').flatMap((o) => o.items),
          alreadyCredited: entries.reduce((s, e) => s + Math.max(0, e.delta), 0),
        });
        if (amount > 0) {
          await this.wallet.earn(ret.order.customerId, amount, 'return_refund', ref);
          credited = true;
        }
      }
    }

    await this.prisma.returnRequest.update({
      where: { id: ret.id },
      data: { status: credited ? 'refunded' : 'received' },
    });
  }
}
