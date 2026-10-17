import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CMS_SLUG_RE } from '@belzo/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { createZodDto } from '../identity/zod-dto';
import { ReviewService } from './review.service';
import { CmsService } from './cms.service';

const moderateSchema = z.object({ action: z.enum(['approve', 'reject']) });
class ModerateDto extends createZodDto(moderateSchema) {}

const pageSchema = z.object({
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(CMS_SLUG_RE, 'Use lowercase letters, numbers and single hyphens, e.g. refund-policy')
    .optional(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(60_000),
  isActive: z.boolean().optional(),
});
class PageDto extends createZodDto(pageSchema) {}

const pageActiveSchema = z.object({ isActive: z.boolean() });
class PageActiveDto extends createZodDto(pageActiveSchema) {}

const bannerSchema = z.object({
  id: z.string().uuid().optional(),
  placement: z.string().trim().min(1).max(40),
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .refine((s) => /^https?:\/\//.test(s) || s.startsWith('/'), 'Must be a URL or an app path'),
  linkUrl: z
    .string()
    .trim()
    .min(1)
    .refine((s) => /^https?:\/\//.test(s) || s.startsWith('/'), 'Must be a URL or an app path')
    .optional(),
  title: z.string().trim().max(120).optional(),
  displayOrder: z.number().int().optional(),
  endsAt: z.string().datetime().optional(),
});
class BannerDto extends createZodDto(bannerSchema) {}

/**
 * Admin engagement management (FR-3.8 moderation, FR-10.3/10.7 CMS). Review
 * moderation is allowed for support; CMS/banner writes for marketing
 * (super_admin implicitly). Server-side RBAC (SECURITY-08).
 */
@ApiTags('admin-engagement')
@ApiBearerAuth()
@Controller('admin')
export class AdminEngagementController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly cms: CmsService,
  ) {}

  @Roles('support')
  @Get('reviews/pending')
  pending() {
    return this.reviews.pendingForModeration();
  }

  @Roles('support')
  @Get('reviews')
  list(@Query('status') status?: string) {
    const valid =
      status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined;
    return this.reviews.listForAdmin(valid);
  }

  @Roles('support')
  @Patch('reviews/:id/moderate')
  moderate(@Param('id') id: string, @Body() dto: ModerateDto) {
    return this.reviews.moderate(id, dto.action);
  }

  /** All pages (including disabled) with their text, for the Pages editor. */
  @Roles('marketing')
  @Get('cms/pages')
  listPages() {
    return this.cms.listAll();
  }

  @Roles('marketing')
  @Post('cms/pages')
  upsertPage(@Body() dto: PageDto) {
    return this.cms.upsertPage(dto);
  }

  /** Enable (visible on the website and app) or disable a page. */
  @Roles('marketing')
  @Patch('cms/pages/:slug/active')
  setPageActive(@Param('slug') slug: string, @Body() dto: PageActiveDto) {
    return this.cms.setActive(slug, dto.isActive);
  }

  @Roles('marketing')
  @Post('banners')
  upsertBanner(@Body() dto: BannerDto) {
    return this.cms.upsertBanner(dto);
  }

  @Roles('marketing')
  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.cms.deleteBanner(id);
  }
}
