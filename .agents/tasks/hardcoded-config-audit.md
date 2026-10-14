# Hardcoded Configuration Audit — Belzo eMart

**Scope:** `apps/api` (and `apps/web` where a business value is baked into the client) in the monorepo at `c:\xampp\htdocs\Belzo`.
**Mode:** READ-ONLY audit. No code was changed.
**Goal:** Find hardcoded *business/policy* values that an operator would realistically want to change, and map each to the existing admin `SettingsService` convention.

---

## 1. Summary answer first

The single most important finding is a **wire-up gap, not a missing feature**:

> The admin UI at `apps/web/src/app/admin/settings/page.tsx` **already exposes** editable settings for store name, GSTIN, seller state, free-shipping threshold, flat shipping, COD enabled, and COD fee. The admin controller persists them via `SettingsService` (audit-logged). **But the API never reads any of these keys.** `PricingService` and `InvoiceService` use hardcoded constants / `process.env` instead. So an operator can edit these values in the dashboard, see "Saved", and nothing changes in checkout or invoices.

Confirmed by grep: the keys `shipping.freeThresholdPaise`, `shipping.flatPaise`, `payment.codFeePaise`, `payment.codEnabled`, `store.state`, `store.gstin`, `store.name` are written by the web UI but have **zero** read references anywhere in `apps/api/src`.

Everything else below is secondary: genuinely hardcoded values (pickup PIN, mock estimates, OTP TTL, per-item shipping weight, lockout thresholds) that are policy/config but have no setting yet.

### Ranked table of recommended-configurable values

| # | Value (file:line) | Current hardcode | Controls | Admin key exists? | Recommendation |
|---|---|---|---|---|---|
| 1 | `pricing.service.ts:19` `freeShippingThreshold` | `paise(50000)` (₹500) | Free-shipping cutoff | **UI yes** (`shipping.freeThresholdPaise`), **not read** | Make-configurable — wire read |
| 2 | `pricing.service.ts:20` `flatShipping` | `paise(4900)` (₹49) | Flat shipping fee | **UI yes** (`shipping.flatPaise`), **not read** | Make-configurable — wire read |
| 3 | `pricing.service.ts:21` `codFee` | `paise(3900)` (₹39) | COD surcharge | **UI yes** (`payment.codFeePaise`), **not read** | Make-configurable — wire read |
| 4 | `pricing.service.ts:23` `sellerState` | `env.STORE_STATE ?? 'Karnataka'` | GST intra/inter-state split | **UI yes** (`store.state`), **not read** | Make-configurable — wire read |
| 5 | `invoice.service.ts:74` `gstin` | `env.STORE_GSTIN \|\| 'GSTIN-UNSET'` | GSTIN printed on invoices | **UI yes** (`store.gstin`), **not read** | Make-configurable — wire read |
| 6 | n/a (no COD on/off gate) | — | Whether COD is offered | **UI yes** (`payment.codEnabled`), **not read / not enforced** | Make-configurable — enforce in checkout |
| 7 | `shiprocket.provider.ts:46` | `pickup_postcode=560001` | Courier pickup origin | No | Make-configurable (`shipping.pickupPincode`) |
| 8 | `mock-shipping.provider.ts:22` | `shippingCharge 4900`, `estimatedDays 4`, `serviceable true` | Dev shipping estimate | No | Leave as code (mock/dev only) |
| 9 | `shiprocket.provider.ts:53-54` | fallback `estimatedDays 5`, `rate 49` | Fallback when courier omits data | No | Low priority — optional config |
| 10 | `fulfilment.service.ts:38` | `+ 500` g per item | Shipment weight → courier rate | No | Make-configurable (`shipping.defaultItemWeightGrams`) |
| 11 | `otp.service.ts:30` `ttlMs` | `5 * 60 * 1000` (5 min) | OTP validity window | No | Make-configurable (`security.otpTtlSeconds`) — low |
| 12 | `otp.service.ts:61,69` | "Valid for 5 minutes" copy | OTP message body/template | No (FR-13.5 wants templates) | Make-configurable (notification templates) |
| 13 | `lockout.service.ts:12-13` | `maxFailures 5`, `windowMs 15 min` | Brute-force lockout policy | No | Optional config — security policy |
| 14 | `schema.prisma` `OtpRequest.maxAttempts` | `@default(5)` | OTP wrong-guess limit | No (DB default) | Optional config — low |
| 15 | `fulfilment.service.ts:40` | fallback pincode `'000000'` | Fallback when address missing | No | Leave as code (defensive guard) |

---

## 2. Per-item detail with evidence

### CRITICAL — settings exposed in UI but ignored by the API

The admin settings page defines these editable keys and `PUT /admin/settings` stores them through `SettingsService.set()` (audit-logged):

```
apps/web/src/app/admin/settings/page.tsx:10-18
  store.name, store.gstin, store.state,
  shipping.freeThresholdPaise, shipping.flatPaise,
  payment.codEnabled, payment.codFeePaise
```

But the pricing engine hardcodes the equivalents and does **not** inject `SettingsService` at all:

```
apps/api/src/modules/checkout/pricing.service.ts:19-23
  private readonly freeShippingThreshold = paise(50000); // ₹500
  private readonly flatShipping          = paise(4900);  // ₹49
  private readonly codFee                = paise(3900);  // ₹39
  private readonly sellerState           = process.env.STORE_STATE ?? 'Karnataka';
```

The code comment even admits the intent: *"Seller state is configured (SETTINGS in U7); a sensible default is used here."* The wiring was never completed.

Grep confirmation (read side): searching `apps/api/src` for `freeThresholdPaise|flatPaise|codFeePaise|codEnabled|store.state|store.gstin|store.name` → **no matches**.

**#1-#4 Shipping threshold / flat shipping / COD fee / seller state.**
- What they control: every checkout preview and placed-order total (`CheckoutService.preview`/`place` call `PricingService.compute`, which uses `shippingFor`, `codFeeFor`, and `sellerState` for the CGST+SGST vs IGST decision).
- Admin key exists: **yes, in the UI**, with sensible names (`shipping.freeThresholdPaise`, `shipping.flatPaise`, `payment.codFeePaise`, `store.state`). The admin surface is already built.
- Recommendation: **make-configurable (wire the read).** `PricingService` should inject `SettingsService`, read these keys (async), and fall back to the current constants as defaults. Because `compute()` is currently synchronous, the clean fix is to resolve the four values in `CheckoutService` (already async, already injects `SettingsService`) and pass them into `compute()`. Reason: the operator-facing control already exists and is misleading today.

**#5 Store GSTIN on invoices.**
```
apps/api/src/modules/orders/invoice.service.ts:74
  const gstin = process.env.STORE_GSTIN || 'GSTIN-UNSET';
```
- Controls the GSTIN printed on every tax invoice (legal requirement). Store name "Belzo eMart" is also hardcoded in the same template (line ~90).
- Admin key exists in UI: `store.gstin` (and `store.name`), but `InvoiceService` reads `process.env`, not settings.
- Recommendation: **make-configurable.** Read `store.gstin` / `store.name` from `SettingsService` (fall back to env / default). Reason: operators change GSTIN/legal name without a redeploy; invoices are compliance-sensitive.

**#6 COD enabled.**
- The UI exposes `payment.codEnabled`, but no code reads it. `CheckoutService.place` accepts `paymentMethod: 'cod'` unconditionally; `PaymentService` handles `provider === 'cod'` with no gate.
- Recommendation: **make-configurable + enforce.** In checkout, reject COD when `payment.codEnabled` is false. Reason: toggling COD on/off is a standard merchant control that currently does nothing.

### Shipping integration hardcodes

**#7 ShipRocket pickup PIN (and COD/weight query).**
```
apps/api/src/integrations/shipping/shiprocket.provider.ts:46
  `...serviceability/?pickup_postcode=560001&delivery_postcode=${pincode}&weight=${weightGrams / 1000}&cod=${cod ? 1 : 0}`
```
- `pickup_postcode=560001` (Bengaluru) is the warehouse origin, baked into the serviceability URL. The `weightGrams / 1000` divisor is a grams→kg unit conversion (API contract), not policy.
- Admin key exists: no.
- Recommendation: **make-configurable** as `shipping.pickupPincode` (store/warehouse origin). Reason: any merchant not shipping from 560001 gets wrong rates/serviceability. Leave the `/1000` divisor as code (it is the ShipRocket unit contract, not a business choice).

**#8 Mock shipping estimates.**
```
apps/api/src/integrations/shipping/mock-shipping.provider.ts:22
  return { serviceable: true, codAvailable: cod, estimatedDays: 4, shippingCharge: 4900 };
  :30  estimatedDelivery = now + 4 * 86_400_000  // 4 days
  :29  courier: 'Belzo Express (Mock)'
```
- Controls dev/test shipping behaviour only (`SHIPPING_PROVIDER=mock`).
- Recommendation: **leave as code.** Reason: this adapter exists only for local dev/demo; it is explicitly deterministic. Not operator-facing in production.

**#9 ShipRocket fallbacks.**
```
apps/api/src/integrations/shipping/shiprocket.provider.ts:53-54
  estimatedDays: Number(best?.estimated_delivery_days ?? 5),
  shippingCharge: Math.round((best?.rate ?? 49) * 100),
```
- Fallback estimate/rate used only when the courier response omits them.
- Recommendation: **low priority / optional.** Could reuse `shipping.flatPaise` and a `shipping.defaultEstimatedDays` setting, but the real value comes from the live API. Fine to leave as code initially.

**#10 Per-item shipment weight.**
```
apps/api/src/modules/orders/fulfilment.service.ts:38
  const weight = order.items.reduce((s) => s + 500, 0);
```
- Assumes **500 g per line item** regardless of the real variant weight. This weight is passed to `createAwb` and drives courier rating. Note `Variant.weightGrams` exists in the schema (`schema.prisma:357`) but is ignored here.
- Admin key exists: no.
- Recommendation: **make-configurable** as `shipping.defaultItemWeightGrams` (fallback), and ideally prefer the variant's actual `weightGrams × quantity` when set. Reason: flat 500 g mis-rates shipments; a default weight is a legitimate operator knob.

**#15 Fallback pincode `'000000'`.**
```
apps/api/src/modules/orders/fulfilment.service.ts:40
  pincode: address?.pincode ?? '000000',
```
- Defensive fallback when an order's address is missing.
- Recommendation: **leave as code.** It is an internal guard, not merchant policy (a missing address is a data error, not a configurable value).

### Identity / security policy

**#11 OTP TTL.**
```
apps/api/src/modules/identity/otp.service.ts:30
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes
```
- Controls how long an OTP code stays valid.
- Recommendation: **make-configurable (low priority)** as `security.otpTtlSeconds`. Reason: a reasonable security knob, but changes rarely. Note the "5 minutes" wording is duplicated in message copy (see #12), so changing the TTL without the copy would drift.

**#12 OTP message copy / templates.**
```
apps/api/src/modules/identity/otp.service.ts:61  SMS body "...Valid for 5 minutes."
apps/api/src/modules/identity/otp.service.ts:69  email HTML "...valid for 5 minutes."
```
- Hardcoded notification wording. Requirements FR-13.5 explicitly lists **notification templates** as configurable. Similar hardcoded copy lives in `engagement/notification.service.ts` (order/abandoned-cart titles & bodies, with en/hi variants).
- Recommendation: **make-configurable** via a notification-templates settings group (`notifications.templates.*`) — but this is a larger feature (templating + i18n), so stage it after the quick pricing/invoice wiring.

**#13 Login lockout policy.**
```
apps/api/src/modules/identity/lockout.service.ts:12-13
  private readonly maxFailures = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
```
- Brute-force lockout threshold and window for both customer and admin login.
- Recommendation: **optional config** (`security.lockout.maxFailures`, `security.lockout.windowSeconds`). Reason: a security-policy knob some operators tune; defaults are sensible, so low urgency.

**#14 OTP max attempts.**
```
apps/api/prisma/schema.prisma:182  maxAttempts Int @default(5)
```
- Per-request wrong-guess limit; read as `record.maxAttempts` in `otp.service.ts:94`. It is a DB default, so already "soft-configurable" per row but not operator-exposed.
- Recommendation: **optional / low.** Could be driven by the same `security.*` group as #13.

---

## 3. Leave-as-code list (not merchant config)

These are code/infrastructure constants, correctly left hardcoded or env-driven:

- **Token TTLs** — `env.schema.ts:22-23` `JWT_ACCESS_TTL` (900s), `JWT_REFRESH_TTL` (14d). Already env-configurable; these are deploy/security config, not merchant dashboard settings. Fine as-is.
- **Rate limits** — `app.module.ts:36` global `ttl 60s / limit 100`; `auth.controller.ts` per-route `@Throttle` (5–10 / 60s). Security infra; keep in code.
- **Settings cache TTL** — `settings.service.ts:7` `CACHE_TTL = 300`. Internal Redis cache tuning.
- **Queue job options** — `queue.constants.ts:14-18` `attempts 5`, `backoff delay 2000`, `removeOnComplete/Fail`. BullMQ resiliency tuning (RESILIENCY-10), not merchant policy.
- **HTTP timeouts / circuit breaker** — `resilient-http.service.ts` `timeout 8000`, `errorThresholdPercentage 50`, `resetTimeout 15000`, `rollingCountTimeout 30000`. Infra resiliency.
- **Cart quantity clamp** — `cart.service.ts:5` `MAX_QTY = 99`. Borderline, but a UI/sanity guard rather than merchant policy; leave as code unless a merchant specifically asks for per-order quantity caps.
- **Abandoned-cart idle window** — `abandoned-cart.service.ts:15` `idleHours = 6`. Reasonable to leave as code; could become `marketing.abandonedCartIdleHours` later if marketing wants to tune it (low priority).
- **`fulfilment.service.ts:40` `'000000'`** fallback pincode (defensive guard, see #15).
- **Currency** — `env.schema.ts:31` `STORE_CURRENCY: z.literal('INR')`. Intentionally locked to INR by type; not a knob.
- **Mock-provider constants** (#8) — dev-only adapter.
- **Pure code constants** excluded as instructed: `PublicSettingsController.THEMES`, DI tokens, HSN/tax enum options, state-machine maps, HTTP status codes, crypto (`sha256`, `argon2`), slab-tier math.

---

## 4. Proposed grouping into admin settings sections

Using the existing `SettingsService` dotted-key convention (`store.*`, `shipping.*`, `payment.*`). Keys in **bold** already have an admin UI surface; the work is wiring the API read side.

**Store (`store.*`)** — surface: `settings/page.tsx` (exists)
- **`store.name`**, **`store.gstin`**, **`store.state`** → consume in `InvoiceService` and `PricingService` (items #4, #5).

**Shipping (`shipping.*`)** — surface: `settings/page.tsx` + dedicated `serviceability/page.tsx` (exists)
- **`shipping.freeThresholdPaise`**, **`shipping.flatPaise`** → consume in pricing (#1, #2).
- `shipping.serviceablePincodes` → already fully wired (admin + public + checkout gate). Good reference implementation to copy.
- `shipping.pickupPincode` (new) → ShipRocket origin (#7).
- `shipping.defaultItemWeightGrams` (new) → fulfilment weight (#10).

**Payment (`payment.*`)** — surface: `settings/page.tsx` (exists)
- **`payment.codEnabled`** → enforce in checkout (#6).
- **`payment.codFeePaise`** → consume in pricing (#3).

**Security (`security.*`)** — surface: **none yet** (would need a new admin panel)
- `security.otpTtlSeconds` (#11), `security.lockout.maxFailures` + `security.lockout.windowSeconds` (#13), optionally OTP `maxAttempts` (#14). Low priority.

**Notifications (`notifications.*`)** — surface: **none yet** (FR-13.5 asks for templates)
- `notifications.templates.*` for OTP + order + abandoned-cart copy (#12). Larger feature; stage last.

### Suggested sequencing (highest operator value, lowest effort first)
1. **Wire the already-exposed keys** (#1-#6): inject/read in `CheckoutService` + `PricingService` + `InvoiceService`. Closes the "edits do nothing" gap. Pattern to follow: `CheckoutService.serviceablePincodes()` (reads a setting with a safe default).
2. **ShipRocket pickup PIN + default item weight** (#7, #10): add two `shipping.*` keys + inputs on the existing settings page.
3. **Security knobs** (#11, #13): optional, needs a small new settings section.
4. **Notification templates** (#12): larger, FR-13.5 feature.

---

## 5. Verification notes

- Read-side gap confirmed by content search: no file under `apps/api/src` references `freeThresholdPaise`, `flatPaise`, `codFeePaise`, `codEnabled`, `store.state`, `store.gstin`, or `store.name`.
- `PricingService` constructor takes no `SettingsService` dependency (`pricing.service.ts`), confirming it cannot read settings today.
- `CheckoutService` *does* inject `SettingsService` and already reads `shipping.serviceablePincodes` — the established, working pattern to extend.
- `serviceablePincodes` behaviour verified against the user's reported requirement (popup/PIN gate): the public `GET /settings/serviceability` and the checkout `isServiceable` gate are both wired and treat an empty list as "deliver everywhere."

*Content was rephrased for compliance with licensing restrictions where third-party API field names are referenced.*
