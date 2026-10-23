import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { WishlistService } from './wishlist.service';
import { WalletService } from './wallet.service';
import { ReferralService } from './referral.service';
import { ReviewService } from './review.service';
import { QnaService } from './qna.service';
import { NotificationService } from './notification.service';
import { CmsService } from './cms.service';

const reviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(2000),
  images: z.array(z.string().url()).max(6).optional(),
});
class ReviewDto extends createZodDto(reviewSchema) {}

const questionSchema = z.object({ productId: z.string().uuid(), body: z.string().trim().min(1).max(500) });
class QuestionDto extends createZodDto(questionSchema) {}

const wishlistSchema = z.object({ variantId: z.string().uuid() });
class WishlistDto extends createZodDto(wishlistSchema) {}

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100) });
class MarkReadDto extends createZodDto(markReadSchema) {}

/**
 * Customer engagement endpoints (FR-3.8-3.10, FR-6). Authenticated; scoped to
 * the caller. Public product review/Q&A reads live in the public controller.
 */
@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(
    private readonly wishlist: WishlistService,
    private readonly wallet: WalletService,
    private readonly referrals: ReferralService,
    private readonly reviews: ReviewService,
    private readonly qna: QnaService,
    private readonly notifications: NotificationService,
  ) {}

  // Wishlist
  @Get('wishlist')
  listWishlist(@CurrentUser() user: JwtPrincipal) {
    return this.wishlist.list(user.sub);
  }
  @Post('wishlist')
  addWishlist(@CurrentUser() user: JwtPrincipal, @Body() dto: WishlistDto) {
    return this.wishlist.add(user.sub, dto.variantId);
  }
  @Delete('wishlist/:variantId')
  removeWishlist(@CurrentUser() user: JwtPrincipal, @Param('variantId') variantId: string) {
    return this.wishlist.remove(user.sub, variantId);
  }

  // Wallet
  @Get('wallet')
  async walletBalance(@CurrentUser() user: JwtPrincipal) {
    return { balance: await this.wallet.getBalance(user.sub) };
  }
  @Get('wallet/ledger')
  walletLedger(@CurrentUser() user: JwtPrincipal) {
    return this.wallet.ledger(user.sub);
  }

  // Referral
  @Get('referral/code')
  async referralCode(@CurrentUser() user: JwtPrincipal) {
    return { code: await this.referrals.getOrCreateCode(user.sub) };
  }

  // Reviews & Q&A (write)
  @Post('reviews')
  addReview(@CurrentUser() user: JwtPrincipal, @Body() dto: ReviewDto) {
    return this.reviews.add(user.sub, dto);
  }
  @Post('reviews/:id/helpful')
  voteHelpful(@Param('id') id: string) {
    return this.reviews.voteHelpful(id);
  }
  @Post('questions')
  ask(@CurrentUser() user: JwtPrincipal, @Body() dto: QuestionDto) {
    return this.qna.ask(user.sub, dto.productId, dto.body);
  }

  // Notifications
  @Get('notifications')
  listNotifications(@CurrentUser() user: JwtPrincipal) {
    return this.notifications.listInApp(user.sub);
  }
  @Post('notifications/read')
  markRead(@CurrentUser() user: JwtPrincipal, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user.sub, dto.ids);
  }
}
