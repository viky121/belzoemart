# U3 catalogue — Business Rules & Testable Properties

## Catalogue rules
- BR-1 Slugs are unique per model (category, brand, product). Generated from name, de-duplicated with a
  numeric suffix.
- BR-2 Category tree supports unlimited depth; a category's parent chain must not contain itself (no
  cycles). Moving a category under its own descendant is rejected.
- BR-3 Only `published` products appear in storefront queries; admin sees all statuses.
- BR-4 A product has ≥1 variant to be publishable. Each variant `0 <= sellingPrice <= mrp`.
- BR-5 Discount % is derived: `round((mrp - sellingPrice) / mrp * 100)` (0 when mrp = 0).

## Inventory rules (key correctness area)
- BR-6 `available >= 0` and `reserved >= 0` always. Reserve fails if `available < qty`.
- BR-7 Reserve: `available -= qty; reserved += qty`. Release: `reserved -= qty; available += qty`
  (bounded so reserved never goes negative). Sale confirm: `reserved -= qty`.
- BR-8 Every stock change writes a StockMovement (audit trail).
- BR-9 Adjustment (admin) changes `available` by a signed delta but cannot drive it below 0.

## Search & discovery rules
- BR-10 Search matches title/description via PostgreSQL full-text (tsvector) + trigram similarity for
  typo tolerance; results limited to published products.
- BR-11 Filters: category (incl. descendants), brand, price range, attributes, rating, availability.
- BR-12 Sort: relevance (FTS rank), price asc/desc, newest, popularity (ratingCount), rating, discount.

## Testable Properties (PBT-01)

| Property | Category | Rule |
|---|---|---|
| Reserve then release returns inventory to the original available/reserved counts | Round-trip/Invariant (PBT-02/03) | BR-7 |
| For any sequence of reserve/release/adjust ops, `available >= 0` and `reserved >= 0` | Stateful invariant (PBT-06) | BR-6 |
| Reserve fails (no state change) when qty > available | Invariant (PBT-03) | BR-6 |
| discountPct is always in [0,100] and 0 when mrp=0 | Invariant (PBT-03) | BR-5 |
| slugify is idempotent: slugify(slugify(x)) == slugify(x) | Idempotence (PBT-04) | BR-1 |
| total available+reserved conserved by reserve/release (no stock created/destroyed) | Invariant (PBT-03) | BR-7 |

Components with no PBT properties: thin controllers, media upload passthrough (integration-tested).
