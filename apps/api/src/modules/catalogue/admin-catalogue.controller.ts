import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator';
import { createZodDto } from '../identity/zod-dto';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { VariantService } from './variant.service';
import { BrandService } from './brand.service';
import { InventoryService } from './inventory.service';

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
    .array(z.object({ url: z.string().url(), alt: z.string().max(200).optional() }))
    .max(10),
});
class ProductImagesDto extends createZodDto(productImagesSchema) {}

const productSlabsSchema = z.object({
  tiers: z
    .array(z.object({ minQty: z.number().int().min(2), discountPct: z.number().min(0).max(95) }))
    .max(10),
});
class ProductSlabsDto extends createZodDto(productSlabsSchema) {}

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

const adjustSchema = z.object({ delta: z.number().int(), ref: z.string().max(80).optional() });
class AdjustDto extends createZodDto(adjustSchema) {}

/**
 * Admin catalogue management (FR-8). Guarded by RBAC — catalogue_manager or
 * super_admin (SECURITY-08). Inventory adjust is audited via StockMovement.
 */
@ApiTags('admin-catalogue')
@ApiBearerAuth()
@Roles('catalogue_manager')
@Controller('admin')
export class AdminCatalogueController {
  constructor(
    private readonly categories: CategoryService,
    private readonly products: ProductService,
    private readonly variants: VariantService,
    private readonly brands: BrandService,
    private readonly inventory: InventoryService,
  ) {}

  @Get('categories')
  listCategories() {
    return this.categories.tree();
  }

  @Post('categories')
  upsertCategory(@Body() dto: CategoryUpsertDto) {
    return this.categories.upsert(dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  @Get('products')
  listProducts() {
    return this.products.adminList();
  }

  @Get('products/export')
  exportProducts() {
    return this.products.exportRows();
  }

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

  @Post('products/bulk')
  bulk(@Body() dto: BulkDto) {
    return this.products.bulkUpsert(dto.rows);
  }

  @Get('products/:productId/variants')
  listVariants(@Param('productId') productId: string) {
    return this.variants.listByProduct(productId);
  }

  @Post('variants')
  upsertVariant(@Body() dto: VariantUpsertDto) {
    return this.variants.upsert(dto);
  }

  @Delete('variants/:id')
  removeVariant(@Param('id') id: string) {
    return this.variants.remove(id);
  }

  @Post('products/:id/price-slabs')
  applyProductSlabs(@Param('id') id: string, @Body() dto: ProductSlabsDto) {
    return this.products.applyPriceSlabs(id, dto.tiers);
  }

  @Get('brands')
  listBrandsAdmin() {
    return this.brands.adminList();
  }

  @Post('brands')
  upsertBrand(@Body() dto: { name: string; logoUrl?: string; id?: string }) {
    return this.brands.upsert(dto);
  }

  @Delete('brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.brands.remove(id);
  }

  @Post('inventory/:variantId/adjust')
  adjustStock(@Param('variantId') variantId: string, @Body() dto: AdjustDto) {
    return this.inventory.adjust(variantId, dto.delta, dto.ref);
  }

  @Get('inventory/:variantId')
  async stock(@Param('variantId') variantId: string) {
    return { variantId, available: await this.inventory.getStock(variantId) };
  }
}
