import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  assignParentSkus,
  groupSheetRows,
  type SheetCategoryOption,
  type SheetExport,
  type SheetGroup,
  type SheetImportResult,
  type SheetIssue,
  type SheetRowInput,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductService } from './product.service';
import { categoryLabels, type CategoryRef } from './category-match';
import {
  hasVariantCells,
  planProductGroup,
  toSheetExportRows,
  type PlanContext,
  type PlanVariant,
  type ProductPlan,
} from './bulk-sheet.plan';

/** Parent-SKU derivation over every product (design §6a step 4), built lazily once per request. */
interface DerivedSkus {
  /** productId -> saved or derived Parent SKU. */
  parentSkuOf: Map<string, string>;
  /** Derived Parent SKU -> productId, for products whose sku is null. */
  productOfDerivedSku: Map<string, string>;
  titleOf: Map<string, string>;
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/**
 * Bulk Excel sheet import/export (design §5–§7). The browser parses the
 * workbook; this service groups the posted rows, matches each product group to
 * the catalogue, plans it with the pure planner and writes each group in its
 * own transaction. Export returns JSON rows the browser turns into the .xlsx.
 */
@Injectable()
export class BulkSheetService {
  private readonly logger = new Logger('BulkSheetService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
  ) {}

  // -------------------------------------------------------------------------
  // Shared queries
  // -------------------------------------------------------------------------

  private async loadDerived(): Promise<DerivedSkus> {
    const all = await this.prisma.product.findMany({
      select: {
        id: true,
        slug: true,
        sku: true,
        title: true,
        createdAt: true,
        variants: { select: { sku: true, isActive: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const parentSkuOf = assignParentSkus(
      all.map((p) => ({
        id: p.id,
        slug: p.slug,
        sku: p.sku,
        activeSkus: p.variants.filter((v) => v.isActive).map((v) => v.sku),
        allSkus: p.variants.map((v) => v.sku),
      })),
    );
    const productOfDerivedSku = new Map<string, string>();
    const titleOf = new Map<string, string>();
    for (const p of all) {
      titleOf.set(p.id, p.title);
      const derived = parentSkuOf.get(p.id);
      if (p.sku === null && derived !== undefined) productOfDerivedSku.set(derived, p.id);
    }
    return { parentSkuOf, productOfDerivedSku, titleOf };
  }

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------

  async importRows(
    rows: SheetRowInput[],
    opts: { weightUnit?: 'g' | 'kg' } = {},
  ): Promise<SheetImportResult> {
    const { groups, issues } = groupSheetRows(rows);
    const result: SheetImportResult = {
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      issues,
    };
    const allCats: CategoryRef[] = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true, isActive: true },
    });
    let derived: DerivedSkus | null = null;
    const getDerived = async (): Promise<DerivedSkus> => (derived ??= await this.loadDerived());

    for (const group of groups) {
      await this.importGroup(group, allCats, getDerived, opts.weightUnit ?? null, result);
    }

    const errors = result.issues.filter((i) => i.level === 'error').length;
    this.logger.log(
      `bulk-sheet import: ${groups.length} groups, ${result.productsCreated} created, ${result.productsUpdated} updated, ${errors} errors`,
    );
    return result;
  }

  /** ` (did you mean X?)` when a Parent SKU differing only in letter case exists, else ''. */
  private async caseHint(P: string, getDerived: () => Promise<DerivedSkus>): Promise<string> {
    const other = await this.caseTwin(P, getDerived);
    return other ? ` (did you mean ${other}?)` : '';
  }

  private async caseTwin(P: string, getDerived: () => Promise<DerivedSkus>): Promise<string | null> {
    const hit = await this.prisma.product.findFirst({
      where: { sku: { equals: P, mode: 'insensitive' } },
      select: { sku: true },
    });
    if (hit?.sku && hit.sku !== P) return hit.sku;
    const lower = P.toLowerCase();
    const d = await getDerived();
    for (const k of d.productOfDerivedSku.keys()) {
      if (k !== P && k.toLowerCase() === lower) return k;
    }
    return null;
  }

  private async importGroup(
    group: SheetGroup,
    allCats: CategoryRef[],
    getDerived: () => Promise<DerivedSkus>,
    weightUnitHint: 'g' | 'kg' | null,
    result: SheetImportResult,
  ): Promise<void> {
    const P = group.key;
    const issues = result.issues;
    const childSkus = group.children.map((c) => (c.sku ?? '').trim());
    const groupRows = [
      ...(group.parent ? [{ row: group.parent.row, sku: P }] : []),
      ...group.children.map((c, i) => ({ row: c.row, sku: childSkus[i]! })),
    ];
    const groupError = async (message: string, hint = false): Promise<void> => {
      const text = hint ? message + (await this.caseHint(P, getDerived)) : message;
      for (const r of groupRows) issues.push({ row: r.row, sku: r.sku, level: 'error', message: text });
    };

    // ---- 6a. Match the target product ------------------------------------
    let targetId: string | null = null;
    let derivedOnly = false;

    const byParentSku = await this.prisma.product.findUnique({ where: { sku: P }, select: { id: true } });
    if (byParentSku) targetId = byParentSku.id;

    if (!targetId && group.children.length > 0) {
      // Step 2: the group's existing Child SKUs.
      const found = await this.prisma.variant.findMany({
        where: { sku: { in: childSkus } },
        select: { sku: true, productId: true, product: { select: { sku: true } } },
      });
      const ids = new Set(found.map((f) => f.productId));
      if (ids.size > 1) {
        return groupError('These Child SKUs belong to different products — split them by Parent SKU.');
      }
      const first = childSkus.map((s) => found.find((f) => f.sku === s)).find((f) => f !== undefined);
      if (first) {
        if (first.product.sku === null || first.product.sku === P) targetId = first.productId;
        else {
          return groupError(`SKU ${first.sku} already belongs to the product with Parent SKU ${first.product.sku}.`);
        }
      }
    }

    if (!targetId && group.children.length === 0) {
      // Step 3 (single-row form): P is the product's own variant SKU.
      const own = await this.prisma.variant.findUnique({
        where: { sku: P },
        select: {
          isActive: true,
          product: {
            select: {
              id: true,
              sku: true,
              title: true,
              _count: { select: { variants: { where: { isActive: true } } } },
            },
          },
        },
      });
      if (own) {
        const prod = own.product;
        if (prod.sku === null) {
          const active = prod._count.variants;
          if (active - (own.isActive ? 1 : 0) > 0) {
            const q = (await getDerived()).parentSkuOf.get(prod.id) ?? '';
            return groupError(
              `SKU ${P} is one of ${active} variants of "${prod.title}" — put it on a Child row with Parent SKU ${q}.`,
            );
          }
          targetId = prod.id;
        } else if (prod.sku === P) targetId = prod.id;
        else return groupError(`SKU ${P} already belongs to the product with Parent SKU ${prod.sku}.`);
      }
    }

    if (!targetId) {
      // Step 4: a legacy product's derived Parent SKU.
      const id = (await getDerived()).productOfDerivedSku.get(P);
      if (id) {
        targetId = id;
        derivedOnly = true;
      }
    }

    if (!targetId && group.children.length > 0) {
      const v = await this.prisma.variant.findUnique({
        where: { sku: P },
        select: { product: { select: { title: true } } },
      });
      if (v) {
        return groupError(
          `Parent SKU ${P} is already the SKU of a variant of "${v.product.title}" — use a different Parent SKU.`,
          true,
        );
      }
    }

    // Step 5: new product (needs its Parent row).
    if (!targetId && !group.parent) {
      const hint = await this.caseHint(P, getDerived);
      for (const r of groupRows) {
        issues.push({
          row: r.row,
          sku: r.sku,
          level: 'error',
          message: `Parent SKU ${P} was not found in this file or in the catalogue — add its Parent row.${hint}`,
        });
      }
      return;
    }

    // ---- Loads ------------------------------------------------------------
    const loaded = await this.prisma.variant.findMany({
      where: { sku: { in: [...new Set([...childSkus, P])] } },
      include: { inventory: true, product: { select: { id: true, sku: true, title: true } } },
    });
    const variantsBySku = new Map<string, PlanVariant>(loaded.map((v) => [v.sku, v]));

    if (targetId) {
      // Ownership check: every existing SKU of the group must belong to the target.
      const foreign = [...childSkus, P]
        .map((s) => variantsBySku.get(s))
        .find((v) => v !== undefined && v.productId !== targetId);
      if (foreign) {
        const q = (await getDerived()).parentSkuOf.get(foreign.productId) ?? '';
        return groupError(
          `SKU ${foreign.sku} belongs to "${foreign.product.title}" (Parent SKU ${q}), not to Parent SKU ${P} — fix the Parent SKU or the SKU.`,
          true,
        );
      }
      const ownsAny = [...childSkus, P].some((s) => variantsBySku.has(s));
      if (
        derivedOnly &&
        group.parent &&
        (group.children.length > 0 || hasVariantCells(group.parent)) &&
        !ownsAny
      ) {
        const title = (await getDerived()).titleOf.get(targetId) ?? '';
        return groupError(
          `Parent SKU ${P} is already the Parent SKU of "${title}". To add variants to it, upload them as Child rows without its Parent row, or include one of its existing Child rows; otherwise use a different Parent SKU.`,
          true,
        );
      }
    }

    const target = targetId
      ? await this.prisma.product.findUnique({
          where: { id: targetId },
          include: {
            images: { orderBy: { position: 'asc' } },
            brand: { select: { id: true, name: true } },
            _count: { select: { variants: { where: { isActive: true } } } },
          },
        })
      : null;
    if (targetId && !target) return groupError('Product not found — upload the file again.');

    // NIT 3: saving sku = P must not take another legacy product's derived Parent SKU.
    if (target && target.sku === null) {
      const d = await getDerived();
      const other = d.productOfDerivedSku.get(P);
      if (other !== undefined && other !== target.id) {
        return groupError(
          `Parent SKU ${P} is already the Parent SKU of "${d.titleOf.get(other) ?? ''}" — use a different Parent SKU.`,
          true,
        );
      }
    }

    // Parent-SKU clash for new variant SKUs (saved or derived Parent SKUs of other products).
    const variantSkus = group.children.length > 0 ? childSkus : [P];
    const newSkus = [...new Set(variantSkus.filter((s) => !variantsBySku.has(s)))];
    const parentSkuClash = new Map<string, string>();
    if (newSkus.length > 0) {
      const hits = await this.prisma.product.findMany({
        where: { sku: { in: newSkus } },
        select: { id: true, sku: true, title: true },
      });
      for (const h of hits) {
        if (h.sku && h.sku !== P && h.id !== targetId) parentSkuClash.set(h.sku, h.title);
      }
      const d = await getDerived();
      for (const s of newSkus) {
        if (s === P || parentSkuClash.has(s)) continue;
        const id = d.productOfDerivedSku.get(s);
        if (id !== undefined && id !== targetId) parentSkuClash.set(s, d.titleOf.get(id) ?? '');
      }
    }

    // Case-only near misses: warnings, reported with the plan on commit.
    const hintWarnings: SheetIssue[] = [];
    const newChildSkus = newSkus.filter((s) => group.children.length > 0 && childSkus.includes(s));
    if (newChildSkus.length > 0) {
      const twins = await this.prisma.variant.findMany({
        where: { OR: newChildSkus.map((s) => ({ sku: { equals: s, mode: 'insensitive' as const } })) },
        select: { sku: true },
      });
      for (const s of newChildSkus) {
        const twin = twins.find((t) => t.sku !== s && t.sku.toLowerCase() === s.toLowerCase());
        if (!twin) continue;
        for (const c of group.children) {
          if ((c.sku ?? '').trim() !== s) continue;
          hintWarnings.push({
            row: c.row,
            sku: s,
            level: 'warning',
            message: `A variant with SKU ${twin.sku} already exists (different letter case) — this row creates a new variant ${s}.`,
          });
        }
      }
    }
    if (!target && group.parent) {
      const twin = await this.caseTwin(P, getDerived);
      if (twin) {
        hintWarnings.push({
          row: group.parent.row,
          sku: P,
          level: 'warning',
          message: `A product with Parent SKU ${twin} already exists (different letter case) — this row creates a new product ${P}.`,
        });
      }
    }

    // ---- 6b. Plan ----------------------------------------------------------
    const derivedNow = await getDerived();
    const ctx: PlanContext = {
      product: target
        ? {
            id: target.id,
            sku: target.sku,
            title: target.title,
            description: target.description,
            categoryId: target.categoryId,
            brandId: target.brandId,
            hsnCode: target.hsnCode,
            taxRatePct: target.taxRatePct,
            attributesJson: target.attributesJson,
            images: target.images.map((i) => ({ url: i.url, alt: i.alt, position: i.position })),
            brand: target.brand,
            activeVariantCount: target._count.variants,
          }
        : null,
      variantsBySku,
      allCats,
      parentSkuOf: (id) => derivedNow.parentSkuOf.get(id),
      parentSkuClash,
      weightUnitHint,
    };
    const { plan, issues: planIssues } = planProductGroup(group, ctx);
    issues.push(...planIssues.filter((i) => i.level === 'error'));
    if (!plan) return;

    // ---- 6c. Execute -------------------------------------------------------
    try {
      await this.execute(plan, target?.images ?? []);
    } catch (err) {
      const { code, message } = this.failure(err);
      this.logger.warn(`bulk-sheet group ${P} failed: ${code ?? message}`);
      for (const r of plan.rows) {
        issues.push({ row: r.row, sku: r.sku, level: 'error', message: `Not saved: ${message}` });
      }
      return;
    }

    const plannedRows = new Set(plan.rows.map((r) => r.row));
    issues.push(...planIssues.filter((i) => i.level === 'warning'));
    issues.push(...hintWarnings.filter((w) => plannedRows.has(w.row)));
    if (plan.create) result.productsCreated += 1;
    else result.productsUpdated += 1;
    for (const v of plan.variants) {
      if (v.kind === 'create') result.variantsCreated += 1;
      else result.variantsUpdated += 1;
    }
  }

  /** User-facing message for a failed group transaction (NIT 11: P2002 by target). */
  private failure(err: unknown): { code?: string; message: string } {
    const e = (err ?? {}) as { code?: unknown; meta?: { target?: unknown } };
    const code = typeof e.code === 'string' ? e.code : undefined;
    if (code === 'P2002') {
      const target = e.meta?.target;
      const names = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
      if (names.some((n) => n.includes('sku'))) {
        return { code, message: 'SKU is already used by another product or variant.' };
      }
      if (names.some((n) => n.includes('slug'))) {
        return {
          code,
          message: 'Another product with the same title was saved at the same moment — upload the file again.',
        };
      }
    }
    return { code, message: err instanceof Error ? err.message : 'unknown error' };
  }

  /** §6c: brand + slug before the transaction, then one interactive transaction per group. */
  private async execute(plan: ProductPlan, existingImages: { url: string; alt: string }[]): Promise<void> {
    const brandId = plan.brandName
      ? (await this.products.findOrCreateBrandByName(plan.brandName)).id
      : undefined;
    const slug = plan.create ? await this.products.uniqueSlug(plan.create.title) : undefined;
    const P = plan.key;

    await this.prisma.$transaction(
      async (tx) => {
        let productId: string;
        if (plan.create && slug !== undefined) {
          const c = plan.create;
          const created = await tx.product.create({
            data: {
              title: c.title,
              slug,
              sku: P,
              categoryId: c.categoryId,
              brandId,
              description: c.description,
              hsnCode: c.hsnCode,
              taxRatePct: c.taxRatePct,
              attributesJson: json(c.attributesJson),
              isReturnable: true,
              status: 'published',
            },
          });
          productId = created.id;
        } else {
          productId = plan.productId as string;
          const data: Prisma.ProductUncheckedUpdateInput = {};
          const d = plan.data;
          if (d.title !== undefined) data.title = d.title;
          if (d.description !== undefined) data.description = d.description;
          if (d.categoryId !== undefined) data.categoryId = d.categoryId;
          if (d.hsnCode !== undefined) data.hsnCode = d.hsnCode;
          if (d.taxRatePct !== undefined) data.taxRatePct = d.taxRatePct;
          if (d.attributesJson !== undefined) data.attributesJson = json(d.attributesJson);
          if (brandId !== undefined) data.brandId = brandId;
          if (plan.saveSku) data.sku = P;
          if (Object.keys(data).length > 0) await tx.product.update({ where: { id: productId }, data });
        }

        for (const v of plan.variants) {
          if (v.kind === 'create') {
            const created = await tx.variant.create({
              data: {
                productId,
                sku: v.data.sku,
                mrp: v.data.mrp,
                sellingPrice: v.data.sellingPrice,
                costPrice: v.data.costPrice,
                weightGrams: v.data.weightGrams,
                attributesJson: json(v.data.attributesJson),
                priceSlabsJson: json(v.data.priceSlabsJson),
                imageUrl: v.data.imageUrl,
              },
            });
            await tx.inventory.create({ data: { variantId: created.id, available: v.stock } });
            if (v.stock > 0) {
              await tx.stockMovement.create({
                data: { variantId: created.id, delta: v.stock, reason: 'adjustment', ref: 'bulk-sheet' },
              });
            }
            continue;
          }

          const { attributesJson, priceSlabsJson, ...scalars } = v.data;
          const data: Prisma.VariantUncheckedUpdateInput = { ...scalars };
          if (attributesJson !== undefined) data.attributesJson = json(attributesJson);
          if (priceSlabsJson !== undefined) data.priceSlabsJson = json(priceSlabsJson);
          if (Object.keys(data).length > 0) await tx.variant.update({ where: { id: v.variantId }, data });

          if (v.stock !== null) {
            const inv = await tx.inventory.findUnique({ where: { variantId: v.variantId } });
            const previous = inv?.available ?? 0;
            if (v.stock !== previous) {
              await tx.inventory.upsert({
                where: { variantId: v.variantId },
                create: { variantId: v.variantId, available: v.stock },
                update: { available: v.stock },
              });
              await tx.stockMovement.create({
                data: {
                  variantId: v.variantId,
                  delta: v.stock - previous,
                  reason: 'adjustment',
                  ref: 'bulk-sheet',
                },
              });
            }
          }
        }

        if (plan.gallery) {
          await tx.productImage.deleteMany({ where: { productId } });
          for (const [position, url] of plan.gallery.entries()) {
            await tx.productImage.create({
              data: {
                productId,
                url,
                // NIT 9: a retained URL keeps its alt text.
                alt: existingImages.find((i) => i.url === url)?.alt ?? '',
                position,
              },
            });
          }
        }
      },
      { timeout: 20_000 },
    );
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  /** §7: every draft/published product as sheet rows, plus the leaf categories for the dropdown. */
  async exportSheet(): Promise<SheetExport> {
    const products = await this.prisma.product.findMany({
      where: { status: { in: ['draft', 'published'] } },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { name: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: { inventory: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const derived = await this.loadDerived();
    const cats = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true, isActive: true, parentId: true },
    });
    const labels = categoryLabels(cats);

    const rows = products.flatMap((p) =>
      toSheetExportRows(
        p,
        derived.parentSkuOf.get(p.id) ?? p.sku ?? '',
        labels.get(p.category.id) ?? p.category.slug,
      ),
    );

    const byId = new Map(cats.map((c) => [c.id, c]));
    const hasActiveChild = new Set(
      cats.filter((c) => c.isActive && c.parentId !== null).map((c) => c.parentId as string),
    );
    const pathOf = (id: string): string => {
      const names: string[] = [];
      let cur = byId.get(id);
      for (let depth = 0; cur && depth < 20; depth++) {
        names.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return names.join(' › ');
    };
    const categories: SheetCategoryOption[] = cats
      .filter((c) => c.isActive && !hasActiveChild.has(c.id))
      .map((c) => ({ label: labels.get(c.id) ?? c.slug, slug: c.slug, path: pathOf(c.id) }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return { rows, categories };
  }
}
