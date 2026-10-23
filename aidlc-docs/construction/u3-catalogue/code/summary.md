# U3 catalogue — Code Generation Summary

Makes the storefront browsable: categories, products, variants, inventory, media, and search, plus the
admin catalogue backend. Builds on U1/U2.

## What was built

### Shared (`packages/shared`)
- `catalogue.ts` — `slugify` (idempotent), `discountPct` (0–100), and DTO types (CategoryNode, Variant,
  ProductCard, ProductDetail, ProductSort) + `catalogue.test.ts` (PBT).

### Data model (`apps/api/prisma/schema.prisma`)
Category (self-referential tree), Brand, Attribute/AttributeValue, Product (HSN + GST rate, status,
rating), ProductImage, ProductAttribute, Variant (paise MRP/selling), Inventory, StockMovement. Seed
extended with 4 categories and 8 sample products (each with a variant + stock).

### Integrations
- `integrations/storage/` — `StorageProvider` port + `LocalStorageProvider` (dev) + `S3StorageProvider`
  (deploy-time), env-selected.

### Catalogue services (`apps/api/src/modules/catalogue/`)
- `inventory.logic.ts` (pure) + `inventory.service.ts` — reserve/release/confirm/adjust with
  StockMovement audit; invariants `available ≥ 0`, `reserved ≥ 0`.
- `category.service.ts` — nested tree, unique slug, cycle prevention, descendant filter.
- `product.service.ts` — storefront list (filters/sort/pagination), detail, create, publish guard, CSV
  bulk upsert with per-row error report.
- `variant.service.ts` — price invariant (`0 ≤ sellingPrice ≤ mrp`).
- `brand.service.ts`, `attribute.service.ts`, `media.service.ts`.
- `search/` — `SearchProvider` port + `PostgresSearchProvider` (FTS + autocomplete), swappable.
- Controllers: `catalogue.controller` (public), `admin-catalogue.controller` (`@Roles('catalogue_manager')`).
- `catalogue.module.ts` wired into `AppModule`; exports InventoryService/ProductService for U4/U5.

### Web (`apps/web`)
- `lib/catalogue-api.ts` + `components/product-card.tsx`.
- Pages: home (categories + new arrivals), `category/[slug]` (sort), `product/[slug]` (gallery, price,
  variant selector, add-to-cart stub for U4), `search`. Header search box. Storefront CSS. `data-testid`s.

## Verification (executed)
- `packages/shared`: **19 tests pass**, build OK.
- `prisma generate` OK; **API typecheck clean**; **API tests: 35/35 pass** (adds inventory PBT + product
  bulk-upsert unit tests).
- Bug caught & fixed during verification: a TypeScript circular-inference error (TS7022) in
  `category.service.wouldCreateCycle` — fixed with an explicit type annotation on the Prisma result.

## Extension compliance (U3)
- **Security**: SECURITY-05 (zod validation on catalogue/search queries + admin DTOs), SECURITY-08
  (admin catalogue endpoints behind `@Roles`), SECURITY-09 (S3 public-access-blocked note). No blocking
  findings.
- **Resiliency**: RESILIENCY-10 (storage/search behind ports; media upload swappable). Search behind an
  abstraction for later scale-out. No blocking findings.
- **PBT**: PBT-03/04/06 — inventory non-negativity + reserve/release round-trip + conservation
  (stateful), discountPct range, slug idempotence — all passing. No blocking findings.

## Follow-ups
- Product images are seeded as placeholder paths; real uploads use the storage port (S3 at deploy).
- `PostgresSearchProvider` uses ILIKE for portability; enable `pg_trgm`/`tsvector` at deploy for ranking
  + typo tolerance (interface unchanged).
- Add-to-cart on the PDP is stubbed; U4 wires it to the cart API.
