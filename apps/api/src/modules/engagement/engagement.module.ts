import { Module } from '@nestjs/common';
import { SmsModule } from '../../integrations/sms/sms.module';
import { NotificationsIntegrationModule } from '../../integrations/notifications/notifications-integration.module';
import { WishlistService } from './wishlist.service';
import { WalletService } from './wallet.service';
import { ReferralService } from './referral.service';
import { ReviewService } from './review.service';
import { QnaService } from './qna.service';
import { NotificationService } from './notification.service';
import { CmsService } from './cms.service';
import { AbandonedCartService } from './abandoned-cart.service';
import { EngagementController } from './engagement.controller';
import { PublicEngagementController } from './public-engagement.controller';
import { AdminEngagementController } from './admin-engagement.controller';

/**
 * Engagement domain module (U6): wishlist, reviews/Q&A, wallet/referrals,
 * notifications, CMS. Exports WalletService so U5 returns can credit wallet
 * refunds (refund_wallet resolution).
 */
@Module({
  imports: [SmsModule, NotificationsIntegrationModule],
  controllers: [EngagementController, PublicEngagementController, AdminEngagementController],
  providers: [
    WishlistService,
    WalletService,
    ReferralService,
    ReviewService,
    QnaService,
    NotificationService,
    CmsService,
    AbandonedCartService,
  ],
  exports: [WalletService],
})
export class EngagementModule {}
