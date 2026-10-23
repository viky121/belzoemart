# Settings-Wiring Implementation Plan — Belzo eMart

Make hardcoded merchant-config values in `apps/api` actually driven by the existing
admin Settings system (`SettingsService` + `PUT /admin/settings`). Scope = Phase 1
and Phase 2 from `.agents/tasks/hardcoded-config-audit.md`. Deferred items
(security knobs #11/#13/#14, notification templates #12, mock-provider constants #8,
ShipRocket fallbacks #9, cart MAX_QTY, `'000000'` fallback) are intentionally left
as code.

## Design decisions (grounded in the code read)

1. **Keep `PricingService.compute()` synchronous and pure.** It gains four optional
   inputs — `freeShippingThresholdPaise`, `flatShippingPaise`, `codFeePaise`,
   `sellerState` — each defaulting to the current class constant when omitted. This
   keeps every existing caller/test (`checkout.service.spec.ts` passes a stub; the
   shared `computeTotals` is untouched) backward-compatible. Rationale: `compute()`
   is called from both `preview()` and `place()`; making it async would ripple
   needlessly, and the audit explicitly recommends resolving values in the already-async
   `CheckoutService`.

2. **Resolve settings in `CheckoutService`** (already `async`, already injects
   `SettingsService`, already reads `shipping.serviceablePincodes`). Copy that exact
   pattern: read each key with `settings.get<T>()`, validate the shape, and fall back
   to the current default when the key is absent or malformed. A missing/invalid
   setting ⇒ omit the value (pass `undefined`) so `compute()` uses its own constant —
   single source of truth for defaults stays in `PricingService`.

3. **Setting value validation.** `SettingsService.get<T>()` returns raw JSON. Paise
   keys are coerced only when `typeof === 'number' && Number.isInteger(v) && v >= 0`;
   otherwise fall back. `store.state` used only when it is a non-empty string.
   `payment.codEnabled` treated as **enabled unless explicitly `false`** (default ON,
   backward compatible). Brand validated paise ints through `paise()` before passing
   to `compute()`.

4. **COD enforcement (#6)** happens in `CheckoutService`, not `PricingService`:
   `place()` throws `BadRequestException` when `paymentMethod === 'cod'` and resolved
   `codEnabled === false`. `preview()` surfaces availability via a new additive
   `codEnabled: boolean` field on `CheckoutPreviewResult` (non-breaking).

5. **InvoiceService (#5)** injects `SettingsService` (already a provider, exported by
   `AdminModule`; `OrdersModule`/`OrdersWorkerModule` must import `AdminModule`).
   `generate()`/`renderHtml` read `store.gstin` and `store.name`, falling back to
   `process.env.STORE_GSTIN || 'GSTIN-UNSET'` and `'Belzo eMart'`. Output format is
   byte-for-byte identical — only the source of the two string values changes.

6. **ShipRocket pickup PIN (#7)** — inject `SettingsService` directly into
   `ShipRocketProvider` and read `shipping.pickupPincode` inside `checkServiceability`,
   default `'560001'`. Chosen over threading a new arg through the `ShippingProvider`
   interface because the pickup origin is a ShipRocket-specific concern and the mock
   provider ignores it; changing the interface would ripple to `MockShippingProvider`
   and both controllers for no benefit. `ShippingModule` must import `AdminModule`.
   The `weightGrams / 1000` kg conversion stays as code (ShipRocket unit contract).

7. **Default item weight (#10)** — in `FulfilmentService.createShipment`, prefer each
   line's real `Variant.weightGrams × quantity` when `> 0`, else fall back to
   `shipping.defaultItemWeightGrams × quantity` (default 500). `OrderItem` has no
   relation to `Variant` and no `weightGrams`, so fetch variants by the order's
   `variantId`s (`prisma.variant.findMany`) and build a `variantId → weightGrams` map.
   `FulfilmentService` injects `SettingsService` to resolve the default.

8. **Admin schema** — `admin.controller.ts` `settingSchema` is
   `z.object({ key: z.string().trim().min(1).max(80), value: z.unknown() })`; it
   already accepts arbitrary keys well within 80 chars. **No schema change needed** —
   only confirm. The two new keys are added as UI inputs.

9. **Seed** — add `shipping.pickupPincode: '560001'` and
   `shipping.defaultItemWeightGrams: 500` to `seedSettings()` for parity with the
   existing defaults block (idempotent upsert; absence still falls back in code).

### Settings keys read, types, and defaults

| Key | Type | Default (fallback) | Consumed in |
|---|---|---|---|
| `shipping.freeThresholdPaise` | int paise | `50000` (₹500) | pricing via checkout |
| `shipping.flatPaise` | int paise | `4900` (₹49) | pricing via checkout |
| `payment.codFeePaise` | int paise | `3900` (₹39) | pricing via checkout |
| `store.state` | string | `process.env.STORE_STATE ?? 'Karnataka'` | pricing (GST split) via checkout |
| `payment.codEnabled` | bool | `true` (enabled unless explicit `false`) | checkout COD gate + preview |
| `store.gstin` | string | `process.env.STORE_GSTIN \|\| 'GSTIN-UNSET'` | invoice |
| `store.name` | string | `'Belzo eMart'` | invoice |
| `shipping.pickupPincode` | string (6-digit) | `'560001'` | shiprocket provider |
| `shipping.defaultItemWeightGrams` | int grams | `500` | fulfilment |

### New `compute()` signature

```ts
compute(input: {
  lines: PriceLine[];
  buyerState: string;
  isCod: boolean;
  coupon?: CouponSpec;
  // NEW optional overrides — omit to use the class-constant defaults:
  freeShippingThresholdPaise?: Money;
  flatShippingPaise?: Money;
  codFeePaise?: Money;
  sellerState?: string;
}): PriceBreakup
```

Internally resolve `const freeThreshold = input.freeShippingThresholdPaise ?? this.freeShippingThreshold;`
(same for flat, codFee, sellerState) and use those locals for the shipping cutoff,
COD fee, and the `sameState` comparison. Preserve GST logic exactly: CGST+SGST when
buyer state == seller state, else IGST. Keep `shippingFor`/`codFeeFor` public helpers
intact (default-based) for backward compatibility.

---

## Implementation steps (ordered by dependency)

- [ ] 1. Extend `PricingService.compute()` with the four optional override inputs, each
      defaulting to the existing private constant. Resolve locals at the top of
      `compute()` and use them for shipping threshold, COD fee, and the `sellerState`
      comparison. Leave `shippingFor`/`codFeeFor` and all constants in place. No behavior
      change when overrides are omitted.
      Files: `apps/api/src/modules/checkout/pricing.service.ts`
      Verify: `pnpm --filter @belzo/api test` — existing `checkout.service.spec.ts`
      still passes (its `PricingService` stub is unaffected); `pnpm --filter @belzo/api typecheck`.

- [ ] 2. In `CheckoutService`, add a private async `resolvePricingConfig()` that reads
      `shipping.freeThresholdPaise`, `shipping.flatPaise`, `payment.codFeePaise`,
      `store.state`, and `payment.codEnabled` via `this.settings.get<T>()`, validating
      each (int-paise ≥ 0 for the three paise keys branded via `paise()`; non-empty
      string for `store.state`; `codEnabled` = not explicitly `false`). Return
      `{ overrides, codEnabled }` where `overrides` only includes present/valid values.
      Follow the existing `serviceablePincodes()` helper style.
      Files: `apps/api/src/modules/checkout/checkout.service.ts`
      Verify: `pnpm --filter @belzo/api typecheck`.

- [ ] 3. Wire the resolved overrides into both `preview()` and `place()`: pass
      `...overrides` into `this.pricing.compute(...)` in each. In `preview()`, resolve
      config once and add `codEnabled` to the returned `CheckoutPreviewResult` (extend
      the interface with `codEnabled: boolean`). In `place()`, after resolving, if
      `input.paymentMethod === 'cod'` and `codEnabled === false`, throw
      `new BadRequestException('Cash on Delivery is currently unavailable.')` before
      building the order. Default remains COD-enabled when the key is unset.
      Files: `apps/api/src/modules/checkout/checkout.service.ts`
      Verify: `pnpm --filter @belzo/api test` (checkout spec green — its settings stub
      returns `undefined` ⇒ COD enabled, defaults used); `pnpm --filter @belzo/api typecheck`.

- [ ] 4. Add unit tests for the new pricing/COD behavior in a new spec next to the
      checkout spec: (a) resolved settings override the defaults in `compute()` output
      (e.g. a different flat shipping / free threshold / COD fee changes the breakup);
      (b) `store.state == buyerState` yields CGST+SGST, mismatch yields IGST; (c)
      `place()` with `paymentMethod: 'cod'` and `payment.codEnabled === false` throws
      `BadRequestException`; (d) unset keys reproduce today's defaults. Build the
      `SettingsService` stub inline like the existing spec (`get: async (key) => map[key]`).
      Files: `apps/api/src/modules/checkout/pricing-settings.service.spec.ts` (new)
      Verify: `pnpm --filter @belzo/api test` — new tests pass.

- [ ] 5. Inject `SettingsService` into `InvoiceService` (constructor param, keep the
      existing `@Inject(STORAGE_PROVIDER)`). In `generate()`, read `store.gstin` and
      `store.name` from settings before rendering and pass them into `renderHtml`
      (add two params). Fall back to `process.env.STORE_GSTIN || 'GSTIN-UNSET'` and
      `'Belzo eMart'`. Keep the exact HTML structure — only the two interpolated values
      change source.
      Files: `apps/api/src/modules/orders/invoice.service.ts`
      Verify: `pnpm --filter @belzo/api typecheck`.

- [ ] 6. Ensure `OrdersModule` and `OrdersWorkerModule` import `AdminModule` so
      `InvoiceService` and `FulfilmentService` can inject the exported `SettingsService`.
      Add the import to both modules' `imports` arrays.
      Files: `apps/api/src/modules/orders/orders.module.ts`,
      `apps/api/src/modules/orders/orders-worker.module.ts`
      Verify: `pnpm --filter @belzo/api build` — Nest DI resolves (no "can't resolve
      dependencies of InvoiceService/FulfilmentService (SettingsService)" error).

- [ ] 7. Add an `InvoiceService` unit spec covering GSTIN/store-name sourcing: with
      settings present the invoice HTML contains the configured GSTIN and store name;
      with settings absent it falls back to env/default. Stub `prisma` (invoice
      findUnique → null, order findUnique → fixture with items, invoiceCounter.upsert,
      `$transaction`), the `STORAGE_PROVIDER` (`put` captures the HTML body), and
      `SettingsService`.
      Files: `apps/api/src/modules/orders/invoice.service.spec.ts` (new)
      Verify: `pnpm --filter @belzo/api test` — new tests pass.

- [ ] 8. Inject `SettingsService` into `ShipRocketProvider` (add constructor param
      alongside `ResilientHttpService`). In `checkServiceability`, read
      `shipping.pickupPincode` (default `'560001'`) and interpolate it in place of the
      hardcoded `560001` in the serviceability URL. Leave `weightGrams / 1000` as-is.
      Add `AdminModule` to `ShippingModule.imports` so the provider can inject it.
      Files: `apps/api/src/integrations/shipping/shiprocket.provider.ts`,
      `apps/api/src/integrations/shipping/shipping.module.ts`
      Verify: `pnpm --filter @belzo/api build` — DI resolves; `pnpm --filter @belzo/api typecheck`.

- [ ] 9. In `FulfilmentService`, inject `SettingsService`; in `createShipment` replace
      `const weight = order.items.reduce((s) => s + 500, 0)` with a weight computed from
      real variant weights: fetch `prisma.variant.findMany({ where: { id: { in
      variantIds } }, select: { id, weightGrams } })`, build a map, read
      `shipping.defaultItemWeightGrams` (default 500) once, then
      `weight = order.items.reduce((s, i) => s + (map[i.variantId] > 0 ? map[i.variantId]
      : defaultWeight) * i.quantity, 0)`. Keep the `address?.pincode ?? '000000'` guard.
      Files: `apps/api/src/modules/orders/fulfilment.service.ts`
      Verify: `pnpm --filter @belzo/api typecheck`; `pnpm --filter @belzo/api build`.

- [ ] 10. Add a `FulfilmentService` unit spec for weight resolution: (a) variant with
      `weightGrams > 0` uses `weightGrams × quantity`; (b) variant with `weightGrams === 0`
      falls back to the resolved `shipping.defaultItemWeightGrams × quantity`; (c) unset
      setting falls back to 500. Stub `prisma` (order.findUnique with items,
      shipment.findFirst → null, variant.findMany returning fixtures, shipment.create,
      order.update), the `SHIPPING_PROVIDER` (`createAwb` captures `weightGrams`), and
      `SettingsService`.
      Files: `apps/api/src/modules/orders/fulfilment.service.spec.ts` (new)
      Verify: `pnpm --filter @belzo/api test` — new tests pass.

- [ ] 11. Add the two new inputs to the admin settings page `EDITABLE` array:
      `{ key: 'shipping.pickupPincode', label: 'Pickup PIN code', type: 'text' }` and
      `{ key: 'shipping.defaultItemWeightGrams', label: 'Default item weight (grams)',
      type: 'number' }`. The existing render/save logic (text ⇒ string, number ⇒
      `Number(...)`, save-on-blur, PUT `{ key, value }`) already handles both correctly,
      so no other change. Confirm `admin.controller.ts` `settingSchema` accepts the keys
      (it does — ≤ 80 chars, `value: z.unknown()`); do not change it.
      Files: `apps/web/src/app/admin/settings/page.tsx`
      Verify: `pnpm --filter @belzo/web build` (and `typecheck` if available).

- [ ] 12. Add `shipping.pickupPincode: '560001'` and
      `shipping.defaultItemWeightGrams: 500` to the `settings` object in
      `seedSettings()` so a fresh seed persists the new defaults (idempotent upsert).
      Files: `apps/api/prisma/seed.ts`
      Verify: `pnpm --filter @belzo/api typecheck`.

- [ ] 13. Full verification sweep (see command list below). Fix any failures before
      marking the task done.

## Specs that need adding/updating

- `apps/api/src/modules/checkout/checkout.service.spec.ts` — **must still pass unchanged**
  (its `SettingsService` stub returns `undefined` for every key ⇒ defaults + COD enabled).
  Update only if the added `codEnabled` field or COD gate interacts; the current `upi`
  test paths are unaffected.
- NEW `apps/api/src/modules/checkout/pricing-settings.service.spec.ts` (step 4).
- NEW `apps/api/src/modules/orders/invoice.service.spec.ts` (step 7).
- NEW `apps/api/src/modules/orders/fulfilment.service.spec.ts` (step 10).
- `packages/shared/src/pricing.test.ts` — untouched (`computeTotals` not modified).

## Full verification command list (run from repo root `c:\xampp\htdocs\Belzo`)

1. `pnpm --filter @belzo/api typecheck`
2. `pnpm --filter @belzo/api test` (jest; all existing + new specs green)
3. `pnpm --filter @belzo/api build` (nest build — confirms DI graph resolves after
   `AdminModule` imports)
4. `pnpm --filter @belzo/api lint`
5. `pnpm --filter @belzo/web build` (confirms the settings page compiles)
6. Full monorepo gate (optional but recommended): `pnpm -r typecheck && pnpm -r test && pnpm -r build`

## Backward-compatibility guarantees (must hold)

- Every new read falls back to today's hardcoded default when the key is absent or
  malformed ⇒ a fresh DB behaves exactly as before.
- Money stays integer paise end to end; GST and rounding logic in `computeTotals` is
  untouched.
- COD defaults to ENABLED when `payment.codEnabled` is unset.
- Invoice HTML output format is unchanged — only the GSTIN/store-name source changes.
- `PricingService.compute()` stays synchronous; existing callers that omit the new
  inputs are unaffected.
