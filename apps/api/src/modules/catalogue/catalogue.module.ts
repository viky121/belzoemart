import { Module } from '@nestjs/common';
import { StorageModule } from '../../integrations/storage/storage.module';
import { SearchModule } from './search/search.module';
import { SearchLogService } from './search/search-log.service';
import { CategoryService } from './category.service';
import { BrandService } from './brand.service';
import { AttributeService } from './attribute.service';
import { ProductService } from './product.service';
import { VariantService } from './variant.service';
import { InventoryService } from './inventory.service';
import { MediaService } from './media.service';
import { BulkSheetService } from './bulk-sheet.service';
import { CatalogueController } from './catalogue.controller';
import { AdminCatalogueController } from './admin-catalogue.controller';

/**
 * Catalogue domain module (U3): categories, brands, attributes, products,
 * variants, inventory, media, and search. Exports InventoryService for U4
 * checkout stock reservation and ProductService for order snapshots.
 */
@Module({
  imports: [StorageModule, SearchModule],
  controllers: [CatalogueController, AdminCatalogueController],
  providers: [
    CategoryService,
    BrandService,
    AttributeService,
    ProductService,
    VariantService,
    InventoryService,
    MediaService,
    BulkSheetService,
    SearchLogService,
  ],
  exports: [InventoryService, ProductService, CategoryService],
})
export class CatalogueModule {}
