# U3 catalogue — Domain Entities

Technology-agnostic domain model for the catalogue unit (categories, products, variants, inventory,
media, search). Maps to Prisma models in code generation.

## Category
- `id`, `name`, `slug` (unique), `parentId?` (self-relation → unlimited depth), `imageUrl?`,
  `displayOrder` (int), `seoTitle?`, `seoDescription?`, `isActive`, timestamps.
- Invariant: `slug` unique; a category cannot be its own ancestor (no cycles).

## Brand
- `id`, `name`, `slug` (unique), `logoUrl?`, `isActive`, timestamps.

## Attribute
- `id`, `name` (e.g. "Colour", "Size"), `code` (unique), `type` (`select`|`text`|`number`).
- `AttributeValue`: `id`, `attributeId`, `value` (e.g. "Red", "XL").

## Product
- `id`, `title`, `slug` (unique), `description`, `categoryId`, `brandId?`, `hsnCode` (GST),
  `taxRatePct` (GST rate by HSN), `status` (`draft`|`published`|`archived`), `isTaxInclusive` (bool),
  `ratingAvg` (decimal, denormalised), `ratingCount` (int), `searchVector` (tsvector, generated),
  `seoTitle?`, `seoDescription?`, timestamps.
- Media: `ProductImage` (id, productId, url, alt, position), optional `videoUrl`.
- Attributes: `ProductAttribute` join (productId, attributeValueId).

## Variant
- `id`, `productId`, `sku` (unique), `mrp` (Money/paise), `sellingPrice` (Money/paise),
  `attributesJson` (e.g. {"Colour":"Red","Size":"XL"}), `imageUrl?`, `weightGrams` (int),
  `isActive`, timestamps.
- Invariants: `sellingPrice <= mrp` and both `>= 0` (BR); `sku` unique.

## Inventory (per variant)
- `Inventory`: `variantId` (unique), `available` (int >= 0), `reserved` (int >= 0),
  `reorderLevel` (int), `updatedAt`.
- `StockMovement`: `id`, `variantId`, `delta` (int, +/-), `reason` (`purchase`|`sale`|`return`|
  `adjustment`|`reserve`|`release`), `ref?`, `createdAt` (audit trail).
- Invariant: `available >= 0` and `reserved >= 0` at all times (BR — key PBT target).

## Master data note
- Tax master = product.hsnCode + product.taxRatePct (GST by HSN). Shipping-class/attribute/brand masters
  are Brand/Attribute models above; shipping classes join in U5.
