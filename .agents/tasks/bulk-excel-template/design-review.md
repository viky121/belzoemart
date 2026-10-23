# Design review (round 3): bulk Excel template (one format for download + upload)

Reviewed: `.agents/tasks/bulk-excel-template/design.md` (revision with §17 responses to round 2), checked against `apps/api/prisma/schema.prisma` + `migrations/`, `product.service.ts` (`detail`, `uniqueSlug`, `findOrCreateBrandByName`, `applyPriceSlabs`, `bulkUpsert`, `exportRows`), `variant.service.ts`, `admin-catalogue.controller.ts`, `cart.service.ts`, `app.module.ts` (throttler), `main.ts`, `packages/shared/{package.json,tsconfig.json,src/index.ts,src/money.ts,src/catalogue.ts,src/pricing.ts}`, `apps/web/{package.json,tsconfig.json,jest.config.js,next.config.mjs}`, `apps/web/src/lib/variant-edit.ts`, `apps/web/src/app/admin/catalogue/{bulk/page.tsx,page.tsx,export-button.tsx,product-editor.tsx,product-wizard.tsx,variant-slabs.tsx}`, `apps/web/src/app/(shop)/product/[slug]/{page.tsx,product-variants.tsx}` and `scripts/test-bulk.js`.

Verdict: **CHANGES_REQUESTED** (0 HIGH, 1 MEDIUM, 12 NIT).

Every round-2 finding is addressed in the text, and the fixes hold up against the code. The ownership check (§6a) closes the derived-SKU merge, the single-row multi-variant guard is in place, the old CSV is rejected as a whole, and `assignSkuFiles` fixes the image fallback. One medium gap is left. It comes from how the product wizard stores single-variant products, which earlier rounds didn't check.

## Findings

### 1. MEDIUM: Single-row edits to Size or Colour leave the twin attribute stale on wizard-created single-variant products
Where: §6b "Single-row extra rules" (`Colour` stays a product attribute; `Size` and `Pack Of` go to the variant); §7 single-row export (size = variant `Size`, colour = product `Color`).

What the code does: for a product without variants (`!hasVariants`), `product-wizard.tsx` writes `Size` and `Color` twice:
- as **product** attributes (lines 215–216, `a['Size'] = size; a['Color'] = color`);
- as **variant** attributes (lines 294–295).

The product editor's `ATTR_KEYS` also lists `Size` and `Color` as product attributes. The storefront shows product attributes in the spec list (`product/[slug]/page.tsx` line 141). The cart's `unit` label reads the variant's `Size` (`cart.service.ts` lines 66–70).

The problem: such a product exports in single-row form. If the owner changes Size from `M` to `L` in the sheet, only the variant `Size` changes. The storefront spec list still says "Size: M" while the cart says L. Changing Colour updates only the product `Color`, so the variant's `Color` (and its variant label) keeps the old value. A normal sheet edit leaves the product showing two different values.

Fix: in single-row form, propagate a **real edit** to the twin key. A plain re-upload must not write anything (AC-9).
```
Single-row Size (value s, non-blank):
  if no size-matching key on the variant holds s (a real change for the variant):
    variant attrs: mergeAttr(vAttrs, 'Size', size-matches, s)
    product attrs: if the product attributesJson has a size-matching key -> mergeAttr(pAttrs, 'Size', size-matches, s)
  else: nothing (the product's Size is not touched, even if it differs)
Single-row Colour (value c, non-blank):
  if no colour-matching key on the product holds c:
    product attrs: mergeAttr(pAttrs, 'Color', colour-matches, c)
    variant attrs: if the variant has a colour-matching key -> mergeAttr(vAttrs, 'Color', colour-matches, c)
  else: nothing
Export single-row: size = variant Size, else product Size; colour = product Color, else variant Color.
```
Because the twin is updated only when the primary value changes, an export → import round trip stays write-free, even when the twin already differs.

Specs:
- A wizard-shaped product (product `{Size:'M', Color:'Blue'}`, variant `{Size:'M', Color:'Blue'}`) with sheet Size `L` → both Size keys become `L`. Sheet Colour `Red` → both Color keys become `Red`.
- The same product re-imported unchanged → no writes.
- Product `Size:'Medium'` with variant `Size:'M'`, re-imported → no writes.

### 2. NIT: The editor and wizard can create a variant SKU equal to another product's saved Parent SKU
Where: §6b `parentSkuClash` covers only the sheet path. `VariantService.upsert` (used by the editor, `variant-slabs.tsx` and the wizard) checks only `variant.sku`.

Effect: after the editor adds variant `TSHIRT-001` to product B while product A has `sku = 'TSHIRT-001'`, the next download fails grouping on that row ("SKU X is also a Parent SKU in row N"). That breaks AC-9 for the row.

Fix: in `VariantService.upsert`, after the variant clash check, run `product.findUnique({ where: { sku: input.sku }, select: { id, title } })`. When it finds a product other than `input.productId`, throw `ConflictException('SKU "X" is the Parent SKU of "<title>" — use a different SKU')`. Add a spec to `variant.service.spec.ts`. Derived (unsaved) keys can stay unchecked; `assignParentSkus` just falls back for them.

### 3. NIT: Saving `sku = P` through step 2 or 3 can take another legacy product's derived Parent SKU
Where: §6a steps 2 and 3, plus §6c "plus `sku: P` when `product.sku` is null".

Scenario: null-sku product T is matched through its Child SKUs (step 2) under a Parent SKU P that equals another null-sku product L's derived key (`productOfDerivedSku.get(P) === L`). T saves `sku = P`, and L silently switches to `P-<slug>`. Any earlier download for L then fails as a group error. That error is visible, so nothing is merged, but the cause is unclear to the owner.

Fix: before saving `sku: P` for a null-sku target T, if `productOfDerivedSku.get(P)` is a product other than T, raise a group error on every row: `Parent SKU P is already the Parent SKU of "<L title>" — use a different Parent SKU.` Building the map is already lazy and cached. Spec: two legacy products where L's derived key is used as T's Parent SKU → group error, zero writes.

### 4. NIT: Instructions don't say that deleting a Child row does not remove the variant
Where: §7 Instructions. The owner's first message in this thread was about removing variants (200/500/1000 ml). A sheet user may delete the 500 ml Child row and expect the variant to disappear. Today it silently stays.

Fix: add Instructions #16b: "Deleting a row from the sheet does not delete the product or variant. To remove a variant, use Remove in the product editor."

### 5. NIT: Values that look like grams under a `Weight (g)` header are saved ×1000 with only a warning
Where: §3 aliases (`weightg` → weightKg); §6b "Weight over 50,000 g gives a warning". Fulfilment reads `variant.weightGrams` for shipping (`fulfilment.service.ts`).

A file that still has the owner's original `Weight (g)` header, with real gram values (e.g. `200`), saves 200 kg per unit. Only a warning is shown.

Fix: `mapHeaderRow` records which alias matched (`weightUnitHint: 'g' | 'kg' | null`) and the reader passes it on. When the header was `Weight (g)` and the value is over 50 kg, make it a row error instead of a warning: "Weight is in kg — N looks like grams; enter N/1000 (e.g. 0.2)". Kg values (the owner's sample) are unaffected.

### 6. NIT: 429s from the global throttler are not handled
Where: §4 Import steps 1 and 4; §10. `app.module.ts` registers `ThrottlerGuard` as `APP_GUARD` with 100 requests per 60 s. Image uploads (one request per file) plus chunk POSTs can exceed that on a large file. A 429 then turns into "image upload failed" or "Import request failed" errors, and the next chunk fails the same way.

Fix: in both the image-upload loop and the chunk loop, on HTTP 429 wait `Retry-After` seconds (default 60) with the progress text "Server busy — waiting N s…", then retry the same request once. If it fails again, use the current error path. Add a row to §10.

### 7. NIT: A chunk that times out may already be saved, but the message suggests it wasn't
Where: §4 Import step 4 ("Import request failed: <message>"). Imports are idempotent (diff-only upsert by SKU), so the server may commit after the browser or proxy has given up.

Fix: for network errors and 5xx/504, the row message is `Import request failed: <message>. Some of these rows may have been saved — uploading the same file again is safe.`

### 8. NIT: The GST list is the pre-GST-2.0 slab set
Where: FR-1 header, `GST_RATES`, Instructions #9. India's GST rationalisation (effective 22 Sep 2025) moved most goods to 5% and 18% and added 40%. 12% and 28% are now largely unused. This is not verifiable from the repo, and the header text is the owner's literal requirement, so keep it. `taxRatePct` is also capped at 28 by the existing DTOs.

Fix: keep `GST_RATES` as the single source for the dropdown, the header text and the parser (it already is). Add an open point A-28 telling the owner that 40% can't be entered anywhere yet. No behaviour change.

### 9. NIT: Gallery replacement drops existing alt texts
Where: §6c step 3 (`create rows with … alt: ''`). The editor stores `alt` per image (`setImages`). Changing one image cell in the sheet clears the alt of every image.

Fix: when creating the new rows, use `alt = existing.find((i) => i.url === url)?.alt ?? ''`.

### 10. NIT: A blank indicator with `parentSku === sku` is inferred as a Child
Where: §3 grouping step 2. People often copy the SKU into both cells on the Parent row. With the indicator blank, that row becomes a Child of itself. A new product then fails with "Parent SKU P was not found … add its Parent row."

Fix: a blank indicator becomes `parent` when `parentSku` is blank **or** equals `sku` after trimming, and otherwise `child`. Add a spec.

### 11. NIT: A unique-constraint race on `slug` gets the generic message
Where: §6c "`P2002` on `sku` becomes …". `uniqueSlug` runs before the transaction, so a concurrent create can raise P2002 on `slug`, and the admin sees Prisma's raw text.

Fix: branch on `err.meta?.target`. If it includes `sku`, use the existing message. If it includes `slug`, use "Another product with the same title was saved at the same moment — upload the file again." Anything else uses the generic text.

### 12. NIT: The editor's tier tool and the sheet use different bases for "%"
Where: §7 Instructions #10 vs `ProductService.applyPriceSlabs` (`unitPrice = round(sellingPrice × (1 − pct/100))`, used by `variant-slabs.tsx` and the wizard). The sheet's tiers are % off **MRP** (R-4, approved). The same "10%" gives different prices in the two places.

Fix: append to Instructions #10: "Note: the product editor's 'Bulk tiers' tool takes % off the Selling Price. The sheet takes % off MRP."

### 13. NIT: AC-15 and §11 state the bundle check differently
Where: AC-15 says First Load JS "changes by less than 1 kB". The §11 manual step says it is "unchanged versus `master`".

Fix: make §11 say "changes by less than 1 kB", matching AC-15.

## Verified assumptions
- Migration safety:
  - Tables are `@@map`ped (`products`, `variants`). Columns are camelCase without `@map`, as in `20261001120000_product_returnable` (`"isReturnable"`).
  - `ALTER TABLE "variants" ADD COLUMN "costPrice" INTEGER` and `ALTER TABLE "products" ADD COLUMN "sku" TEXT` are nullable with no default. Postgres stores that as metadata only.
  - `CREATE UNIQUE INDEX "products_sku_key"` matches Prisma's `@unique` naming. Postgres UNIQUE allows many NULLs.
  - `20261002120000` sorts after the latest migration `20261001120000`.
  - Neither column exists today.
- `VariantService.normaliseSlabs` returns zod-stripped `{minQty, unitPrice}` objects. `upsert` overwrites `attributesJson ?? {}` and `priceSlabsJson`, and leaves `weightGrams`/`imageUrl` unchanged when they are undefined. Create writes inventory 0. `remove()` soft-deletes ordered variants, and the sheet's `reactivate` restores them, matching the 409 text "re-upload it via Bulk upload to restore it".
- `VariantUpsertDto`:
  - `imageUrl` accepts `/…` app paths, so sheet-stored relative variant images survive an editor re-save.
  - `priceSlabs` has `.max(10)`, and the sheet writes at most 4.
  - `mrp`/`sellingPrice` have no `.max`.
  - `attributes: z.record(z.string())` has no length cap.
- `ProductService`:
  - `uniqueSlug`/`findOrCreateBrandByName` are private (to be made public). The brand lookup is case-insensitive.
  - `detail()` maps variants field by field (no spread), so `costPrice` can't leak.
  - `bulkUpsert`'s `normKey`/`resolveCategory` are as described (exact slug, then lower-cased slug, then `normKey` on active categories, then hints).
- Tier math, recomputed:
  - S/M (MRP 99,900, SP 79,900; 22/25/28/30 %) → 77,922 / 74,925 / 71,928 / 69,930.
  - L (MRP 109,900, SP 84,900): tier 2 = 85,722 > 84,900 is skipped, giving 82,425 / 79,128 / 76,930.
  - Shoes (MRP 499,500, SP 399,900): tier 2 = 409,590 is skipped, giving 399,600 / 389,610 / 374,625.
  - The output is strictly decreasing below SP with minQty ≥ 5, so it passes `normaliseSlabs`.
  - `resolveSlabPrice` (`catalogue.ts`) picks the highest `minQty ≤ qty`, and the cart uses the product-wide quantity (`cart.service.ts` line 64).
- Exclusive: `round(79,900 × 112 / 100) = 89,488`. The conversion happens before the `sp' > mrp'` check, so a converted price above MRP is a row error. `purchasePrice` and MRP are never converted.
- kg→grams: `Math.round(0.22 × 1000) = 220`, `0.85 → 850`, `0.2 → 200`. The export's `g/1000` re-imports to the same integer.
- Brand "1": `^\d+(\.\d+)?$` rejects `"1"` (an Excel numeric cell comes through as `"1"` via `plainNumber`), so the fallback takes `Zara` from the first Child row and adds a warning.
- Header matching: every FR-1 header and the owner's literal headers (`Weight (g)`, `Tax Type (Dropdown: …)`, `GST Rate (Dropdown: …)`, `Bulk Tier N (…) Discount %`, `image 1 (main image )`, `dimention (LWH)`, `purchasing price`, `Quantity/Stock`) normalise to listed aliases. `categoryslug` is gone, and the old header list sets `oldFormat`.
- Exactly one format: the bulk page and catalogue page are the only users of `PRODUCT_CSV_COLUMNS`, `export-button.tsx` and `GET /admin/products/export`, and all are removed. `scripts/test-bulk.js` exists and is the only reason the deprecated `POST /admin/products/bulk` stays.
- Round trip: the diff-only plan with `stableStringify`, whitespace-insensitive HSN, de-duplicated gallery no-op, `?? 0` stock, numeric Pack Of comparison and blank-for-oversize rules hold against the code paths checked. The new risk in finding 1 is the only one found.
- `costPrice` confidentiality: every storefront `variant.findMany` either selects fields (`fulfilment`, `return`, `invoice`, `review`) or maps fields explicitly (`cart`, `wishlist`, `order`, `ProductService.detail`/`toCard`). Raw variant rows reach only `GET /admin/products/:productId/variants` and `POST /admin/variants`, both under class-level `@Roles('catalogue_manager')`.
- Routes: `GET products/sheet` and `POST products/bulk-v2` don't clash with `products/:id/detail`, `products/:productId/variants` or `PATCH products/:id`. The JSON body limit is `1mb` (`main.ts` line 53).
- Tree-shaking premise (AC-15): `apps/web/tsconfig.json` maps `@belzo/shared` to `packages/shared/src/index.ts` (ESM source), and `transpilePackages` includes it. The storefront therefore bundles ESM source, where unused pure top-level declarations can be dropped. The "no module-scope side effects" rule is the right lever. Web jest also maps to the source, and ts-jest compiles `import()` to `require`.
- Shared has `fast-check` 3.20.0 and is CommonJS for the API (`dist`). The API resolves shared from `dist`, so building shared before the API typecheck is required, as §13 says.

## Unverified / wrong assumptions
- Wrong (incomplete): the single-row mapping assumes Size lives only on the variant and Colour only on the product. The wizard writes both to both (finding 1).
- Incomplete: "no SKU is both a Parent SKU and another product's variant SKU" is enforced only on the sheet path, not in `VariantService.upsert` (finding 2).
- Unverified (needs `next build`): Next 14 resolving exceljs's `browser` build through `import('exceljs')` (the A-13 fallback is defined), and the AC-15 First Load JS delta.
- Unverified: Excel/LibreOffice list-validation behaviour for percent-typed GST cells (A-9). The import accepts both forms either way.
- Unverified: interactive-transaction time for a 1,000-row group against the production DB (20 s timeout). It should be fine at this catalogue size, and a timeout fails only that group with "Not saved".
- Unverified: the owner's "recommendation" text (R-1…R-10, including the `Weight (kg)` header). No record of it exists in the repo, so it is accepted as the design states it.
- Unverified: the current GST slab structure (finding 8) is outside the repo. It is flagged for the owner only.
