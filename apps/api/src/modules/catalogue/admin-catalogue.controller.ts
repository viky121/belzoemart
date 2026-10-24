import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_CART_QTY, SHEET_FIELD_MAX, WEIGHT_UNITS } from '@belzo/shared';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { createZodDto } from '../identity/zod-dto';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { VariantService } from './variant.service';
import { BrandService } from './brand.service';
import { InventoryService } from './inventory.service';
import { BulkSheetService } from './bulk-sheet.service';

// -- DTOs -------------------------------------------------------------------
const categoryUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .refine((s) => /^https?:\/\//.test(s) || s.startsWith('/'), 'Must be a URL or an app path')
    .optional(),
  displayOrder: z.number().int().optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
});
class CategoryUpsertDto extends createZodDto(categoryUpsertSchema) {}

const productDetailFields = {
  shgName: z.string().max(160).optional(),
  story: z.string().max(5000).optional(),
  attributes: z.record(z.string()).optional(),
  seoTitle: z.string().max(70).optional(),
  seoKeywords: z.string().max(255).optional(),
  seoDescription: z.string().max(160).optional(),
};

const productCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  hsnCode: z.string().max(12).optional(),
  taxRatePct: z.number().int().min(0).max(28).optional(),
  isReturnable: z.boolean().optional(),
  ...productDetailFields,
});
class ProductCreateDto extends createZodDto(productCreateSchema) {}

const variantUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  sku: z.string().trim().min(1).max(60),
  mrp: z.number().int().min(0),
  sellingPrice: z.number().int().min(0),
  attributes: z.record(z.string()).optional(),
  weightGrams: z.number().int().min(0).optional(),
  // Fewest / most units a customer can buy in one order. null clears the limit; undefined leaves it unchanged.
  minOrderQty: z.number().int().min(1).max(MAX_CART_QTY).nullable().optional(),
  maxOrderQty: z.number().int().min(1).max(MAX_CART_QTY).nullable().optional(),
  // Weight / pack size as entered (e.g. 500 + "gm", 6 + "pc"). null clears it; undefined leaves it unchanged.
  weightValue: z.number().min(0).max(1_000_000).nullable().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .refine((s) => /^https?:\/\//.test(s) || s.startsWith('/'), 'Must be a URL or an app path')
    .optional(),
  priceSlabs: z
    .array(z.object({ minQty: z.number().int().min(2), unitPrice: z.number().int().min(0) }))
    .max(10)
    .optional(),
  /** Purchase price, paise. Admin-only; null clears it, omitted leaves it unchanged. */
  costPrice: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
});
class VariantUpsertDto extends createZodDto(variantUpsertSchema) {}

// Only the purchase limits, so the stock dialog can change them without re-sending the whole variant.
const orderLimitsSchema = z.object({
  minOrderQty: z.number().int().min(1).max(MAX_CART_QTY).nullable().optional(),
  maxOrderQty: z.number().int().min(1).max(MAX_CART_QTY).nullable().optional(),
});
class OrderLimitsDto extends createZodDto(orderLimitsSchema) {}

const statusSchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });
class StatusDto extends createZodDto(statusSchema) {}

const productUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().nullable().optional(),
  hsnCode: z.string().max(12).optional(),
  taxRatePct: z.number().int().min(0).max(28).optional(),
  isReturnable: z.boolean().optional(),
  ...productDetailFields,
});
class ProductUpdateDto extends createZodDto(productUpdateSchema) {}

const productImagesSchema = z.object({
  images: z
    .array(
      z.object({
        // An absolute http(s) URL (S3/CDN) or a site-relative one ("/api/uploads/..." with local storage).
        url: z
          .string()
          .trim()
          .max(2048)
          .refine((u) => /^https?:\/\/\S+$/i.test(u) || (u.startsWith('/') && !u.startsWith('//')), {
            message: 'Invalid image URL',
          }),
        alt: z.string().max(200).optional(),
      }),
    )
    .max(10),
});
class ProductImagesDto extends createZodDto(productImagesSchema) {}

const productSlabsSchema = z.object({
  tiers: z
    .array(z.object({ minQty: z.number().int().min(2), discountPct: z.number().min(0).max(95) }))
    .max(10),
});
class ProductSlabsDto extends createZodDto(productSlabsSchema) {}

// Bulk edit (FR-8): apply one offer/price/stock change to many products at once.
// `offer` sets sellingPrice from MRP (percent 0-95 or fixed paise off); `price`
// sets an absolute sellingPrice (paise); `stock` adjusts the default variant's
// available qty (set/increase/decrease) via the audited inventory path.
const bulkEditSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  operation: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('offer'),
      mode: z.enum(['percent', 'fixed']),
      value: z.number().min(0),
    }),
    z.object({ kind: z.literal('price'), value: z.number().int().min(0) }),
    z.object({
      kind: z.literal('stock'),
      mode: z.enum(['set', 'increase', 'decrease']),
      value: z.number().int().min(0),
    }),
  ]),
});
class BulkEditDto extends createZodDto(bulkEditSchema) {}

const csvRowSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  categorySlug: z.string().min(1),
  mrp: z.number().int().min(0),
  sellingPrice: z.number().int().min(0),
  description: z.string().max(5000).optional(),
  brand: z.string().trim().min(1).optional(),
  hsnCode: z.string().max(12).optional(),
  taxRatePct: z.number().int().min(0).max(28).optional(),
  stock: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published']).optional(),
  // Pre-split URL array. Each entry is validated in the service so a single bad
  // URL becomes a per-row error instead of a request-level 400 that would drop
  // every row in the upload.
  imageUrls: z.array(z.string().trim().min(1)).optional(),
});
const bulkSchema = z.object({ rows: z.array(csvRowSchema).max(5000) });
class BulkDto extends createZodDto(bulkSchema) {}

// Excel sheet rows (design §5). Cell limits are shared with the client pre-check
// and groupSheetRows; content problems become per-row issues, not 400s.
const s = (max: number) => z.string().max(max).optional();
const sheetRowSchema = z.object({
  row: z.number().int().min(2).max(1_000_000),
  indicator: s(SHEET_FIELD_MAX.indicator),
  parentSku: s(SHEET_FIELD_MAX.parentSku),
  sku: s(SHEET_FIELD_MAX.sku),
  finalDetail: s(SHEET_FIELD_MAX.finalDetail),
  brand: s(SHEET_FIELD_MAX.brand),
  title: s(SHEET_FIELD_MAX.title),
  description: s(SHEET_FIELD_MAX.description),
  colour: s(SHEET_FIELD_MAX.colour),
  size: s(SHEET_FIELD_MAX.size),
  weightKg: s(SHEET_FIELD_MAX.weightKg),
  hsnCode: s(SHEET_FIELD_MAX.hsnCode),
  taxType: s(SHEET_FIELD_MAX.taxType),
  gstRate: s(SHEET_FIELD_MAX.gstRate),
  mrp: s(SHEET_FIELD_MAX.mrp),
  sellingPrice: s(SHEET_FIELD_MAX.sellingPrice),
  purchasePrice: s(SHEET_FIELD_MAX.purchasePrice),
  stock: s(SHEET_FIELD_MAX.stock),
  packOf: s(SHEET_FIELD_MAX.packOf),
  tier1: s(SHEET_FIELD_MAX.tier1),
  tier2: s(SHEET_FIELD_MAX.tier2),
  tier3: s(SHEET_FIELD_MAX.tier3),
  tier4: s(SHEET_FIELD_MAX.tier4),
  tier5: s(SHEET_FIELD_MAX.tier5),
  image1: s(SHEET_FIELD_MAX.image1),
  image2: s(SHEET_FIELD_MAX.image2),
  image3: s(SHEET_FIELD_MAX.image3),
  image4: s(SHEET_FIELD_MAX.image4),
  image5: s(SHEET_FIELD_MAX.image5),
  dimensions: s(SHEET_FIELD_MAX.dimensions),
});
const bulkSheetSchema = z.object({
  rows: z.array(sheetRowSchema).min(1).max(1000),
  /** Unit named by the uploaded Weight header ('Weight (g)' -> 'g'), NIT 5. */
  weightUnit: z.enum(['g', 'kg']).optional(),
});
class BulkSheetDto extends createZodDto(bulkSheetSchema) {}

const adjustSchema = z.object({ delta: z.number().int(), ref: z.string().max(80).optional() });
class AdjustDto extends createZodDto(adjustSchema) {}

/**
 * Admin catalogue management (FR-8). Guarded by RBAC — catalogue_manager or
 * super_admin (SECURITY-08). Inventory adjust is audited via StockMovement.
 */
@ApiTags('admin-catalogue')
@ApiBearerAuth()
@RequirePermission('products.edit')
@Controller('admin')
export class AdminCatalogueController {
  constructor(
    private readonly categories: CategoryService,
    private readonly products: ProductService,
    private readonly variants: VariantService,
    private readonly brands: BrandService,
    private readonly inventory: InventoryService,
    private readonly sheet: BulkSheetService,
  ) {}

  @RequirePermission('taxonomy.view')
  @Get('categories')
  listCategories() {
    return this.categories.tree();
  }

  @RequirePermission('taxonomy.edit')
  @Post('categories')
  upsertCategory(@Body() dto: CategoryUpsertDto) {
    return this.categories.upsert(dto);
  }

  @RequirePermission('taxonomy.edit')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  @RequirePermission('products.view', 'mobile.edit', 'content.edit')
  @Get('products')
  listProducts() {
    return this.products.adminList();
  }

  /** Every draft/published product as Excel sheet rows (the browser builds the .xlsx). */
  @RequirePermission('products.view')
  @Get('products/sheet')
  bulkSheetExport() {
    return this.sheet.exportSheet();
  }

  @RequirePermission('products.view')
  @Get('products/:id/detail')
  productDetail(@Param('id') id: string) {
    return this.products.adminDetail(id);
  }

  @Post('products')
  createProduct(@Body() dto: ProductCreateDto) {
    return this.products.create(dto);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: ProductUpdateDto) {
    return this.products.update(id, dto);
  }

  @Put('products/:id/images')
  setImages(@Param('id') id: string, @Body() dto: ProductImagesDto) {
    return this.products.setImages(id, dto.images);
  }

  @Patch('products/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.products.setStatus(id, dto.status);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.products.remove(id);
  }

  /** @deprecated use POST /admin/products/bulk-v2 (Excel sheet) */
  @RequirePermission('products.bulk')
  @Post('products/bulk')
  bulk(@Body() dto: BulkDto) {
    return this.products.bulkUpsert(dto.rows);
  }

  /** Import Excel sheet rows (one chunk of whole product groups). */
  @RequirePermission('products.bulk')
  @Post('products/bulk-v2')
  bulkSheetImport(@Body() dto: BulkSheetDto) {
    return this.sheet.importRows(dto.rows, { weightUnit: dto.weightUnit });
  }

  @RequirePermission('products.view')
  @Get('products/:productId/variants')
  listVariants(@Param('productId') productId: string) {
    return this.variants.listByProduct(productId);
  }

  @Post('variants')
  upsertVariant(@Body() dto: VariantUpsertDto) {
    return this.variants.upsert(dto);
  }

  /** Set the fewest / most units a customer can buy of this variant per order (null = no limit). */
  @Patch('variants/:id/order-limits')
  setOrderLimits(@Param('id') id: string, @Body() dto: OrderLimitsDto) {
    return this.variants.setOrderLimits(id, dto.minOrderQty, dto.maxOrderQty);
  }

  @Delete('variants/:id')
  removeVariant(@Param('id') id: string) {
    return this.variants.remove(id);
  }

  @Post('products/:id/price-slabs')
  applyProductSlabs(@Param('id') id: string, @Body() dto: ProductSlabsDto) {
    return this.products.applyPriceSlabs(id, dto.tiers);
  }

  /** Apply one offer / price / stock change to many products at once. */
  @RequirePermission('products.bulk')
  @Post('products/bulk-edit')
  bulkEdit(@Body() dto: BulkEditDto) {
    return this.products.bulkEdit({ productIds: dto.productIds, operation: dto.operation });
  }

  @RequirePermission('taxonomy.view')
  @Get('brands')
  listBrandsAdmin() {
    return this.brands.adminList();
  }

  @RequirePermission('taxonomy.edit')
  @Post('brands')
  upsertBrand(@Body() dto: { name: string; logoUrl?: string; id?: string }) {
    return this.brands.upsert(dto);
  }

  @RequirePermission('taxonomy.edit')
  @Delete('brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.brands.remove(id);
  }

  @RequirePermission('stock.adjust')
  @Post('inventory/:variantId/adjust')
  adjustStock(@Param('variantId') variantId: string, @Body() dto: AdjustDto) {
    return this.inventory.adjust(variantId, dto.delta, dto.ref);
  }

  @RequirePermission('products.view')
  @Get('inventory/:variantId')
  async stock(@Param('variantId') variantId: string) {
    return { variantId, available: await this.inventory.getStock(variantId) };
  }
}
