import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { productQuerySchema, searchLogSchema, type ProductQuery } from '@belzo/shared';
import { Public } from '../../common/auth/public.decorator';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { BrandService } from './brand.service';
import { SEARCH_PROVIDER, type SearchProvider } from './search/search.provider';
import { SearchLogService } from './search/search-log.service';

/** `GET /brands` filters: brands of one category (with its sub-categories) or of a search. */
const brandQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Public storefront catalogue endpoints (FR-2, FR-3). All read-only and public.
 */
@ApiTags('catalogue')
@Controller()
export class CatalogueController {
  constructor(
    private readonly categories: CategoryService,
    private readonly products: ProductService,
    private readonly brands: BrandService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
    private readonly searchLog: SearchLogService,
  ) {}

  @Public()
  @Get('categories')
  categoryTree() {
    return this.categories.tree();
  }

  @Public()
  @Get('brands')
  brandList(@Query() query: Record<string, string>) {
    return this.brands.list(brandQuerySchema.parse(query));
  }

  @Public()
  @Get('products')
  listProducts(@Query() query: Record<string, string>) {
    const parsed: ProductQuery = productQuerySchema.parse(query);
    return this.products.list(parsed);
  }

  @Public()
  @Get('products/:idOrSlug')
  productDetail(@Param('idOrSlug') idOrSlug: string) {
    return this.products.detail(idOrSlug);
  }

  @Public()
  @Get('search')
  searchProducts(@Query() query: Record<string, string>) {
    const parsed: ProductQuery = productQuerySchema.parse(query);
    return this.search.search(parsed);
  }

  @Public()
  @Get('search/autocomplete')
  autocomplete(@Query('q') q: string) {
    return this.search.autocomplete(q ?? '');
  }

  /**
   * The website and the app call this AFTER a real search (Enter, a tapped suggestion, the results
   * page) so the admin Search terms report counts what customers look for. Public (guests search too),
   * limited per address, answers nothing, and a failure to save never reaches the customer.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  @Post('search/log')
  async logSearch(@Req() req: Request, @Body() body: unknown): Promise<void> {
    const parsed = searchLogSchema.safeParse(body);
    if (!parsed.success) return;
    await this.searchLog.record({
      q: parsed.data.q,
      source: parsed.data.source,
      authorization: req.headers.authorization,
      ip: req.ip,
    });
  }
}
