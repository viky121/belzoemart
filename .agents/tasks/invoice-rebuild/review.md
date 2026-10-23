# Rate-weighted line tax, first-issue status guard and GSTIN validation for the GST invoice

This is the second pass on the GST tax invoice rebuild (fddeefc). The follow-up commit cea080d resolves all six findings from the first pass. Each stored tax head (CGST, SGST, IGST) is now split across lines by line net × line GST rate, in integer basis points, with the remainder on the last positive-weight line. So a 0% line carries no tax, each line's tax tracks its printed rate, and every column still sums exactly to the stored order value. `generate()` refuses to issue a first invoice for `pending` or `cancelled` orders before it allocates a number. The invoice header match is anchored to `<uploadsRoot>/invoices/`, and the admin form validates `store.gstin` on blur. `packages/shared/src/pricing.ts` is untracked and was last modified on 2026-09-21, and `pricing.service.ts` is in neither commit. The pricing engine is untouched, and the invoice still prints the stored grand total.

Watch for: no blocking issues remain. The GSTIN check is client-side and shape-only, so a GSTIN with a wrong check digit, or one written directly to the settings API, still prints (confirmed, minor). On mixed-rate carts, per-line amounts still drift about 0.5–1% from rate × taxable. That comes from the engine's integer-rounded blended rate (confirmed), which is out of scope here and was reported separately.

**Verdict**: APPROVED

## High-level view

Line tax uses weights `net[i] × round(taxRatePct × 100)`. The allocator gives zero-weight lines 0 whenever any weight is positive, so the remainder only lands on a taxed line. If every rate is 0 but tax was stored (a legacy snapshot), the split falls back to net weights. Taxable value and discount allocation are unchanged. The sample renders reconcile. On a ₹2,233.00 taxable cart at 5%, 18% and 0%, the 18% line now shows CGST 9% ₹51.31 on ₹573.33 (the first pass printed ₹23.03). The 0% line shows ₹0.00. CGST and SGST are ₹89.32 each, and the grand total is ₹2,499.64, both equal to the stored values. The inter-state render's IGST lines sum to the stored ₹178.64.

The status guard sits in `generate()`, so it covers the admin regenerate fallback, the customer endpoint and the `order.confirmed` worker. Prepaid capture sets `confirmed` before it enqueues the worker job. COD orders stay `pending` until an admin confirms them. Confirming enqueues no invoice job, so after this change COD invoices come only from the admin "Generate invoice" button. That button gap existed before this change.

Every edge case the first pass listed now has a test, and each one asserts exact reconciliation. The coder's recorded run shows typecheck, lint, test and build all passing (API 169 tests, shared 103, web 42), so no re-run was done for this review.

<details>
<summary>Issues (2)</summary>

1. **GSTIN validation is shape-only and client-only (non-blocking, confirmed)**: `isValidGstin` checks the 15-character pattern but not the check digit. The admin settings service has no server-side check for `store.gstin`. Add the GSTIN checksum to `isValidGstin` and enforce it in the settings service for `store.gstin`, so a typo or a direct API write can't reach printed invoices.
2. **Blended-rate drift (informational, out of scope)**: The 5% line prints ₹76.02 tax on ₹1,529.51, where rate × taxable is ₹76.48. The 18% line prints ₹102.62 on ₹573.33, where rate × taxable is ₹103.20. The cause is that `computeTotals` charges one integer-rounded weighted rate across the cart. Track it as a separate pricing-engine fix, which the commit message says has been reported.

</details>

<details>
<summary>Details</summary>

### Rate-weighted split of the stored tax heads

```ts
const rateWeights = items.map((i, idx) => net[idx]! * Math.max(0, Math.round(i.taxRatePct * 100)));
const taxWeights = rateWeights.some((w) => w > 0) ? rateWeights : net;
const cgst = alloc(order.cgst, taxWeights);
```

Traced for exact sums in these cases: single line, zero discount, zero tax, mixed 0% and taxed lines, and all rates 0 with tax stored. In every case Σline discount equals `order.discount`, each Σline tax head equals its stored head, and Σline total + shipping + COD fee equals `grandTotal`.

One case changes on a GST-inclusive snapshot. `extracted = net − tax` now subtracts a rate-weighted tax, so a small, high-rate line trips the existing negative-value fallback more often than before. That fallback keeps the column sums exact, but the line's printed total then differs from its net. The current engine never produces inclusive snapshots, so this has no live effect (likely).

### Invoice-number guard timing

The guard checks the status that `generate()` loads, before it calls `nextNumber()`. If an order is cancelled between that read and the number allocation, a number can still be spent. That window existed before this change and is narrow (possible, low impact).

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/orders/invoice-document.ts`: tax heads allocated by net × rate (basis points), with a net fallback when all rates are 0.
- `apps/api/src/modules/orders/invoice-document.spec.ts`: tests for rate weighting, a 0% line, legacy snapshots, zero tax (inter and intra), zero discount and a single line.
- `apps/api/src/modules/orders/invoice.service.ts`: `generate()` rejects a first issue for pending or cancelled orders with a 400.
- `apps/api/src/modules/orders/invoice.service.spec.ts`: status-guard tests, plus a re-render of an existing invoice on a cancelled order.
- `apps/api/src/main.ts`: invoice CSP and no-cache matched against `<uploadsRoot>/invoices/`.
- `apps/web/src/app/admin/settings/page.tsx`: `store.gstin` validated on blur, with an inline `role="alert"` error and `aria-invalid`.

Full diff: `git show cea080d` (first pass: `git show fddeefc`).

</details>
