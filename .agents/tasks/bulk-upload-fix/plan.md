# Implementation Plan — Fix & extend admin Bulk Product Upload

Goal: make the admin CSV bulk upload reliably import all product details AND images.
Fix the root cause (template `categorySlug` `grocery` does not exist and users cannot
discover valid slugs), add image/stock/brand/description/status support, and publish
imported products by default so they appear on the storefront.

Monorepo: `c:\xampp\htdocs\Belzo` (pnpm). Work directly in the workspace — NO worktree.
Money is stored as integer paise; CSV prices are in rupees and converted client-side.

Files in scope:
- `apps/api/src/modules/catalogue/admin-catalogue.controller.ts` (`csvRowSchema`)
- `apps/api/src/modules/catalogue/product.service.ts` (`bulkUpsert`)
- `apps/api/src/modules/catalogue/product.service.spec.ts` (bulkUpsert tests)
- `apps/web/src/app/admin/catalogue/bulk/page.tsx` (CSV columns, template, parsing, UI)

Patterns to reuse (already in the codebase):
- Unique-slug dedup loop: `ProductService.uniqueSlug` / `BrandService.uniqueSlug`
  (`base = slugify(name) || 'brand'`, then append `-2`, `-3`, … until free).
- Case-insensitive match: Prisma `{ contains, mode: 'insensitive' }` is used in
  `search/postgres-search.provider.ts`; for brand find use `equals`/`mode:'insensitive'`.
- Image URL validation mirrors `categoryUpsertSchema.imageUrl`:
  `/^https?:\/\//.test(s) || s.startsWith('/')`.
- Image rows: `ProductImage { productId, url, alt default '', position }`.

---

- [ ] 1. Extend the backend CSV row contract (`csvRowSchema`) to the new superset, backward compatible.
      In `admin-catalogue.controller.ts` replace `csvRowSchema` so required fields stay
      `sku, title, categorySlug, mrp (int paise ≥0), sellingPrice (int paise ≥0)` and add OPTIONAL:
      `description` (`z.string().max(5000).optional()`), `brand` (`z.string().trim().min(1).optional()` — a brand NAME),
      `hsnCode` (`z.string().max(12).optional()`), `taxRatePct` (`z.number().int().min(0).max(28).optional()`),
      `stock` (`z.number().int().min(0).optional()`), `status` (`z.enum(['draft','published']).optional()`),
      `imageUrls` (`z.array(z.string().trim().min(1)).optional()` — pre-split array of URL strings; validate contents in the service so a bad URL becomes a per-row error, not a 400 that drops the whole request).
      Keep `bulkSchema = z.object({ rows: z.array(csvRowSchema).max(5000) })`. The old 7-column payload still validates (new fields optional).
      Files: `apps/api/src/modules/catalogue/admin-catalogue.controller.ts`
      Verify: `pnpm --filter @belzo/api typecheck` passes.

- [ ] 2. Add a brand find-or-create helper and rewrite `ProductService.bulkUpsert` to accept and persist the superset.
      Update the `bulkUpsert` parameter type to match the new schema (optional `description, brand, hsnCode, taxRatePct, stock, status, imageUrls`).
      Add a private `findOrCreateBrandByName(name)`: trim name; `prisma.brand.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })`; if found return it; else create with a unique slug using the same dedup loop as `BrandService.uniqueSlug` (`slugify(name) || 'brand'`, append `-2`,`-3`…).
      Per-row logic (one try/catch per row, continue on error, keep `{ ok, errors:[{row,message}] }` shape; row numbers 1-based):
      - Validate price invariant: `sellingPrice > mrp` → error `sellingPrice exceeds mrp`; negative → `prices must be non-negative`.
      - Validate each `imageUrls` entry with `/^https?:\/\//.test(s) || s.startsWith('/')`; on failure throw `invalid image url "<url>"` (reported per-row).
      - Look up category by slug; missing → `unknown category "<slug>"`.
      - Resolve brand via `findOrCreateBrandByName` only when `brand` is non-empty.
      - NEW SKU (no existing variant): create Product with `title`, `slug` via `uniqueSlug(title)`, `categoryId`, `brandId` (if resolved), `description ?? ''`, `hsnCode ?? ''`, `taxRatePct ?? 0`, `isReturnable: true`, `status: row.status ?? 'published'`; create Variant `{ productId, sku, mrp, sellingPrice }`; create Inventory `{ variantId, available: stock ?? 0 }`; create one ProductImage per `imageUrls` entry with `position` = index.
      - EXISTING SKU (match `prisma.variant.findUnique({ where: { sku } })`): always update `mrp, sellingPrice`; and when provided update the parent product's `description, hsnCode, taxRatePct`, update `brandId` when `brand` given, apply `status` when given; set Inventory `available = stock` when `stock` provided (upsert inventory); for each `imageUrls` entry not already present on the product, append a ProductImage with `position` = current max+1 (do NOT delete existing images, do NOT duplicate identical URLs). Resolve the parent `productId` from the existing variant.
      - Wrap each row's writes in `prisma.$transaction` where reasonable so a mid-row failure does not leave a half-written product; one bad row must not abort the whole import.
      Files: `apps/api/src/modules/catalogue/product.service.ts`
      Verify: `pnpm --filter @belzo/api typecheck` and `pnpm --filter @belzo/api lint` pass.

- [ ] 3. Extend `product.service.spec.ts` bulkUpsert tests for the new behaviour.
      Keep the two existing tests (price invariant, unknown category) passing — note the fake Prisma category now returns a leaf-slug object; keep `apparel` or switch to a leaf slug, update accordingly. Grow the fake Prisma to cover `brand.findFirst/create`, `product.findUnique` (for existing-SKU parent lookup), `productImage.create/findMany`, and `inventory.upsert/create`. Add tests:
      - new SKU with `imageUrls` attaches ProductImage rows in order (assert positions 0,1).
      - new SKU with `stock` creates Inventory `available = stock`.
      - `brand` triggers find-or-create (found path reuses id; missing path creates with slug).
      - `status: 'published'` is written on create; default (no status) also publishes.
      - invalid `imageUrls` entry (e.g. `ftp://x`) is reported as a row error and does not create a product.
      - existing-SKU path updates price + appends a new image without duplicating an identical URL.
      Files: `apps/api/src/modules/catalogue/product.service.spec.ts`
      Verify: `pnpm --filter @belzo/api test` — all bulkUpsert tests pass.

- [ ] 4. Update the frontend bulk page: columns, template with a REAL leaf slug, new parsing, slug discovery UI.
      In `apps/web/src/app/admin/catalogue/bulk/page.tsx`:
      - Extend `Row` interface and `COLUMNS` to `sku,title,categorySlug,mrp,sellingPrice,description,brand,hsnCode,taxRatePct,stock,status,imageUrl` (header `imageUrl`, pipe-separated for multiple).
      - On mount (`useEffect`) call `adminFetch<CategoryNodeDto[]>('/admin/categories')`, flatten to leaf nodes (nodes with no children), store leaf `{name,slug}` list in state. Build `TEMPLATE` dynamically using the first leaf slug (fallback to a hardcoded leaf if fetch fails) instead of the dead `grocery`.
      - Parse new columns: `stock` → int, `status` → `'draft'|'published'` (default blank), `imageUrl` → split on `'|'`, trim, drop empties → `imageUrls: string[]`. Prices stay rupees→paise. Build the POST body row with `imageUrls`, `stock`, `status`, `description`, `brand` (omit empties/undefined).
      - Render a copy-friendly list/`<datalist>` of valid leaf category slugs (the key usability fix) so admins can see/copy real slugs.
      - Preview table: add `Images` (count) and `Stock` columns. Keep the existing result/error report untouched.
      - Update page copy: images are referenced by URL (CSV cannot carry binaries); multiple URLs separated by `|`; note new SKUs are now published by default (behaviour change) so they appear on the storefront.
      Files: `apps/web/src/app/admin/catalogue/bulk/page.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web build` pass.

- [ ] 5. Full verification sweep.
      Run from `c:\xampp\htdocs\Belzo`:
      `pnpm --filter @belzo/api typecheck`, `pnpm --filter @belzo/api lint`, `pnpm --filter @belzo/api test`,
      `pnpm --filter @belzo/shared test`, `pnpm --filter @belzo/web typecheck`, `pnpm --filter @belzo/web build`.
      Files: none (verification only)
      Verify: all six commands exit 0; no regressions in catalogue/pricing/home features.

## Notes / assumptions
- The frontend pre-splits `imageUrl` on `|` into `imageUrls[]` before POSTing; the backend schema therefore accepts `imageUrls: string[]` and validates each entry in the service (so a bad URL is a per-row error, not a request-level 400). This keeps the UI's existing `{ok,errors}` report working.
- Status is restricted to `draft|published` for bulk (archived not meaningful on import). Default `published` per the task.
- Brand match is case-insensitive by name; slug uniqueness reuses the existing dedup pattern.
- Backward compatibility: a CSV with only the original 7 columns still imports; the only behaviour change is new SKUs are now published (previously draft) — surfaced in page copy.
