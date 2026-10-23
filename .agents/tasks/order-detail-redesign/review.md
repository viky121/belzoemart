# Customer order-detail redesign: second pass (COD wallet credit, server-side return rules, honest milestone times)

This pass covers d98c0cd, e78297e, 37da53a and 5690322, which address all seven findings from the first review. The whole task diff (`0b4b44f..HEAD`) was re-checked against the brief. The server now enforces the return rules itself: Replace only for reasons that allow it, refund to source only for prepaid orders, Other needs 10+ characters, and free-text defect reasons match case- and spacing-insensitively. Derived Delivered/Cancelled/Returned steps no longer borrow `order.updatedAt`. The page explains why Cancel is missing, and disabled modal buttons point at their hint. Delivered COD returns now credit the wallet (owner-approved option A), and a return is marked `refunded` only when money actually moved. There are no uncommitted changes to tracked files. Schema, ORDER_TRANSITIONS/canCustomerCancel, the pricing engine and invoices are untouched; the only money change is the approved COD credit. All eight verification commands pass on rerun.

Watch for: a full COD return refunds shipping and the COD fee, but prepaid returns never do (confirmed; this asymmetry is a policy question). The COD cap is computed outside a transaction (likely, but it needs concurrent admin actions).

**Verdict**: APPROVED

## High-level view

The live status is consistent. The badge and stepper read only `order.status`. `reconcileTracking` takes the furthest of order, shipment and events, and terminal order states win. Derived steps now carry a time only for "packed" (from `shipment.createdAt`); every other derived step shows "Time not available". The mock provider and `syncTracking` are unchanged since the first pass.

`ReturnService.request` now mirrors every rule in the storefront form. These checks were already in place: ownership, delivered-only, items in the order, no duplicate lines, quantity within what remains, non-returnable products, photos for defect reasons by code or text, and own `returns/<uuid>.<ext>` URLs. On top of those, it checks resolution against the reason and payment type and enforces the Other comment length. COD requests without a resolution now default to the wallet instead of `refund_source`.

COD returns go through a new `processCodReceived` path. A delivered COD order credits the returned lines' share of the goods actually charged (grandTotal minus shipping and COD fee, so coupons and GST are spread pro rata). The credit is idempotent by `return:<id>` and capped at grandTotal minus earlier credits. The final return of a fully returned order gets the remainder, including shipping and the COD fee. The prepaid path keeps its old math but now records `received` instead of `refunded` when nothing is refunded.

The UI additions are small. The Actions card shows "Orders can't be cancelled once they are packed" for packed, shipped and out-for-delivery orders. The Next, Submit and Continue buttons get `aria-describedby` pointing at their hint. In the cancel modal, that hint stays screen-reader-only until a reason is chosen.

<details>
<summary>Issues (2)</summary>

1. **COD vs prepaid fee refund asymmetry** (minor): a fully returned COD order gets shipping and the COD fee back, while a prepaid return refunds only unit price × qty. Confirm with the owner that this is intended, or align the two paths in a follow-up.
2. **COD credit cap not serialized** (minor): `processCodReceived` reads earlier wallet credits and then calls `wallet.earn` outside a transaction. Two returns of the same order marked received at the same moment could together exceed grandTotal. Wrap the read and the earn in one `$transaction`, or lock on the order row.

</details>

<details>
<summary>Details</summary>

### COD wallet credit on received returns

In `codReturnCredit` (`apps/api/src/modules/orders/cod-return-credit.ts`), the full-return branch returns `remaining`, which includes shipping and the COD fee (confirmed). The prepaid branch still refunds `unitPrice × qty` clamped to the captured amount. So a prepaid shopper who returns everything never gets shipping back, while a COD shopper does. The prepaid branch also ignores coupon discounts, which predates this change. FEAT-002 records owner approval for "option A" and describes the fee remainder. The review cannot confirm that the owner knowingly accepted the prepaid asymmetry, so it is listed as a question rather than a defect.

The cap is computed from a `walletEntry.findMany` read followed by `wallet.earn`, in separate transactions (likely). `wallet.earn` is idempotent per ref, which prevents crediting the same return twice. It does not stop two different returns of one order from both reading the same `alreadyCredited`. This only happens if an admin marks two returns received concurrently.

### Test coverage

All specs listed in the plan exist and pass, and the first-pass gaps (duplicate lines, non-returnable items, code-less defect text) are now covered. Not tested: concurrent receipt of two returns of one COD order, and a prepaid order whose payment is already `partially_refunded` when a second return is received. The second case is a pre-existing path that now resolves to `received` with no refund.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/orders/cod-return-credit.ts`: pure pro-rata COD wallet credit with cap and full-return remainder
- `apps/api/src/modules/orders/return.service.ts` (+spec): reason/resolution/Other rules in `request`, COD default resolution, `processCodReceived`, `refunded` only when money moved
- `packages/shared/src/returns.ts` (+test): normalised `findReturnReason`, `reasonComments`
- `packages/shared/src/order-tracking.ts` (+test): derived steps no longer use `order.updatedAt`
- `apps/web/src/lib/order-view.ts` (+test): `cancelUnavailableReason`, no `updatedAt` on Cancelled/Returned steps, COD wallet copy
- `apps/web/src/app/(shop)/orders/[id]/page.tsx`: cancel-unavailable note
- `apps/web/src/app/(shop)/orders/[id]/cancel-order-modal.tsx`, `return-request-modal.tsx`: `aria-describedby` hints

Full diff: `git diff 0b4b44f..HEAD` (this pass: `git diff 2b7d7c1..HEAD`)

Verification rerun (all exit 0): shared test 214/214, shared build, api typecheck, api lint, api test 307/307, web typecheck, web test 132/132, web build.

</details>
