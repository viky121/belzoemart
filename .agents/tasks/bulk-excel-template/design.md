# Bulk product Excel template (one format for download + upload)

## Part A: Requirements

### Summary
Replace the admin bulk product CSV (12 flat columns, one row per variant) with ONE Excel (.xlsx) workbook in the store owner's Parent/Child format. The same file is used to download all current products and to upload creates/updates. The old CSV format, its "Download template" link, its column list copy and the "Export products (CSV)" button go away. The import adds bulk tiers (% off MRP to price slabs), GST Inclusive/Exclusive handling, purchase price (new admin-only `Variant.costPrice`) and a stable parent SKU (new `Product.sku`).

### Functional requirements
- FR-1. The workbook has a sheet named `Products` with exactly these 29 headers in this order (row 1):
  `Parent/Child Indicator | Parent SKU | SKU | Final detail | Brand | Title | Description | Colour | Size | Weight (kg) | HSN Code | Tax Type (Dropdown: Inclusive/Exclusive) | GST Rate (Dropdown: 0%/5%/12%/18%/28%) | MRP (INR) | Selling Price (INR) | purchasing price | Quantity/Stock | Pack Of | Bulk Tier 1 (1-4 units) Discount % | Bulk Tier 2 (5-8 units) Discount % | Bulk Tier 3 (9-12 units) Discount % | Bulk Tier 4 (13-20 units) Discount % | Bulk Tier 5 (21+ units) Discount % | image 1 (main image ) | image 2 | image 3 | image 4 | image 5 | dimention (LWH)`
- FR-2. Download ("⬇ Download Excel") on the bulk page and in the catalogue page header exports every draft and published product: one Parent row per product plus one Child row per active variant. A single-variant product whose variant SKU equals its parent SKU is written as a single Parent row carrying the prices.
- FR-3. With no products, the file has the headers plus one example Parent+Child pair, clearly marked as an example. Uploading it unchanged imports nothing (example rows are skipped with a warning).
- FR-4. The workbook has dropdowns on Parent/Child Indicator, Tax Type, GST Rate and Final detail (list from the `Categories` sheet), a bold frozen header, set column widths and an `Instructions` sheet.
- FR-5. Upload accepts `.xlsx` (and `.csv` saved from it as CSV UTF-8, same headers). Header matching ignores case, surrounding spaces, anything in parentheses (so the `(Dropdown: …)` suffix, `(kg)`, `(INR)`, `(main image )`) and punctuation. It also accepts `Weight (g)` (values still kg) and the `dimention` typo. A file in the old 12-column CSV format is rejected as a whole with a message pointing to "⬇ Download Excel" (there is only one upload format).
- FR-6. Row model, field mapping, tiers, tax type, purchase price, images, upsert and parent SKU follow the rules the owner approved ("go with recommendation"). The owner's answers are not copied word for word into this file. Below is how this design applies them; Part B §6–§7 has the detail:
  - R-1 Row model: a Parent row is the product and a Child row is one variant of the Parent named in `Parent SKU`. A product with only one variant can be a single Parent row that carries the prices; its SKU is then the variant SKU.
  - R-2 `Final detail` is the category. A category name or a slug both work.
  - R-3 Weight values are in kg. The header is written as `Weight (kg)`, and `Weight (g)` is still accepted on upload.
  - R-4 Bulk tiers are % off MRP. Tier 1 (1–4 units) is reference only, because the Selling Price applies there. Tiers 2–5 become price slabs at 5, 9, 13 and 21 units.
  - R-5 Prices are stored GST-inclusive (Option A). Tax Type Inclusive is the default. Exclusive adds the GST Rate to the Selling Price on import. MRP is always inclusive.
  - R-6 `purchasing price` goes into a new admin-only `Variant.costPrice`, which can also be edited in the product editor.
  - R-7 Images are links or the names of selected files. Parent row images become the product gallery, and a Child row's image 1 becomes the variant photo.
  - R-8 Colour and Size become attributes. `dimention` becomes the product attribute `Dimensions`. Pack Of becomes a variant attribute.
  - R-9 Upsert is by SKU. A blank cell leaves the value unchanged. Quantity/Stock overwrites live stock.
  - R-10 The parent SKU is stored in a new `Product.sku`.
- FR-7. Results report per-row `{ row, sku, level: 'error'|'warning', message }`, where `row` is the spreadsheet row number. The bulk page shows them in an Errors table and a Warnings table.
- FR-8. The product editor's "Variants, price & stock" table shows and edits the purchase price (`costPrice`).
- FR-9. `costPrice` never appears in a storefront or public response.

### Non-functional requirements
- Money is integer paise end to end. Rupee↔paise conversion happens only at the sheet boundary.
- Each product group gets its own DB transaction. One failing product never affects another, and one invalid child row never blocks its valid siblings.
- The migration only adds things and is safe on the live DB: two nullable columns plus a unique index on a nullable column.
- RBAC: every new route sits on `AdminCatalogueController` (class-level `@Roles('catalogue_manager')`). Export is never public.
- `exceljs` is pinned to an exact version, added to `apps/web` only, and loaded with a dynamic `import()` inside admin event handlers so storefront bundles don't change.

### Acceptance criteria
1. The downloaded file opens in Excel with sheets `Products`, `Instructions` and `Categories`. Row 1 of `Products` equals the FR-1 headers exactly, in order. The header is bold and frozen.
2. Cells A2, L2 and M2 of `Products` carry list validations `Parent,Child`; `Inclusive,Exclusive`; `0%,5%,12%,18%,28%`. D2 (when at least one leaf category exists) carries `Categories!$A$2:$A$n`.
3. Uploading the owner's 7 sample rows into a DB that has the "Herbal Tea" category and no matching SKUs gives 0 errors and creates:
   - Product `TSHIRT-001`: sku `TSHIRT-001`, brand `Zara` (the parent's "1" is ignored, with a warning), taxRatePct 12, hsnCode `61091000`, attributes `{ Color: 'Blue' }`, status published. Variants S/M/L with attributes `{ Size, Color: 'Blue' }`, weightGrams 200/220/250, mrp 99900/99900/109900, sellingPrice 79900/79900/84900, costPrice 79000/79000/82000, stock 50/65/40.
   - Product `SHOES-102`: brand Nike, taxRatePct 18, 2 variants.
4. Slabs after AC-3:
   - TSHIRT-001-S and -M: `[{5,77922},{9,74925},{13,71928},{21,69930}]`.
   - TSHIRT-001-L: `[{9,82425},{13,79128},{21,76930}]`, plus a tier-2 warning.
   - SHOES-102-UK7 and -UK8: `[{9,399600},{13,389610},{21,374625}]`, plus a tier-2 warning on each.
5. Uploading the same file again reports 2 products updated and 0 created. No business field changes (no `product.update`/`variant.update` call is made, because the planner writes only diffs), no duplicate inventory rows and no StockMovement rows.
6. A row with `Tax Type = Exclusive`, GST 12% and Selling Price 799 stores sellingPrice 89488. If the converted price is above MRP, the row gets an error and nothing is written for that row.
7. A GST Rate outside {0, 5, 12, 18, 28} is a row error. `12%`, `0.12` and `12` all mean 12.
8. A tier cell given as `20%`, as Excel numeric `0.2` or as `20` means 20%.
9. Download → upload unchanged as `.xlsx` changes nothing in the DB, with one intended exception: a legacy product with null `Product.sku` gets its derived parent SKU saved. A second round trip then changes nothing at all. The same holds for:
   - products with more than 5 images;
   - slabs that don't fit the 5 tiers;
   - a non-standard stored GST rate such as 3%;
   - an empty gallery whose variants have photos;
   - descriptions with trailing whitespace;
   - brand names that differ only in case;
   - a multi-variant product at a non-standard GST rate (no errors; one "not a standard rate" warning on the Parent row);
   - an HSN stored with spaces;
   - a product title near 200 characters and attribute values up to 200 characters;
   - a gallery with duplicate URLs and more than 5 images;
   - lower-case `size` / `pack of` attribute keys.

   An Excel-saved `.csv` behaves the same, except for hand-set slab prices whose % off MRP isn't a whole or 2-decimal number (see A-10).
10. A child row with an error (e.g. Selling Price > MRP) is reported and skipped. Its sibling children and the product are still saved. A Parent row with an error fails its whole group: the parent row shows the error and each child row shows "not imported: Parent row N has errors".
11. A Child row whose Parent SKU isn't in the file attaches to the existing DB product with that parent SKU (exact, case-sensitive match). If no such product exists, the row errors, with a "did you mean …?" hint when only the letter case differs. Each of these is a group error that writes nothing:
   - a new Parent SKU with Child rows that equals an unrelated product's variant SKU;
   - a group whose Parent SKU or any existing SKU belongs to a product other than the matched one;
   - a Parent row with Child rows (or prices) whose Parent SKU matches a legacy product only through its derived Parent SKU while none of the group's SKUs is already a variant of that product;
   - a single Parent row whose SKU is one variant of a multi-variant product that has no saved Parent SKU.
12. `GET /api/v1/products/:slug` (and cards, search, cart, wishlist, orders) never includes `costPrice`. A spec asserts this for the product detail DTO.
13. The product editor shows "Purchase (₹)" per variant. Saving a change persists it; clearing the field sets null. Saving other fields keeps slabs, attributes, weight and image.
14. The bulk page and catalogue page have no CSV template link, no CSV column list and no "Export products (CSV)" button. `GET /admin/products/export` is removed.
15. `pnpm --filter @belzo/web build` succeeds. `exceljs` is only in an async chunk that admin click handlers load, so no chunk loaded by `/` or `/product/[slug]` contains it. Their First Load JS changes by less than 1 kB (shared `bulk-sheet.ts` has no module-scope side effects, so it tree-shakes out; see §3).
16. Uploading a file in the old CSV format (`sku,title,categorySlug,mrp,sellingPrice,description,brand,hsnCode,taxRatePct,stock,status,imageUrl`), as `.csv` or re-saved as `.xlsx`, shows the "This is the old CSV format…" message and sends nothing.

### Out of scope
- Pricing engine, checkout, invoices, remove-variant and media behaviour.
- Showing or editing `Product.sku` in the admin UI (it is set only by the sheet).
- Moving a variant from one product to another through the sheet (reported as an error).
- Server-side .xlsx parsing or generation.
- Fixing the pre-existing `PUT /admin/products/:id/images` `z.string().url()` rejection of `/…` paths. Backlogged; noted in the catalogue-edit-features review.
- Old `.xls` (binary) files. The page asks the user to save as `.xlsx`.

---

## Part B: Technical design

### 1. Overview
The format logic is pure and lives in `packages/shared/src/bulk-sheet.ts`: columns, header matching, cell parsers, grouping, tier math, Exclusive conversion and parent-SKU derivation. Both apps use the same rules from it.

The browser does everything that needs `exceljs`:
- It builds the .xlsx from JSON returned by a new admin export endpoint.
- It reads an uploaded .xlsx/.csv into string rows (`SheetRowInput[]`).
- It uploads referenced image files, as it does today.
- It posts product groups in size-bounded chunks to a new import endpoint.

The API (`BulkSheetService`) is the authority. Per request it groups the rows, matches each group to an existing product, plans and validates every row with a pure planner, then writes each product group in its own interactive transaction. It returns per-row issues.

Client-side xlsx handling was chosen over server-side parsing for three reasons:
1. Image file names must be resolved and uploaded in the browser before import, so the client has to read the sheet anyway.
2. Untrusted zip/XML parsing stays out of the API process.
3. Only one place depends on `exceljs`.

Server-side generation was rejected for the same single-dependency reason.

Technology (locked):
- NestJS 10 + Prisma 5.18 (Postgres) for the API.
- Next 14 client components for the web app.
- zod 3.23.8 for request validation.
- `exceljs` **4.4.0** (exact; MIT; latest on npm; `browser` field → `dist/exceljs.min.js`, ships `index.d.ts`).
- jest/ts-jest for tests and fast-check 3.20.0 (already a shared/API devDependency) for property tests.
- No other new dependencies.

### 2. Data model and migration
`apps/api/prisma/schema.prisma`:
```prisma
model Product {
  // … existing fields …
  sku            String?       @unique   // parent SKU from the bulk sheet; null for legacy products
}
model Variant {
  // … existing fields …
  costPrice      Int?                    // purchase price, paise; ADMIN-ONLY
}
```
New migration `apps/api/prisma/migrations/20261002120000_product_sku_variant_cost_price/migration.sql`:
```sql
-- Purchase (cost) price per variant, paise. Admin-only; nullable, no default.
ALTER TABLE "variants" ADD COLUMN "costPrice" INTEGER;
-- Parent SKU used by the bulk Excel sheet. Nullable; Postgres UNIQUE allows many NULLs.
ALTER TABLE "products" ADD COLUMN "sku" TEXT;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
```
Both columns are nullable with no default, so the ALTERs only change metadata. The unique index builds quickly because every existing value is NULL. Run `pnpm --filter @belzo/api db:generate` afterwards. `Product.isTaxInclusive` exists but nothing reads it; it is left untouched because prices are always stored inclusive.

### 3. Shared module `packages/shared/src/bulk-sheet.ts` (export from `index.ts`)
```ts
export type SheetKey = 'indicator'|'parentSku'|'sku'|'finalDetail'|'brand'|'title'|'description'
  |'colour'|'size'|'weightKg'|'hsnCode'|'taxType'|'gstRate'|'mrp'|'sellingPrice'|'purchasePrice'
  |'stock'|'packOf'|'tier1'|'tier2'|'tier3'|'tier4'|'tier5'
  |'image1'|'image2'|'image3'|'image4'|'image5'|'dimensions';
export type SheetCellKind = 'text'|'sku'|'money'|'percent'|'int'|'kg'|'list'|'image';
export const SHEET_NAME = 'Products';
export const SHEET_COLUMNS: readonly { key: SheetKey; header: string; width: number; kind: SheetCellKind }[];
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export const TIER_MIN_QTY = { tier2: 5, tier3: 9, tier4: 13, tier5: 21 } as const;
export const EXAMPLE_SKU_PREFIX = 'EXAMPLE-';
export const INT_MAX = 2_147_483_647;          // Postgres INTEGER max
export const PACK_OF_MAX = 10_000;
export function stableStringify(v: unknown): string;   // JSON with sorted object keys
export type SheetRowInput = { row: number } & Partial<Record<SheetKey, string>>;
export interface SheetIssue { row: number; sku: string; level: 'error' | 'warning'; message: string }
export interface SheetGroup { key: string; parent?: SheetRowInput; children: SheetRowInput[] }
export interface SheetImportResult {
  productsCreated: number; productsUpdated: number; variantsCreated: number; variantsUpdated: number;
  issues: SheetIssue[];
}
/** One sheet row as produced by the export. Money = rupees, weightKg = kg, stock/packOf = integers,
 *  tier1..5 = percent (e.g. 22 or 18.0018), everything else = text; null = blank cell. */
export type SheetExportRow = {
  [K in SheetKey]: K extends 'mrp'|'sellingPrice'|'purchasePrice'|'weightKg'|'stock'|'packOf'
    |'tier1'|'tier2'|'tier3'|'tier4'|'tier5' ? number | null : string | null
} & { indicator: 'Parent' | 'Child'; sku: string };
/** Max characters per cell, shared by the client pre-check, groupSheetRows and the API DTO. */
export const SHEET_FIELD_MAX: Readonly<Record<SheetKey, number>>;
export interface SheetCategoryOption { label: string; slug: string; path: string }
export interface SheetExport { rows: SheetExportRow[]; categories: SheetCategoryOption[] }
```

`SHEET_COLUMNS` (header text exactly as FR-1; width; kind):

| key | header | width | kind |
|---|---|---|---|
| indicator | Parent/Child Indicator | 14 | list |
| parentSku | Parent SKU | 16 | sku |
| sku | SKU | 18 | sku |
| finalDetail | Final detail | 22 | list |
| brand | Brand | 14 | text |
| title | Title | 36 | text |
| description | Description | 48 | text |
| colour | Colour | 10 | text |
| size | Size | 10 | text |
| weightKg | Weight (kg) | 11 | kg |
| hsnCode | HSN Code | 12 | sku |
| taxType | Tax Type (Dropdown: Inclusive/Exclusive) | 16 | list |
| gstRate | GST Rate (Dropdown: 0%/5%/12%/18%/28%) | 14 | list |
| mrp | MRP (INR) | 11 | money |
| sellingPrice | Selling Price (INR) | 13 | money |
| purchasePrice | purchasing price | 13 | money |
| stock | Quantity/Stock | 12 | int |
| packOf | Pack Of | 9 | int |
| tier1..tier5 | Bulk Tier 1 (1-4 units) Discount % … Bulk Tier 5 (21+ units) Discount % | 14 | percent |
| image1 | image 1 (main image ) | 30 | image |
| image2..image5 | image 2 … image 5 | 30 | image |
| dimensions | dimention (LWH) | 16 | text |

`SHEET_FIELD_MAX`:
- 20: indicator, gstRate, hsnCode
- 30: weightKg, mrp, sellingPrice, purchasePrice, stock, packOf, tier1..5
- 40: taxType
- 60: parentSku, sku
- 200: finalDetail, brand, title, colour, size, dimensions
- 2048: image1..5
- 5000: description

The values come from the existing product/variant DTOs: title 200, description 5000, sku 60. HSN gets a 20-character envelope because the planner checks the real limit of 12 itself, which makes a too-long HSN a row error rather than a 400. `colour`, `size` and `dimensions` are 200 because product and variant attributes are `z.record(z.string())` with no length cap (checked in `admin-catalogue.controller.ts`), so an editor-entered value can be longer than 60 and the export must still round-trip it. Values over 200 are rejected; the editor has no such values in practice, and A-18 covers the same kind of legacy outlier for SKUs.

`title` and `description` are not length-checked on Child rows (the import ignores them, and `slimChildRow` drops them before sending). The export truncates the Child title to 200 characters (§7).

**Key-order-insensitive JSON**: `stableStringify(v: unknown): string`. Like `JSON.stringify`, but object keys are sorted (recursively); array order is kept. The planner uses it to diff `attributesJson` and `priceSlabsJson`, because Postgres `jsonb` does not keep object key order (it stores shorter keys first, then bytewise), so the read-back object's key order is not the order the app wrote.

**SKU comparison**: SKU and Parent SKU comparisons are exact (case-sensitive) after trimming, in grouping, in duplicate checks and in DB matching. This matches the DB: `Variant.sku` and the new `Product.sku` are case-sensitive unique indexes. `ABC` and `abc` are two different SKUs. Only the `EXAMPLE-` prefix test is case-insensitive. Case-only near misses get a hint (grouping step 8, §6a), never an automatic match.

**No module-scope side effects.** `bulk-sheet.ts` holds only literal arrays and objects plus functions at the top level. The alias lookup `Map` is built lazily on the first `canonicalHeader` call and cached in a module `let`. This keeps the module tree-shakeable out of storefront bundles (AC-15), even though it is re-exported from `index.ts`.

**Header matching**: `normHeader(raw: string): string` does steps 1–4 and `canonicalHeader(raw: string): SheetKey | null` adds step 5.
1. Strip a BOM.
2. Remove every `( … )` group, including an unclosed trailing one: `/\([^)]*(\)|$)/g`.
3. Lower-case.
4. Remove everything that isn't `a-z0-9`.
5. Look the result up in an alias table:
   - `parentchildindicator|indicator|parentchild|type` → indicator
   - `parentsku` → parentSku; `sku` → sku
   - `finaldetail|category` → finalDetail (no `categoryslug`: that header exists only in the old CSV format)
   - `brand` → brand; `title` → title; `description` → description
   - `colour|color` → colour; `size` → size
   - `weight|weightkg|weightg` → weightKg
   - `hsncode|hsn` → hsnCode
   - `taxtype` → taxType
   - `gstrate|gst` → gstRate
   - `mrp|mrpinr` → mrp; `sellingprice|sellingpriceinr` → sellingPrice
   - `purchasingprice|purchaseprice|costprice` → purchasePrice
   - `quantitystock|quantity|stock` → stock
   - `packof` → packOf
   - `bulktierNdiscount|bulktierN` → tierN (N = 1..5)
   - `imageN|imageNmainimage` → imageN
   - `dimention|dimension|dimensions|dimentionlwh|dimensionslwh` → dimensions

`mapHeaderRow(headers: string[]): { index: Map<SheetKey, number>; unknown: string[]; duplicates: string[]; oldFormat: boolean }` uses the first occurrence of each key.
- `oldFormat` is true when `index` has no `indicator` key and at least one header's `normHeader` value is in `OLD_FORMAT_HEADERS = ['categoryslug', 'taxratepct', 'imageurl', 'status']`. Those four headers are what the removed `product-csv.ts` (`PRODUCT_CSV_COLUMNS`) wrote and the new template never has.
- Both readers (§4) turn `oldFormat` into the fatal `OLD_FORMAT_MESSAGE` = `This is the old CSV format. Click "⬇ Download Excel", copy your rows into that file and upload it.` Nothing is sent. Without this, an old export would map (sku, title, mrp, …) and import every row as a single-row Parent with GST, images and status silently dropped.

**Cell parsers.** Each returns `{ ok: true, value } | { ok: false, error: string }`. A blank or whitespace-only input gives `{ ok: true, value: null }`.
- `parseText(s, max)`: trims. Longer than `max` is an error: `"<Column> is longer than <max> characters"`.
- Numeric syntax (all numeric parsers). After the parser's own stripping, the remaining text must match `/^\d+(\.\d+)?$/` (money, kg, percent) or `/^\d+$/` (int). `Number()` is called only after the regex passes, so hex (`0x10`), exponents (`1e3`), `Infinity`, `.5` and `5.` are parse errors with the parser's normal message. A leading `-` followed by a digit gives the parser's "cannot be negative" error instead. Excel numeric cells never reach this as exponent text because `cellToString` writes plain decimals (§4).
- `INT_MAX = 2_147_483_647` (Postgres `INTEGER`; `mrp`, `sellingPrice`, `costPrice`, `weightGrams` and `Inventory.available` are all `Int`). Bounds are checked in the parsers so a too-large value is one row error, never a failed DB write that would fail the whole group.
- `parseRupeesToPaise(s, column)`: strips a leading `/^(₹|rs\.?|inr)\s*/i` and a trailing `/\s*(inr|rs\.?|\/-)$/i`, then all commas and spaces, then the regex, then `Number()`. The empty string after stripping is an error, not 0. Converts with `rupeesToMoney()` from `money.ts`. A result above `INT_MAX` paise is the error `"<Column> is too large"`. Errors: `"<Column> must be a number in rupees, e.g. 799 or 799.50"` / `"<Column> cannot be negative"`.
- `parsePercent(s, column)`: a trailing `%` (spaces allowed before it) means the value is the percent; it is removed before the regex. Otherwise `n = Number(s)`: `0 < n < 1` becomes `Number((n*100).toPrecision(12))`; any other `n` is used as-is. Errors: `"<Column> must be a percentage, e.g. 20%"` / `"<Column> cannot be negative"`. (Range checks are the caller's: GST list, tiers 0–95.)
- `parseGstRate(s)`: runs `parsePercent`, then accepts only values within 1e-9 of one of `GST_RATES` and returns that integer. Error: `"GST Rate must be one of 0%, 5%, 12%, 18%, 28%"`.
- `parseTaxType(s)`: lower-case starting `incl` → 'inclusive'; starting `excl` → 'exclusive'. Error: `"Tax Type must be Inclusive or Exclusive"`.
- `parseIndicator(s)`: `parent|p` → 'parent'; `child|c|variant` → 'child'. Error: `"Parent/Child Indicator must be Parent or Child"`.
- `parseNonNegInt(s, column, max = INT_MAX)`: strips commas and spaces, `/^\d+$/`, `Number()`. Errors: `"<Column> must be a whole number (0 or more)"` / `"<Column> cannot be negative"`. Above `max` is `"<Column> is too large (max N)"`. Stock uses `INT_MAX`; Pack Of uses `max = 10_000`.
- `parseKgToGrams(s)`: strips a trailing `kg`/`kgs` (case-insensitive, spaces allowed), the regex, `Number()`, then `Math.round(n * 1000)`. Errors: `"Weight must be a number in kg, e.g. 0.25"` / `"Weight cannot be negative"`. Grams above `INT_MAX` is `"Weight is too large"`. The 50 kg warning in the planner stays.
- `<Column>` in every message is `columnLabel(key)`: the key's `SHEET_COLUMNS` header with every `( … )` group removed, whitespace collapsed to one space and trimmed (e.g. `Bulk Tier 2 Discount %`, `GST Rate`, `MRP`, `Selling Price`, `purchasing price`, `Quantity/Stock`, `Pack Of`). `parseGstRate` replaces any `parsePercent` error with its own list message.

**Grouping**: `groupSheetRows(rows: SheetRowInput[]): { groups: SheetGroup[]; issues: SheetIssue[] }`. There are two passes over the rows in input order. Pass 1 applies steps 1–5, collects keys and records failed Parent rows. Pass 2 applies steps 6–8, which need to know which Parent rows exist and which have children. All SKU comparisons are exact after trimming (see "SKU comparison" above).
1. Skip rows whose every value is blank. Skip rows whose `sku` starts with `EXAMPLE-` (case-insensitive) with a warning: "Example row skipped — delete it or replace it with a real product."
2. Indicator: parsed. A blank indicator becomes `child` if `parentSku` is set, else `parent`. An invalid value is an error and the row is excluded. Its role is unknown, so it never cascades.
3. Length check: any cell longer than `SHEET_FIELD_MAX[key]` is an error, `"<Column header> is longer than N characters"`, and the row is excluded. On Child rows `title` and `description` are skipped by this check. The client runs this too, so an over-long cell never reaches the zod DTO as a whole-chunk 400. (The length check runs after the indicator so it knows the role; an invalid indicator excludes the row before it.)
4. A blank `sku` is the error "SKU is required".
5. Parent rows: key = `sku`. A second valid Parent row with the same SKU is an error on the later row: "Parent SKU X is already used in row N". A Parent row whose trimmed `parentSku` is non-blank and differs from its `sku` keeps key = `sku` and gets the warning "Parent SKU on a Parent row is ignored — its SKU (X) is the Parent SKU." (equal values give no warning). Child rows need a `parentSku` ("Parent SKU is required on Child rows"); key = `parentSku`.
   - Failed parents: when a row whose indicator resolved to `parent` is excluded by step 3 and its trimmed `sku` is non-blank, record `failedParents.set(sku, row.row)`. A duplicate Parent row (step 5) is not recorded, because the earlier Parent row with that SKU is valid and the children belong to it.
6. Cascade: every Child row whose `parentSku` is in `failedParents` and has no valid Parent row in the file gets the error `Not imported: Parent row N has errors.` and is excluded. This is what makes AC-10 hold for parents rejected during grouping.
7. Variant-SKU uniqueness, across child SKUs and the SKUs of Parent rows that have no children (single-row products): a repeat is an error on the later row: "SKU X is already used in row N". A child SKU equal to its own group's key is allowed. A child SKU equal to a different group's key is the error "SKU X is also a Parent SKU in row N".
8. Case hint: a Child row whose `parentSku` has no exact Parent row in the file, but equals a Parent row's SKU ignoring case, gets the warning "Parent SKU tshirt-001 differs only in letter case from the Parent row N (TSHIRT-001). SKUs are case-sensitive, so this row is not part of that product." It still forms its own group (which then matches the DB exactly or errors in §6a).
9. Groups come out in order of first appearance. Children keep row order. Excluded rows are not in any group.

**Tier math**: `buildTierSlabs(mrp, sellingPrice, tiers: { tier2..tier5: number | null }): { mode: 'keep' } | { mode: 'replace'; slabs: { minQty; unitPrice }[]; warnings: string[] }`.
- All four null → `keep`.
- Otherwise `prev = sellingPrice`. For k in 2..5 with a non-null `t`:
  - `price = Math.round(mrp * (100 - t) / 100)`.
  - If `price > sellingPrice`, skip with the warning `"Bulk Tier k (t% off MRP = ₹x) is above the Selling Price ₹y — tier skipped"`.
  - Else if `price >= prev`, skip with the warning `"Bulk Tier k (₹x) is not lower than the previous price ₹p — tier skipped"`.
  - Else push `{ minQty: TIER_MIN_QTY[k], unitPrice: price }` and set `prev = price`.
- The result is ascending by minQty, has minQty ≥ 5 and is strictly decreasing below sellingPrice, so it always satisfies `VariantService.normaliseSlabs`.
- A tier equal to the selling price is skipped. It counts as "not lower".
- Range checking (0 ≤ t ≤ 95, same cap as `applyPriceSlabs`) happens in the planner before this call.

**Tier export**: `tierPercentsFromSlabs(mrp, sellingPrice, slabs)`.
- Returns null when any of these holds:
  - `mrp <= 0`;
  - any slab's minQty isn't one of 5/9/13/21;
  - the slabs (sorted by minQty) aren't strictly decreasing and all below `sellingPrice`. `normaliseSlabs` allows equal prices, which `buildTierSlabs` would skip;
  - any resulting percent is above 95. The import range check would reject it, so a round trip would fail.
- Null means "not representable", and the export leaves tiers 2–5 blank so a re-upload keeps the slabs unchanged.
- Otherwise returns a percent per present tier: `(1 - unitPrice / mrp) * 100`, full precision.
- `tier1Percent(mrp, sp)` = `(1 - sp/mrp)*100`, or null when mrp ≤ 0.

**Exclusive conversion**: `exclusiveToInclusive(paise, gstPct) = Math.round(paise * (100 + gstPct) / 100)`.

**Parent SKU derivation**: `assignParentSkus(products: { id; slug; sku: string | null; activeSkus: string[]; allSkus: string[] }[]): Map<string, string>`. The caller orders products by `createdAt asc, id asc`.
- Pass 1: products with a stored `sku` keep it, and it is reserved.
- Pass 2: for each product with a null sku:
  - Candidate = longest common prefix of `activeSkus`, with trailing `-`, `_`, `/`, `.` and spaces trimmed.
  - Reject the candidate if it is shorter than 3 characters, if `activeSkus` is empty, or if it is already taken. Taken means a reserved or assigned parent SKU, or any SKU in another product's `allSkus`. The product's own variant SKUs don't count.
  - On rejection, use `P-${slug.slice(0, 40)}` (trailing `-` trimmed). If that is taken too, use `P-${slug.slice(0, 40)}-${id.slice(0, 8)}`. Slugs can be about 200 characters, so the truncation keeps every derived SKU at 51 characters or fewer, inside the 60-character SKU limit.
  - Reject a longest-common-prefix (LCP) candidate longer than 60 characters, which only happens with legacy SKUs over 60, and fall back as above.
- A single-variant product therefore usually gets its own variant SKU.
- The export and the import's step-d matching both call this with the same query, so they agree.

**Test/round-trip helper**: `exportRowToInput(r: SheetExportRow, row: number): SheetRowInput`. It turns an export row into the strings the client sends. Money and kg use `String(n)`. Percents use `${Number(pct.toPrecision(15))}%`, the same as `cellToString` on a percent-formatted cell. Null becomes `undefined`. The API round-trip spec uses it.

### 4. Client reading and upload (web)
New dependency: `pnpm --filter @belzo/web add exceljs@4.4.0 --save-exact`.

`apps/web/src/lib/product-xlsx.ts` (no React; statically importable; `exceljs` is loaded lazily):
```ts
async function loadExcel(): Promise<typeof import('exceljs')> {
  const mod = await import('exceljs');
  return ((mod as { default?: unknown }).default ?? mod) as typeof import('exceljs');
}
export async function buildProductWorkbook(data: SheetExport): Promise<ArrayBuffer>;   // §7
export async function readProductWorkbook(buf: ArrayBuffer): Promise<ParsedSheet>;
export function cellToString(value: unknown, numFmt: string | undefined, kind: SheetCellKind): string;
export interface ParsedSheet { rows: SheetRowInput[]; issues: SheetIssue[]; fatal?: string }
```
- `readProductWorkbook` loads the buffer. It picks the sheet named `Products` (case-insensitive), or else the first sheet whose row 1 maps a `sku` header. If none, `fatal` = "This file doesn't look like the Belzo product template — no SKU column found."
- It maps headers from row 1: `ws.getRow(1).getCell(c)` for `c = 1..ws.columnCount`, each through `cellToString(…, 'text')`, then `mapHeaderRow`. Unknown headers give one warning on row 1: "Ignored columns: …". Duplicate headers give a warning too: "Column X appears twice — the first one is used."
- It then walks the data rows with `ws.eachRow({ includeEmpty: false }, (row, rowNumber) => …)`, skipping `rowNumber === 1`, with `row` = `rowNumber`. Each mapped key reads `row.getCell(index + 1)` → `cellToString(cell.value, cell.numFmt, kind)`. Do not loop to `ws.actualRowCount`: that is the number of non-empty rows, not the last row number, so a blank row in the middle would silently drop the last rows of the file.
- `wb.xlsx.load` throwing (corrupt zip, password-protected file, `.xls` renamed) is fatal: "Could not read this Excel file. Open it in Excel, save it as .xlsx and try again." A dynamic `import('exceljs')` failure (ChunkLoadError) is fatal: "Could not load the Excel reader. Refresh the page and try again."
- After header mapping: `oldFormat` is fatal with `OLD_FORMAT_MESSAGE` (§3).
- More than 5,000 non-blank data rows is fatal: "Too many rows (N). Upload at most 5,000 rows at a time — split the file, keeping each product's Parent and Child rows in the same file." The download has no cap, so Instructions #1 says the same for catalogues above 5,000 rows.
- `cellToString` rules:
  - null/undefined → `''`.
  - number:
    - percent kind with `numFmt` containing `%` → `${plainNumber(Number((v*100).toPrecision(15)))}%`.
    - sku kind and integer → `v.toFixed(0)`.
    - anything else → `plainNumber(v)`.
    - `plainNumber(v)`: `String(v)` when it has no `e`; otherwise `v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })`. So an Excel number such as `1e21` or `1e-7` reaches the parsers as plain digits and gets the normal "too large" or rounding behaviour, while exponent *text* typed into a cell is still rejected by the numeric regex (§3).
  - string → trimmed.
  - boolean → `TRUE`/`FALSE`.
  - Date → `yyyy-mm-dd`.
  - `{richText}` → joined `text`.
  - `{text, hyperlink}` → for image kind, the `hyperlink` if it matches `^https?://`, else `text`; for other kinds, `text`.
  - `{formula|sharedFormula, result}` → recurse on `result`.
  - `{error}` → `''`.

`apps/web/src/lib/product-sheet.ts` (pure):
- `readProductCsv(text): ParsedSheet` uses the new `parseCsvTable` in `lib/csv.ts`. That function returns every record as trimmed `string[]`, BOM stripped, blank records kept so record index + 1 = row number. `parseCsv` is reimplemented on top of it with the same behaviour and tests. `toCsv`/`CSV_BOM` stay.
  - The header is record 1 (after the BOM); there is no header search. If record 1 maps no `sku` header, `fatal` is the same "This file doesn't look like the Belzo product template — no SKU column found." used for .xlsx. `oldFormat` is fatal with `OLD_FORMAT_MESSAGE`. Unknown/duplicate header warnings and the 5,000-row fatal are the same as for .xlsx.
  - The bulk page reads the file with `file.text()`, which decodes UTF-8. Excel's plain "CSV (Comma delimited)" save is not UTF-8, so ₹ and Hindi text would be garbled; Instructions #19 and the upload sub-text ask for "CSV UTF-8 (Comma delimited)", as the old page did. There is no encoding detection.
- `imageRefs(row): string[]`: non-blank image1..5. `isUrlRef(s)`: `^https?://` or starts with `/`.
- `assignSkuFiles(fileKeys: string[], skus: string[]): Map<string, string[]>` replaces the page's `skuFiles`. Keys of the result are lower-cased trimmed SKUs; `fileKeys` are the page's lower-cased file names (`imageFiles.keys()`).
  - For each file, `base` = name without its last extension. A SKU `s` (lower-cased) matches when `base === s || base.startsWith(s + '-') || base.startsWith(s + '_')`, the same rule as today's `skuFiles`.
  - Each file goes to the **longest** matching SKU among all Parent and Child SKUs of the parsed file, so `tshirt-001-s.jpg` goes to `TSHIRT-001-S`, not to its Parent `TSHIRT-001`. A file that matches no SKU is not assigned.
  - Order within one SKU: the exact-base file (`base === s`) first, then the rest sorted by name (`localeCompare`). This makes `tshirt-001.jpg` the main image, ahead of `tshirt-001-2.jpg`, which plain `.sort()` would put first (`-` sorts before `.`).
  - Two SKUs that differ only in letter case share one lower-cased key and get the same files (file names are matched case-insensitively, as today).
- `applyResolvedImages(row, resolve: (ref) => string | undefined): { row } | { error }`.
- `chunkGroups(groups, { maxRows: 400, maxBytes: 900_000 }): { chunks: SheetRowInput[][]; issues: SheetIssue[] }` packs whole groups (after `slimChildRow`). Bytes are measured with `new TextEncoder().encode(JSON.stringify({ rows })).length`.
  - Groups are added to the current chunk while it stays within 400 rows and 900,000 bytes; otherwise a new chunk starts.
  - A group with more than 400 rows but at most 1,000 rows and 900,000 bytes goes alone in its own chunk.
  - A group over 1,000 rows (the DTO cap) or over 900,000 bytes on its own is not sent. Every one of its rows gets the error "This product has too many rows to import at once (max 1,000 rows / 900 KB) — split its Child rows into separate uploads." This way the 1 MB JSON limit (`main.ts` `useBodyParser('json', { limit: '1mb' })`) and the zod `max(1000)` are never hit by the UI.
- `slimChildRow(row)` drops `title` and `description` from Child rows before sending (the server ignores them) to keep requests under the 1 MB JSON body limit.
- `productsXlsxFilename(d = new Date())` → `belzo-products-YYYY-MM-DD.xlsx`.

Bulk page `apps/web/src/app/admin/catalogue/bulk/page.tsx` (rewritten around the new types; existing image-matching helpers kept):
- File input `accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"`, `data-testid="bulk-file"`.
- `.xlsx` → `file.arrayBuffer()` → `readProductWorkbook`. `.csv` → `file.text()` → `readProductCsv`. `.xls` → "Old .xls files aren't supported. In Excel choose File → Save As → Excel Workbook (.xlsx)." Files over 10 MB → "File is too large (max 10 MB)." `fatal` is shown in `parseErr`.
- After parsing, it runs `groupSheetRows` for the counts shown ("N products · M variants in K rows") and for whole-file issues such as duplicate SKUs across future chunks. Rows that fail grouping (including cascaded children and skipped EXAMPLE rows) are kept as client issues and not sent. Only rows inside `groups` are sent.
- The final issue list is the client issues plus every chunk's server issues, de-duplicated by `${row}|${level}|${message}`. The server re-runs `groupSheetRows` on each chunk, so a warning such as the case hint can appear from both sides; the de-duplication shows it once.
- Images: `addImageFiles`, `fileKeyFor` (exact name, else the extension-less name when unique) and the drop zone are kept unchanged. The page's `skuFiles` is removed and replaced by `assignSkuFiles` (above), computed once from the selected files and the SKUs of every row in the parsed file. When all five image cells of a row are blank, the files assigned to that row's SKU fill image1..5 in the helper's order (max 5). `missingFiles` is computed over `imageRefs` after this fill.
- Import:
  1. Upload each needed file once (existing loop and progress text).
  2. Resolve refs. A row with a missing or failed image gets an error ("image file "x" was not selected in step 2" / "image upload failed for …") and is not sent. If that row is a Parent row, its whole group is skipped, and each child row gets "Not imported: its Parent row N could not be imported."
  3. Run `chunkGroups`. Add its oversize-group issues to the client errors, then POST each chunk sequentially to `/admin/products/bulk-v2` with `{ rows }`.
  4. Sum the counts and concatenate issues. If a chunk request fails:
     - 401 stops the import and shows the existing session-expired text.
     - Any other error gives each row in that chunk the error `"Import request failed: <message>"`, and the import moves on to the next chunk.
- The preview table shows the first 15 rows: Row | Type | Parent SKU | SKU | Title (Parent) or Size / Colour (Child) | MRP | Selling | Stock | Images (count, ⚠ when unresolved).
- Result section (`data-testid="bulk-result"`):
  - `admin-status--ok` "X products created · Y updated · Z variants saved".
  - `admin-status--bad` "E errors", with an Errors table: Row | SKU | Message.
  - `admin-status--warn` "W warnings", with a Warnings table (`data-testid="bulk-warnings"`): Row | SKU | Message. Both tables are sorted by row.
- Copy for section 1 ("1. Download the Excel template"): "⬇ Download Excel" button plus a short paragraph:
  > One file for everything. It contains all your products (a Parent row per product, a Child row per variant). Edit it in Excel and upload it below, or add new Parent/Child rows for new products. Every rule is on the Instructions sheet. ⚠ Quantity/Stock in the file replaces live stock. Clear those cells unless you have just counted stock.

  The old `buildTemplate`, `templateHref`, `FALLBACK_SLUG`, column list paragraph, category-slug chip list and `Row` interface are removed.
- Section 2 heading: "2. Upload the filled Excel". File-input hint: ".xlsx, or CSV UTF-8 (Comma delimited) with the same headers". Drop-zone sub-text: "Select every image named in the image 1–5 cells · matched by file name (or by SKU)".

`apps/web/src/app/admin/catalogue/excel-download-button.tsx` (new, `'use client'`; replaces `export-button.tsx`, which is deleted):
- `ExcelDownloadButton({ className = 'btn', style })`.
- On click: `adminFetch<SheetExport>('/admin/products/sheet')` → `buildProductWorkbook(data)` → `Blob` with type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` → temporary `<a download>`, then `URL.revokeObjectURL`.
- Label "⬇ Download Excel", busy label "Preparing…", `data-testid="download-excel"`.
- Errors show in a `role="status"` span. 401 shows the session-expired text, as the old button did. The button stays enabled for an empty catalogue (it writes the example workbook).
- `catalogue/page.tsx` swaps `ExportProductsButton` for `ExcelDownloadButton` with the same classes and style. The bulk page uses it in section 1.

Deleted: `apps/web/src/lib/product-csv.ts`, `apps/web/src/app/admin/catalogue/export-button.tsx`, and the product-csv tests in `csv.test.ts` (the `toCsv`/`parseCsv` tests stay).

### 5. API endpoints (`admin-catalogue.controller.ts`, class-level `@Roles('catalogue_manager')`, `@Controller('admin')`)
- `GET /admin/products/sheet` → `SheetExport`. Handler `bulkSheetExport()` calls `BulkSheetService.exportSheet()`. Put it where the old `products/export` route was. It is a single segment, so it can't clash with `products/:id/detail`.
- `POST /admin/products/bulk-v2` → `SheetImportResult`. Handler `bulkSheetImport(@Body() dto: BulkSheetDto)` calls `BulkSheetService.importRows(dto.rows)`. Body DTO:
  ```ts
  const s = (max: number) => z.string().max(max).optional();
  const sheetRowSchema = z.object({
    row: z.number().int().min(2).max(1_000_000),
    indicator: s(20), parentSku: s(60), sku: s(60), finalDetail: s(200), brand: s(200),
    title: s(200), description: s(5000), colour: s(200), size: s(200), weightKg: s(30),
    hsnCode: s(20), taxType: s(40), gstRate: s(20), mrp: s(30), sellingPrice: s(30),
    purchasePrice: s(30), stock: s(30), packOf: s(30),
    tier1: s(30), tier2: s(30), tier3: s(30), tier4: s(30), tier5: s(30),
    image1: s(2048), image2: s(2048), image3: s(2048), image4: s(2048), image5: s(2048),
    dimensions: s(200),
  });
  const bulkSheetSchema = z.object({ rows: z.array(sheetRowSchema).min(1).max(1000) });
  class BulkSheetDto extends createZodDto(bulkSheetSchema) {}
  ```
  The literal limits shown are written as `s(SHEET_FIELD_MAX.<key>)`, so the DTO, the client pre-check and `groupSheetRows` share one table (§3). A structural violation is a request-level 400 from the global zod pipe. That only happens with a non-UI client, because the UI pre-checks the same limits and turns violations into row errors. Content problems are per-row issues, never 400s.
- Removed: `GET /admin/products/export`, `ProductService.exportRows`, `toExportRows`, `ProductExportRow` and their specs. Only the deleted `export-button.tsx` used them.
- Kept: `POST /admin/products/bulk` + `bulkUpsert`, because `scripts/test-bulk.js` still calls them. They get a `/** @deprecated use POST /admin/products/bulk-v2 (Excel sheet) */` JSDoc and no behaviour change. The UI no longer calls it.
- `VariantUpsertDto` gains `costPrice: z.number().int().min(0).max(2_147_483_647).nullable().optional()` (the column is Postgres `INTEGER`; a larger value is a 400 instead of a DB error). The existing `mrp`/`sellingPrice` fields have no `.max`; that is pre-existing and left unchanged.

`catalogue.module.ts` registers the new `BulkSheetService(prisma: PrismaService, products: ProductService)`. `ProductService` changes:
- `uniqueSlug` and `findOrCreateBrandByName` go from `private` to `public`. Bodies are unchanged.

New `apps/api/src/modules/catalogue/category-match.ts` (pure), with the normalisation moved out of `bulkUpsert`:
- `normCategoryKey(s)`: the same as today's `normKey`.
- `matchCategory(input, all: { id; name; slug; isActive?: boolean }[]): { ok: { id; name; slug } } | { error: string }`. Order:
  1. exact slug (any isActive);
  2. lower-cased exact slug;
  3. normKey match by slug or name on categories with `isActive !== false`.

  `isActive` is optional and only `false` excludes. This mirrors today's DB query, `findMany({ where: { isActive: true } })`. One match → ok. Several → `category "X" is ambiguous — use one of: a, b`. None → `unknown category "X" — did you mean: …?`, with the same hint rule as today.
- `categoryLabels(all): Map<id, string>`: the category name when `matchCategory(name, all)` resolves to that same category, else its slug.

`bulkUpsert` (deprecated) changes in exactly one way: its local `normKey` lambda is replaced by the imported `normCategoryKey`, which has an identical body. Its `resolveCategory` closure, DB queries, messages and hint rule stay as they are, so the deprecated path is frozen. The existing specs (`tea-coffee`, `Tea & Coffee`, ambiguous `Ghee`) must still pass unchanged.

`category-match.spec.ts` repeats those three cases against `matchCategory` with the same category fixture. It also covers an inactive category: it matches by exact slug but not by name.

### 6. Import algorithm (`BulkSheetService.importRows(rows)`)
Per request:
1. `groupSheetRows(rows)` (defence in depth; the client already ran it).
2. Load `allCats = category.findMany({ select: { id, name, slug, isActive } })` once.
3. Process groups sequentially. For each group:

**6a. Match the target product** (key `P`, `childSkus`). All lookups are exact (case-sensitive) Prisma `equals`/`in`. The steps used depend on the group's shape.

Steps:
1. `product.findUnique({ where: { sku: P } })`.
2. `variant.findMany({ where: { sku: { in: childSkus } }, select: { productId } })`. More than one distinct productId is a group error on every row: "These Child SKUs belong to different products — split them by Parent SKU." If there is exactly one, use that product, but only when its `sku` is null or equals `P`. Otherwise it is a group error: "SKU X already belongs to the product with Parent SKU Q." (No-op when `childSkus` is empty.)
3. `variant.findUnique({ where: { sku: P } })`. Use its product under the same `sku` null-or-`P` rule.
4. Look `P` up in the derived map, built lazily once per request with `assignParentSkus` over every product. That needs `product.findMany({ select: { id, slug, sku, createdAt, variants: { select: { sku, isActive } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })`. Only products whose `sku` is null can match. `assignParentSkus` returns `productId → parentSku`; the service keeps it as `parentSkuOf` and also builds the inverse `productOfDerivedSku: Map<parentSku, productId>` over the null-sku products only. Step 4 and every "derived map" lookup by SKU below use the inverse; `parentSkuOf(id)` uses the forward map (it returns the stored `sku` for products that have one).
5. New product. A new product needs a Parent row in the group. If there isn't one, each child gets the error "Parent SKU P was not found in this file or in the catalogue — add its Parent row." plus the case hint below.

Order by group shape (stop at the first step that finds a product or raises a group error; the ownership check below then runs on whatever target was found):
- Group has **no Child rows** (single-row form, Parent row only): 1, 2 (no-op), 3, 4, 5. Step 3 is the legitimate "P is my own variant SKU" case of a single-variant legacy product.
  - Step 3 query for this shape: `variant.findUnique({ where: { sku: P }, select: { isActive: true, product: { select: { id: true, sku: true, title: true, _count: { select: { variants: { where: { isActive: true } } } } } } } })` (filtered relation counts are GA in Prisma 5). "Another active variant" = `_count.variants - (isActive ? 1 : 0) > 0`.
  - Step 3 extra rule: when the matched product's `sku` is null and it has at least one active variant other than `P`, it is a group error, not a match: `SKU P is one of N variants of "<title>" — put it on a Child row with Parent SKU Q.` N = the product's active variant count (P included when active); Q = `parentSkuOf(product.id)` from the derived map. Nothing is written. Otherwise a single Parent row would rewrite a multi-variant product and save one variant SKU as its Parent SKU, which breaks every earlier download of it. When the product's `sku` is already set, the existing null-or-`P` rule applies unchanged.
- Group **has Child rows**: 1, 2, 4. If still not found and `variant.findUnique({ where: { sku: P } })` exists, it is a group error on every row: `Parent SKU P is already the SKU of a variant of "<title>" — use a different Parent SKU.` Nothing is written. Otherwise step 5. Step 3 is not used here because it would attach new children to an unrelated legacy product whose variant happens to be called `P` and overwrite its title, category, brand, GST, HSN and gallery. A legacy product whose own variant SKU equals its derived parent SKU (e.g. variants `OIL-500`, `OIL-500-X` → derived `OIL-500`) is still found by step 4, because `assignParentSkus` ignores a product's own variant SKUs.

**Ownership check** (runs once a target T is chosen by step 1, 2, 3 or 4; skipped for a new product). It uses the `variantsBySku` load below, which covers every SKU of the group plus `P`, whichever product owns it:
1. `owners` = the distinct `productId`s of the existing variants among the group's child SKUs, plus the owner of variant `P` when it exists.
2. If `owners` contains any product other than T, it is a group error on every row and nothing is written: `SKU X belongs to "<title>" (Parent SKU Q), not to Parent SKU P — fix the Parent SKU or the SKU.` X = the first such SKU in row order (P itself when only variant `P` is foreign); title/Q = that owner's `title` and `parentSkuOf(owner)`. This covers a step-1 match whose children (or whose `P` variant) belong elsewhere, e.g. a copy-pasted Parent SKU, or a Parent SKU saved on another product between two uploads or two chunks.
3. If T was found **only by step 4** (steps 1–3 missed), the group has a Parent row, the group would write variants (it has Child rows, or the Parent row has any variant-only cell filled), and `owners` is empty (no SKU of the group is already a variant of T), it is a group error on every row and nothing is written: `Parent SKU P is already the Parent SKU of "<title>". To add variants to it, upload them as Child rows without its Parent row, or include one of its existing Child rows; otherwise use a different Parent SKU.` A derived key appears only in a download, so an owner building a fresh sheet can't know it is taken; this stops a new product from silently overwriting a legacy product's title, category, brand, GST, HSN and gallery.
4. Still allowed: child-only groups matched by step 4 (they never write product fields, AC-11); a Parent row with no Child rows and no variant cells matched by step 4 (it only edits product fields, which is how a downloaded zero-variant product or a hand-made "edit the title" row round-trips; such a row can't create a product anyway, because a new product needs prices or Child rows); and the `OIL-500` own-variant case (P is T's variant, so `owners` = {T}).

With this check the planner's per-variant "SKU X already belongs to another product" rule (§6b) can't trigger for groups that reached the planner; it stays as defence in depth.

Case hint (error path only, so normal imports pay nothing): when step 5 produces the not-found error, or a group-error message names `P`, run `product.findFirst({ where: { sku: { equals: P, mode: 'insensitive' } }, select: { sku: true } })`, and also check the derived map's keys ignoring case. If either finds a different-case SKU, append ` (did you mean TSHIRT-001?)` to the message.

New-product case hint: when step 5 is about to create a new product, run the same insensitive `product.findFirst` and check the derived map's keys ignoring case (the map is already built, because step 4 ran). A different-case hit is a warning on the Parent row, and the product is still created: `A product with Parent SKU TSHIRT-001 already exists (different letter case) — this row creates a new product tshirt-001.` One query per new product only.

New-variant case hint: after loading `variantsBySku`, for the child SKUs that don't exist exactly, run one `variant.findMany({ where: { OR: newSkus.map((s) => ({ sku: { equals: s, mode: 'insensitive' } })) }, select: { sku: true } })` (skipped when `newSkus` is empty). A hit is a warning on that row: "A variant with SKU X already exists (different letter case) — this row creates a new variant Y." The row is still imported, because the DB treats them as different SKUs.

Loads, in this order, once a target is chosen (or step 5 decided "new"):
1. `variantsBySku` = `variant.findMany({ where: { sku: { in: [...childSkus, P] } }, include: { inventory: true, product: { select: { id: true, sku: true, title: true } } } })` for every SKU in the group, whichever product it belongs to. The ownership check above runs on it.
2. The target: `product.findUnique({ where: { id }, include: { images: { orderBy: { position: 'asc' } }, brand: { select: { id: true, name: true } } } })`. `Product` stores only `brandId`, so the brand include is what lets the planner compare the brand name (§6b). `ctx.product` carries the product with `images` and `brand` (null when the product has no brand).
3. Parent-SKU clash for new variants: `newSkus` = the group's variant SKUs not in `variantsBySku`. When non-empty, `product.findMany({ where: { sku: { in: newSkus } }, select: { id: true, sku: true, title: true } })`, plus a lookup of each new SKU in the derived map's keys (building the map if it isn't built yet). Hits on a product other than T become `ctx.parentSkuClash: Map<sku, title>` (§6b). A new variant SKU equal to T's own Parent SKU is not a clash (a child SKU may equal its own group key).

**6b. Plan.** `planProductGroup(group, ctx) → { plan: ProductPlan | null; issues: SheetIssue[] }` in the new `bulk-sheet.plan.ts`. It is pure and synchronous. `ctx` holds `{ product (with images and brand: { id, name } | null; null for a new product), variantsBySku, allCats, parentSkuOf(productId), parentSkuClash }`.

Parent row (when present). Every parse error is a parent error:
- `title`: max 200. Required when new ("Title is required for a new product"). Blank on an existing product = unchanged.
- `finalDetail`: `matchCategory`. Required when new ("Final detail (category) is required for a new product"). Blank = unchanged. A match error is a parent error.
- `description`: max 5000. Blank = unchanged; new products default to `''`.
- `brand`: take the parent cell if it isn't blank and doesn't match `^\d+(\.\d+)?$`. Otherwise take the first child in the group with such a brand. If the parent cell was non-blank but numeric, warn on the parent row: "Brand "1" looks like a number and was ignored — using "Zara" from row 3." If nothing qualifies, the brand is unchanged (none for a new product); when the parent cell was numeric the warning is then `Brand "1" looks like a number and was ignored.` Brand max 200.
  - If `ctx.product.brand?.name` equals the chosen name (trimmed, case-insensitive), the brand is unchanged. In that case `findOrCreateBrandByName` is not called. This keeps a round trip from switching to a different brand row that has the same name in another case.
- `hsnCode`: spaces removed, max 12 ("HSN Code must be 12 characters or fewer"). Blank = unchanged. Compared with the stored value as `planned === stored.replace(/\s+/g, '')`; if equal, unchanged and the stored value keeps its spaces (the editor accepts any string ≤ 12, e.g. `0910 30`). If the value is written (new product or changed) and isn't 4, 6 or 8 digits, a warning: "HSN Code usually has 4, 6 or 8 digits." An unchanged HSN gives no warning, so round trips stay quiet.
- `gstRate`: `parseGstRate`. Blank on a new product → 0 with the warning "GST Rate is blank — saved as 0%." Blank on an existing product = unchanged.
  - The editor allows any integer from 0 to 28, so a stored rate can be outside the list. If the cell doesn't parse as a list rate but its `parsePercent` value equals the existing product's `taxRatePct`, that is not an error. The rate is unchanged, with the warning "GST Rate N% is not a standard rate — kept as it is." Any other value outside the list is a parent error (AC-7).
  - The parent's GST outcome feeds `parentGst` and `gstForExclusive` (defined under "GST for variant rows" below).
- Parent `image1..5`: each non-blank cell must be an `isUrlRef` (`^https?://` or a `/…` app path, as `bulkUpsert` checks today). Otherwise it is a parent error: "image k is not a link or a selected file".
- `taxType`: `parseTaxType`; blank = none.
- `colour`: product attribute `Color`. `dimensions`: product attribute `Dimensions`. These are the same key names the product editor's `ATTR_KEYS` use. Both merge into the existing product `attributesJson` with the same `mergeAttr` rule as variant attributes (below), and the product attributes diff uses `stableStringify`. Blank = unchanged.
- Text fields (title, description, colour, dimensions) are compared with the current DB value after trimming both (HSN uses the whitespace-stripped comparison above). If they are equal, the field is unchanged. This stops a round trip from rewriting a description just because it had trailing whitespace.
- Any parent error: the plan is null. The parent row gets the error(s), and each child row gets "Not imported: Parent row N has errors."
- Parent row with children and any variant-only cell filled (MRP, Selling Price, purchasing price, stock, size, weight, Pack Of, tiers): warning "Prices, stock, size, weight, Pack Of and tiers on a Parent row with Child rows are ignored." Exception: the parent's images are product-level, so they are not ignored.

Variant rows = the children. If the group has a Parent row and no children, and any variant-only cell is filled (or the product is new), the Parent row is the single variant with `sku = P`. Single-row extra rules:
- `Colour` stays a product attribute.
- `Size` and `Pack Of` go to the variant.
- Images go to the gallery only; variant `imageUrl` is unchanged.
- If the product exists, `P` isn't one of its variants, and it already has other active variants, it is a parent error: "Parent row has prices but no Child rows, and SKU P isn't a variant of this product — add Child rows for its variants."
- A new single-row product needs MRP and Selling Price ("New product needs MRP and Selling Price on the Parent row, or Child rows").

For each variant row (any error excludes only this row):
- Existing `V = variantsBySku.get(sku)`. If `V.productId` isn't the target product, it is an error: "SKU X already belongs to another product (Parent SKU Q / "title")." There is no move between products. (Unreachable after the §6a ownership check; kept as defence in depth.)
- New variant (no `V`) whose SKU is in `ctx.parentSkuClash`: row error `SKU X is the Parent SKU of "<title>" — use a different SKU.` Otherwise a later full download would put X both as that product's Parent SKU and as this product's Child SKU, and grouping rejects that ("SKU X is also a Parent SKU in row N"), breaking AC-9. For a derived (not yet saved) Parent SKU the clash would instead make `assignParentSkus` silently switch that product to a fallback Parent SKU, so sheets that still use X would no longer match it; the same error prevents that.
- Parse `mrp`, `sellingPrice`, `purchasePrice` (each ≤ `INT_MAX` paise), `stock` (int ≤ `INT_MAX`), `weightKg` (grams ≤ `INT_MAX`), `packOf` (int 1..`PACK_OF_MAX`, else "Pack Of must be a whole number of 1 or more" / "Pack Of is too large (max 10000)"), `size`/`colour` (max 200), `tier2..5` (`parsePercent`, each 0 ≤ t ≤ 95, else "Bulk Tier k must be between 0% and 95%"), and `image1..5` (each must be an `isUrlRef`, else "image k is not a link or a selected file"). `tier1` is not read at all (R-4: reference only). Any value, including the >95% that the export can write for deep discounts, gives no error or warning.
- Effective tax type = the child's cell, else the parent's cell, else inclusive. An invalid Tax Type cell on the row is a row error.
- GST for variant rows. Computed once per group, before the variant rows:
  ```ts
  // parentGst: the rate the product will have after this import (used for the child-cell warning).
  // gstForExclusive: the rate an Exclusive Selling Price is converted with, or undefined.
  //   Parent row present, cell parses to a list rate          -> parentGst = gstForExclusive = that rate
  //   Parent row present, cell is the "kept non-standard" case -> parentGst = gstForExclusive = product.taxRatePct
  //   Parent row present, cell blank, product exists          -> parentGst = gstForExclusive = product.taxRatePct
  //   Parent row present, cell blank, product new             -> parentGst = 0 (saved, with the blank-GST warning),
  //                                                              gstForExclusive = undefined
  //   (Parent row present, cell invalid                        -> parent error; the group has no plan)
  //   No Parent row (existing product, child-only upload)      -> parentGst = gstForExclusive = product.taxRatePct
  ```
  Child `gstRate` cell:
  - Parent row present: never parsed as a rate source and never an error. If `parsePercent(cell)` gives a number that differs from `parentGst`, warning on the child row: "GST Rate on Child rows is ignored — the Parent row's N% is used." The export writes the parent's rate on every Child row, so a round trip (including a non-standard 3%) gives no child warning.
  - No Parent row: ignored unless the row's effective tax type is Exclusive. Then it is parsed with the same tolerance as the Parent cell: a list rate, or a value equal to `product.taxRatePct`, is accepted and used only for this row's conversion (the product's GST is not changed; a child-only upload never edits product fields). If the accepted rate differs from `product.taxRatePct`, warning: "GST Rate N% is used only to convert this Exclusive price — the product's GST stays M%." Any other value is a row error with the `parseGstRate` message. Blank → `product.taxRatePct`.
- If the price is Exclusive and Selling Price is given: `sp = exclusiveToInclusive(sp, gstForRow)`, where `gstForRow` is the child-cell rate from the no-Parent rule above when given, else `gstForExclusive`. When it is undefined: row error "GST Rate is needed to convert an Exclusive price." A converted price above `INT_MAX` is the row error "Selling Price is too large." `purchasePrice` is never converted (Instructions #8).
- `mrp' = mrp ?? V?.mrp`, `sp' = sp ?? V?.sellingPrice`. A new variant needs both: "MRP and Selling Price are required for a new variant."
- `sp' > mrp'` is an error: "Selling Price ₹a (incl. GST) is more than MRP ₹b." The "(incl. GST)" appears only when converted.
- Weight over 50,000 g gives a warning: "Weight is in kg — N kg looks too high."
- `costPrice` above `sp'` gives a warning: "purchasing price is above the Selling Price."
- Slabs, in this order:
  1. If any of tiers 2–5 is set and `mrp' === 0`: the warning "Bulk tiers need an MRP — tiers skipped" and the outcome is `keep`. `buildTierSlabs` is not called.
  2. Otherwise `buildTierSlabs(mrp', sp', tiers 2..5)`.
  3. On `keep`, start from the existing `V.priceSlabsJson` (`[]` when new). Drop every slab whose `unitPrice > sp'`, each with the warning "Existing bulk tier at N+ units (₹x) is above the new Selling Price and was removed."
  4. On `replace`, use its slabs plus its warnings. When every filled tier was skipped, `slabs` is `[]` and the variant's existing bulk prices are cleared (Instructions #10 says so).
- Attributes: start from `V.attributesJson ?? {}`. Postgres `jsonb` does not keep key order, so key position is not preserved or relied on; only keys and values matter. One merge rule, `mergeAttr(attrs, canonical, matches, value)`, is used for Size, Color and Pack Of (and for the product attributes Color and Dimensions):
  - `matches` = the keys of `attrs` with `k.trim().toLowerCase()` in the match set: `size` for Size; `colour`/`color` for Color; `pack of` for Pack Of; `dimensions`/`dimension` for Dimensions.
  - Value given and some match already holds the same trimmed value: nothing changes (that key keeps its case; the other matches are left alone too, so a round trip never rewrites).
  - Value given and different: remove every match, then set `attrs[canonical] = value`.
  - Value "remove" (only Pack Of = 1): remove every match.
  - Blank cell: leave all matches alone.
  - Variant mapping: `size` → `Size`; `colour` → `Color` (Child rows only; on a single-row Parent, Colour is a product attribute); Pack Of: `packOf > 1` → value `String(n)`, `packOf === 1` → remove. See A-1.
  - For the "same value" test on Pack Of: when both trimmed values match `/^\d+$/` they are compared numerically (`Number(a) === Number(b)`), otherwise as trimmed text. So a stored `"2"` or `"02"` and a sheet `2` are equal (the export writes `"02"` as the number 2, §7), and a round trip doesn't rewrite it.
- `imageUrl`: a child's `image1` if set. Blank = unchanged.
- Child `image2..5` (non-blank) when they are not used to build a new product's gallery (§6b Gallery): warning on that row: "image 2–5 on Child rows are only used to build a new product's gallery — ignored." The export writes only image 1 on Child rows, so a round trip never triggers it.
- `weightGrams`, `costPrice`, `stock`: blank = unchanged. New variants default to 0, null and 0.
- `reactivate = V?.isActive === false`.
- **Diff-only plan.** For an existing variant, the plan's `data` contains only the fields whose new value differs from `V`:
  - mrp, sellingPrice, costPrice, weightGrams and imageUrl by `!==`;
  - attributes and slabs by `stableStringify(planned) !== stableStringify(stored)` (key-order-insensitive, §3), after the merge above. Because the planned object starts from the read-back object and the merge leaves equal values alone, an unchanged row always compares equal even though `jsonb` re-ordered the keys;
  - `isActive` when reactivating.

  Stock is "changed" only when `stock !== (V.inventory?.available ?? 0)`, the same expression §6c uses. A variant with no inventory row and stock 0 in the sheet is therefore unchanged and no inventory row is created. The same applies to product fields: categoryId, brandId, taxRatePct, hsnCode, title, description, attributesJson and `sku` (when null). An existing variant or product with an empty diff gets no update call, but still counts in `variantsUpdated`/`productsUpdated`, because the counts mean "matched and processed". That is what makes AC-5 and AC-9 hold by construction.

Gallery:
- Only when a Parent row is present, with `parentImgs` = de-duplicated parent image1..5:
  - If `parentImgs` is non-empty, the candidate is `parentImgs`.
  - Else, if the product is **new** and any valid child rows have images, the candidate is the de-duplicated image1..5 of the valid child rows, in row order, capped at 10. Going over the cap gives a parent warning: "Only the first 10 images are kept." For an existing product, blank parent images always keep the gallery. Otherwise re-uploading a download would fill an empty gallery with the variant photos, and AC-9 forbids that change.
  - Else the gallery is unchanged.
- Let `existingDedup` = the current gallery URLs by position, de-duplicated (first occurrence kept). The candidate is already de-duplicated. No candidate is applied (no-op) when either:
  - `candidate` equals `existingDedup` element by element, or
  - `candidate.length === 5 && existingDedup.length > 5` and `candidate` equals `existingDedup.slice(0, 5)`. This keeps images 6+ through a round trip.
  
  The export writes the first 5 of the de-duplicated gallery (§7), so a gallery such as `[a, a, b, c, d, e, f]` exports `a, b, c, d, e`, which matches `existingDedup.slice(0, 5)` and is a no-op. When a candidate is applied, the stored duplicates disappear; that only happens on a real edit.
- Without a Parent row, children's images set only variant `imageUrl`.

A new product with zero valid variant plans gets the parent error "Product not created — none of its variant rows are valid" (no plan).

**6c. Execute.**
- Before the transaction: `brandId = brandName ? (await products.findOrCreateBrandByName(brandName)).id : undefined`. For a new product: `slug = await products.uniqueSlug(title)`.
- Then `prisma.$transaction(async (tx) => { … }, { timeout: 20_000 })`:
  1. Product:
     - Create: `{ title, slug, sku: P, categoryId, brandId, description, hsnCode ?? '', taxRatePct ?? 0, attributesJson, isReturnable: true, status: 'published' }`.
     - Update: only the changed planned fields, plus `sku: P` when `product.sku` is null; skipped when nothing changed. Status is never touched.
  2. Variants:
     - Create: `variant.create({ productId, sku, mrp, sellingPrice, costPrice, weightGrams, attributesJson, priceSlabsJson, imageUrl })`, then `inventory.create({ variantId, available: stock ?? 0 })`. When `stock > 0`, also `stockMovement.create({ variantId, delta: stock, reason: 'adjustment', ref: 'bulk-sheet' })`, matching the movement the editor's add-variant flow writes through `InventoryService.adjust`.
     - Update: `variant.update({ where: { id }, data: plan.data })`, only when the diff is non-empty. `plan.data` holds the changed subset of `{ mrp, sellingPrice, costPrice, weightGrams, imageUrl, attributesJson, priceSlabsJson, isActive: true }`.
     - When stock is provided for an existing variant: `inventory.findUnique({ where: { variantId } })` inside the tx (fresh, not the pre-loaded value). If `stock !== (inv?.available ?? 0)` (the same expression as the plan; a missing row with stock 0 does nothing), `inventory.upsert` sets `available = stock`, and `stockMovement.create({ variantId, delta: stock - previous, reason: 'adjustment', ref: 'bulk-sheet' })` writes the audit trail `InventoryService.adjust` would write (`StockReason.adjustment` exists in the schema). An equal value does nothing. `reserved` is never touched.
  3. Gallery replace, only when a candidate applies: `productImage.deleteMany({ where: { productId } })`, then create rows with `position` = index and `alt: ''`.
- Success: add 1 to `productsCreated` or `productsUpdated`, and the variant counts to `variantsCreated`/`variantsUpdated`. Plan warnings are added to the issues.
- Transaction failure (any throw, including a Prisma `P2002` unique race): recoverable for the request. Every row of the group (parent and planned children) gets the error "Not saved: <message>". Planner errors (e.g. a skipped child's own error) are always reported; plan warnings are reported only when the group commits, because they describe changes that were not made. `P2002` on `sku` becomes "SKU is already used by another product or variant." Nothing in the group is written. `Logger.warn` logs `bulk-sheet group P failed: <code|message>` (no customer data). Processing continues with the next group.
- At the end of the request, `Logger.log`: `bulk-sheet import: G groups, C created, U updated, E errors`.
- Logger: `private readonly logger = new Logger('BulkSheetService')`. This is the existing pattern, e.g. `PaymentService`. The logged values are SKUs and counts only.

### 7. Export (`BulkSheetService.exportSheet()`) and workbook build
Queries:
1. `product.findMany({ where: { status: { in: ['draft','published'] } }, include: { category: { select: { id, name, slug } }, brand: { select: { name } }, images: { orderBy: { position: 'asc' } }, variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, include: { inventory: true } } }, orderBy: { createdAt: 'desc' } })`.
2. The same all-products query used by `assignParentSkus` (§6a step 4).
3. `category.findMany({ select: { id, name, slug, isActive, parentId } })`.

The pure `toSheetExportRows(product, parentSku, categoryLabel)` lives in `bulk-sheet.plan.ts`. `SheetExportRow` holds strings for text columns and numbers or null for numeric ones: rupees for money, kg for weight, integers for stock and Pack Of, percents for tiers. `gstRate` is a string like `12%`, `taxType` is `'Inclusive'` and `indicator` is `'Parent'|'Child'`. Rules:
- **Single-row form**: exactly one active variant and `variant.sku === parentSku`.
  - Product fields: finalDetail = label, brand, title, description, hsn, `Inclusive`, gst, colour = product attribute `Color`, dimensions = product attribute `Dimensions`.
  - Variant fields: size = variant attribute `Size`; weightKg = `weightGrams/1000`, or null when 0; mrp/sp/purchase = paise/100 (purchase is null when costPrice is null); stock = `inventory?.available ?? 0`; packOf = 1 when the variant has no key matching `pack of` (`k.trim().toLowerCase()`), the integer when the first match's trimmed value is a whole number from 2 to `PACK_OF_MAX`, and null (blank, which leaves it unchanged) for any other value, including a stored `"1"`. A blank never deletes a hand-entered non-numeric value, but a written 1 would. Attribute lookups (`Size`, `Color`, `Pack Of`, `Dimensions`) are case-insensitive. gst = `${taxRatePct}%`, written even for non-standard stored rates (see §6b `gstRate`).
  - Tiers: tier1 = `tier1Percent`, and tiers 2–5 from `tierPercentsFromSlabs` (blank when null).
  - images 1–5 = the first 5 of the de-duplicated gallery (by position, first occurrence kept).
- **Parent + Child form** (otherwise):
  - The Parent row has the product fields and images 1–5 = the first 5 of the de-duplicated gallery. Its variant cells are blank.
  - Each Child row gets parentSku and sku. For readability, matching the owner's sample, it repeats finalDetail, brand, description, hsn, tax type (`Inclusive`) and gst (the parent's `${taxRatePct}%`). On import: finalDetail, description and hsn on Child rows are ignored; brand is used only as the fallback for a blank or numeric Parent brand; Tax Type applies to that child's own prices; GST is never a rate source while the Parent row is present (§6b "GST for variant rows"), so it gives no warning when it equals the parent's rate. Its title is `${title} - ${variant label}`, truncated to 200 characters, where the label = Size / Colour / Pack Of values joined by " / " (or the SKU). It has colour = variant attribute `Color`, the variant fields above, and image1 = `variant.imageUrl`.
  - Over-long values: any text value longer than `SHEET_FIELD_MAX` for its column (e.g. a legacy brand or an attribute value over 200 characters) is written blank, because blank keeps the stored value on import. The only exception is the Child title, which is truncated (it is ignored on import). For gallery images the rule applies to all five cells together: if any of the first 5 de-duplicated gallery URLs is over 2,048 characters, all five Parent image cells are written blank, because a partly blank image set would replace the gallery. This keeps every exported row valid for AC-9.
  - A product with zero active variants is written as a Parent row only.
- `categories`: active categories with no active children, each as `{ label: categoryLabels.get(id), slug, path: 'Parent › Child' }`, sorted by path.

`buildProductWorkbook(data)` (exceljs):
- `wb.creator = 'Belzo eMart'`.
- Sheet `Products`:
  - `ws.columns` from `SHEET_COLUMNS` (header, key, width). Text, sku and image columns get `style: { numFmt: '@' }`, so values typed into the SKU, Parent SKU and HSN columns stay text (keeps leading zeros and avoids scientific notation).
  - Header row: bold, fill `FFE5E7EB`, wrap text, height 32.
  - `ws.views = [{ state: 'frozen', ySplit: 1 }]`; `ws.autoFilter = 'A1:AC1'`.
  - Data rows are written via `ws.addRow`. Money cells are numbers with `numFmt '0.00'`. kg cells are numbers with `numFmt 'General'` (shows `0.25` and `1`; `'0.###'` would show `1.`). The value is `weightGrams / 1000`, so it never has more than 3 decimals. int cells use `'0'`. Percent cells hold `pct/100` with `'0%'` when `|pct - round(pct)| < 1e-6`, else `'0.00%'`. Full precision is kept in the value, which is how slabs survive a round trip. GST is the text `12%`.
  - String values are written as plain strings. exceljs stores them as shared strings, not formulas, so a cell such as `=HYPERLINK(…)` or `+91…` coming from product data is never evaluated by Excel.
  - Data validations go on rows 2..`max(1000, lastRow + 200)`, set per cell in a loop: `ws.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Not in the list', error: '<hint>', formulae: [...] }`. That is about 4 × 1,200 cells, which is small. `formulae` per column:
    - A: `['"Parent,Child"']`.
    - L: `['"Inclusive,Exclusive"']`.
    - M: `['"0%,5%,12%,18%,28%"']`.
    - D: `[`Categories!$A$2:$A$${n + 1}`]`, only when n > 0.
    - `errorStyle: 'warning'` lets a slug or an Excel-converted `12%` number through instead of blocking the user.
  - Empty catalogue: two example rows, italic, fill `FFFEF3C7`:
    - Parent `EXAMPLE-TSHIRT`, Final detail = first category label (or blank), Brand `Zara`, Title `EXAMPLE – Men's Cotton T-Shirt (delete this row)`, Description `Example only — delete these two rows.`, Colour `Blue`, HSN `61091000`, Inclusive, 12%.
    - Child `EXAMPLE-TSHIRT` → `EXAMPLE-TSHIRT-M`, Size `M`, 0.22, 999 / 799 / 790, 65, 1, tiers 20/22/25/28/30 %.
- Sheet `Instructions`: column A width 110, wrapped, one rule per row, a bold title row. Text:
  1. "Belzo product sheet — one file for download and upload. Keep the header row exactly as it is. Upload at most 5,000 rows at a time — split larger files (keep each product's Parent and Child rows together)."
  2. "Parent row = the product (Title, Description, Final detail = category, Brand, HSN, GST, Tax Type, Colour, dimention). Child row = one variant (size, colour, pack) of the Parent named in Parent SKU."
  3. "A product with a single variant can be one Parent row with MRP and Selling Price filled (its SKU is the variant SKU)."
  4. "A Child whose Parent SKU is not in the file is added to the existing product with that Parent SKU."
  5. "SKU and Parent SKU match existing products exactly, including upper/lower case (TSHIRT-001 and tshirt-001 are different SKUs). Don't change them on existing rows: a changed Child SKU is added as a new variant, and a changed Parent SKU of an existing product is rejected once that product's Parent SKU has been saved."
  6. "Final detail: pick a category from the list (Categories sheet). The category name or slug both work."
  7. "Prices are in rupees. Selling Price is the price for 1–4 units. MRP is always GST-inclusive."
  8. "Tax Type: Inclusive (default) = prices already include GST. Exclusive = we add the GST Rate to the Selling Price when importing (purchasing price is not changed). After adding GST the Selling Price must not exceed MRP."
  9. "GST Rate must be 0%, 5%, 12%, 18% or 28%."
  10. "Bulk Tiers are % OFF MRP. Tier 1 (1–4 units) is for reference only — the Selling Price is used. Tiers 2–5 set the price per unit from 5, 9, 13 and 21 units in the cart. A tier that is not cheaper than the Selling Price (or the tier before it) is skipped with a warning. If every filled tier is skipped, that variant has no bulk prices after the import. Leave all of tiers 2–5 blank to keep the current bulk prices."
  11. "If a product has custom bulk prices set in the editor that don't fit these ranges, the tier cells are left blank — re-uploading keeps those prices."
  12. "Weight is in kg (e.g. 0.25 for 250 g)."
  13. "Pack Of: number of items in the pack (1 = single)."
  14. "purchasing price is for your records only. Customers never see it."
  15. "Images: put a full link (https://…), or the file name of an image you select on the upload page. image 1 on the Parent row is the main image. Filled image cells REPLACE the product's images in that order. All blank keeps the current images. image 1 on a Child row is that variant's photo. For a NEW product with no Parent images, the Child images become its gallery. If the product has more than 5 images and you leave the first 5 as they are, the extra images are kept; remove them in the product editor. If all image cells of a row are blank, selected files named after that row's SKU (e.g. TSHIRT-001.jpg, TSHIRT-001-2.jpg) are used; a file goes to the longest SKU it matches, so TSHIRT-001-S.jpg belongs to the Child TSHIRT-001-S."
  16. "Blank cells keep the current value for existing products."
  17. "⚠ Quantity/Stock overwrites live stock. If orders came in after you downloaded, clear the stock cells unless you have just counted stock."
  18. "Example rows (SKU starting with EXAMPLE-) are skipped."
  19. "You can also upload this sheet saved as CSV UTF-8 (Comma delimited) with the same headers in row 1. The old CSV format is no longer accepted."
- Sheet `Categories`: header `Name (use in Final detail) | Slug | Path` (bold, frozen), then the rows. Column widths 30/30/50.
- Returns `await wb.xlsx.writeBuffer()`.

### 8. costPrice in the editor, VariantService and attribute preservation
- `VariantService.upsert` input gains `costPrice?: number | null`. On update the data gets `...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {})`, so undefined leaves it unchanged. That matters because `variant-slabs.tsx` and `product-wizard.tsx` never send it. On create: `costPrice: input.costPrice ?? null`. The value is ≥ 0 by DTO; there is no MRP check, because a purchase price may exceed MRP.
- `apps/web/src/lib/variant-edit.ts`:
  - `AdminVariantRow.costPrice: number | null`.
  - `VariantEdit.cost: string` (`initialEdit` → `toRupees(costPrice)` or `''`).
  - `validateEdits` adds: a non-blank `cost` that isn't money → `${sku}: enter a valid purchase price (0 or more), or leave it blank.`
  - `VariantUpsertBody.costPrice: number | null`. In `variantUpsertBody`, blank → null, else `toPaise`. A change in cost alone counts as a change. The body always carries `costPrice`.
  - New `mergeVariantAttrs(existing, size, color)` keeps every key except Size/Color (case-insensitive), then sets trimmed non-blank Size and Color.
  - New exported `pickAttr(attrs, ...keys): string`: the trimmed value of the first entry whose `k.toLowerCase()` is one of `keys`, else `''`. `variantLabel`'s local `pick` is replaced by it (same behaviour: `pickAttr(attrs, 'size')`, `pickAttr(attrs, 'color', 'colour')`).
- `product-editor.tsx`: a "Purchase (₹)" column between Selling and Stock. The input is `type="number" step=0.01 min=0`, `placeholder="optional"`, `aria-label={`Purchase price in rupees for ${v.sku}`}`, `data-testid={`editor-v-cost-${i}`}`. Add to the hint: "Purchase price is for your records only — customers never see it." Nothing else in the save flow changes.
- `variant-slabs.tsx`:
  - `save(v)` sends `attributes: mergeVariantAttrs(v.attributesJson, vm.size, vm.color)` instead of `buildAttrs(...)`. Without this, saving slabs would wipe the `Pack Of` attribute the sheet stores. `addVariant` keeps `buildAttrs`.
  - `reload()` reads `size: pickAttr(attrs, 'size')` and `color: pickAttr(attrs, 'color', 'colour')` instead of `attrs.Size ?? ''` / `attrs.Color ?? ''`. Otherwise a legacy lower-case `size` key loads as blank and `mergeVariantAttrs` (which removes Size keys case-insensitively) would erase it on Save. Behaviour for canonical `Size`/`Color` keys is unchanged.

### 9. costPrice confidentiality (invariant owner: the API mapping layer)
Every storefront path builds an explicit DTO, so a new column cannot leak by default. Checked:
- `ProductService.detail`, `toCard`, `list` and `PostgresSearchProvider` (explicit fields).
- `CartService.getCart` lines, `WishlistService.list` and `OrderService.productMetaForVariants` (explicit fields; orders spread `OrderItem`, not Variant).

Raw variant rows that include `costPrice` reach only two admin routes, `GET /admin/products/:productId/variants` (`VariantService.listByProduct`, which the editor needs) and `POST /admin/variants`. Both sit behind `@Roles('catalogue_manager')`. The reporting low-stock query and `adminDetail` map explicit fields, so they don't return it.

Every other `variant.findMany` in the API was checked and either selects specific fields or maps them explicitly:
- `ReturnService`, `InvoiceService`, `FulfilmentService` and `ReviewService` use `select`.
- `OrderService.productMetaForVariants` and `WishlistService.list` map explicitly.

`Product.sku` isn't sensitive. It reaches only admin responses that return raw product rows (`create`, `update`, `setStatus`), and storefront DTOs don't include it.

New specs pin this:
- `product.service.spec.ts`: `detail()` and `list()` against a fake variant with `costPrice: 12345`. They assert `JSON.stringify(dto)` doesn't contain `costPrice` or `12345`.
- `cart.service.spec.ts`: one assertion that the line has no `costPrice` key.

### 10. Error handling summary
| Operation | Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| Read file (client) | not xlsx/csv, >10 MB, no SKU header, old CSV format, >5,000 rows, corrupt zip, exceljs chunk fails to load | fatal for the file | `parseErr` message; nothing sent | no |
| Client pre-check | cell over `SHEET_FIELD_MAX`, group > 1,000 rows / 900 KB | row (parent → group) | client error rows; never sent | no |
| Image upload (client) | missing file / upload error | row (parent → group) | client error rows | no |
| Chunk POST | 401 | stops import | session-expired message | no |
| Chunk POST | 400/413/5xx/network | per chunk | every row in the chunk: "Import request failed: …" | API default |
| Grouping | invalid indicator, missing SKU or Parent SKU, duplicates | row | error issue | no |
| Grouping | Parent row over a length limit | group | parent error + child "Not imported: Parent row N has errors." | no |
| Matching | children spread over products; child SKU of a product with another Parent SKU; Parent SKU (with children) equals an unrelated variant SKU; unknown Parent SKU without Parent row; ownership check (a group SKU or variant `P` owned by a product other than the target); derived-only match with a Parent row that writes variants and shares no SKU with the target; single Parent row naming one variant of a multi-variant null-sku product | group | error on every row, nothing written, with a case hint when a different-case SKU exists | no |
| Parent parse/validation | bad category/GST/tax type/length; new product without title/category | group | parent error + child "not imported" errors | no |
| Variant parse/validation | bad number (incl. hex/exponent text), value over INTEGER max or Pack Of over 10,000, SP > MRP, other-product SKU, new SKU equal to another product's Parent SKU (saved or derived), tier out of range, Exclusive without a GST rate, invalid child GST on a child-only Exclusive row | row | error issue; siblings continue | no |
| Soft rule | skipped tier, numeric brand, blank GST, non-standard existing GST kept, child GST differs from parent, child-only Exclusive GST differs from product, weight > 50 kg, cost > SP, dropped old slab, changed non-4/6/8-digit HSN, Child image 2–5 ignored, case-only SKU near miss (variant, Child Parent SKU, new product's Parent SKU), Parent SKU cell filled on a Parent row | n/a | warning issue (plan warnings only when the group commits) | no |
| Transaction | DB error / P2002 race / timeout | group | "Not saved: …" on every row of the group; planner errors still reported, plan warnings dropped | `warn` |
| Export | DB failure | request | 500 → button shows "Download failed: …" | Nest default `error` |

### 11. Test matrix
Shared (`packages/shared/src/bulk-sheet.test.ts`):
- `canonicalHeader`: maps all 29 FR-1 headers to their keys, and maps `Weight (g)`, `  tax type  `, `GST RATE (Dropdown: x)`, `dimention (LWH)`, `image 1 (main image )`, `Colour`/`Color`. Unknown headers → null; `categorySlug` → null.
- `mapHeaderRow`: the old `PRODUCT_CSV_COLUMNS` header list → `oldFormat: true`; the FR-1 headers → false; FR-1 headers without the indicator column → false.
- Parser messages: `parseNonNegInt('x', 'Quantity/Stock')` → "Quantity/Stock must be a whole number (0 or more)"; `'-1'` → "Quantity/Stock cannot be negative"; `parseKgToGrams('x')` → "Weight must be a number in kg, e.g. 0.25"; `parsePercent('x', 'Bulk Tier 2 Discount %')` → "Bulk Tier 2 Discount % must be a percentage, e.g. 20%"; `columnLabel('tier2') === 'Bulk Tier 2 Discount %'`.
- Parsers:
  - `parsePercent`: `"20%"`→20, `"0.2"`→20, `"20"`→20, `"18.0018%"`→18.0018, `""`→null, `"x"`→error.
  - `parseGstRate`: ok for `12%`, `0.12`, `12`, `0`, `0%`; errors for `3%` and `x`.
  - `parseRupeesToPaise`: `"999"`→99900, `"1,099.50"`→109950, `"₹ 799"`→79900; errors for `-1` ("cannot be negative"), `abc`, `0x10`, `1e3`, `.5` and `99999999999` ("is too large"); `"21474836.47"` → 2147483647 ok.
  - `parseNonNegInt`: `0x10` and `1e3` → error; `2147483648` → too large; Pack Of `10001` → too large.
  - `parseKgToGrams`: `"0.22"`→220, `"0.85 kg"`→850; `"1e3"` → error; `"9999999"` (kg) → too large.
  - `parsePercent`: `"0x10"` and `"1e1%"` → error.
  - `stableStringify({ b: 1, a: { d: 2, c: 3 } }) === stableStringify({ a: { c: 3, d: 2 }, b: 1 })`; arrays keep order.
  - `parseIndicator` and `parseTaxType`, including invalid values.
- `groupSheetRows`:
  - Owner's 7 rows → 2 groups with 3 and 2 children.
  - A child before its parent is still grouped.
  - Blank rows are skipped; EXAMPLE rows are skipped with a warning.
  - Duplicate child SKU → error on the later row.
  - Duplicate Parent SKU → error.
  - Child without Parent SKU → error.
  - A child SKU equal to its own Parent SKU is allowed; equal to another group's Parent SKU → error.
  - Blank indicator is inferred.
  - Parent row with a 5,001-character description → parent length error, and each of its Child rows gets `Not imported: Parent row N has errors.` (no group is produced). A Child row with a 300-character title is not an error.
  - A Parent row with an invalid indicator excluded → its would-be children are not cascaded (they form a parent-less group).
  - Child `tshirt-001` + Parent `TSHIRT-001` → two groups; the child gets the case-hint warning. `ABC` and `abc` child SKUs are not duplicates.
  - 201-character `colour` → error; 200 → ok.
  - Parent row `sku TSHIRT-001`, `parentSku TSHIRT-X` → keyed `TSHIRT-001` plus the "Parent SKU on a Parent row is ignored" warning; `parentSku` equal to `sku` → no warning.
- `buildTierSlabs`: S/M, L and shoes give exactly the AC-4 slabs and warnings. A non-decreasing tier is skipped. A tier equal to the SP is skipped. All blank → keep.
- `exclusiveToInclusive(79900, 12) = 89488`; `(79900, 0) = 79900`.
- `tierPercentsFromSlabs`: representable vs not → null. Not representable covers minQty 2, equal adjacent prices, a slab equal to the SP and a slab more than 95% off MRP.
- `SHEET_FIELD_MAX` covers every `SheetKey`, and a 201-character title on a Parent row in `groupSheetRows` is a row error (on a Child row it isn't checked).
- `canonicalHeader('image 1 (main image ')` (unclosed paren) → image1. fast-check property: for integers `mrp` in 1..10,000,000 and `unitPrice` in 0..mrp-1, the export pct → `/100` → `cellToString`-equivalent `toPrecision(15)` → import price equals `unitPrice`.
- `assignParentSkus`:
  - `TSHIRT-001-S/M/L` → `TSHIRT-001`; single variant → its own SKU.
  - LCP shorter than 3 → `P-slug`; a candidate that is another product's variant SKU → `P-slug`; a stored sku is kept; collision chain → `-id8`; identical input gives an identical result.
  - A 200-character slug gives a derived SKU of 60 characters or fewer.

API specs: `apps/api/src/modules/catalogue/bulk-sheet.service.spec.ts`, `bulk-sheet.plan.spec.ts` and `category-match.spec.ts`.

The service spec uses its own in-memory fake Prisma, modelled on `product.service.spec.ts`'s `build()`. It can't simply extend `build()`, because that fake updates variants `where: { sku }` and finds products only by slug. The new fake supports:
- `product.findUnique` by `sku`, `id` or `slug` (the last one for `ProductService.uniqueSlug`; the spec builds `new ProductService(fake, {} as CategoryService)` and passes it to `BulkSheetService`), and `product.findMany` (with the `include`/`orderBy` the service uses);
- `variant.findUnique` by `sku` (including the `product: { select: { …, _count: { select: { variants: { where: { isActive: true } } } } } }` shape of the single-row step 3), `variant.findMany` with `sku: { in }`, and `variant.update` `where: { id }`;
- `product.findMany` with `where: { sku: { in } }` (the Parent-SKU clash query);
- `inventory.findUnique`/`upsert`/`create`, `stockMovement.create`, `productImage.deleteMany`/`create`;
- `category.findMany`, `brand.findFirst`/`create`, and `$transaction(fn, opts)`;
- `product.findFirst` and `variant.findMany` with `sku: { equals, mode: 'insensitive' }` (the case-hint queries), and `include: { brand }` on `product.findUnique`;
- JSON columns returned with their object keys in reverse-sorted order, to mimic `jsonb` re-ordering, so the key-order-insensitive diff is actually exercised.

It records every write call, so the diff-only and round-trip tests can assert "no writes". Cases:
- Owner sample → AC-3 and AC-4 exactly (products, variants, attributes without `Pack Of`, weights, costPrice, stock, slabs, brand fallback warning, `Product.sku`, published).
- Re-import the same rows → AC-5 (updated counts, no field change, no StockMovement).
- Exclusive: converted SP stored; converted SP > MRP → row error, siblings saved.
- A child error doesn't block siblings; a parent error cascades to its children (AC-10).
- Child-only upload attaches to an existing product; unknown parent → error (AC-11).
- Blank cells are unchanged:
  - MRP-only edit keeps the SP.
  - Blank stock keeps inventory.
  - All tiers blank keeps slabs; an SP cut drops slabs above the new SP with a warning.
  - Stock change writes a StockMovement with the delta and `ref 'bulk-sheet'`.
- Images:
  - Parent images replace the gallery; children images fill the gallery only when the Parent row is present.
  - No Parent row → only variant `imageUrl` changes.
  - 7-image gallery + its first 5 → untouched.
  - A bad image ref → row error.
- Matching:
  - `Product.sku` hit.
  - Null-sku product found via a child SKU, with `sku` saved.
  - Derived-SKU parent-only row.
  - A child SKU of another product → error.
  - Children spread across two products → group error.
  - Legacy "Sesame Oil" (null `Product.sku`) with variant SKU `OIL`; upload Parent `OIL` + new Children `OIL-1L`, `OIL-5L` → group error `Parent SKU OIL is already the SKU of a variant of "Sesame Oil" — use a different Parent SKU.` on all three rows, and zero write calls.
  - Legacy product with variants `OIL-500`, `OIL-500-X` (null sku); upload Parent `OIL-500` + new Child `OIL-500-Y` → attaches via the derived map, `sku` saved, one variant created.
  - Single-row Parent `OIL` (no children) where `OIL` is the legacy single variant → step 3 matches that product (unchanged behaviour).
  - Child-only upload with Parent SKU `tshirt-001` when the product's sku is `TSHIRT-001` → not-found error ending `(did you mean TSHIRT-001?)`.
  - New child SKU `tshirt-001-xl` when `TSHIRT-001-XL` exists → variant created plus the case warning.
  - Ownership, derived-only (review round 2, scenario A): legacy "Wildflower Honey" (null sku, variants `HONEY-250`, `HONEY-500`, derived `HONEY`); upload Parent `HONEY` "Honey Comb" + new Child `HONEY-COMB-1` → group error `Parent SKU HONEY is already the Parent SKU of "Wildflower Honey". …` on both rows, zero write calls (no `product.update`, no `productImage.deleteMany`).
  - Same fixture, child-only `HONEY` + `HONEY-1KG` → attaches to Wildflower Honey, one variant created; title, category, brand, GST, HSN and gallery unchanged.
  - Same fixture, Parent `HONEY` with no Child rows and no variant cells, new title → title updated and `sku = 'HONEY'` saved (derived parent-only edit still works).
  - Same fixture, Parent `HONEY` + existing Child `HONEY-250` + new Child `HONEY-1KG` → matched by step 2, one variant created, `sku` saved.
  - Ownership, step 1 (scenario B): product T has `sku = 'JAM'`; upload Parent `JAM` + Child `HONEY-250` (owned by Wildflower Honey) → group error `SKU HONEY-250 belongs to "Wildflower Honey" (Parent SKU HONEY), not to Parent SKU JAM — fix the Parent SKU or the SKU.` on both rows, no `product.update`.
  - Single-row multi-variant legacy (finding 2): null-sku product X with variants `OIL-500`, `OIL-1L` (derived `OIL`); single-row Parent `OIL-500` with MRP/SP → group error `SKU OIL-500 is one of 2 variants of "<X title>" — put it on a Child row with Parent SKU OIL.`, zero writes. The same row when X has `sku = 'OIL'` → the existing "already belongs to the product with Parent SKU OIL" error.
  - New product `tshirt-001` (Parent + new Child) when a product with `sku = 'TSHIRT-001'` exists → product created plus the Parent-row warning `A product with Parent SKU TSHIRT-001 already exists (different letter case) — this row creates a new product tshirt-001.`
  - New variant SKU equal to another product's saved `sku` (`TSHIRT-001` uploaded as a Child of product B while product A has `sku = 'TSHIRT-001'`) → row error `SKU TSHIRT-001 is the Parent SKU of "<A title>" — use a different SKU.`, B's other children saved. Same for another null-sku product's derived Parent SKU.
- Brand: the target is loaded with `brand`; an existing brand `Zara` and a sheet `zara` → no `findOrCreateBrandByName` call, no `product.update`.
- GST for variant rows:
  - Multi-variant product at 3% exported and re-imported → no errors, one parent warning ("not a standard rate"), no child GST warnings, no writes.
  - New product, blank GST, Exclusive child → row error "GST Rate is needed to convert an Exclusive price."; the product is still created at 0% with its other valid children.
  - Parent 12%, child cell `18%` → child warning "GST Rate on Child rows is ignored — the Parent row's 12% is used.", conversion uses 12.
  - Child-only Exclusive row, product at 12%, child cell `18%` → converted at 18 with the "used only to convert" warning, product GST unchanged; child cell `7%` → row error.
- Attributes and HSN:
  - Stored HSN `0910 30`, sheet `091030` → unchanged, no warning.
  - Variant with a `pack of: "2"` key and sheet Pack Of 2 → unchanged; Pack Of 3 → the key becomes `Pack Of: "3"` and `pack of` is removed; Pack Of 1 → every match removed.
  - Stored attributes whose key order differs from the planned object → no update (the fake returns keys in a shuffled order to mimic `jsonb`).
- Child image 2 filled on an existing product → warning, gallery unchanged.
- All filled tiers skipped on an existing variant with slabs → `priceSlabsJson` set to `[]` plus the skip warnings. `mrp' = 0` with tier 2 set → "Bulk tiers need an MRP" warning, slabs kept, `buildTierSlabs` not used.
- Stock: variant without an inventory row and sheet stock 0 → no inventory write; stock 5 → inventory upsert + movement delta 5.
- Bounds: a child with MRP `99999999999` → that row errors, its siblings and the product are saved (no "Not saved" group error).
- Inactive variant SKU → reactivated. `Pack Of` 2 sets the attribute; 1 removes it. GST 3% on a new product → parent error. Single-row Parent with prices → one variant with SKU = P.
- A transaction throw on group 1 → all its rows error; group 2 is still imported. Group 1's planner errors (a child with SP > MRP) are still in the issues; its plan warnings (a skipped tier) are not.
- Pack Of: stored `"02"`, sheet `2` → unchanged, no `variant.update`.
- Export:
  - Multi-variant → Parent + Children; single-variant → one row.
  - Tier percents; non-representable slabs → blank; costPrice null → blank purchase.
  - Derived parent SKU.
  - Ambiguous category name → slug label.
  - Only leaf categories in the list.
  - No products → `rows: []` (the client adds the examples).
- Round trip: `exportSheet()` rows, converted to the strings the client would send (the shared test helper `exportRowToInput`), then `importRows`. The fixture includes:
  - a null-sku multi-variant product and a null-sku single-variant product;
  - a 7-image gallery and an empty gallery whose variants have `imageUrl`;
  - editor-made slabs at minQty 2 and slabs that fit the tiers;
  - `taxRatePct` 3;
  - a description with a trailing newline;
  - a lower-case `size` attribute key, a `Pack Of` of `"2"` and a lower-case `pack of` key of `"2"`;
  - a brand that has a same-name, different-case twin;
  - a variant with `costPrice` null;
  - a multi-variant product at `taxRatePct` 3 (not only a single-row one);
  - an HSN stored with a space (`0910 30`);
  - a product title of 195 characters (Child title over 200 before truncation);
  - a variant `Size` value of 150 characters and a product `Dimensions` value of 120;
  - a gallery `[a, a, b, c, d, e, f]`;
  - a variant with no inventory row.

  Expected: only `product.update({ data: { sku } })` calls for the two null-sku products, no other `update`/`create`/`deleteMany` calls and no error issues. A second export → import pass makes no write calls at all.
- Diff-only: re-importing AC-3 → no `variant.update`, `product.update`, `inventory.upsert` or `productImage.*` calls (AC-5).
- Gallery: an existing product with an empty gallery, no Parent images and Child images → gallery untouched and only variant `imageUrl` set. A new product in the same shape → gallery built from the Child images.
- GST: an existing product at 3% with GST cell `3%` → unchanged plus a warning; GST `4%` → parent error; a new product with `3%` → parent error.
- Tier 1 `99%` with tiers 2–5 blank → no issue, slabs kept.
- New variant with stock 10 → inventory 10 plus one StockMovement `{ delta: 10, reason: 'adjustment', ref: 'bulk-sheet' }`.
- `category-match`: the same cases as the existing bulkUpsert resolver specs. The existing `product.service.spec.ts` bulkUpsert specs stay green.
- `variant.service.spec.ts`: `costPrice` undefined → the update data has no `costPrice` key; null clears it; a number sets it; create defaults to null.
- `product.service.spec.ts`: §9 confidentiality specs. Remove the `toExportRows`/`exportRows` specs.
- Controller metadata: `Reflect.getMetadata(ROLES_KEY, AdminCatalogueController)` contains `'catalogue_manager'`, and the class has `bulkSheetImport` and `bulkSheetExport` handlers. This proves the new routes sit under the guard.

Web (jest, node env; `exceljs` node build):
- `product-xlsx.test.ts`:
  - Build from a fixture `SheetExport`, then load with exceljs. Check the sheet names, the exact header row, bold and frozen header, validations on A2/L2/M2/D2, the Categories values and the percent cell numFmt.
  - `readProductWorkbook(build(x))` → expected `SheetRowInput[]` (round trip).
  - A workbook with owner's rows written as text `"20%"` and as numeric `0.2` with `0%` format, numeric SKU/HSN cells and a hyperlink image cell → normalised strings.
  - Empty export → 2 EXAMPLE rows.
  - A non-template workbook → `fatal`. A workbook whose row 1 is the old CSV header → `fatal === OLD_FORMAT_MESSAGE`.
  - kg cells carry `numFmt 'General'`.
  - A workbook with blank rows 5–6 and data down to row 9 → rows 2–4 and 7–9 come back, with their real row numbers. This guards against the `actualRowCount` trap.
  - Non-zip bytes → the "Could not read this Excel file" fatal error.
  - A cell value `'=1+1'` written by `buildProductWorkbook` reads back as the literal string, not a formula.
- `product-sheet.test.ts`:
  - `readProductCsv` with the owner's headers (including `Weight (g)` and the `(Dropdown: …)` suffixes) and correct row numbers across a blank line.
  - `chunkGroups` never splits a group, respects maxRows/maxBytes, sends a 401-row group alone in its own chunk, and turns a 1,001-row group into errors instead of a chunk.
  - `slimChildRow`; `applyResolvedImages`.
  - Issue merge: the same `{row, level, message}` from the client and a chunk appears once.
  - `readProductCsv` with the old 12-column header → `fatal === OLD_FORMAT_MESSAGE`, no rows; with record 1 blank and headers in record 2 → the "no SKU column found" fatal.
  - `assignSkuFiles(['tshirt-001.jpg', 'tshirt-001-2.jpg', 'tshirt-001-s.jpg'], ['TSHIRT-001', 'TSHIRT-001-S'])` → `tshirt-001: ['tshirt-001.jpg', 'tshirt-001-2.jpg']`, `tshirt-001-s: ['tshirt-001-s.jpg']`. A file matching no SKU is not assigned.
- `product-xlsx.test.ts` also: a numeric cell `1e21` in a money column reads as `"1000000000000000000000"` and `1e-7` as `"0.0000001"` (`plainNumber`).
- `csv.test.ts`: `parseCsvTable` keeps blank records. Existing `parseCsv`/`toCsv` tests still pass. Product-csv tests are removed.
- `variant-edit.test.ts`: cost in `initialEdit`/`validateEdits`/`variantUpsertBody` (a cost-only change, blank → null); `mergeVariantAttrs` keeps `Pack Of`; `pickAttr({ size: 'M ' }, 'size') === 'M'`, `pickAttr({ Colour: 'Red' }, 'color', 'colour') === 'Red'`; the existing `variantLabel` tests still pass. Then `mergeVariantAttrs({ size: 'M', 'Pack Of': '2' }, pickAttr(…,'size'), '')` keeps `M` (as `Size`) and `Pack Of` — the `reload()` → `save()` path for a lower-case key.

Manual / integration (not automatable here):
- Apply the migration to the local DB.
- Download from both buttons. Open in Excel or LibreOffice and check the dropdowns.
- Upload the owner's sample with images selected by file name, then re-upload the download.
- Check that the storefront product page shows no purchase price.
- `next build`: First Load JS for `/` and `/product/[slug]` changes by less than 1 kB versus `master`, and the exceljs chunk loads only on the admin click.

### 12. Files
New:
- `packages/shared/src/bulk-sheet.ts` + `.test.ts`
- `apps/api/prisma/migrations/20261002120000_product_sku_variant_cost_price/migration.sql`
- `apps/api/src/modules/catalogue/{bulk-sheet.service.ts, bulk-sheet.plan.ts, category-match.ts}` + specs
- `apps/web/src/lib/{product-xlsx.ts, product-sheet.ts}` + tests
- `apps/web/src/app/admin/catalogue/excel-download-button.tsx`

Modified:
- `packages/shared/src/index.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/catalogue/{admin-catalogue.controller.ts, catalogue.module.ts, product.service.ts, product.service.spec.ts, variant.service.ts, variant.service.spec.ts}`
- `apps/api/src/modules/cart/cart.service.spec.ts`
- `apps/web/package.json` + `pnpm-lock.yaml`
- `apps/web/src/lib/{csv.ts, csv.test.ts, variant-edit.ts, variant-edit.test.ts}`
- `apps/web/src/app/admin/catalogue/{bulk/page.tsx, page.tsx, product-editor.tsx, variant-slabs.tsx}`

Deleted:
- `apps/web/src/lib/product-csv.ts`
- `apps/web/src/app/admin/catalogue/export-button.tsx`

### 13. Verification commands (PowerShell, one per call, repo root)
`pnpm install`; `pnpm --filter @belzo/shared build`; `pnpm --filter @belzo/shared test`; `pnpm --filter @belzo/api db:generate`; `pnpm --filter @belzo/api typecheck`; `pnpm --filter @belzo/api test`; `pnpm --filter @belzo/api lint`; `pnpm --filter @belzo/web typecheck`; `pnpm --filter @belzo/web test`; `pnpm --filter @belzo/web lint`; `pnpm --filter @belzo/web build`.

The API resolves `@belzo/shared` from `dist`, so build shared before the API typecheck. To apply the migration locally: `pnpm --filter @belzo/api db:migrate`, which needs the local Postgres in `DATABASE_URL`. If it isn't reachable, report that and don't run it. Never run it against production; no deploy.

### 14. Assumptions and open points (flagged for review)
- A-1. **Pack Of = 1 is not stored.** The storefront variant label is `Object.values(attributes).join(' / ')`, so storing `1` would show "S / Blue / 1". Values > 1 are stored as `"Pack Of": "N"`. The export writes 1 when the key is absent, so the round trip is stable. The decision says "Pack Of → variant attributes"; this narrows it on purpose.
- A-2. The children-to-gallery fallback applies only when the Parent row is in the file. Otherwise a partial upload of one child with a photo would wipe the product gallery.
- A-3. The 5-image prefix rule keeps images 6–10 through a round trip. The workbook has only 5 image columns; the gallery allows 10. Both the export and the no-op rule work on the de-duplicated gallery, so stored duplicate URLs don't defeat it.
- A-4. Slabs that don't fit minQty 5/9/13/21 (set in the editor) export as blank tiers, so a re-upload keeps them. They can't be edited through the sheet.
- A-5. A tier price equal to the Selling Price is skipped as "not lower". Tier 1 is not read on import at all: no parse, no range check, no warning. The owner's shoe rows have Tier 1 15%, which doesn't match their Selling Price, so a warning would flag every sample row. Separately, the export's computed Tier 1 can exceed 95% for deep discounts, and a range check would break the round trip.
- A-6. Product-level fields (category, HSN, GST, description, title, dimensions) come only from the Parent row. A Child row's Tax Type applies to its own prices. A Child row's GST is never a rate source while the Parent row is present (warning only when it differs); in a child-only upload it is used only to convert that row's Exclusive price (§6b "GST for variant rows"). A child-only upload never edits product fields or the brand.
- A-7. Brands are found or created before the transaction, so a group that later fails can leave a new, unused brand. Today's `bulkUpsert` behaves the same.
- A-8. Stock is still an absolute overwrite (owner decision 9). As a new audit improvement, each change writes a StockMovement (`adjustment`, `bulk-sheet`). The overwrite risk is called out in the UI and the Instructions.
- A-9. Excel list validations use `errorStyle: 'warning'`. Excel compares a typed `12%` (stored as number 0.12) against the text list, and a slug typed in Final detail isn't in the name list either. A hard stop would block valid input. Unverified: exact Excel/LibreOffice behaviour for percent-typed list cells. The import accepts both forms regardless.
- A-10. CSV uploads lose tier precision to whatever Excel displays (e.g. `18.03%`). A hand-set slab can then move by up to about MRP × 0.00005 paise. The .xlsx path is exact.
- A-11. SKUs with more than 15 digits typed as numbers are already corrupted by Excel before upload; nothing can recover them. Text-formatted SKU/HSN columns prevent this for cells typed into the template.
- A-12. The export excludes archived products, as before. The import can still match an archived product by SKU, and its status is left archived.
- A-13. Checked with `npm view`: `exceljs` 4.4.0 is the `latest` dist-tag (registry metadata last modified 2024-12-20). It is MIT-licensed, with `browser: ./dist/exceljs.min.js`, `main: ./excel.js` and `types: ./index.d.ts`. It isn't installed in the repo yet. It is the de-facto maintained option; SheetJS on npm is outdated. In web jest (node env, ts-jest compiles `import()` to `require`), `import('exceljs')` resolves the node `main` build, and `loadExcel`'s `default ?? mod` handles the `__importStar` wrapper. Unverified until build: that Next 14 resolves the `browser` build through `import('exceljs')`. Defined fallback if `next build` fails to resolve it: `import('exceljs/dist/exceljs.min.js')` with a local `declare module 'exceljs/dist/exceljs.min.js' { export * from 'exceljs'; }` in `apps/web/src/types/exceljs.d.ts`.
- A-14. `POST /admin/products/bulk` is kept, deprecated, because `scripts/test-bulk.js` uses it. `GET /admin/products/export` is removed because nothing else uses it.
- A-15. CSV row numbers are CSV record numbers. They equal the Excel row numbers unless a cell holds an embedded line break. Excel-saved CSVs quote those cells, so this still holds.
- A-16. Out of scope and pre-existing: the editor's `PUT /admin/products/:id/images` rejects `/…` paths that bulk imports may store.
- A-17. `parsePercent` reads a number strictly between 0 and 1 as a fraction (Excel's stored form of a `%` cell), so a typed `0.5` in a General-format tier cell means 50%, not 0.5%. Tier cells in the downloaded template are %-formatted, so a typed `0.5%` is stored as 0.005 and read correctly.
- A-18. Legacy variant SKUs longer than 60 characters (the old `csvRowSchema` had no max) get a "SKU is longer than 60 characters" row error. None are expected; the editor and wizard cap SKUs at 60.
- A-19. The children-to-gallery fallback applies to new products only (see §6b and AC-9). An existing product with an empty gallery keeps it empty until Parent row images are given.
- A-20. A non-standard stored GST rate (the editor allows any integer 0–28) is written to the sheet as is. On import it is accepted only when it equals the product's current rate, so it is kept with a warning. Changing to another non-list rate is still an error (AC-7).
- A-21. SKUs are case-sensitive everywhere (grouping and DB), matching the case-sensitive unique indexes. Case-only near misses are hinted, never auto-matched, so the sheet can't silently attach rows to a product the owner didn't name exactly.
- A-22. A Parent SKU that (with Child rows) equals an existing variant SKU of a product it can't be matched to by steps 1, 2 or 4 is rejected rather than guessed. The owner picks a different Parent SKU. Single-row Parent rows keep the variant-SKU match (step 3), except for a multi-variant product without a saved Parent SKU (group error). After any match, the §6a ownership check rejects a group whose SKUs belong to another product, and a derived-only match is accepted only for child-only groups and Parent rows that write no variants, unless the group already names one of the product's variants. So no step can silently merge a group into an unrelated product.
- A-23. Text values longer than the sheet limits (legacy brands, attribute values over 200 characters, image URLs over 2,048) are exported blank so a re-upload keeps them. They can't be edited through the sheet. None are expected; the editor's DTOs don't cap attribute values, which is why the limit is 200 rather than 60.
- A-24. Numeric cells are capped at Postgres `INTEGER` (2,147,483,647 paise ≈ ₹2.1 crore per unit; 2,147,483,647 g; stock 2,147,483,647) and Pack Of at 10,000. These are storage limits, not business rules.
- A-25. The old 12-column CSV is rejected as a whole (one upload format, as the owner asked). Owners with old files copy their rows into a fresh download.
- A-26. The SKU-named image fallback assigns each file to the longest matching SKU in the file, so a Parent row never takes its Child rows' photos as the gallery.
- A-27. Step 2 still accepts a null-sku legacy product found through its existing Child SKUs under any Parent SKU the owner chooses (that Parent SKU is then saved). Naming the product's own existing variants is treated as intent; the ownership check only rejects SKUs owned by a different product.
- A-28. India's GST rationalisation (Sep 2025) added 40% and moved most goods to 5%/18%; 40% cannot be entered anywhere yet because GST_RATES and the DTOs cap taxRatePct at 28 — owner to decide.

### 15. First-pass verification against the code
This pass checked the design against the code; no review file existed. What was checked and what changed:
- `schema.prisma`:
  - `Product` has no `sku` and `Variant` has no `costPrice` today. `Product.isTaxInclusive` exists and is unread.
  - `StockReason.adjustment` and `ProductStatus` draft/published/archived exist.
  - The latest migration is `20261001120000_product_returnable`, so the new `20261002120000_…` sorts after it.
- `product.service.ts`:
  - `uniqueSlug` and `findOrCreateBrandByName` are `private` (made public as planned).
  - The constructor is `(prisma, categories: CategoryService)`.
  - `bulkUpsert` loads fuzzy categories with `where: { isActive: true }` and no `isActive` in `select`, and the spec fake returns rows without `isActive`. Fix: `matchCategory` treats `isActive` as optional, and `bulkUpsert` only swaps `normKey` for `normCategoryKey`.
- `VariantService`:
  - `normaliseSlabs` is private and allows equal prices.
  - `upsert` overwrites `attributesJson` (`?? {}`) and `priceSlabsJson` on every update, which confirms the `mergeVariantAttrs` fix for `variant-slabs.tsx` `save()`.
  - `weightGrams`/`imageUrl` undefined leave the column unchanged.
- `pricing.ts`/`catalogue.ts`: `resolveSlabPrice` picks the highest `minQty <= qty`, and the cart sums quantity per product. AC-4 slab values were recomputed by hand and match.
- `product-editor.tsx`/`variant-edit.ts`:
  - The editor already round-trips slabs, attributes, weight and image via `variantUpsertBody`.
  - `ATTR_KEYS` uses `Color` and `Dimensions`, the keys the sheet writes.
- `product-wizard.tsx`: create-only. It never sends `costPrice`, which is fine because create defaults to null.
- `bulk/page.tsx`: the image helpers (`addImageFiles`, `fileKeyFor`, `skuFiles`, drop zone) exist as described. `admin-status--warn` exists in `admin.css`.
- `main.ts`: the JSON body limit is 1 MB.

Fixed in this pass:
1. `readProductWorkbook` now uses `eachRow`. The old plan to loop to `actualRowCount` would drop the last rows after a blank row.
2. Over-long cells would have 400'd a whole chunk. There is now a shared `SHEET_FIELD_MAX` pre-check, plus an oversize-group guard.
3. Round-trip breakers were fixed:
   - Tier 1 >95%: Tier 1 is no longer read.
   - Slabs >95% off: exported blank.
   - Non-standard GST.
   - Empty gallery filled from variant photos: fallback is now for new products only.
   - Duplicate gallery URLs (only partly in the first pass; galleries over 5 images were still broken, fixed in §16, finding 7).
   - Trailing whitespace.
   - Same-name brands.
   - Attribute key case. (The first pass also claimed key position was kept; that was wrong because `jsonb` re-orders keys. Corrected in §16, finding 13.)
   - Non-numeric `Pack Of`.
   - `P-slug` over 60 characters.
4. The planner is diff-only, so AC-5 and AC-9 hold by construction. AC-9 now states the intended `Product.sku` backfill exception.
5. The reporting low-stock query was wrongly listed as leaking `costPrice`. It maps explicit fields.
6. Instructions #5 no longer claims a changed SKU creates a new product.
7. Shared-module tree-shaking (AC-15) is pinned by a no-module-scope-side-effects rule.
8. The API spec gets its own fake, because the existing `build()` updates variants by SKU.
9. FR-6's dangling "owner decisions 1–10" reference is replaced by the explicit rules R-1…R-10 this design applies.

Not verified, needs a real run:
- Next 14 resolving the exceljs `browser` build (A-13 fallback defined).
- Excel/LibreOffice dropdown behaviour for percent-typed cells (A-9).
- The "Herbal Tea" category assumed by AC-3. It is not in the seed, so the AC-3 spec fixture creates it.
- AC-15's "< 1 kB First Load JS" depends on the bundler dropping unused `bulk-sheet.ts` re-exports; checked only by the `next build` comparison in §11.

### 16. Responses to the design review (`design-review.md`, CHANGES_REQUESTED)
Re-checked against the code for this revision: `admin-catalogue.controller.ts` (product and variant `attributes: z.record(z.string())` with no length cap; `hsnCode: z.string().max(12)`; `VariantUpsertDto` `mrp`/`sellingPrice` without `.max`), `schema.prisma` + migrations (`attributesJson`/`priceSlabsJson` are `JSONB`; datasource `postgresql`, so Prisma `mode: 'insensitive'` is available), `variant-slabs.tsx` `reload()` (`attrs.Size ?? ''`, `attrs.Color ?? ''`), `variant-edit.ts` `variantLabel`'s local case-insensitive `pick`, and `product-variants.tsx` (`Object.values(v.attributes).join(' / ')`). Every finding is addressed; none is backlogged or ignored.

1. HIGH, child GST. Addressed. §6b "GST for variant rows" defines `parentGst`/`gstForExclusive` exactly as the review proposed. A child GST cell is never an error while the Parent row is present (warning only when it differs). In a child-only upload it is used only for that row's Exclusive conversion, with the equals-current-rate tolerance. A new product with blank GST saves 0% but has no rate for the Exclusive conversion, so an Exclusive row errors. §7 and A-6 now say the same. Specs added (3% multi-variant round trip; new product, blank GST, Exclusive child).
2. HIGH, step 3 merging. Addressed. §6a now orders the steps by group shape. Groups with Child rows use 1, 2, 4, then a group error if `P` is an existing variant SKU. Single-row groups keep step 3. Specs added for the Sesame Oil scenario (group error, zero writes) and the own-variant `OIL-500` case. AC-11 and A-22 are updated.
3. MEDIUM, brand include. Addressed. The target query includes `brand: { select: { id, name } }`, and `ctx.product.brand` is what the brand rule compares.
4. MEDIUM, cascade from grouping. Addressed. `groupSheetRows` records `failedParents` in pass 1 (role known, SKU non-blank) and cascades `Not imported: Parent row N has errors.` in pass 2. Invalid-indicator rows don't cascade. Duplicate Parent rows aren't recorded, because the earlier valid Parent row owns the children. The length check moved after the indicator step so it knows the row's role. Spec added.
5. MEDIUM, field limits vs export. Addressed. Child `title`/`description` skip the length check, and the export truncates the Child title to 200. `colour`, `size` and `dimensions` are raised to 200 in `SHEET_FIELD_MAX` and the DTO. Added beyond the review: any other exported text over its limit is written blank (blank keeps the value), so legacy outliers can't break AC-9 (A-23).
6. MEDIUM, HSN spaces. Addressed. HSN is compared whitespace-stripped, and an unchanged HSN gives no 4/6/8-digit warning.
7. MEDIUM, duplicate gallery URLs. Addressed. The export writes the first 5 of the de-duplicated gallery, and the no-op rule compares with `existingDedup` and `existingDedup.slice(0, 5)`. Fixture added.
8. MEDIUM, `Pack Of` key case. Addressed. One `mergeAttr` rule (case-insensitive match set, same value = no change, different = remove matches + set canonical, Pack Of 1 = remove all) covers Size, Color, Pack Of and the product attributes.
9. MEDIUM, numeric bounds. Addressed. Every numeric parser checks a strict regex before `Number()`. Money, stock and grams are capped at `INT_MAX`, Pack Of at 10,000, and a converted Exclusive price is checked as well. `VariantUpsertDto.costPrice` gets `.max(2_147_483_647)`. `cellToString` writes Excel numbers as plain decimals (`plainNumber`) so the regex never rejects a genuine numeric cell. Parser specs added.
10. MEDIUM, SKU case. Addressed. SKU comparisons are exact everywhere (§3 "SKU comparison", A-21). Grouping adds a case-hint warning. §6a appends `(did you mean …?)` on case-only misses, and new variants that differ only by case get a warning. Spec added.
11. NIT, `chunkGroups` wording. Addressed (§4).
12. NIT, stock `?? null` vs `?? 0`. Addressed. Both use `?? 0`. A missing inventory row with stock 0 is unchanged and creates nothing.
13. NIT, `jsonb` key order. Addressed. The position rationale is removed. Attributes and slabs are diffed with `stableStringify` (sorted keys). The spec fake returns JSON keys re-ordered so the diff is actually exercised.
14. NIT, Child image 2–5. Addressed. Warning added when they aren't used for a new product's gallery.
15. NIT, `mrp' = 0` order and all-tiers-skipped. Addressed. The slab steps are numbered (the MRP check comes before `buildTierSlabs`), and Instructions #10 says an all-skipped set leaves no bulk prices.
16. NIT, `reload()` exact keys. Addressed. A shared `pickAttr` in `variant-edit.ts` (also used by `variantLabel`) is used in `reload()`. Test added.

Review "unverified" items that need no design change: exceljs registry metadata and Next resolution (A-13 fallback is defined), AC-15 bundle size (checked by `next build`), and Excel list behaviour for percent cells (A-9; the import accepts both forms). The owner's recommendation text isn't recorded in the repo. R-1…R-10 are kept exactly as approved in the earlier design, including R-3 (header written as `Weight (kg)`, `Weight (g)` still accepted). This revision adds no new product behaviour beyond what the findings needed.

### 17. Responses to design review round 2 (`design-review.md`, CHANGES_REQUESTED: 1 HIGH, 3 MEDIUM, 11 NIT)
Re-checked for this revision: `bulk/page.tsx` `skuFiles` (prefix rule `base === s || startsWith(s-) || startsWith(s_)`, then plain `.sort()`), `product-csv.ts` `PRODUCT_CSV_COLUMNS` (`sku,title,categorySlug,mrp,sellingPrice,description,brand,hsnCode,taxRatePct,stock,status,imageUrl`) and the old bulk page copy ("save as CSV UTF-8"). Every finding is addressed; none is backlogged or ignored.

1. HIGH, no ownership check after steps 1/4. Addressed. §6a adds the ownership check after the target is chosen. A group SKU (or variant `P`) owned by a product other than T is a group error. A derived-only match with a Parent row that writes variants and shares no SKU with T is a group error. One refinement to the review's rule: a Parent row with no Child rows and no variant cells may still match by derived SKU, because that is how a downloaded zero-variant legacy product round-trips (AC-9) and how a parent-only edit of a legacy product works (existing "derived-SKU parent-only row" spec). Such a row can't create a product, so the scenario-A risk doesn't apply to it. `variantsBySku` now loads before the target so the check can use it. Specs added for scenarios A and B, child-only attach, parent-only edit and the existing-child case. AC-11 and A-22 are updated.
2. MEDIUM, single-row Parent naming one variant of a multi-variant legacy product. Addressed. Step 3 (single-row shape) loads the active variant count and raises `SKU P is one of N variants of "<title>" — put it on a Child row with Parent SKU Q.` when the product's `sku` is null. Spec added.
3. MEDIUM, old CSV half-accepted. Addressed. `mapHeaderRow` returns `oldFormat`; both readers turn it into a fatal `OLD_FORMAT_MESSAGE`. The `categoryslug` alias is removed. FR-5, AC-16, Instructions #19 and A-25 say so. Specs added.
4. MEDIUM, SKU-named image fallback. Addressed. New pure `assignSkuFiles` in `product-sheet.ts` (longest matching SKU wins; exact-base file first, then by name) replaces `skuFiles`. Spec added with the review's three files. Instructions #15 explains it.
5. NIT, case-only new Parent SKU. Addressed. Step 5 runs the insensitive lookup (stored and derived) and warns on the Parent row.
6. NIT, undefined messages. Addressed. Exact strings for `parseNonNegInt`, `parseKgToGrams`, `parsePercent`, the `columnLabel` rule, and the brand warning with no fallback.
7. NIT, >5,000-row export. Addressed in Instructions #1 and the fatal message.
8. NIT, `Pack Of` `"02"`. Addressed. Digit-only values compare numerically. Spec added.
9. NIT, `'0.###'`. Addressed. kg cells use `'General'`.
10. NIT, Instructions #15. Addressed with the review's sentence.
11. NIT, issues on transaction failure. Addressed. Planner errors are always reported; plan warnings only on commit (§6c, §10). Spec added.
12. NIT, CSV encoding and header position. Addressed. Header = record 1 after the BOM, else the "no SKU column" fatal; Instructions #19 and the file-input hint say "CSV UTF-8 (Comma delimited)". No encoding detection.
13. NIT, new variant SKU equal to another product's Parent SKU. Addressed. One `product.findMany({ where: { sku: { in: newSkus } } })` per group plus a derived-map lookup feed `ctx.parentSkuClash`; a hit is the row error `SKU X is the Parent SKU of "<title>" — use a different SKU.` The derived lookup goes slightly beyond the review: without it the other product's derived Parent SKU would silently change in the next download. Spec added.
14. NIT, AC-2 vs §7. Addressed. AC-2 qualifies D2.
15. NIT, Parent SKU on a Parent row. Addressed. Grouping step 5 warns when it is filled and differs from the SKU. Spec added.

Review "unverified" items that need no design change: Next 14 resolution of the exceljs `browser` build (A-13 fallback), AC-15 bundle size (checked by `next build`), Excel list behaviour for percent cells (A-9), exceljs validation write cost (fine at this catalogue size), the owner's recommendation text (R-1…R-10 kept as approved, including the `Weight (kg)` header) and the "Herbal Tea" fixture. No new product behaviour was added beyond what the findings needed.
