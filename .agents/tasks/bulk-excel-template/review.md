# One Excel template for bulk product download and upload

Reviewed 2026-10-10T22:37:30+05:30 against `design.md` (FR-1..9, AC-1..16, §2–§11), `design-review.md` round 3 and the `plan.md` Finding 1 rules plus the NIT do/skip table. Scope: commits `0d29c3c`, `3b382e4`, `bb4678a` and `7970ffe` on `master`, and the untracked files the task touched (`apps/api/prisma/schema.prisma`, `apps/api/src/modules/catalogue/catalogue.module.ts`). There are no uncommitted changes to tracked files.

The change replaces the 12-column product CSV with one `.xlsx` workbook in the owner's Parent/Child format, used for both download and upload. The browser builds and reads the workbook with a lazily loaded `exceljs` 4.4.0. The API gets `GET /admin/products/sheet` (export JSON) and `POST /admin/products/bulk-v2` (chunked import). Format rules live in a shared, side-effect-free `bulk-sheet.ts`. A pure planner writes only diffs, one transaction per product group. A migration adds two nullable columns, `Product.sku` (parent SKU) and admin-only `Variant.costPrice`, and the editor can now edit the purchase price. The old CSV template, the column list, the export button and `GET /admin/products/export` are gone.

Watch for: only NITs are left. When a weight cell has a `kg` suffix under a `Weight (g)` header, the error message prints `NaN` (confirmed). Gram values of 50 or less under a `Weight (g)` header are still saved as kilograms without a warning, as the NIT 5 design allows (confirmed). Doc-only NITs 8 and 13 are still pending in `design.md` (confirmed; planned for the finalize step).

**Verdict**: APPROVED

## High-level view

Data model: the migration SQL matches design §2 exactly. It adds two nullable columns and a unique index on a nullable column, nothing else. NIT 2 is in: `VariantService.upsert` returns 409 when an editor- or wizard-entered variant SKU equals another product's saved parent SKU.

Purchase price: storefront paths build explicit DTOs, and the new specs pin `detail()`, `list()` and the cart line against a `costPrice` leak. Raw rows that include it reach only `catalogue_manager` routes. `variant-slabs.tsx` and the wizard never send `costPrice` (undefined = unchanged), so slab or attribute saves can't clear it.

Import: matching follows §6a by group shape. The ownership check, the derived-only guard, the NIT 3 guard and the parent-SKU clash map all run before any write. Finding 1 follows plan.md on both import and export. The AC-5 and AC-9 specs assert zero writes (except the intended first-pass `sku` backfill), against a fake that re-orders jsonb keys. NITs 9, 10 and 11 are implemented and have specs.

Client and bundle: `exceljs` 4.4.0 is pinned exactly, appears only in `apps/web`, and is loaded only through `import()`. The other references are `import type` or the test. `bulk-sheet.ts` has no imports and no module-scope side effects (`/*#__PURE__*/` IIFEs, a lazy alias map). Web code reaches it through `lib/shared-bulk-sheet.ts` to avoid the `@belzo/shared` index edge. NITs 4, 6, 7 and 12 are in the page and the Instructions sheet. `pricing.ts`, checkout, orders and invoices have no diff.

<details>
<summary>Issues (3)</summary>

1. **NaN in the grams-under-`Weight (g)` error** (NIT): `Number(raw) / 1000` gives `NaN` when the cell has a `kg`/`kgs` suffix. Build the message from the parsed value (`weight.value / 1_000_000`) instead of the raw text.
2. **Small gram values under `Weight (g)` are silent** (NIT): values of 50 or less (e.g. `30` for a 30 g sachet) are stored as 30 kg with no warning, and fulfilment uses `weightGrams` for shipping. Optionally, when `weightUnitHint === 'g'`, warn on any weight ≥ 1 that the header says grams but the value is read as kg.
3. **Doc-only NITs 8 and 13 not yet in design.md** (NIT): §14 has no A-28 (40% GST can't be entered), and §11 line 844 still says "unchanged versus `master`". Apply both in plan step 6 (finalize).

</details>

<details>
<summary>Details</summary>

### Verification re-run for this review

Re-run here, all PASS:
- `pnpm --filter @belzo/shared build`
- `pnpm --filter @belzo/shared test` (9 suites, 194 tests)
- `pnpm --filter @belzo/api typecheck`
- `pnpm --filter @belzo/api test` (27 suites, 269 tests)
- `pnpm --filter @belzo/api lint`
- `pnpm --filter @belzo/web typecheck`
- `pnpm --filter @belzo/web test` (7 suites, 102 tests)
- `pnpm --filter @belzo/web lint` (only the 4 pre-existing warnings in untouched files)

Not re-run: `pnpm --filter @belzo/web build`. It rewrites `.next`. The AC-15 numbers come from `verification.md` and the FEAT-004 evidence, which also records that the `shared-bulk-sheet.ts` shim matters: pointing it back at `@belzo/shared` gives 123 kB.

Not verified anywhere: `db:migrate` (local Postgres was unreachable), opening the file in Excel or LibreOffice, and a real upload with images against a running API.

The AC-3/4/5/9 specs exist in `bulk-sheet.service.spec.ts` and pass. The AC-9 fixture covers every §11 round-trip case. `product-xlsx.test.ts` covers the xlsx half of the round trip.

### Weight-unit guard (NIT 5) edge cases

```ts
if (ctx.weightUnitHint === 'g') {
  errs.push(`Weight is in kg — ${raw} looks like grams; enter ${Number(raw) / 1000} (e.g. 0.2)`);
}
```

`parseKgToGrams` accepts a trailing `kg`/`kgs`, so `raw` can be `60000 kg`, and the message then says "enter NaN" (confirmed). The guard fires only above 50 kg. Under the owner's own `Weight (g)` header, a real gram value such as `30` is read as 30 kg and saved with no warning (confirmed). That follows the agreed NIT 5 rule, and the downloaded template writes `Weight (kg)`, so this only affects sheets the owner made by hand. It is still worth a soft warning, because shipping uses `weightGrams`.

### Repository hygiene

`catalogue.module.ts` (which registers `BulkSheetService`) and `schema.prisma` are pre-existing untracked files. Following the plan's ground rules, they are modified in the working tree and listed in the commit bodies, not committed. The committed controller depends on that registration, so a deploy has to use the working tree, as the rest of this mostly-untracked repo already does.

</details>

<details>
<summary>File map</summary>

- `apps/api/prisma/migrations/20261002120000_product_sku_variant_cost_price/migration.sql`: new additive migration.
- `apps/api/prisma/schema.prisma` (untracked): `Product.sku String? @unique`, `Variant.costPrice Int?`.
- `apps/api/src/modules/catalogue/bulk-sheet.service.ts`: new; matching, ownership checks, transactions, export.
- `apps/api/src/modules/catalogue/bulk-sheet.plan.ts`: new; pure diff-only planner (Finding 1, NIT 5) and export mapping.
- `apps/api/src/modules/catalogue/category-match.ts`: new; category resolution taken out of `bulkUpsert`.
- `apps/api/src/modules/catalogue/admin-catalogue.controller.ts`: `products/sheet` and `products/bulk-v2` routes; `costPrice` in the DTO; export route removed; `bulk` marked deprecated.
- `apps/api/src/modules/catalogue/product.service.ts`: export code removed; `uniqueSlug` and `findOrCreateBrandByName` made public; `normCategoryKey` swap.
- `apps/api/src/modules/catalogue/variant.service.ts`: `costPrice` passthrough; NIT 2 parent-SKU 409.
- `apps/api/src/modules/catalogue/catalogue.module.ts` (untracked): registers `BulkSheetService`.
- API specs: `bulk-sheet.service.spec.ts`, `bulk-sheet.plan.spec.ts`, `category-match.spec.ts`, `product.service.spec.ts`, `variant.service.spec.ts`, `cart.service.spec.ts`.
- `packages/shared/src/bulk-sheet.ts` + test, `index.ts`: format primitives, side-effect free.
- `apps/web/src/lib/product-xlsx.ts`, `product-sheet.ts`, `shared-bulk-sheet.ts` + tests: workbook build/read, CSV reader, chunking, retry.
- `apps/web/src/lib/csv.ts`: `parseCsvTable`.
- `apps/web/src/lib/admin-api.ts`: `AdminUploadError`.
- `apps/web/src/lib/variant-edit.ts`: cost field, `pickAttr`, `mergeVariantAttrs`.
- `apps/web/src/app/admin/catalogue/bulk/page.tsx`: rewritten upload page.
- `apps/web/src/app/admin/catalogue/excel-download-button.tsx`: replaces `export-button.tsx`.
- `apps/web/src/app/admin/catalogue/page.tsx`, `product-editor.tsx`, `variant-slabs.tsx`: wiring, Purchase column, attribute preservation.
- Deleted: `apps/web/src/lib/product-csv.ts`, `apps/web/src/app/admin/catalogue/export-button.tsx`.
- `apps/web/package.json`, `pnpm-lock.yaml`: `exceljs` 4.4.0, exact.

Full diff: `git diff c3fe07a..7970ffe`.

</details>
