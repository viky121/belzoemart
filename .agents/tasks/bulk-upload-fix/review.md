# Admin bulk product upload: import all details and images

The CSV bulk importer previously created draft products with no images, no stock, and no brand, and its downloadable template pointed at a `grocery` category slug that does not exist — so every row failed with "unknown category" and admins had no way to discover valid slugs. This change extends the CSV contract to a backward-compatible superset (`description, brand, hsnCode, taxRatePct, stock, status, imageUrl`), rewrites `bulkUpsert` to attach images, set inventory from stock, find-or-create brands by name, publish new SKUs by default, and update existing SKUs (price + details + appended images) without wiping data, and reworks the frontend to fetch the live category tree so the template uses a real leaf slug and admins get a copy-friendly list of valid slugs. Prices stay integer paise end to end; per-row failures are isolated and reported.

Watch for: brand find-or-create runs outside the per-row transaction, so a brand can be created even if the row later fails (confirmed, cosmetic/orphan only). The frontend truncates `stock` to an integer but passes `taxRatePct` through `Number()` unrounded, so a decimal GST value would 400 the whole batch instead of becoming a per-row error (confirmed, low-likelihood input).

**Verdict**: APPROVED

## High-level view

The CSV schema keeps the five original required fields (`sku, title, categorySlug, mrp, sellingPrice`) and adds every new field as optional, so a legacy minimal CSV still validates and imports — the only behavioural change is that new SKUs now publish by default. Image URLs ride as a pre-split `imageUrls: string[]` that the schema accepts unconditionally; validation lives in the service so one bad URL is a per-row error rather than a request-level 400 that would drop the entire upload.

`bulkUpsert` keeps its `{ ok, errors:[{row,message}] }` shape with 1-based row numbers and a try/catch per row, and each row's writes run inside their own `prisma.$transaction` so a mid-row failure leaves nothing half-written and does not abort the batch. New SKUs create Product + Variant + Inventory(available=stock) + one ProductImage per URL in order; existing SKUs always update price, conditionally update parent-product fields, upsert inventory, and append only not-yet-present image URLs after the current max position without deleting anything.

Brands are matched case-insensitively by name and created with a deduped slug reusing the existing slug pattern. The frontend fetches `/admin/categories`, flattens to leaf nodes, builds the template from a real leaf slug (with a sensible fallback), and renders the valid slugs as a copyable list and `<datalist>` — the actual fix for the dead-slug failure mode.

The spec suite covers image attach order, inventory-from-stock, brand find-or-create (both reuse and create paths), publish-by-default plus explicit status, invalid imageUrl reported as a row error with no product written, and the existing-SKU update-and-append-without-duplicate path, alongside the retained price-invariant and unknown-category tests.

<details>
<summary>Issues (2)</summary>

1. **Brand created outside row transaction** — `findOrCreateBrandByName` runs before the per-row `$transaction`, so a brand row can persist even if the product write fails. Harmless orphan (reused on retry); optionally move inside the transaction or clean up unused brands.
2. **Unrounded taxRatePct on the frontend** — `stock` is `Math.trunc`'d but `taxRatePct` is passed through `Number()` as-is, so a decimal GST value fails the controller's `z.number().int()` and 400s the whole batch. Low-likelihood input (GST slabs are integers); mirror the `Math.trunc` treatment to be safe.

</details>

<details>
<summary>Details</summary>

### Backward-compatible CSV contract

`csvRowSchema` keeps `sku, title, categorySlug` as non-empty strings and `mrp, sellingPrice` as non-negative integers, and every added field (`description, brand, hsnCode, taxRatePct, stock, status, imageUrls`) is `.optional()`. A CSV carrying only the original required columns still validates, so legacy uploads keep working. `bulkSchema` retains the `rows.max(5000)` cap. The one deliberate behaviour change — new SKUs publish instead of draft — is surfaced in the page copy and the result panel.

`imageUrls` is typed as `z.array(z.string().trim().min(1)).optional()` and the schema does not try to validate URL shape. That is intentional: the frontend pre-splits the `imageUrl` column on `|`, and the service validates each entry so a malformed URL becomes a `{ row, message }` error instead of a 400 that would reject every row in the batch.

### Per-row isolation and transactionality

`bulkUpsert` iterates with a per-row try/catch, pushing `{ row: i + 1, message }` on failure and incrementing `ok` on success, preserving the `{ ok, errors }` contract the UI renders. Each row's writes run inside their own `prisma.$transaction(async (tx) => …)`, so a mid-row failure (e.g. the variant create succeeds but an image write throws) rolls back that row without touching the rest of the import.

Price and image validation happen before any write: `sellingPrice > mrp` → `sellingPrice exceeds mrp`, negatives → `prices must be non-negative`, and each image URL must match `/^https?:\/\//` or start with `/` (mirroring `categoryUpsertSchema.imageUrl`) or the row throws `invalid image url "<url>"` and writes nothing.

### New-SKU creation

```
Product(status: row.status ?? 'published', brandId?, description/hsnCode/taxRatePct defaults, isReturnable:true)
  └─ Variant(sku, mrp, sellingPrice)
       └─ Inventory(available: stock ?? 0)
  └─ ProductImage[] (one per imageUrls entry, position = index)
```

Slug comes from `uniqueSlug(title)` which loops `-2, -3, …` until free, matching the existing product pattern. Status defaults to `published` per the task — verified both in code (`row.status ?? 'published'`) and by the `publishes new SKUs by default` test.

### Existing-SKU update

Matched via `variant.findUnique({ where: { sku } })`. Price (`mrp`, `sellingPrice`) is always updated; `description, hsnCode, taxRatePct` and `brandId`/`status` are only written when present (`productData` built conditionally, `product.update` skipped when empty). Inventory is upserted when `stock` is provided. Images are appended, not replaced: existing URLs are collected into a `Set`, `imagesToAdd` filters out any already attached, and new rows start at `max(position)+1`. No `deleteMany` on the image path, so a blank/short image list never wipes the gallery. The `updates price and appends a new image for an existing SKU without duplicating` test locks this in (old.jpg kept, new.jpg at position 1).

One confirmed caveat: `productImage.findMany` and the `nextPos` computation happen just outside the `$transaction`, so concurrent imports touching the same product could race on position. For an admin bulk import this is acceptable, not blocking.

### Brand find-or-create

`findOrCreateBrandByName` does a case-insensitive `findFirst({ name: { equals, mode: 'insensitive' } })` (Postgres, consistent with the rest of the codebase) and, on miss, creates a brand with a slug deduped by `uniqueBrandSlug` (`slugify(name) || 'brand'`, then `-2, -3, …`). It is only called when `row.brand` is non-empty. Both paths are tested: an existing `Acme` is reused by id with no new brand created, and `Fresh Co` is created with slug `fresh-co`.

The call sits outside the per-row transaction, so a brand created for a row that later fails will persist as an orphan. It is reused on the next import and causes no incorrect data, so this is a cosmetic note rather than a defect.

### Frontend template and slug discovery

The page fetches `/admin/categories`, flattens the `CategoryNodeDto` tree to leaf nodes, and builds the template from the first leaf slug with a `tea-coffee` fallback if the fetch fails — directly replacing the dead `grocery` slug that caused the original failure. Valid leaf slugs are rendered both as a `<datalist>` and a scrollable copyable list. The preview table gains `Images` (count) and `Stock` columns, and the parser splits `imageUrl` on `|`, trims, drops empties, converts rupee prices to paise via `Math.round(parseFloat(x) * 100)`, and truncates `stock` with `Math.trunc`.

`taxRatePct` is converted with a bare `Number(r.taxRatePct)` and not truncated, unlike `stock`. A decimal entry would therefore fail the controller's `z.number().int().max(28)` and 400 the whole batch. GST rates are integer slabs in practice so this is low-likelihood, but mirroring the `Math.trunc` treatment would make the field as forgiving as `stock`.

### Money handling

Prices stay integer paise throughout: the frontend converts rupees to paise before POSTing, the schema enforces `z.number().int().min(0)`, and the service writes the values straight to `Variant.mrp`/`sellingPrice` (both `Int` in the schema). No floating-point money crosses the API boundary.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/catalogue/admin-catalogue.controller.ts` — new superset `csvRowSchema` (5 required + 7 optional fields), `bulkSchema` cap retained.
- `apps/api/src/modules/catalogue/product.service.ts` — `uniqueBrandSlug` + `findOrCreateBrandByName` helpers; `bulkUpsert` rewritten for images/stock/brand/status, new-SKU publish default, existing-SKU append-without-wipe, per-row `$transaction`.
- `apps/api/src/modules/catalogue/product.service.spec.ts` — expanded fake Prisma (brand/product/productImage/inventory) and six new bulkUpsert tests.
- `apps/web/src/app/admin/catalogue/bulk/page.tsx` — new file: 12-column CSV, dynamic template from live leaf slug, slug-discovery UI, Images/Stock preview columns, published-by-default copy.

Full diff: `git show f38d164`
</details>
