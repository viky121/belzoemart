# Verification — integration iteration 1 (no review.json yet)

Run from `c:\xampp\htdocs\Belzo`, PowerShell, one command per call, branch `master` at `7970ffe`. Ports 3000/4000 not listening before `next build`.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm install` | PASS (lockfile up to date) |
| 2 | `pnpm --filter @belzo/shared build` | PASS |
| 3 | `pnpm --filter @belzo/shared test` | PASS — 9 suites / 194 tests |
| 4 | `pnpm --filter @belzo/shared lint` | PASS — clean |
| 5 | `pnpm --filter @belzo/api db:generate` | PASS (no EPERM) |
| 6 | `pnpm --filter @belzo/api typecheck` | PASS |
| 7 | `pnpm --filter @belzo/api test` | PASS — 27 suites / 269 tests |
| 8 | `pnpm --filter @belzo/api lint` | PASS — clean |
| 9 | `pnpm --filter @belzo/web typecheck` | PASS |
| 10 | `pnpm --filter @belzo/web test` | PASS — 7 suites / 102 tests |
| 11 | `pnpm --filter @belzo/web lint` | PASS — 0 errors, 4 pre-existing warnings in untouched files (reviews-panel, admin/reviews, home-sections-editor, header-search) |
| 12 | `pnpm --filter @belzo/web build` | PASS |

## AC-15 bundle check (vs build-baseline.txt)
| Route | Baseline First Load | Now | Delta |
|---|---|---|---|
| `/` | 116 kB (page 2.01 kB) | 116 kB (page 2.01 kB) | 0 |
| `/product/[slug]` | 120 kB (page 6.11 kB) | 120 kB (page 6.11 kB) | 0 |
| shared by all | 87.1 kB | 87.2 kB | +0.1 kB |

Admin routes: `/admin/catalogue` 129 kB, `/admin/catalogue/bulk` 124 kB (exceljs is in an async chunk).

## FEAT status
FEAT-001..004 all `completed` (commits 0d29c3c, 3b382e4, bb4678a, 7970ffe).

## Seam checks
- Web → API contract: `excel-download-button.tsx` calls `GET /admin/products/sheet` (`SheetExport`); `bulk/page.tsx` posts `{ rows, weightUnit }` to `/admin/products/bulk-v2`. Matches `bulkSheetSchema` (rows 1..1000, `weightUnit` enum g/kg optional) and `BulkSheetService.importRows(rows, { weightUnit })`. `chunkGroups` caps chunks at 400 rows / 900 kB and slims Child title/description, so the per-field zod limits are not hit by Child rows; Parent over-long cells are caught client-side by `groupSheetRows`.
- Removed exports: no remaining references to `exportRows`, `toExportRows`, `ProductExportRow`, `/admin/products/export`, `product-csv`, `export-button`, `templateHref` in apps/, packages/ or scripts/.
- `POST /admin/products/bulk` still present (`@deprecated`) for `scripts/test-bulk.js`.
- `BulkSheetService` registered in `catalogue.module.ts` providers.

## Fixes this iteration
None required; no code changes, so no commit.

## Not run / not verified
- `db:migrate` not run: local Postgres was unreachable in FEAT-001; the migration `20261002120000_product_sku_variant_cost_price` must be applied on deploy (`scripts/deploy.ps1` doesn't run migrations).
- Manual: opening the .xlsx in Excel/LibreOffice (dropdowns), real upload with images against a running API, storefront shows no purchase price.
