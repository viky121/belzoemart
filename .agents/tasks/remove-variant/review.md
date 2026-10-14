# Remove a single variant from a product (soft/hard delete + inactive-variant hiding)

Admins can now remove one variant (e.g. 500 ml out of 200/500/1000 ml) from the product editor and the Variants & pricing panel through a new `DELETE /admin/variants/:id`. `VariantService.remove` returns 404 for unknown ids. It refuses to remove the last active variant of a published product. A variant that was ever ordered is soft-deleted (`isActive=false`); anything else is hard-deleted. Either way it's purged from every cart and wishlist. Inactive variants are then filtered out of the storefront list, search, cart, admin list/detail/export and `listByProduct`, and checkout refuses any cart line that's still left over. Order history keeps working because it reads the OrderItem snapshot and looks up variants without a filter, null-safely. Verification evidence is in both commit messages: api typecheck/lint/test (23 suites, 135 tests), shared tests, web typecheck/test/build, and next lint on the changed files.

Watch for: the ordered-vs-never-ordered check runs outside the delete transaction, so a checkout landing in that window can leave an order pointing at a hard-deleted variant (likely, narrow race). The low-stock report and search autocomplete still surface removed variants or variant-less products (confirmed, cosmetic).

**Verdict**: APPROVED

## High-level view

Delete vs deactivate depends only on `orderItem.count({ variantId }) > 0`. Inventory is the only real FK to Variant, so a hard delete cascades inventory and leaves StockMovement rows orphaned but intact, as specified. Soft-deleted variants keep their row and inventory, so cancel/return/restock paths (`inventory.release/adjust`), fulfilment weight lookup, returnability checks and review "has purchased" checks all still resolve. The guards and the count run before the transaction rather than inside it. That is the one integrity gap.

On the storefront, a published product with no active variants is hidden from list (paginated and `ids` branch), detail (404) and Postgres search, using the same `where` for rows and counts. Cards are priced from active variants only. `addItem` rejects inactive or unknown variants, `getCart` marks lingering lines unavailable and leaves them out of bulk-tier quantity, and checkout's `buildLines` blocks them before the out-of-stock check. Preview and place-order share that path. Reorder skips removed variants instead of failing. No new money arithmetic was added; all prices stay in integer paise.

On the admin side, `adminList`, `adminDetail`, `exportRows`, `setStatus` and `listByProduct` use active variants only. A CSV re-import never touches removed SKUs unless the sheet names them, and then `bulkUpsert` deliberately reactivates them. The bulk page copy says so. `VariantService.upsert` turns a clash with a removed SKU into a 409 that hints at restoring it. Both UIs confirm with a label built from size/colour + SKU, drop only the removed row so unsaved edits elsewhere survive, refresh the catalogue table, and disable the button while the request runs. The editor's Save is also disabled during a remove.

<details>
<summary>Issues (4)</summary>

1. **Hard-delete race with checkout** — `remove` counts OrderItems before opening the transaction. Re-check the count inside the transaction, or soft-delete whenever `inventory.reserved > 0`, so an order placed in that window can't be left with a deleted inventory row (`confirmSale`/`release` then throw NotFound).
2. **Last-active guard not atomic** — two concurrent removes of a published product's last two variants can both pass. The product then has zero active variants and is hidden from the storefront (fails closed). Do the count inside the same transaction if this matters.
3. **Low-stock report lists removed variants** — `ReportingService.inventory()` queries `inventory` with no variant filter, so soft-deleted variants with ≤10 units keep appearing. Add `variant: { isActive: true }` to the where.
4. **Autocomplete suggests unpurchasable products** — `PostgresSearchProvider.autocomplete` filters only on `status: 'published'`. Add `variants: { some: { isActive: true } }` to match `search`.

</details>

<details>
<summary>Details</summary>

### Delete-vs-deactivate decision and its race window

```
remove(id)
  findUnique(variant + product.status)        ─┐
  count active variants (published only)       │ outside tx
  count orderItem where variantId              ─┘
  $transaction: cartItem.deleteMany, wishlistItem.deleteMany,
                variant.update(isActive=false) | variant.delete (cascades inventory)
```

Both counts are read before the transaction. Checkout creates the Order with its OrderItems and then calls `inventory.reserve` per line. If that lands between `orderItem.count` and `variant.delete` (likely, narrow), the variant and its inventory row are deleted under a live order. Later `confirmSale` on payment capture, `release` on failure or cancel, and `adjust` on return all go through `InventoryService.mutate`, which throws `NotFoundException('Inventory not found for variant')`. A captured payment would then fail to convert its reservation. With no FK from OrderItem to Variant, the database won't catch it. Re-running the count inside the transaction shrinks the window. Treating `inventory.reserved > 0` as "ordered" closes the common case outright.

The last-active guard has the same shape (possible). Two parallel DELETEs on the last two active variants of a published product can both see `active = 2`. The result fails closed: the product drops out of list, detail and search because every storefront query now requires `variants: { some: { isActive: true } }`, and `setStatus('published')` won't re-publish it until a variant is added or restored.

### Storefront search autocomplete

`autocomplete` in the Postgres search provider was left unfiltered (confirmed): it can suggest a product that `search` then hides.

### Bulk upload reactivation and CSV round-trip

`exportRows` emits active variants only, so an export → edit → re-upload after a removal leaves the removed SKU alone. A spreadsheet exported *before* the removal still lists the old SKU, and re-uploading it silently restores the variant. That matches the spec and is now documented in the bulk page copy. The reactivated variant keeps whatever `priceSlabsJson` it had when it was removed, computed from its old selling price. That's the same behavior existing active SKUs already get on a price-only re-upload, so it isn't a regression.

### Admin views

`ReportingService.inventory()` (low-stock report) wasn't updated (confirmed). It reads `inventory` joined to variant with no `isActive` filter, so a deactivated variant that still holds ≤10 units shows up as low stock for a SKU that can no longer be sold or edited in the catalogue UI.

### Test coverage

The fake-Prisma specs cover hard delete, soft delete, the last-active block, the draft exception, the two-variant published case, 404, idempotent re-removal, `listByProduct` filtering, cart add rejection and lingering-line handling (tier quantity included), the checkout block, list/search card pricing with where+count filtering, `adminList` counts, bulk reactivation and no-op on active SKUs, the upsert restore hint, and order detail/reorder for both deactivated and hard-deleted variants. Web tests cover the label/confirm/success helpers.

Not tested: the `exportRows`, `adminDetail` and `setStatus` active-only filters; detail returning 404 when no active variant remains; place-order (only preview) with an unavailable line; and the React remove handlers themselves (local row drop, refresh callback, in-flight disable). The race above can't be reached in the fake-Prisma style without an interleaving harness.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/catalogue/variant.service.ts`: `remove()`, active-only `listByProduct`, restore hint on a removed-SKU clash
- `apps/api/src/modules/catalogue/admin-catalogue.controller.ts`: `DELETE /admin/variants/:id` (controller-level `@Roles('catalogue_manager')`)
- `apps/api/src/modules/catalogue/product.service.ts`: active-only list/ids/detail/setStatus/adminList/export/adminDetail; card price from active; `bulkUpsert` reactivation
- `apps/api/src/modules/catalogue/search/postgres-search.provider.ts`: active-only search where/include and pricing (whole-file add; previously untracked)
- `apps/api/src/modules/cart/cart.service.ts`: `addItem` rejects inactive; `getCart` unavailable lines (whole-file add)
- `apps/api/src/modules/checkout/checkout.service.ts`: block unavailable lines in `buildLines`
- `apps/api/src/modules/engagement/wishlist.service.ts`: `inStock` false for inactive (whole-file add)
- `apps/api/src/modules/orders/order.service.ts`: reorder skips removed variants (whole-file add)
- `*.spec.ts` (cart, product, postgres-search, variant, checkout, order): fake-Prisma coverage listed above
- `apps/web/src/app/admin/catalogue/product-editor.tsx`: Remove column + handler, Save disabled during remove
- `apps/web/src/app/admin/catalogue/variant-slabs.tsx`: Remove button per card, size/colour label, `onChanged` (whole-file add)
- `apps/web/src/app/admin/catalogue/page.tsx`: passes `onChanged` to the slabs editor
- `apps/web/src/app/admin/catalogue/bulk/page.tsx`: note about restoring a removed SKU
- `apps/web/src/lib/variant-edit.ts` (+ test): `variantLabel`, confirm/success text helpers

Full diff: `git diff 38a2eae HEAD`

</details>
