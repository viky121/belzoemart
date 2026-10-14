# GST-inclusive checkout pricing (Option A), pass 2

Checkout totals are now GST-inclusive: `computeTotals` charges `(subtotal − discount) + shipping + codFee` and extracts GST per line as `round(net × r / (100 + r))`. Pass 1 approved the engine, API specs and web rendering, and blocked on one issue: the invoice split inclusive GST across lines by `net × rate`. Commit `57adedd` fixes that. Inclusive orders now give each invoice line exactly the GST the engine extracted for it, and legacy exclusive orders keep the old split. Commit `436c6dc` handles the pass-1 non-blocking "You save" note by adding a display-only `shippingWaived` to the preview response. The verification evidence in both commit messages and `plan.md` covers every package: shared 115/115, api 182/182 after the last commit, web 49/49, plus typecheck, lint and build. No migration was added and no stored order is touched (`git diff --name-only 6dede33 HEAD` lists 13 source/spec files only).

Watch for: `shippingWaived` adds a small display-only feature. Its approval appears only in `plan.md`, not in the user's own messages (confirmed). No blocking issues remain.

**Verdict**: APPROVED

## High-level view

The invoice now decides the pricing mode before it shares out tax. It calls an order inclusive only when the shared `isGstInclusiveSnapshot` says so and the line nets reconcile as inclusive. In that mode each line's tax is recomputed with the same formula and the same discount allocation the engine uses. A new `splitLineTaxes` then splits those line taxes into the stored CGST/SGST/IGST heads exactly. The E4 mixed-rate order now prints 4662 / 4474 / 2109 GST on taxable 93236 / 24857 / 42179, which matches each line's rate. Odd snapshots that don't reconcile still get a pro-rata split that sums exactly to the stored values.

`preview()` runs `pricing.compute` a second time without the coupon, only when the coupon is `free_shipping`, and returns the difference in delivery charge as `shippingWaived`. The checkout page adds it to `totalSaved`. `PriceBreakup`, `place()`, the stored snapshot and the payment amount are unchanged.

<details>
<summary>Issues (1)</summary>

1. **`shippingWaived` scope trace** (non-blocking, confirmed). The "You save" change is recorded as a store-owner decision in `plan.md` only, not in the verbatim user messages. Keep it if the owner did approve it. It is additive and display-only, so reverting `436c6dc` is clean if not.

</details>

<details>
<summary>Details</summary>

### Invoice per-line GST now matches the engine extraction

Engine parity depends on the invoice's discount shares matching the engine's. The invoice uses `allocateProportional(order.discount, gross, gross)` only while `discount ≤ Σ gross`, and `couponDiscount` always guarantees that. In the intra-state `splitLineTaxes` loop, the amount still needed (`cgst − Σ floor(tᵢ/2)`) works out to `floor(k/2)` for `k` odd lines. So the loop always finishes and the `null` fallback can't be reached for engine-produced orders. On an inclusive line, printed `taxable × rate` differs from the printed GST by at most `0.5 × (1 + r/100)`, which is under 1 paisa. Spec (e) asserts this along with the E4 pins and HSN groups. Spec (f) runs 300 seeded random mixed-rate orders against `inclusiveLineTaxes`, and spec (g) pins the legacy `net × rate` split.

The mode check `tax > 0 && isGstInclusiveSnapshot && Σnet == orderTaxable + tax` resolves the pass-1 duplicate-detection note in one direction only. The invoice can no longer call an order inclusive when the web shows it as legacy. A snapshot the web calls inclusive but that doesn't reconcile (spec h) still prints as non-inclusive with the mode-agnostic split. The coder made this trade-off deliberately to keep exact reconciliation on odd rows.

### Waived-delivery savings

Not tested: adding `shippingWaived` into the checkout banner, because the repo has no TSX tests. The API value itself is covered: ₹200 FREESHIP gives `shippingWaived` 4900, and the above-threshold, flat-coupon and no-coupon cases give 0.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/orders/invoice-document.ts`: mode decided before the tax split; inclusive lines use extracted GST via `splitLineTaxes`; legacy split unchanged.
- `apps/api/src/modules/orders/invoice-document.spec.ts`: specs (e)–(h), with per-line engine parity, a 300-order random sweep, the legacy pin and the odd-snapshot fallback.
- `apps/api/src/modules/checkout/checkout.service.ts`: additive `shippingWaived` in the preview result.
- `apps/api/src/modules/checkout/checkout.service.spec.ts`: `shippingWaived` cases.
- `apps/web/src/app/(shop)/checkout/page.tsx`: `totalSaved` includes `shippingWaived`.

Pass-1 files (engine, API pricing specs, web breakup helper and pages) are unchanged since `a6c0072`. Full diff: `git diff 6dede33..436c6dc`. This pass: `git diff a6c0072..436c6dc`.

</details>
