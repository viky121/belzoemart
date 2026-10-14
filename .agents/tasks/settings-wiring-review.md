# Wire admin settings into pricing, COD gate, and invoices (Phase 1)

This change closes the "edits do nothing" gap documented in the config audit: the admin settings UI already wrote `shipping.freeThresholdPaise`, `shipping.flatPaise`, `payment.codFeePaise`, `store.state`, `payment.codEnabled`, `store.gstin`, and `store.name`, but the API never read them. Phase 1 wires the read side for pricing, the COD on/off gate, and invoice store-identity, keeping `PricingService.compute()` synchronous and pure by resolving settings in the already-async `CheckoutService` and threading them in as optional overrides. Every new read falls back to today's hardcoded default when the key is absent or malformed, so a fresh DB behaves exactly as before.

Watch for: nothing blocking. One intentional design point (confirmed): COD is treated as enabled unless the stored value is the boolean `false`, so a malformed non-boolean COD setting fails open to enabled — this matches the plan and current behavior.

**Verdict**: APPROVED

## High-level view

The pricing engine gains four optional inputs (`freeShippingThresholdPaise`, `flatShippingPaise`, `codFeePaise`, `sellerState`), each defaulting to the existing class constant. Callers that pass none behave exactly as before, which is what keeps the function synchronous, pure, and backward compatible with every existing test. The shared `computeTotals` — where the GST split and rounding live — is untouched, so money stays integer paise and the CGST+SGST-vs-IGST decision is unchanged.

`CheckoutService.resolvePricingConfig()` reads the five admin keys in parallel and validates each: paise keys are accepted only when they are non-negative integers (branded through `paise()`), `store.state` only when it is a non-empty string, and anything absent or malformed is simply omitted so `compute()` uses its own constant. Defaults therefore have a single source of truth in `PricingService`. The resolved overrides flow into both `preview()` and `place()`.

The COD gate lives in checkout, not pricing: `place()` rejects a COD order with `BadRequestException` only when the resolved `codEnabled` is explicitly `false`, and `preview()` surfaces availability through a new additive `codEnabled` field. COD defaults to enabled when the key is unset.

`InvoiceService` now injects `SettingsService` and sources the GSTIN and store name from `store.gstin` / `store.name`, falling back to `process.env.STORE_GSTIN || 'GSTIN-UNSET'` and `'Belzo eMart'`. The HTML template is otherwise unchanged — only the two interpolated values change source. Both `OrdersModule` and `OrdersWorkerModule` import `AdminModule` so the DI graph resolves, and `AdminModule` exports `SettingsService`.

Phase 2 items (ShipRocket pickup PIN, default item weight, the two new admin UI inputs, seed additions) are intentionally not in this diff and are not evaluated here. The admin settings page was not touched.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking action items. The COD fail-open-to-enabled behavior is intentional per the plan and is called out above as context, not a finding.

</details>

<details>
<summary>Details</summary>

## Four optional overrides keep compute() pure and backward compatible

`compute()` resolves `const freeThreshold = input.freeShippingThresholdPaise ?? this.freeShippingThreshold;` (and the same for flat, codFee, sellerState) at the top, then uses those locals for the free-shipping cutoff, the COD fee, and the `sameState` comparison fed to `computeTotals`. The private constants (`paise(50000)`, `paise(4900)`, `paise(3900)`, `process.env.STORE_STATE ?? 'Karnataka'`) remain in place as the fallbacks, and the public `shippingFor`/`codFeeFor` helpers are untouched. Because the four params are optional and default to the constants, the existing `checkout.service.spec.ts` — whose `PricingService` is a stub and whose `SettingsService` stub returns `undefined` for every key — is unaffected. The GST split is delegated unchanged to `computeTotals`; this diff only changes which seller state is compared, not how the tax is computed or rounded.

## Settings resolution validates shape and falls back on malformed input

`resolvePricingConfig()` reads the five keys with `Promise.all` and builds an `overrides` object that includes a field only when its value is valid. `toPaise()` accepts a value only when `typeof === 'number' && Number.isInteger(value) && value >= 0`, returning `undefined` otherwise, so a string, float, negative, or missing paise value cleanly degrades to the pricing constant. `store.state` is included only when it is a non-empty string (trimming is handled at comparison time inside `compute()`, so an untrimmed stored value is harmless). This mirrors the established `serviceablePincodes()` pattern, and the empty-list-means-everywhere serviceability behavior is preserved.

## COD gate rejects only on explicit false; preview exposes it additively

`codEnabled` is computed as `codEnabledRaw !== false`, so an unset key yields `true` (enabled, backward compatible) and only the boolean `false` disables COD. In `place()`, the gate runs after config resolution and before the order transaction: `if (isCod && !codEnabled) throw new BadRequestException('Cash on Delivery is currently unavailable.')`. The accompanying spec confirms that a disabled COD order rejects before any stock reservation (`reserveCalls` is empty), that an unset key allows the order and reserves `v1`, and that `preview()` reports `codEnabled: false` when disabled. A malformed non-boolean value leaves COD enabled — intentional fail-open matching the plan and today's unconditional-COD behavior.

## Invoice sources store identity from settings, format unchanged

`InvoiceService` keeps its `@Inject(STORAGE_PROVIDER)` and adds `SettingsService`. `generate()` resolves `storeName` and `gstin` before rendering: `resolveString('store.name') ?? 'Belzo eMart'` and `resolveString('store.gstin') ?? (process.env.STORE_GSTIN || 'GSTIN-UNSET')`. `resolveString` returns `undefined` for absent or non-string/empty values, so the fallbacks reproduce the previous hardcoded values exactly. `renderHtml` now takes the two values as parameters and interpolates them in the same `<p><strong>${storeName}</strong> — GSTIN: ${gstin}</p>` position; the rest of the template (rupee formatting, item rows, the discount minus sign, tax lines, grand total) is unchanged, so output is byte-for-byte identical when settings are absent. The spec asserts configured values appear (and the default name does not), env fallback, and the `GSTIN-UNSET` final fallback.

## DI graph resolves

`AdminModule` exports `SettingsService`, and both `OrdersModule` and `OrdersWorkerModule` now list `AdminModule` in `imports`, which is where `InvoiceService` is provided. `AdminModule` declares no `imports` of its own, so adding it to the orders modules introduces no circular dependency. The coder's recorded `nest build` pass confirms the graph resolves end to end. `CheckoutService` already injected `SettingsService` (for serviceability) via its pre-existing module wiring, so no new import was needed there.

## Verification evidence

The commit message records a full sweep run from the repo root: `@belzo/api` typecheck pass, lint pass, test 15 suites / 58 tests pass, build pass (Nest DI resolves), `@belzo/shared` test 7 suites / 42 tests pass, and `@belzo/web` typecheck pass. Per the review constraints these suites were not re-run. The new specs (`pricing-settings.service.spec.ts`, `invoice.service.spec.ts`) meaningfully assert override flow-through, the GST intra/inter-state split, COD rejection on explicit-false, defaults-on-unset, and invoice sourcing — matching plan steps 4 and 7.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/checkout/pricing.service.ts` — four optional override inputs on `compute()`, resolved to class-constant defaults; constants and public helpers retained.
- `apps/api/src/modules/checkout/checkout.service.ts` — `resolvePricingConfig()` reads/validates the five keys; overrides flow into `preview()`/`place()`; COD gate in `place()`; additive `codEnabled` on `CheckoutPreviewResult`.
- `apps/api/src/modules/checkout/pricing-settings.service.spec.ts` — new spec: override flow-through, GST split, COD rejection, defaults-on-unset.
- `apps/api/src/modules/orders/invoice.service.ts` — injects `SettingsService`; sources `store.gstin`/`store.name` with env/default fallback; HTML format unchanged.
- `apps/api/src/modules/orders/invoice.service.spec.ts` — new spec: settings vs env/default invoice sourcing.
- `apps/api/src/modules/orders/orders.module.ts` — imports `AdminModule`.
- `apps/api/src/modules/orders/orders-worker.module.ts` — imports `AdminModule`.

Full diff: `git show 6ced90c`.

</details>
