import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Ratings & reviews (FR-3.8, BR-2, BR-3). Reviews are marked verified-purchase
 * when the customer has a delivered order containing the product, start in
 * `pending`, and only appear publicly once `approved`. Approving/rejecting
 * recomputes the product's denormalised rating from approved reviews.
 */
@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** True if the customer has a delivered order containing this product. */
  private async hasPurchased(customerId: string, productId: string): Promise<boolean> {
    const variants = await this.prisma.variant.findMany({
      where: { productId },
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);
    if (variantIds.length === 0) return false;
    const count = await this.prisma.order.count({
      where: {
        customerId,
        status: 'delivered',
        items: { some: { variantId: { in: variantIds } } },
      },
    });
    return count > 0;
  }

  async add(
    customerId: string,
    input: { productId: string; rating: number; title?: string; body: string; images?: string[] },
  ) {
    if (input.rating < 1 || input.rating > 5) throw new BadRequestException('Rating must be 1-5');
    const verifiedPurchase = await this.hasPurchased(customerId, input.productId);
    return this.prisma.review.create({
      data: {
        productId: input.productId,
        customerId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        imagesJson: input.images ?? [],
        verifiedPurchase,
        status: 'pending',
      },
    });
  }

  /** Public: approved reviews for a product. */
  listApproved(productId: string) {
    return this.prisma.review.findMany({
      where: { productId, status: 'approved' },
      orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async voteHelpful(reviewId: string) {
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });
  }

  /** Admin moderation (BR-2) + rating recompute (BR-3). */
  async moderate(reviewId: string, action: 'approve' | 'reject') {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: action === 'approve' ? 'approved' : 'rejected' },
    });
    await this.recomputeRating(review.productId);
    return { reviewId, status: action === 'approve' ? 'approved' : 'rejected' };
  }

  /** Recompute Product.ratingAvg/ratingCount from approved reviews (BR-3). */
  private async recomputeRating(productId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { productId, status: 'approved' },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count,
      },
    });
  }

  pendingForModeration() {
    return this.prisma.review.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Admin: all reviews (optionally filtered by status), newest first, each
   * enriched with its product's title/slug for context in the moderation UI.
   */
  async listForAdmin(status?: 'pending' | 'approved' | 'rejected') {
    const reviews = await this.prisma.review.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
    });
    const productIds = [...new Set(reviews.map((r) => r.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return reviews.map((r) => ({ ...r, product: byId.get(r.productId) ?? null }));
  }
}
