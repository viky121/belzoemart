# Implementation Plan — Remove a variant from an existing product

Work directly on `master` in `c:\xampp\htdocs\Belzo` (no worktree). No Prisma schema change and no
migration: `Variant.isActive Boolean @default(true)` already exists.

## Facts verified in the code (do not re-derive)

- `apps/api/prisma/schema.prisma`: `Inventory.variant` is the ONLY real FK to `Variant`
  (`onDelete: Cascade`). `OrderItem.variantId`, `CartItem.variantId`, `WishlistItem.variantId`,
  `StockMovement.variantId` are plain `String` columns with no relation, so a hard delete of a
  variant is never blocked by the DB. `OrderItem` snapshots `title`, `sku`, `unitPrice`, `taxRatePct`.
- Order history reads after removal:
  - `orders/order.service.ts` `productMetaForVariants` looks variants up only for image/slug and
    falls back to `null` → safe for hard-deleted and soft-deleted variants.
  - `orders/return.service.ts` looks up `variant.product.isReturnable` and `inventory.adjust`s the
    variant on approval; `orders/order.service.ts cancel` releases/adjusts inventory; `orders/fulfilment.service.ts`
    reads `weightGrams`. All of these only run for variants that are in an `OrderItem`, and such
    variants are only ever SOFT-deleted (row + inventory kept) → nothing breaks.
  - `orders/order.service.ts reorder` calls `cart.addItem` for every order line → MUST be changed
    (step 5) or a reorder containing a removed variant would 400 once addItem rejects inactive.
- `isActive` is currently honoured only in `ProductService.detail` (`variants: { where: { isActive: true } }`)
  and `ProductService.applyPriceSlabs`. `ProductService.setStatus` uses `include: { variants: true }`
  (NOT filtered — fix in step 3).
- Admin UI: `ProductEditor` (`apps/web/src/app/admin/catalogue/product-editor.tsx`) and
  `VariantSlabsEditor` (`.../variant-slabs.tsx`) both load `GET /admin/products/:id/variants`
  (`VariantService.listByProduct`). Only one is open at a time (`page.tsx` toggles `editId` / `pricingId`).
  `adminFetch` throws `ApiClientError` whose `.message` is the server's message.
- Test commands (jest via ts-jest; the full `pnpm -r test` is slow, >5 min — run targeted files):
  - API: `cd apps/api; npx jest <paths>` (e.g. `npx jest src/modules/catalogue`), typecheck `cd apps/api; npx tsc -p tsconfig.json --noEmit`
  - Web: `cd apps/web; npx jest <paths>` (testMatch `**/*.test.ts`, pure helpers only), typecheck `cd apps/web; npx tsc --noEmit`
  - Baseline: `npx jest src/modules/catalogue/variant.service.spec.ts` passes (5 tests).

## Decisions

- Delete vs deactivate: decided by `orderItem.count({ where: { variantId } }) > 0`. Ordered → soft
  delete (`isActive=false`) so invoices/returns/cancel/restock keep working on the real row and
  inventory. Never ordered → hard delete (inventory cascades) so the SKU is free for reuse.
  StockMovement rows are left untouched (no FK, pure audit history).
- Last-variant guard counts ACTIVE variants of the product; blocks only when `product.status === 'published'`
  and the target is active and is the last active one. Draft and archived products may lose their
  last variant.
- Removing an already-inactive variant is idempotent: re-run cart/wishlist cleanup, return
  `{ removed: true, mode: 'deactivated' }`.
- Storefront listings hide published products that have no active variant via a
  `variants: { some: { isActive: true } }` where clause (keeps `total`/pagination correct) and also
  filter the included variants to active; `toCard`/search mapping additionally filter
  `isActive !== false` defensively (makes it unit-testable with fake Prisma). The storefront detail
  gets the same `some` guard → 404 instead of a ₹0 page with no options.
- Cart: `addItem` rejects missing/inactive variants with 400; `getCart` keeps lingering lines but
  marks them `unavailable: true`, `inStock: false`, `available: 0` and excludes them from the
  bulk-tier quantity; checkout `buildLines` throws a clear 400 for unavailable lines.
- `VariantSlabsEditor` gets an optional `onChanged` prop so the catalogue table's variant count /
  stock refreshes after a removal (same role as `ProductEditor.onSaved`).
- Pure UI helpers (label + messages) go in `apps/web/src/lib/variant-edit.ts` so they are covered by
  the existing web jest setup.

---

- [x] 1. Add `VariantService.remove(id)` and the `DELETE /admin/variants/:id` route.
      In `apps/api/src/modules/catalogue/variant.service.ts`:
      - import `NotFoundException` too.
      - `async remove(id: string): Promise<{ removed: true; mode: 'deleted' | 'deactivated' }>`:
        1. `const v = await this.prisma.variant.findUnique({ where: { id }, include: { product: { select: { id: true, status: true } } } });`
           if `!v` → `throw new NotFoundException('Variant not found')`.
        2. If `v.isActive` and `v.product.status === 'published'`:
           `const active = await this.prisma.variant.count({ where: { productId: v.productId, isActive: true } });`
           if `active <= 1` → `throw new BadRequestException('This is the last active variant of a published product. Unpublish the product (set it to Draft) or delete the whole product instead.')`.
        3. `const ordered = (await this.prisma.orderItem.count({ where: { variantId: id } })) > 0;`
        4. Inside `await this.prisma.$transaction(async (tx) => { ... })` (interactive form, same as
           `ProductService.bulkUpsert`): `tx.cartItem.deleteMany({ where: { variantId: id } })`,
           `tx.wishlistItem.deleteMany({ where: { variantId: id } })`, then
           ordered (or already inactive) → `tx.variant.update({ where: { id }, data: { isActive: false } })`;
           otherwise → `tx.variant.delete({ where: { id } })` (Inventory cascades; do NOT touch stockMovement).
        5. Return `{ removed: true, mode: ordered || !v.isActive ? 'deactivated' : 'deleted' }`.
        Add a JSDoc explaining the rule (ordered → soft delete for order history; else hard delete
        so the SKU can be reused; last-active-of-published blocked).
      - `listByProduct`: change to `where: { productId, isActive: true }` (keep `include: { inventory: true }`).
      - `upsert` SKU clash message: change the clash lookup `select` to `{ id: true, isActive: true }`
        and, when the clashing variant is inactive, throw
        `ConflictException(\`SKU "${input.sku}" belongs to a removed variant kept for order history — re-upload it via Bulk upload to restore it, or use a different SKU\`)`;
        active clash keeps the existing message. (Existing spec fakes return `{ id }` only → `isActive` undefined → existing message path; keep it that way by checking `clash.isActive === false`.)
      In `apps/api/src/modules/catalogue/admin-catalogue.controller.ts` add after `upsertVariant`:
      ```ts
      @Delete('variants/:id')
      removeVariant(@Param('id') id: string) {
        return this.variants.remove(id);
      }
      ```
      (class-level `@Roles('catalogue_manager')` already guards it.)
      Files: apps/api/src/modules/catalogue/variant.service.ts, apps/api/src/modules/catalogue/admin-catalogue.controller.ts
      Verify: `cd apps/api; npx tsc -p tsconfig.json --noEmit` clean; `npx jest src/modules/catalogue/variant.service.spec.ts` existing 5 tests pass.

- [x] 2. Unit tests for `VariantService.remove` and `listByProduct` in `apps/api/src/modules/catalogue/variant.service.spec.ts`.
      Add a new `describe('VariantService.remove', ...)` with its own `build()` fake (same style as the
      existing one): in-memory `variants` (`{ id, sku, productId, isActive }`), `products`
      (`{ id, status }`), `orderItems` (`{ variantId }`), `cartItems`, `wishlistItems`; fake
      `variant.findUnique({ where: { id } })` returning the variant with `product` attached,
      `variant.count({ where: { productId, isActive } })`, `variant.update`, `variant.delete`,
      `orderItem.count({ where: { variantId } })`, `cartItem.deleteMany`, `wishlistItem.deleteMany`
      (each records calls and mutates the arrays), and `$transaction: async (fn) => fn(prisma)`.
      Cases:
      - hard-deletes a never-ordered variant → `{ removed: true, mode: 'deleted' }`, `variant.delete` called with `{ where: { id } }`, no `variant.update`.
      - soft-deletes an ordered variant → `mode: 'deactivated'`, `variant.update` with `data: { isActive: false }`, no `variant.delete`.
      - removes the variant from every cart and wishlist (rows for other variants untouched), in both modes.
      - blocks the last active variant of a published product (`BadRequestException`, nothing deleted/updated, carts untouched).
      - allows removing the last variant of a draft product.
      - allows removing one of two active variants of a published product (e.g. 200ml/500ml/1000ml → remove 500ml).
      - 404 (`NotFoundException`) for an unknown id.
      - already-inactive variant → `mode: 'deactivated'`, no delete.
      Add `describe('VariantService.listByProduct')`: asserts the findMany args are
      `{ where: { productId: 'p1', isActive: true }, include: { inventory: true } }`.
      Add one upsert case: clash with an inactive variant → `ConflictException` whose message matches `/removed variant/`.
      Files: apps/api/src/modules/catalogue/variant.service.spec.ts
      Verify: `cd apps/api; npx jest src/modules/catalogue/variant.service.spec.ts` — all old + new tests pass.

- [x] 3. Filter inactive variants in `ProductService` (storefront list, detail, admin list/detail, export, publish) and reactivate in `bulkUpsert`.
      In `apps/api/src/modules/catalogue/product.service.ts`:
      - `toCard`: first line `const active = p.variants.filter((x) => (x as { isActive?: boolean }).isActive !== false);`
        (add `isActive?: boolean` to the `variants` element type) and use `active` for `cheapestVariant`.
      - `list()` ids branch: where → `{ status: 'published', id: { in: ids }, variants: { some: { isActive: true } } }`,
        include → `variants: { where: { isActive: true } }`.
      - `list()` paginated branch: initialise `where` as `{ status: 'published', variants: { some: { isActive: true } } }`
        and include `variants: { where: { isActive: true } }` (the `count({ where })` uses the same object, so totals stay correct).
      - `detail()`: add `variants: { some: { isActive: true } }` to the `findFirst` where (keep the existing include filter) → 404 when none active.
      - `setStatus()`: `include: { variants: { where: { isActive: true } } }` so publishing requires ≥1 ACTIVE variant (message unchanged).
      - `adminList()`: include `variants: { where: { isActive: true } }` (count, cheapest, stock, defaultVariantId all derive from it).
      - `exportRows()`: `variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, include: { inventory: true } }`.
      - `adminDetail()`: `variants: { where: { isActive: true }, include: { inventory: true } }`.
      - `bulkUpsert` existing-SKU branch: in the `tx.variant.update` data spread
        `...(existingVariant.isActive === false ? { isActive: true } : {})` after `mrp`/`sellingPrice`
        (the `=== false` check keeps the existing "unchanged round trip" spec green, whose fake variant has no `isActive`).
        Update the method JSDoc: "A SKU that belongs to a removed (deactivated) variant is reactivated and updated like any existing SKU."
      Leave `applyPriceSlabs` (already filtered) and `remove` untouched.
      Files: apps/api/src/modules/catalogue/product.service.ts
      Verify: `cd apps/api; npx tsc -p tsconfig.json --noEmit` clean; `npx jest src/modules/catalogue/product.service.spec.ts` — existing tests pass unchanged.

- [x] 4. Filter inactive variants in the Postgres search provider.
      In `apps/api/src/modules/catalogue/search/postgres-search.provider.ts` `search()`: initialise
      `where` as `{ status: 'published', variants: { some: { isActive: true } } }`, include
      `variants: { where: { isActive: true } }`, and inside the `rows.map` compute
      `const active = p.variants.filter((x) => x.isActive !== false);` and reduce over `active`
      (fallback `active[0] ?? { mrp: 0, sellingPrice: 0 }`). `autocomplete` unchanged.
      Files: apps/api/src/modules/catalogue/search/postgres-search.provider.ts
      Verify: `cd apps/api; npx tsc -p tsconfig.json --noEmit` clean.

- [x] 5. Cart, checkout, wishlist and reorder handling of inactive variants.
      - `apps/api/src/modules/cart/cart.service.ts`:
        - import `BadRequestException` from `@nestjs/common`.
        - `addItem`: before touching the cart, `const variant = await this.prisma.variant.findUnique({ where: { id: variantId }, select: { id: true, isActive: true } });`
          if `!variant || !variant.isActive` → `throw new BadRequestException('This product option is no longer available')`.
        - `getCart`: in the `productQty` loop skip lines whose variant is missing or `!isActive`; in
          `lines.map` compute `const unavailable = !v || !v.isActive;`, `const available = unavailable ? 0 : (v?.inventory?.available ?? 0);`,
          `inStock: !unavailable && available >= item.quantity`, and add `unavailable` to the returned line (additive field).
      - `apps/api/src/modules/checkout/checkout.service.ts` `buildLines`: before the `inStock` check add
        `if (item.unavailable) throw new BadRequestException(\`"${item.title}" is no longer available — remove it from your cart\`);`
        (`item` is typed from `CartService.getCart`'s return, so the new field is typed once the cart change lands).
      - `apps/api/src/modules/engagement/wishlist.service.ts` `list`: `inStock: !!v && v.isActive && (v.inventory?.available ?? 0) > 0`.
      - `apps/api/src/modules/orders/order.service.ts` `reorder`: wrap each `this.cart.addItem(...)` in
        `try { ... } catch (e) { if (!(e instanceof BadRequestException)) throw e; }` so a removed variant is skipped
        instead of failing the whole reorder (`BadRequestException` is already imported there).
      Files: apps/api/src/modules/cart/cart.service.ts, apps/api/src/modules/checkout/checkout.service.ts, apps/api/src/modules/engagement/wishlist.service.ts, apps/api/src/modules/orders/order.service.ts
      Verify: `cd apps/api; npx tsc -p tsconfig.json --noEmit` clean; `npx jest src/modules/checkout src/modules/orders` existing tests pass.

- [x] 6. API tests for listing/search/export/bulk/cart/reorder behaviour (depends on 3–5).
      - `apps/api/src/modules/catalogue/product.service.spec.ts`:
        - in `describe('ProductService.list — ids branch')`: new case — a row whose variants are
          `[{ id: 'x-cheap', mrp: 500, sellingPrice: 300, isActive: false }, { id: 'x-v', mrp: 1000, sellingPrice: 800, isActive: true }]`
          yields a card with `sellingPrice: 800` and `defaultVariantId: 'x-v'`; and assert the recorded findMany args contain
          `where.variants = { some: { isActive: true } }` and `include.variants = { where: { isActive: true } }`.
        - new `describe('ProductService.list — paginated')` with a fake whose `findMany`/`count` record args and
          return a row with an inactive cheaper variant: card price comes from the active variant; both
          `findMany` and `count` received `variants: { some: { isActive: true } }` in `where`.
        - `describe('ProductService.exportRows')`: assert `calls[0].include.variants.where` equals `{ isActive: true }` (extend the recorded arg type).
        - new `describe('ProductService.adminList')`: fake `product.findMany` records args, `inventory.findMany` returns stock; assert include `variants: { where: { isActive: true } }`.
        - in `describe('existing SKU edits')`: add `isActive?: boolean` to `FakeVariant`; new case
          "reactivates a soft-deleted SKU and applies the row" — existing variant `{ ...exVariant(), isActive: false }`,
          row with new mrp/sellingPrice/stock → `res.ok === 1`, variant `isActive === true`, prices updated, inventory upserted.
      - new `apps/api/src/modules/catalogue/search/postgres-search.provider.spec.ts`: fake `product.findMany`/`count`;
        card price ignores an inactive cheaper variant; where has `variants: { some: { isActive: true } }`.
      - new `apps/api/src/modules/cart/cart.service.spec.ts` (fake Prisma: `cart.findUnique/create`, `cartItem.findUnique/findMany/create/update`, `variant.findUnique/findMany`):
        - `addItem` rejects an inactive variant with `BadRequestException` and creates no cart item.
        - `addItem` rejects an unknown variant id.
        - `addItem` adds an active variant (cartItem.create called).
        - `getCart` marks a lingering inactive line `unavailable: true, inStock: false, available: 0`, and an inactive
          line does not count toward another active line's `tierQty` for the same product.
      - `apps/api/src/modules/checkout/checkout.service.spec.ts`: new case — cart fake returns an item with
        `unavailable: true, inStock: false` → `svc.preview(...)` rejects with `BadRequestException` matching `/no longer available/`
        (reuse the existing `build()` shape; `address.findUnique` already faked).
      - `apps/api/src/modules/orders/order.service.spec.ts`: new standalone `describe('OrderService.reorder')`
        — order with two items, cart fake whose `addItem` throws `BadRequestException` for one variant and records the other;
        reorder resolves and `getCart` is returned; the other variant was added.
      Files: apps/api/src/modules/catalogue/product.service.spec.ts, apps/api/src/modules/catalogue/search/postgres-search.provider.spec.ts, apps/api/src/modules/cart/cart.service.spec.ts, apps/api/src/modules/checkout/checkout.service.spec.ts, apps/api/src/modules/orders/order.service.spec.ts
      Verify: `cd apps/api; npx jest src/modules/catalogue src/modules/cart src/modules/checkout src/modules/orders` — all pass;
      `npx tsc -p tsconfig.json --noEmit` clean.

- [x] 7. Pure web helpers for the remove-variant UI + tests.
      In `apps/web/src/lib/variant-edit.ts` add:
      - `export type RemoveVariantMode = 'deleted' | 'deactivated';`
      - `export function variantLabel(attrs: Record<string, string> | null | undefined, sku: string): string`
        → joins the non-empty `Size` and `Color` values (keys matched case-insensitively) with `' / '` and appends ` (${sku})`; with no Size/Color returns just `sku`. E.g. `{ Size: '500 ml' }, 'OIL-500' → '500 ml (OIL-500)'`; `{ Size: 'M', Color: 'Black' }, 'TS-M-BLK' → 'M / Black (TS-M-BLK)'`.
      - `export function removeVariantConfirmText(label: string): string`
        → `` `Remove variant "${label}"? If it was ever ordered it is hidden and kept for order history; otherwise it is deleted permanently.` ``
      - `export function removeVariantSuccessMessage(label: string, mode: RemoveVariantMode): string`
        → deleted: `` `Removed "${label}" (deleted).` ``; deactivated: `` `Removed "${label}" — it was ordered before, so it is hidden from the store and kept for order history.` ``
      Add tests to `apps/web/src/lib/variant-edit.test.ts` for all three (attrs with Size+Color, Size only, none/null; both modes).
      Files: apps/web/src/lib/variant-edit.ts, apps/web/src/lib/variant-edit.test.ts
      Verify: `cd apps/web; npx jest src/lib/variant-edit.test.ts` — all pass.

- [x] 8. "Remove" button in the product editor's "Variants, price & stock" table.
      In `apps/web/src/app/admin/catalogue/product-editor.tsx`:
      - import `variantLabel`, `removeVariantConfirmText`, `removeVariantSuccessMessage`, `type RemoveVariantMode` from `@/lib/variant-edit`.
      - state `const [removingId, setRemovingId] = useState<string | null>(null);`
      - `async function removeVariant(v: AdminVariantRow)`: `const label = variantLabel(v.attributesJson, v.sku);`
        `if (!window.confirm(removeVariantConfirmText(label))) return;` `setRemovingId(v.id); setMsg(null);`
        `try { const res = await adminFetch<{ removed: boolean; mode: RemoveVariantMode }>(\`/admin/variants/${v.id}\`, { method: 'DELETE' });`
        remove it locally WITHOUT discarding other rows' unsaved edits:
        `setVariants((cur) => cur.filter((x) => x.id !== v.id)); setEdits((cur) => { const next = { ...cur }; delete next[v.id]; return next; });`
        `setMsg(removeVariantSuccessMessage(label, res.mode)); onSaved();` (refreshes the table's variant count/stock)
        `} catch (e) { setMsg(\`Could not remove ${label}: ${e instanceof Error ? e.message : 'unknown error'}\`); } finally { setRemovingId(null); }`
      - table: add a 5th header `<th scope="col">Actions</th>` and a 5th cell per row:
        `<button type="button" className="admin-btn--danger" onClick={() => removeVariant(v)} disabled={removingId !== null || busy} aria-label={\`Remove variant ${variantLabel(v.attributesJson, v.sku)}\`} data-testid={\`editor-v-remove-${i}\`}>{removingId === v.id ? 'Removing…' : '🗑 Remove'}</button>`
        (`.admin-table button.admin-btn--danger` styling already exists in `admin/admin.css`).
      - Also disable the "Save details" button while `removingId !== null`.
      - Update the hint paragraph below the table to add: "Removing a variant that was ordered before hides it and keeps it for order history."
      Files: apps/web/src/app/admin/catalogue/product-editor.tsx
      Verify: `cd apps/web; npx tsc --noEmit` clean; `npx next lint --file src/app/admin/catalogue/product-editor.tsx` no new errors.

- [x] 9. "Remove variant" button on each card in the Variants & pricing editor, and refresh the catalogue table.
      In `apps/web/src/app/admin/catalogue/variant-slabs.tsx`:
      - signature `export function VariantSlabsEditor({ productId, onChanged }: { productId: string; onChanged?: () => void })`.
      - import `variantLabel`, `removeVariantConfirmText`, `removeVariantSuccessMessage`, `type RemoveVariantMode` from `@/lib/variant-edit`.
      - state `removingId` as in step 8; `async function removeVariant(v: VariantRow)` same flow: confirm with
        `variantLabel(v.attributesJson, v.sku)`, `DELETE /admin/variants/${v.id}` via `adminFetch`, on success
        `setMsg(removeVariantSuccessMessage(label, res.mode)); await reload(); onChanged?.();`, on error
        `setMsg(e instanceof Error ? e.message : 'Could not remove variant.')`, `finally setRemovingId(null)`.
      - per-variant card `slab-editor__vhead`: show the label `{variantLabel(v.attributesJson, v.sku)}` in the `<strong>` (instead of only the SKU) so 200ml/500ml/1000ml are distinguishable.
      - in the card's `slab-editor__actions`, after "Save variant", add
        `<button type="button" className="admin-inline-btn admin-btn--danger" onClick={() => removeVariant(v)} disabled={removingId !== null} aria-label={\`Remove variant ${label}\`} data-testid={\`variant-remove-${v.sku}\`}>{removingId === v.id ? 'Removing…' : '🗑 Remove variant'}</button>`.
      In `apps/web/src/app/admin/catalogue/page.tsx` pass `onChanged={() => load()}` to `<VariantSlabsEditor productId={p.id} />`.
      Files: apps/web/src/app/admin/catalogue/variant-slabs.tsx, apps/web/src/app/admin/catalogue/page.tsx
      Verify: `cd apps/web; npx tsc --noEmit` clean; `npx next lint --file src/app/admin/catalogue/variant-slabs.tsx --file src/app/admin/catalogue/page.tsx` no new errors.

- [x] 10. Bulk page copy.
      In `apps/web/src/app/admin/catalogue/bulk/page.tsx`, in the "To edit existing products" paragraph, after
      "…blank optional cells leave the current value unchanged</strong>." add one sentence:
      `Re-uploading the SKU of a removed variant restores it with the row&apos;s values.`
      Files: apps/web/src/app/admin/catalogue/bulk/page.tsx
      Verify: `cd apps/web; npx tsc --noEmit` clean.

- [x] 11. Final verification across both apps.
      - `cd apps/api; npx tsc -p tsconfig.json --noEmit` and `npx jest src` (allow up to ~10 min; or run
        `npx jest src/modules src/common src/integrations` in chunks) — all suites pass.
      - `cd apps/web; npx tsc --noEmit` and `npx jest` — all pass.
      - Re-read the order-history paths (`orders/order.service.ts` getForCustomer/listForCustomer/cancel,
        `orders/return.service.ts`, `orders/invoice.service.ts`, `orders/fulfilment.service.ts`) and confirm none
        filter by `isActive` or require the variant row for title/sku (they use OrderItem snapshots) — no change needed.
      - Confirm no regressions: `applyPriceSlabs` still filters active; product editor save path unchanged apart from the
        new button; `toExportRows` signature unchanged; bulk round-trip spec still green.
      Files: none (verification only)
      Verify: all commands above exit 0.

## Out of scope / notes for the implementer

- No schema/migration change. Do not add FKs from OrderItem/CartItem/WishlistItem/StockMovement.
- Published products with zero active variants disappear from listings/search/detail (they had no purchasable option anyway).
- The storefront cart UI already renders `inStock: false` lines as unavailable; the new `unavailable` flag is additive and
  checkout blocks such lines with a clear message. No storefront UI change is required.
- Do not commit unless the workflow's later step asks for it; never push.
