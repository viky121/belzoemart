# U4 cart-checkout — Business Rules & Testable Properties

## Cart rules
- BR-1 Adding an existing variant increases its quantity; quantity is clamped to [1, 99].
- BR-2 Guest cart merges into the user cart on login: quantities per variant sum (clamped to 99).
- BR-3 Cart revalidates variant price and stock at read time; out-of-stock items are flagged.

## Pricing rules (pure, deterministic — core PBT target)
- BR-4 Line total = unitSellingPrice × quantity. Subtotal = Σ line totals.
- BR-5 Discount is computed from the coupon (see BR-8) and never exceeds the subtotal.
- BR-6 Taxable value = subtotal − discount (discount applied before tax on the net amount). GST is
  computed per the product's `taxRatePct`; when the buyer state equals the seller state → CGST+SGST
  (each half), else IGST (full). CGST+SGST+IGST == total tax.
- BR-7 Grand total = taxableValue + tax + shipping + codFee. All amounts ≥ 0. Grand total ≥ 0.

## Coupon rules (pure)
- BR-8 A coupon applies only if: active, within [startsAt,endsAt], subtotal ≥ minOrder, category matches
  (if restricted), and usage/per-user limits not exceeded. `flat` → discount = min(value, subtotal);
  `percent` → discount = min(round(subtotal×value/100), maxDiscount ?? ∞, subtotal); `free_shipping` →
  shipping set to 0.
- BR-9 Auto-apply best offer: among applicable coupons, choose the one giving the largest total saving.

## Checkout rules
- BR-10 Checkout preview computes the PriceBreakup for the cart + address + optional coupon without
  mutating anything.
- BR-11 Place order is idempotent by `idempotencyKey`: repeated submits with the same key return the
  same order (no duplicate orders, no double stock reservation) — PBT target.
- BR-12 Placing an order: validates stock, reserves stock (U3 InventoryService), snapshots items+prices,
  creates Order(pending) + Payment(created), returns gateway init data (or COD confirmation).
- BR-13 Payment success is only accepted via verified webhook (signature check) — never client-side
  (SECURITY-08). Webhook processing is idempotent by provider `eventId`.
- BR-14 COD availability and fee come from settings by PIN (U7); U4 uses a default COD fee rule.

## Testable Properties (PBT-01)

| Property | Category | Rule |
|---|---|---|
| GST split sums to total tax: cgst+sgst+igst == tax, for any taxable amount & rate | Invariant (PBT-03) | BR-6 |
| Same-state → igst==0 & cgst==sgst; inter-state → cgst==sgst==0 | Invariant (PBT-03) | BR-6 |
| discount never exceeds subtotal; grandTotal ≥ 0 for any cart/coupon | Invariant (PBT-03) | BR-5,BR-7 |
| computeTotals is deterministic (same input → same breakup) | Function (PBT) | BR-4..BR-7 |
| percent coupon discount ≤ maxDiscount cap when set | Invariant (PBT-03) | BR-8 |
| free_shipping coupon ⇒ shipping component == 0 | Invariant (PBT-03) | BR-8 |
| PriceBreakup serialize→parse round-trip (shared schema) | Round-trip (PBT-02) | — |
| place(idempotencyKey) twice ⇒ one order (idempotent) | Idempotence (PBT-04) | BR-11 |
| cart add/update/remove stateful sequence keeps quantities in [1,99], no negatives | Stateful (PBT-06) | BR-1 |

Components with no PBT: thin controllers, Razorpay adapter I/O (integration-tested via mock).
