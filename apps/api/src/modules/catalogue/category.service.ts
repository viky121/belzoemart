import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { slugify, type CategoryNodeDto } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Category management (FR-2.2, FR-8.1). Supports an unlimited-depth tree with
 * cycle prevention (BR-2) and unique slugs (BR-1).
 */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Build the active category tree (nested). */
  async tree(): Promise<CategoryNodeDto[]> {
    const all = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    const byParent = new Map<string | null, typeof all>();
    for (const c of all) {
      const key = c.parentId;
      const list = byParent.get(key) ?? [];
      list.push(c);
      byParent.set(key, list);
    }
    const build = (parentId: string | null): CategoryNodeDto[] =>
      (byParent.get(parentId) ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl,
        children: build(c.id),
      }));
    return build(null);
  }

  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name) || 'category';
    let slug = base;
    let n = 1;
    for (;;) {
      const existing = await this.prisma.category.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${++n}`;
    }
  }

  /** True if `candidateParentId` is `categoryId` or one of its descendants. */
  private async wouldCreateCycle(categoryId: string, candidateParentId: string): Promise<boolean> {
    let cursor: string | null = candidateParentId;
    while (cursor) {
      if (cursor === categoryId) return true;
      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
    return false;
  }

  async upsert(input: {
    id?: string;
    name: string;
    parentId?: string | null;
    imageUrl?: string;
    displayOrder?: number;
    seoTitle?: string;
    seoDescription?: string;
  }) {
    if (input.id && input.parentId) {
      if (input.parentId === input.id) throw new BadRequestException('A category cannot be its own parent');
      if (await this.wouldCreateCycle(input.id, input.parentId)) {
        throw new BadRequestException('Moving this category would create a cycle');
      }
    }
    const slug = await this.uniqueSlug(input.name, input.id);
    if (input.id) {
      const existing = await this.prisma.category.findUnique({ where: { id: input.id } });
      if (!existing) throw new NotFoundException('Category not found');
      return this.prisma.category.update({
        where: { id: input.id },
        data: {
          name: input.name,
          slug,
          parentId: input.parentId ?? null,
          imageUrl: input.imageUrl,
          displayOrder: input.displayOrder ?? existing.displayOrder,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
        },
      });
    }
    return this.prisma.category.create({
      data: {
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        imageUrl: input.imageUrl,
        displayOrder: input.displayOrder ?? 0,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      },
    });
  }

  /** Delete a category. Guards against orphaning sub-categories or products. */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { children: true, products: true } } },
    });
    if (!cat) throw new NotFoundException('Category not found');
    if (cat._count.children > 0) {
      throw new BadRequestException('Remove or move the sub-categories first');
    }
    if (cat._count.products > 0) {
      throw new BadRequestException('This category has products — reassign them first');
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  /** All descendant ids (inclusive) — used to filter products by category subtree. */
  async descendantIds(categoryId: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();
    for (const c of all) {
      if (c.parentId) {
        const list = children.get(c.parentId) ?? [];
        list.push(c.id);
        children.set(c.parentId, list);
      }
    }
    const result: string[] = [];
    const stack = [categoryId];
    while (stack.length) {
      const id = stack.pop()!;
      result.push(id);
      stack.push(...(children.get(id) ?? []));
    }
    return result;
  }
}
