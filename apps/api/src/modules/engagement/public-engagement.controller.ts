import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { ReviewService } from './review.service';
import { QnaService } from './qna.service';
import { CmsService } from './cms.service';

/**
 * Public engagement reads (FR-3.8, FR-3.9, FR-10.3, FR-10.7): approved product
 * reviews, product Q&A, CMS pages, and active banners.
 */
@ApiTags('public-engagement')
@Controller()
export class PublicEngagementController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly qna: QnaService,
    private readonly cms: CmsService,
  ) {}

  @Public()
  @Get('products/:productId/reviews')
  productReviews(@Param('productId') productId: string) {
    return this.reviews.listApproved(productId);
  }

  @Public()
  @Get('products/:productId/questions')
  productQuestions(@Param('productId') productId: string) {
    return this.qna.listForProduct(productId);
  }

  @Public()
  @Get('cms/pages')
  cmsPages() {
    return this.cms.listPages();
  }

  @Public()
  @Get('cms/pages/:slug')
  cmsPage(@Param('slug') slug: string) {
    return this.cms.getPage(slug);
  }

  @Public()
  @Get('banners')
  banners(@Query('placement') placement = 'home_hero') {
    return this.cms.activeBanners(placement);
  }
}
