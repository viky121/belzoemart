# Implementation Plan: one Excel template for bulk product download + upload

Spec: `.agents/tasks/bulk-excel-template/design.md` (authoritative, incl. §15–§17) plus `design-review.md` round 3 (Finding 1 + NITs). No further design loop. Work directly in `c:\xampp\htdocs\Belzo` on `master`; commit locally per item group, never push, never deploy.

FEAT artifacts with per-feature steps: `.agents/tasks/bulk-excel-template/task-bulk-excel-template/` (`context.json`, `features/FEAT-001..004.json`). This file is the ordered summary and the fallback for a single implement loop.

## Ground rules found during exploration
- The repo is only partly tracked. `apps/api/prisma/schema.prisma`, `catalogue.module.ts` and `packages/shared/src/money.ts` are untracked and already modified. Stage only tracked files you changed plus files this task creates. Never stage pre-existing untracked files or anything under `.agents/`. List the untracked files you changed in the commit body.
- The API resolves `@belzo/shared` from `dist`, so build shared before the API typecheck. API and web jest map it to `src`.
- `prisma generate` on Windows can hit EPERM while an API dev server holds the query-engine DLL. Retry once, then ask the user. Never kill processes you didn't start.
- `next build` rewrites `.next`. If `next dev` is listening on :3000, ask first.
- Run `db:migrate` only against a local Postgres. Otherwise skip it and report. `scripts/deploy.ps1` doesn't run migrations.

## Decisions
- Split into 4 sequential FEATs: migration+costPrice → shared module → API → web. Each one builds and tests on its own. FEAT-001 and FEAT-002 are independent. FEAT-003 needs both. FEAT-004 needs 002 and 003's endpoint contract.
- Put `mergeAttr` and the export mapping (`toSheetExportRows`) in `apps/api/src/modules/catalogue/bulk-sheet.plan.ts`, as the design places them. Only the format primitives go in shared.
- NIT 5 needs the header's unit on the server. Send it as an optional request field `weightUnit: 'g' | 'kg'` on `POST /admin/products/bulk-v2`, rather than adding client-side row exclusion. One rule lives in the planner.
- NIT 6 waits a fixed 60 s. `Retry-After` can't be read: `ApiClientError` carries no headers, and `enableCors` in `main.ts` sets no `exposedHeaders`.

## Migration
`apps/api/prisma/migrations/20261002120000_product_sku_variant_cost_price/migration.sql`:
```sql
-- Purchase (cost) price per variant, paise. Admin-only; nullable, no default.
ALTER TABLE "variants" ADD COLUMN "costPrice" INTEGER;
-- Parent SKU used by the bulk Excel sheet. Nullable; Postgres UNIQUE allows many NULLs.
ALTER TABLE "products" ADD COLUMN "sku" TEXT;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
```
Schema: `Product.sku String? @unique`, `Variant.costPrice Int?`.

## Finding 1: single-row Size/Colour twin propagation (round-3 MEDIUM)
This applies only in single-row form, where a Parent row has no Child rows and is the variant with `sku = P`. Wizard-created single-variant products store Size and Color on both the product and the variant.

Definitions:
- `pAttrs` = a copy of the product's attributes; `vAttrs` = a copy of the variant's (`{}` when new).
- `sizeSet = {size}`, `colourSet = {colour, color}`.
- `holds(a, set, x)`: some key `k` with `k.trim().toLowerCase()` in `set` has a trimmed value equal to `x`.
- `has(a, set)`: some such key exists.

Rules:
- **Size** `s` (non-blank, trimmed): unchanged when `holds(vAttrs,sizeSet,s) || (!has(vAttrs,sizeSet) && holds(pAttrs,sizeSet,s))`. Otherwise:
  - `vAttrs = mergeAttr(vAttrs,'Size',sizeSet,s)`;
  - if `has(pAttrs,sizeSet)`, also `pAttrs = mergeAttr(pAttrs,'Size',sizeSet,s)`.
- **Colour** `c` (non-blank, trimmed): unchanged when `holds(pAttrs,colourSet,c) || (!has(pAttrs,colourSet) && holds(vAttrs,colourSet,c))`. Otherwise:
  - `pAttrs = mergeAttr(pAttrs,'Color',colourSet,c)`;
  - if `has(vAttrs,colourSet)`, also `vAttrs = mergeAttr(vAttrs,'Color',colourSet,c)`.
- A blank cell changes nothing. Child rows and multi-variant Parent rows keep the plain §6b mapping.
- **Export, single-row form:**
  - size = variant Size, else product Size;
  - colour = product Color, else variant Color.

  Lookups are case-insensitive. The "unchanged" test accepts exactly what the export writes, so a round trip makes no writes even when the twin values differ (AC-9).
- **Specs:**
  - Wizard-shaped `{Size:'M',Color:'Blue'}` on both levels, sheet Size `L` → both Size keys become `L`.
  - Sheet Colour `Red` → both Color keys become `Red`.
  - Unchanged re-import → no writes.
  - Product Size `Medium` with variant Size `M`, re-import → no writes.
  - (Extra) Variant without Size and product Size `M`, re-import → no writes.

## Round-3 NITs: do vs skip
| # | NIT | Decision | Where |
|---|---|---|---|
| 2 | Editor/wizard variant SKU equals another product's Parent SKU | DO: `VariantService.upsert` 409 + spec | FEAT-001 |
| 3 | Saving `sku=P` steals another legacy product's derived key | DO: group error + spec | FEAT-003 |
| 4 | Instructions: deleting a row doesn't delete | DO: Instructions rule 16b | FEAT-004 |
| 5 | `Weight (g)` header with gram values | DO: `mapHeaderRow.weightUnitHint` → `weightUnit` request field → row error over 50 kg | FEAT-002/003/004 |
| 6 | 429 from the global throttler | DO, partly: one retry after a fixed 60 s for image uploads (new behaviour-neutral `AdminUploadError.status`) and chunk POSTs. Reading `Retry-After` is consciously SKIPPED (header not exposed via CORS) | FEAT-004 |
| 7 | Timed-out chunk may be saved | DO: "…may have been saved — uploading the same file again is safe." | FEAT-004 |
| 8 | GST list is pre-GST-2.0 | DOC ONLY: no code change. Append open point A-28 to design.md §14 and mention it in the final report/commit body | finalize |
| 9 | Gallery replace drops alts | DO: keep the alt of retained URLs | FEAT-003 |
| 10 | Blank indicator with `parentSku === sku` | DO: inferred as Parent | FEAT-002 |
| 11 | P2002 on `slug` gets the raw message | DO: branch on `meta.target` | FEAT-003 |
| 12 | Editor tiers vs sheet tiers use different % bases | DO: Instructions rule 10 note | FEAT-004 |
| 13 | §11 vs AC-15 wording | DOC ONLY: design.md §11 says "changes by less than 1 kB" | finalize |

Skipped, to note in the final commit message: reading `Retry-After` (NIT 6 uses a fixed 60 s). NITs 8 and 13 are doc-only.

## Ordered items

- [ ] 1. FEAT-001: Migration + admin-only purchase price.
      Changes:
      - Add the schema fields and the migration above, then run `db:generate`.
      - `VariantService.upsert` accepts `costPrice` (undefined = unchanged, create → null). Add the NIT 2 Parent-SKU clash 409.
      - `VariantUpsertDto.costPrice` int 0..2147483647, nullable, optional.
      - `variant-edit.ts`: cost field, `pickAttr`, `mergeVariantAttrs`.
      - `product-editor.tsx`: "Purchase (₹)" column + hint.
      - `variant-slabs.tsx`: `reload()` uses `pickAttr`, `save()` uses `mergeVariantAttrs`.
      - Specs: variant.service (costPrice, NIT 2), product.service (detail/list don't leak `costPrice`), cart (line has no `costPrice`), variant-edit.

      Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261002120000_product_sku_variant_cost_price/migration.sql`, `apps/api/src/modules/catalogue/{variant.service.ts,variant.service.spec.ts,admin-catalogue.controller.ts,product.service.spec.ts}`, `apps/api/src/modules/cart/cart.service.spec.ts`, `apps/web/src/lib/{variant-edit.ts,variant-edit.test.ts}`, `apps/web/src/app/admin/catalogue/{product-editor.tsx,variant-slabs.tsx}`.

      Verify: `pnpm --filter @belzo/api db:generate`, `pnpm --filter @belzo/shared build`, `pnpm --filter @belzo/api typecheck`, `pnpm --filter @belzo/api test`, `pnpm --filter @belzo/api lint`, `pnpm --filter @belzo/web typecheck`, `pnpm --filter @belzo/web test`, `pnpm --filter @belzo/web lint`. All pass.

- [ ] 2. FEAT-002: Shared `bulk-sheet.ts` module.
      Changes:
      - First, save the `next build` route table to `.agents/tasks/bulk-excel-template/build-baseline.txt` (the AC-15 baseline).
      - Implement the full §3 API: columns, `SHEET_FIELD_MAX`, header matching with `oldFormat` and `weightUnitHint`, parsers, `groupSheetRows` with NIT 10, tier math, `exclusiveToInclusive`, `assignParentSkus`, `stableStringify`, `exportRowToInput`.
      - No module-scope side effects. Re-export it from `index.ts`.
      - Tests cover every §11 "Shared" case plus NITs 5 and 10.

      Files: `packages/shared/src/{bulk-sheet.ts,bulk-sheet.test.ts,index.ts}`.

      Verify: `pnpm --filter @belzo/shared test`, `pnpm --filter @belzo/shared build`, `pnpm --filter @belzo/shared lint`, `pnpm --filter @belzo/api typecheck`, `pnpm --filter @belzo/web typecheck`. All pass.

- [ ] 3. FEAT-003: API import/export (depends on 1 and 2).
      Changes:
      - `category-match.ts`. `bulkUpsert` swaps only `normKey`.
      - `ProductService`: make `uniqueSlug`/`findOrCreateBrandByName` public. Remove `exportRows`, `toExportRows`, `ProductExportRow`, their specs and `GET products/export`. Mark `POST products/bulk` `@deprecated`.
      - `bulk-sheet.plan.ts`: `mergeAttr`, `planProductGroup` with Finding 1 and the NIT 5 row error, `toSheetExportRows` with the Finding 1 export fallback.
      - `BulkSheetService`: §6a match/ownership/case hints, NIT 3, §6c transactions with NIT 9 alts and NIT 11 P2002 branching, `exportSheet`.
      - Controller: `GET products/sheet` and `POST products/bulk-v2` (`{ rows ≤1000, weightUnit? }`, field limits from `SHEET_FIELD_MAX`). Register the module provider.
      - Specs: every §11 API case, Finding 1, NITs 3/5/9/11, controller roles metadata.

      Files: `apps/api/src/modules/catalogue/{category-match.ts,category-match.spec.ts,bulk-sheet.plan.ts,bulk-sheet.plan.spec.ts,bulk-sheet.service.ts,bulk-sheet.service.spec.ts,admin-catalogue.controller.ts,catalogue.module.ts,product.service.ts,product.service.spec.ts}`.

      Verify: `pnpm --filter @belzo/shared build`, `pnpm --filter @belzo/api db:generate`, `pnpm --filter @belzo/api typecheck`, `pnpm --filter @belzo/api test`, `pnpm --filter @belzo/api lint`. All pass, and the existing `bulkUpsert` specs are unchanged and green.

- [ ] 4. FEAT-004: Admin web (depends on 2 and 3).
      Changes:
      - `pnpm --filter @belzo/web add exceljs@4.4.0 --save-exact`.
      - `csv.ts` `parseCsvTable`.
      - `product-xlsx.ts`: build/read via dynamic `import('exceljs')`. Instructions get rule 16b and the rule-10 note.
      - `product-sheet.ts`: CSV reader, `assignSkuFiles`, `chunkGroups`, `mergeIssues`, `withThrottleRetry`, `chunkFailureMessage`.
      - `admin-api.ts`: `AdminUploadError` with `status`, same messages.
      - `excel-download-button.tsx`, wired into the catalogue header.
      - Bulk page rewritten per §4. Delete `product-csv.ts` and `export-button.tsx`.
      - Tests per §11 "Web" plus NITs 4/5/6/7/12.
      - `next build` bundle check against the baseline.

      Files: `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/lib/{csv.ts,csv.test.ts,product-xlsx.ts,product-xlsx.test.ts,product-sheet.ts,product-sheet.test.ts,admin-api.ts}`, `apps/web/src/app/admin/catalogue/{excel-download-button.tsx,page.tsx,bulk/page.tsx}`. Deleted: `apps/web/src/lib/product-csv.ts`, `apps/web/src/app/admin/catalogue/export-button.tsx`. Optional: `apps/web/src/types/exceljs.d.ts` (A-13 fallback).

      Verify: `pnpm install`, `pnpm --filter @belzo/shared build`, `pnpm --filter @belzo/web typecheck`, `pnpm --filter @belzo/web test`, `pnpm --filter @belzo/web lint`, `pnpm --filter @belzo/web build`. All pass, and First Load JS for `/` and `/product/[slug]` moves by less than 1 kB versus the baseline.

- [ ] 5. Integration + review loop: run the full verification list below and fix the seams between FEATs. Then go through semantic review until `review.json` has `"verdict": "APPROVED"`.

- [ ] 6. Finalize:
      - Doc-only NITs 8 and 13 go into design.md.
      - Confirm all FEAT commits are on `master` (no push).
      - Final report covers: tests run, migration not applied to production (it must be applied on deploy with `pnpm --filter @belzo/api db:migrate`), manual Excel checks still pending (dropdowns, owner sample upload with images, storefront shows no purchase price), and the skipped NIT item.

## Final verification (PowerShell, repo root, one per call)
`pnpm install` → `pnpm --filter @belzo/shared build` → `pnpm --filter @belzo/shared test` → `pnpm --filter @belzo/shared lint` → `pnpm --filter @belzo/api db:generate` → `pnpm --filter @belzo/api typecheck` → `pnpm --filter @belzo/api test` → `pnpm --filter @belzo/api lint` → `pnpm --filter @belzo/web typecheck` → `pnpm --filter @belzo/web test` → `pnpm --filter @belzo/web lint` → `pnpm --filter @belzo/web build`. Optional, local DB only: `pnpm --filter @belzo/api db:migrate`.
