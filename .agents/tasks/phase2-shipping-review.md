# Phase 2: ShipRocket pickup PIN and fulfilment item weight wired to admin settings

Phase 2 of the settings-wiring effort closes audit items #7 and #10 by turning two more hardcoded merchant values into admin-configurable settings. `shipping.pickupPincode` (default `'560001'`) now drives the ShipRocket serviceability origin, and `shipping.defaultItemWeightGrams` (default `500`) backs a new weight calculation that prefers each variant's real `weightGrams × quantity` and falls back to the setting only when a variant has no weight recorded. Both reads are defensive: absent or malformed values reproduce today's hardcoded behavior on a fresh DB. DI is wired by having `ShippingModule`, `OrdersModule`, and `OrdersWorkerModule` import `AdminModule`, which already exports `SettingsService`. The commit touches exactly seven in-scope files and carries detailed, consistent verification evidence.

Watch for: nothing blocking. The mock provider ignores shipment weight entirely (confirmed), so `defaultItemWeightGrams` only affects live ShipRocket rating — this is by design, not a gap.

**Verdict**: APPROVED

## High-level view

The ShipRocket pickup PIN read is implemented as a private `resolvePickupPincode()` that validates the stored value against a 6-digit Indian PIN pattern (`/^[1-9]\d{5}$/`) and otherwise returns the `'560001'` default. The hardcoded `pickup_postcode=560001` in the serviceability URL is replaced by the resolved value; the `weightGrams / 1000` grams-to-kg conversion is preserved as code, honoring the ShipRocket unit contract. The provider now takes `SettingsService` as a second constructor argument, and `ShippingModule` imports `AdminModule` so the injection resolves.

The fulfilment weight change replaces the flat `+ 500` per item with a per-line computation: it fetches the order's variants via `variant.findMany`, builds a `variantId → weightGrams` map, and for each line uses the variant's weight when `> 0`, else the resolved default. The default itself comes from `resolveDefaultItemWeightGrams()`, which accepts the setting only when it is a positive integer and otherwise returns 500. The existing `address?.pincode ?? '000000'` guard is untouched.

Backward compatibility holds on every new read. A fresh DB with no settings, a DB seeded with the new defaults, and a DB with malformed values all produce the previous behavior (origin 560001, 500g per item). The seed adds both keys with an idempotent upsert whose `update: {}` clause preserves any operator-set value on re-seed. The admin settings page gains two inputs in the existing `EDITABLE` array, reusing the text/number save-on-blur plumbing, and the admin controller `settingSchema` is unchanged — both keys fit within its 80-char limit and `value: z.unknown()`.

Test coverage is proportionate: three provider specs (configured / unset / malformed pickup PIN) and four fulfilment specs (variant weight used, zero-weight fallback to configured default, unset default falls back to 500, mixed lines). Deferred items are respected — the mock provider, the ShipRocket `?? 5` / `?? 49` fallbacks (#9), and the `'000000'` guard (#15) are all left as code.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking action items. All observations below are confirmations that the design constraints were met.

</details>

<details>
<summary>Details</summary>

## Pickup PIN resolution and the preserved kg conversion

`ShipRocketProvider` gains a second constructor parameter `private readonly settings: SettingsService` alongside the existing `ResilientHttpService`, and a `resolvePickupPincode()` helper (confirmed):

```ts
private async resolvePickupPincode(): Promise<string> {
  const raw = await this.settings.get<unknown>(PICKUP_PINCODE_KEY);
  if (typeof raw === 'string' && /^[1-9]\d{5}$/.test(raw.trim())) return raw.trim();
  return DEFAULT_PICKUP_PINCODE; // '560001'
}
```

`checkServiceability` awaits this before building the URL and interpolates `pickup_postcode=${pickupPincode}`. The `weight=${weightGrams / 1000}` divisor stays as literal code, as the plan requires — it is the ShipRocket grams-to-kg unit contract, not a business knob. The malformed-value path is strict: a non-string, or a string failing the PIN regex (leading zero, wrong length, non-numeric), falls back to `'560001'`, so no bad origin can reach the courier. This fail-closed-to-default behavior is the correct backward-compatibility posture (confirmed by the three provider specs).

## Fulfilment weight: variant-first, setting-fallback

The former `order.items.reduce((s) => s + 500, 0)` is replaced with a two-source computation (confirmed):

```ts
const defaultWeight = await this.resolveDefaultItemWeightGrams();
const variantIds = [...new Set(order.items.map((i) => i.variantId))];
const variants = await this.prisma.variant.findMany({
  where: { id: { in: variantIds } },
  select: { id: true, weightGrams: true },
});
const weightByVariant = new Map(variants.map((v) => [v.id, v.weightGrams]));
const weight = order.items.reduce((s, i) => {
  const variantWeight = weightByVariant.get(i.variantId) ?? 0;
  const perItem = variantWeight > 0 ? variantWeight : defaultWeight;
  return s + perItem * i.quantity;
}, 0);
```

The `variant.findMany` select is valid: `schema.prisma` declares `weightGrams Int @default(0)` on `Variant`, so the field always exists and the common case (unset weight) is `0`, which routes to the fallback. The `.get(i.variantId) ?? 0` also covers a variant row that cannot be found, routing it to the default rather than throwing. `resolveDefaultItemWeightGrams()` accepts the setting only when `typeof raw === 'number' && Number.isInteger(raw) && raw > 0`, so `0`, negatives, non-integers, and non-numbers all fall back to 500 — the `weightGrams === 0` edge case the task calls out is handled both at the variant level and the setting level. The `address?.pincode ?? '000000'` guard is unchanged.

## DI wiring across three modules

Both new injections resolve through `AdminModule`, which exports `SettingsService` (confirmed in `admin.module.ts`: `exports: [AuditLogService, SettingsService]`). `ShippingModule` adds `AdminModule` to its imports for `ShipRocketProvider`; `OrdersModule` and `OrdersWorkerModule` both import `AdminModule` so `FulfilmentService` can inject `SettingsService` in the API and worker processes alike. The commit message records `pnpm --filter @belzo/api build: PASS (Nest DI resolves)`, which is the relevant evidence that the graph is complete; no missing-dependency doubt remains.

## Admin surface and seed parity

The settings page `EDITABLE` array gains exactly two entries — `shipping.pickupPincode` (text) and `shipping.defaultItemWeightGrams` (number) — with no duplication (the earlier grep double-listing was a display artifact; the source array is clean). The existing render/save logic coerces number inputs via `Number(...)` and persists `{ key, value }`, so no further UI change is needed. The admin controller `settingSchema` (`z.object({ key: z.string().trim().min(1).max(80), value: z.unknown() })`) is untouched and accepts both keys. The seed adds both defaults inside the existing `settings` object, persisted through the idempotent `upsert({ where, update: {}, create })` loop — re-seeding never clobbers an operator-set value.

## Deferred items and the mock provider left as code

The mock provider is byte-for-byte unchanged: it ignores `weightGrams` and returns its deterministic `estimatedDays: 4, shippingCharge: 4900` (deferred #8). The ShipRocket `?? 5` / `?? 49` response fallbacks (#9) remain literals, and the `'000000'` fallback pincode (#15) is preserved. Phase 1 pricing/COD/invoice code is not in this commit's file set. The change is cleanly scoped to the seven files named in the plan.

## Verification evidence

The commit message records the full command sweep: `typecheck`, `lint`, `test (17 suites, 65 tests incl. 7 new)`, `build (Nest DI resolves)` for `@belzo/api`; `@belzo/shared test` PASS; and `@belzo/web typecheck` + `build` PASS. The "7 new" count matches exactly the 3 ShipRocket specs plus 4 fulfilment specs added here. Per the review mandate, suites were not re-run; the evidence is present, specific, and internally consistent, so no spot-check was warranted.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/integrations/shipping/shiprocket.provider.ts` — inject `SettingsService`, add `resolvePickupPincode()`, read `shipping.pickupPincode` in `checkServiceability`; `/1000` conversion kept.
- `apps/api/src/integrations/shipping/shiprocket.provider.spec.ts` — new; pickup PIN configured / unset / malformed.
- `apps/api/src/integrations/shipping/shipping.module.ts` — import `AdminModule`.
- `apps/api/src/modules/orders/fulfilment.service.ts` — inject `SettingsService`, variant-weight-first computation with configurable default fallback.
- `apps/api/src/modules/orders/fulfilment.service.spec.ts` — new; variant weight, zero-weight fallback, unset-default fallback, mixed lines.
- `apps/api/prisma/seed.ts` — seed `shipping.pickupPincode: '560001'` and `shipping.defaultItemWeightGrams: 500`.
- `apps/web/src/app/admin/settings/page.tsx` — two new Shipping inputs in `EDITABLE`.

Full diff: `git diff 9c8324d ddd0ed5` (the Phase 2 commit).

</details>
