import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { productQuerySchema, type ProductQuery } from '@belzo/shared';
import { Public } from '../../common/auth/public.decorator';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { BrandService } from './brand.service';
import { SEARCH_PROVIDER, type SearchProvider } from './search/search.provider';

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
  ) {}

  @Public()
  @Get('categories')
  categoryTree() {
    return this.categories.tree();
  }

  @Public()
  @Get('brands')
  brandList() {
    return this.brands.list();
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
}
