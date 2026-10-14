# U3 catalogue — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds the catalogue domain to `apps/api` and storefront browsing
pages to `apps/web`. Depends on U1, U2.

## Unit Context
- **Requirements**: FR-2 (discovery/search/filter/sort), FR-3.1-3.4/3.6/3.11 (PDP, variants, stock),
  FR-8.1-8.7 (admin catalogue/inventory/masters — backend), NFR-3.2 (media/CDN), NFR-2.1 (HSN/tax fields).
- **Business rules**: `construction/u3-catalogue/functional-design/business-rules.md`.
- **Depends on**: U1 (platform-core), U2 (admin RBAC guards for write endpoints).

## Steps

- [ ] Step 1 — Shared: add catalogue DTOs/schemas to `packages/shared` (ProductCard, ProductDetail,
  CategoryNode, VariantDto, search/filter query) as needed; slug + discount pure helpers with PBT.
- [ ] Step 2 — Prisma models: Category, Brand, Attribute, AttributeValue, Product, ProductImage,
  ProductAttribute, Variant, Inventory, StockMovement (+ tsvector index). Migration + extend seed with
  sample catalogue across apparel/grocery/electronics/handicraft.
- [ ] Step 3 — Storage port: `StorageProvider` (put/getUrl) + `LocalStorageProvider` (dev) + S3 adapter
  stub, env-selected. MediaService (upload, WebP note, CDN URL).
- [ ] Step 4 — Inventory: pure `inventory.logic.ts` (reserve/release/adjust math + invariants) + PBT
  (stateful sequence, non-negative, conservation); `InventoryService` (DB, StockMovement audit,
  transactional).
- [ ] Step 5 — Pricing helpers already partly in shared; add `discountPct` + slug helpers with PBT.
- [ ] Step 6 — Catalogue services: CategoryService (tree, cycle check, slug), BrandService,
  AttributeService, ProductService (CRUD, publish states, CSV bulk upsert), VariantService (price
  invariant).
- [ ] Step 7 — SearchService abstraction: `SearchProvider` port + `PostgresSearchProvider` (FTS +
  trigram), autocomplete; filters + sort. Swappable for Typesense later.
- [ ] Step 8 — Controllers: public storefront (`products` list/detail, `categories` tree, `search`,
  `search/autocomplete`); admin (`admin/categories`, `admin/products` CRUD + CSV, `admin/inventory`
  adjust) guarded by @Roles. zod DTOs + Swagger.
- [ ] Step 9 — CatalogueModule + wiring into AppModule.
- [ ] Step 10 — Web storefront: home wiring (categories/new arrivals), category listing page with
  filters/sort, product detail page (gallery, variants, price block, stock, add-to-cart stub), search
  page. data-testid throughout.
- [ ] Step 11 — Tests: PBT (inventory, discount, slug) + service unit tests + a search integration test.
- [ ] Step 12 — Docs: `construction/u3-catalogue/code/summary.md`. Verify typecheck + tests.

## Testable Properties carried into code (PBT-01 → PBT-02/03/04/06)
- Inventory reserve/release round-trip + non-negativity + conservation (stateful).
- discountPct ∈ [0,100]; slugify idempotent.

## Traceability
FR-2.* → Steps 6/7/8/10; FR-3.* → Steps 6/8/10; FR-8.* → Steps 2/3/4/6/8; NFR-3.2 → Step 3;
NFR-2.1 → Step 2 (hsnCode/taxRatePct).
