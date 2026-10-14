# U4 cart-checkout — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds cart, pricing/tax/coupon engine, checkout, and Razorpay
payment to `apps/api`; cart + checkout pages to `apps/web`. Depends on U1, U2, U3.

## Unit Context
- **Requirements**: FR-4.1-4.9 (cart, coupon, price breakup/tax, payment, webhook verify, confirmation),
  FR-3.5 (COD/serviceability at PDP), NFR-2.1 (GST split), NFR-1.5 (PCI tokenisation).
- **Business rules**: `construction/u4-cart-checkout/functional-design/business-rules.md`.
- **Depends on**: U3 InventoryService (reserve/release), ProductService; U2 auth (customer principal).

## Steps

- [ ] Step 1 — Shared: pricing/tax/coupon pure engine in `packages/shared` (`pricing.ts`:
  computeGst, computeTotals, evaluateCoupon) + PBT (`pricing.test.ts`). Types already in schemas
  (PriceBreakup, GstSplit).
- [ ] Step 2 — Prisma models: Cart, CartItem, Coupon, CouponRedemption, Payment, WebhookEvent, Order,
  OrderItem (+ enums). Migration + seed a demo coupon (e.g. WELCOME10).
- [ ] Step 3 — Payment port: `PaymentProvider` (createOrder/verifySignature/createRefund) +
  `MockPaymentProvider` (deterministic, auto-verifiable) + `RazorpayProvider` (HMAC verify via resilient
  HTTP), env-selected.
- [ ] Step 4 — CartService (get/add/update/remove/saveForLater/merge; clamps qty; ownership).
- [ ] Step 5 — CouponService (validate + bestAutoOffer using shared evaluateCoupon + usage-limit checks;
  redeem records CouponRedemption). PricingService (wraps shared computeTotals with product tax rates +
  shipping/COD rules + seller state).
- [ ] Step 6 — CheckoutService: preview (no mutation), place (idempotent by key; reserve stock via
  InventoryService; snapshot; create Order+Payment; return gateway init). Uses $transaction.
- [ ] Step 7 — PaymentService: initiate, handleWebhook (verify signature, idempotent by eventId,
  transition payment→captured, emit domain event/enqueue for U5), refund.
- [ ] Step 8 — Controllers: `cart` (customer or guest token), `checkout` (preview/place),
  `coupons` (validate), `payments/webhook` (@Public, raw body). zod DTOs + Swagger + throttling.
- [ ] Step 9 — CartCheckoutModule + AppModule wiring; raw-body config for webhook route.
- [ ] Step 10 — Web: cart page (list/qty/remove/save-for-later), checkout page (address select, coupon,
  price breakup, pay), payment result pages; wire PDP add-to-cart from U3.
- [ ] Step 11 — Tests: shared pricing PBT (GST split, discount ≤ subtotal, grandTotal ≥ 0, determinism,
  free-shipping, cap); checkout idempotency unit test (fake prisma); coupon evaluation unit tests; cart
  stateful PBT.
- [ ] Step 12 — Docs: `construction/u4-cart-checkout/code/summary.md`. Verify (build shared, prisma
  generate, tsc, jest).

## Testable Properties carried into code (PBT-01 → PBT-02/03/04/06)
- GST split sums to tax; state-based CGST/SGST vs IGST.
- discount ≤ subtotal; grandTotal ≥ 0; computeTotals deterministic.
- percent cap; free_shipping ⇒ shipping 0.
- PriceBreakup round-trip; checkout idempotency; cart stateful bounds.

## Traceability
FR-4.1/4.2 → Steps 4/10; FR-4.3 (coupons) → 1/5/8/10; FR-4.4 (breakup/tax) → 1/5/10; FR-4.6-4.8
(payment/webhook/refund) → 3/7/8; FR-4.9 (confirmation) → 7 (enqueue notification hook for U6);
NFR-2.1 → 1/5; NFR-1.5 → 3 (no card data stored, gateway tokenisation).
