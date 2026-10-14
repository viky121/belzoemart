import { Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * CMS pages + banners (FR-10.3, FR-10.7, FR-13.6). Public reads; admin writes
 * (guarded at the controller). Legal pages (terms, privacy, returns, shipping)
 * are seeded and editable here.
 */
@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPage(slug: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (!page || !page.isActive) throw new NotFoundException('Page not found');
    return page;
  }

  listPages() {
    return this.prisma.cmsPage.findMany({ where: { isActive: true }, select: { slug: true, title: true } });
  }

  upsertPage(input: { slug?: string; title: string; body: string; isActive?: boolean }) {
    const slug = input.slug ?? slugify(input.title);
    return this.prisma.cmsPage.upsert({
      where: { slug },
      update: { title: input.title, body: input.body, isActive: input.isActive ?? true },
      create: { slug, title: input.title, body: input.body, isActive: input.isActive ?? true },
    });
  }

  activeBanners(placement: string) {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        placement,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  upsertBanner(input: {
    id?: string;
    placement: string;
    imageUrl: string;
    linkUrl?: string;
    title?: string;
    displayOrder?: number;
    endsAt?: string;
  }) {
    const data = {
      placement: input.placement,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl,
      title: input.title,
      displayOrder: input.displayOrder ?? 0,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    };
    if (input.id) return this.prisma.banner.update({ where: { id: input.id }, data });
    return this.prisma.banner.create({ data });
  }

  async deleteBanner(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    await this.prisma.banner.delete({ where: { id } });
    return { deleted: true };
  }
}
