# CSV round-trip editing for the catalogue + price/stock/SKU/status in the product editor

Two commits on `master` (dd951b4, 38a2eae, base 1e55992). They add `GET /admin/products/export`, which returns one bulk-upload-shaped row per variant (rupees, `|`-joined images by position, draft and published only). A pure RFC-4180 CSV module writes the export with a UTF-8 BOM and replaces the bulk page's old line-splitting parser. `bulkUpsert` now edits existing SKUs: title and category always, optional cells only when non-blank, and a non-empty `imageUrl` replaces the gallery in order. The product editor gets a "Variants, price & stock" section that saves through the existing variant upsert (sending back the variant's existing slabs, attributes, weight and image), inventory adjust (as a delta) and status PATCH. `VariantService.upsert` now returns 409 for duplicate SKUs. Money handling is correct end to end: integer paise on the wire, `Math.round(x*100)` on input, `/100` on export. The new endpoint inherits the class-level `@Roles('catalogue_manager')` under the global JwtAuthGuard + RolesGuard. I re-ran all 7 verification commands and they pass: api typecheck, api lint, api test (21 suites / 109 tests), shared test (7 / 66), web typecheck, web test (4 / 37), web build.

Watch for: re-uploading a stale export overwrites live stock with the export-time snapshot (confirmed). For multi-variant products, an edit made on any row except the last is silently reverted by the later unchanged rows (confirmed, documented as "last row wins"). If Excel turns numeric SKUs into new values, the re-upload creates duplicate products instead of failing (likely).

**Verdict**: APPROVED

## High-level view

The export is a pure mapper (`toExportRows`) behind a thin Prisma query, so the paise→rupee conversion, image ordering, null-brand and missing-inventory cases are all unit-tested without a database. The route sits before `products/:id/detail` and is covered by the same role guard as every other admin catalogue route.

On the web side, `parseCsv` is a character-level parser. It strips the BOM, keeps quoted commas, doubled quotes and CR/LF inside quotes, and skips blank records. Tests cover a round trip through `buildProductsCsv` with commas, quotes, a multi-line description, ₹ and Hindi text. The old parser would have broken exactly this case and read the BOM into the `sku` header, so these fixes are what make the round trip work.

Import semantics for an existing SKU are now "edit". The weak spots are in the CSV workflow rather than the code. The stock column is applied as an absolute overwrite. Product-level fields are repeated on every variant row, and the last row wins. Excel can change SKU and HSN values when it opens the file. The one-request upload is limited by the 5000-row zod cap and the 1 MB JSON body limit.

The editor section keeps bulk tiers safe by design: `variantUpsertBody` always echoes `priceSlabsJson`, `attributesJson`, `weightGrams` and `imageUrl`, and it returns `null` when SKU, MRP and price are unchanged, so a stock-only edit never touches the variant. Stock goes through `inventory.adjust` as `target − loaded available`, which keeps the StockMovement audit trail and does not clobber sales that happen while the form is open. The save runs in sequence (details → images → variants → stock → status), with step-labelled errors and a server reload afterwards. The variant, stock and status steps only run after the unchanged images PUT, whose schema rejects relative image URLs.

<details>
<summary>Issues (8)</summary>

1. **Stale-export stock overwrite** — re-importing an export after orders were placed resets `inventory.available` to the export-time value, which can lead to overselling (confirmed). At minimum, say in the bulk-page copy that the `stock` column should be cleared unless stock was recounted. A better fix is to have the import apply stock only when it differs from an exported baseline, or to apply it as a delta.
2. **Last-row-wins reverts edits on multi-variant products** — export repeats title, category, description, status and images on every variant row, so editing them on anything but the last row is silently undone (confirmed; documented in the copy). Consider detecting rows of the same product that disagree and reporting a per-row error or warning, or preferring the value that differs from the current one.
3. **Excel-mangled SKUs become new products** — opening the CSV in Excel converts `00123` to `123` and long numeric SKUs to `8.9E+12` *on open*, so the "format as Text" advice comes too late, and the re-upload creates duplicate products instead of erroring (likely). Recommend the Data → From Text/CSV import route in the copy, and/or report "created vs updated" counts so accidental creations are visible.
4. **Whole-catalogue upload hits request limits** — the bulk page sends all rows in one POST, and the API caps it at 5000 rows (zod) and 1 MB of JSON (`main.ts`). An exported catalogue with real descriptions will fail as a single request-level error (likely at a few thousand rows or fewer). Chunk the import client-side (for example, 200 rows per request) and remap row numbers.
5. **Editor saves blocked by relative image URLs** — `PUT /admin/products/:id/images` validates `z.string().url()`, but bulk import and local storage (without `PUBLIC_BASE_URL`) produce `/…` paths. For such products the new variant, stock and status edits never run because the images step fails first (possible; the schema is pre-existing). Align `productImagesSchema` with the "URL or app path" refine used elsewhere, or skip the PUT when images are unchanged.
6. **Failed save discards pending edits** — after a mid-sequence failure, `load()` in `finally` resets `edits` and `status`, so edits for variants that hadn't been saved yet and the chosen status are lost (confirmed, minor). Reload only the rows that were saved, or keep unsaved edits.
7. **CSV price edits bypass the slab invariant** — the existing-SKU branch of `bulkUpsert` updates `sellingPrice` without checking `priceSlabsJson`, so a price cut via CSV can leave bulk tiers more expensive than the base price (confirmed; the update line pre-dates this diff, but export makes CSV price editing the main workflow). Validate the slabs or clamp them as `VariantService` does.
8. **Untested page/editor wiring** — the bulk page's CSV-row → `Row` mapping (blank → `undefined`, rupees → paise, `|` split) and the editor's save sequencing have no tests. Only the pure helpers and the service are covered. Extract the row mapping into `lib/` and test export row → CSV → mapped row → `bulkUpsert` input.

</details>

<details>
<summary>Details</summary>

### Export endpoint and the paise→rupee mapper

The schema hard-deletes products and uses `archived` as its soft state, so the `status in ['draft','published']` filter is what excludes deleted products, and it is also what makes the `p.status` cast valid. Rupee values come from `v.mrp / 100`. JS formats integer paise as the shortest round-trip decimal (`19.99`, `799.5`), and the bulk page converts back with `Math.round(parseFloat(x) * 100)`, so prices come back exactly. `RolesGuard` uses `getAllAndOverride([handler, class])`, so the class-level `@Roles('catalogue_manager')` covers `exportProducts`.

The export does not neutralise cells starting with `=`, `+`, `-` or `@`, so a title like `=HYPERLINK(...)` would run as a formula in Excel (confirmed; low risk because only admins author titles). Prefixing `'` would break the round trip, so this is noted but not listed as an action item.

### Existing-SKU edit semantics in bulkUpsert

```
row (existing SKU) ─┬─ variant.update { mrp, sellingPrice }            always
                    ├─ product.update { title, categoryId, ...cells }  title/category always, others if non-blank
                    ├─ inventory.upsert { available: row.stock }       absolute, no StockMovement
                    └─ images: deleteMany + create(position = idx)     only when imageUrls non-empty
```

Three behaviours make "unedited export re-imports unchanged" true only when nothing changed in between:

- **Stock.** `available` is written absolutely and no StockMovement row is created. Any sale between export and import is undone. The copy tells admins that blank cells keep values, but it doesn't tell them to blank `stock`.
- **Product-level fields.** These repeat on every variant row, and rows are processed in order. With a 3-variant product, changing the title or images on row 1 is reverted by rows 2 and 3. The copy states the last-row-wins rule, but an admin will see "3 imported" without any hint that their edit was dropped.
- **Price slabs.** `sellingPrice` is updated without checking `priceSlabsJson`. This line pre-dates the diff, but `VariantService.upsert` (used by the editor) rejects the same situation, so the two edit paths now behave differently for the same price change.

### Excel as the editing tool

The BOM makes ₹ and Devanagari open correctly, and "CSV UTF-8" save keeps it. The parser strips it either way. The remaining risk is Excel's type coercion on open. Leading zeros in `sku` and `hsnCode` are dropped, long digit strings become scientific notation, and `1-2` becomes a date. The copy's advice to format the columns as Text only helps if the file is imported through Data → From Text/CSV. Formatting after a double-click open cannot restore the original digits. An HSN change is a silent data edit. A changed SKU no longer matches `variant.findUnique({ sku })`, so the row goes to the new-SKU branch and creates a second product, which is reported as a normal success.

`parseCsv` treats an unterminated quote as running to end of file, which silently merges the remaining rows into one cell (possible; Excel never writes such a file, but hand-edited files might contain one).

### Request size of a full-catalogue re-upload

`importRows` posts every row in one `POST /admin/products/bulk`. `bulkSchema` caps the request at 5000 rows, and `app.useBodyParser('json', { limit: '1mb' })` caps the payload. Descriptions (up to 5000 characters) are repeated per variant row, so a few hundred products with real copy can exceed 1 MB. The whole import then fails with one request-level error instead of per-row results. Before this change the bulk page was mainly used for new rows. Export → re-upload now makes full-catalogue payloads the normal case.

### Editor "Variants, price & stock" save path

```
save(): validateEdits ─▶ PATCH product ─▶ PUT images ─▶ POST /admin/variants (changed only)
                                                      ─▶ POST /admin/inventory/:id/adjust (delta ≠ 0)
                                                      ─▶ PATCH /admin/products/:id/status (if changed)
        finally: load() when any of the last three ran
```

The upsert endpoint overwrites `attributesJson` and `priceSlabsJson` unconditionally, so preserving bulk tiers depends entirely on `variantUpsertBody` echoing them back. That is a non-obvious coupling: a future change to the endpoint or the helper could quietly break it. `ProductEditor` and `VariantSlabsEditor` are mutually exclusive in `page.tsx` and remount when opened, which keeps them from writing stale SKU or price data over each other.

The images PUT sits in front of the new steps, and its schema is `z.string().url()`. Bulk import accepts `/…` paths, and `LocalStorageProvider.getUrl` returns `/api/uploads/...` when `PUBLIC_BASE_URL` and `CDN_BASE_URL` are unset. For those products the editor reports "Could not save images" and never reaches the variant, stock or status calls. The schema mismatch pre-dates this diff, but it now gates the new feature.

On a mid-sequence failure, `finally` calls `load()`, which resets `edits` and `status` from the server. Successful steps are reflected, but edits for later variants and the selected status are also discarded. After a slab-price 409/400 on variant 1, the admin has to re-enter stock and status for everything else. Swapping SKUs between two variants of the same product passes client validation and then fails with the new 409 on the first POST. The duplicate-SKU 409 is a read-then-write check, so two concurrent saves of the same SKU still hit Prisma P2002 and return a generic 500.

### Test coverage

Covered: `toExportRows` (paise, ordering, multi-variant, null brand/inventory, zero variants), the `exportRows` status filter, the four existing-SKU branches, the four new `VariantService.upsert` cases plus free-SKU create, CSV quoting/BOM/multi-line/Unicode round trip, filename format, and all `variant-edit` helpers including each validation message.

Not tested: the bulk page's parsed-record → `Row` mapping (where blank cells become `undefined`, and which "unchanged round trip" depends on), the editor's step sequencing, error-message composition and reload, and the export-button download path. The integration seam (export row → CSV → page mapping → `bulkUpsert`) was checked manually in the FEAT-002 findings, not by a test.

`page.tsx` and `variant.service.ts` were untracked before this task, so the commits add them whole. That means the "UpdateStockModal untouched" claim can't be checked against a git base.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/catalogue/admin-catalogue.controller.ts`: `GET products/export` route.
- `apps/api/src/modules/catalogue/product.service.ts`: `ProductExportRow`, `toExportRows`, `exportRows`, and existing-SKU edit/replace semantics in `bulkUpsert`.
- `apps/api/src/modules/catalogue/product.service.spec.ts`: fake `deleteMany`/`existingProducts`, existing-SKU edit tests, export mapper/query tests.
- `apps/api/src/modules/catalogue/variant.service.ts`: duplicate-SKU `ConflictException` (file newly tracked).
- `apps/api/src/modules/catalogue/variant.service.spec.ts`: new upsert tests.
- `apps/web/src/lib/csv.ts`, `csv.test.ts`: RFC-4180 parse/serialise with BOM.
- `apps/web/src/lib/product-csv.ts`: column list, export row type, `buildProductsCsv`, filename.
- `apps/web/src/lib/variant-edit.ts`, `variant-edit.test.ts`: editor change detection, payload, delta, validation.
- `apps/web/src/app/admin/catalogue/export-button.tsx`: fetch + Blob download button.
- `apps/web/src/app/admin/catalogue/bulk/page.tsx`: shared parser/columns, export button, edit-workflow copy.
- `apps/web/src/app/admin/catalogue/page.tsx`: export button in header (file newly tracked).
- `apps/web/src/app/admin/catalogue/product-editor.tsx`: variants/price/stock/status section and multi-step save.

Full diff: `git diff 1e55992..HEAD`.

</details>
