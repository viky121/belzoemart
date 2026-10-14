# U4 cart-checkout — Code Generation Summary

Delivers the core revenue path: cart → pricing/tax/coupon → checkout → Razorpay payment → confirmation.
Builds on U1/U2/U3.

## What was built

### Shared (`packages/shared`)
- `pricing.ts` — pure engine: `subtotalOf`, `computeGst` (CGST/SGST vs IGST), `couponDiscount`
  (flat/percent/free-shipping with caps), `computeTotals` (discount-before-tax, blended rate,
  grand total ≥ 0) + `pricing.test.ts` (10 property/example tests).

### Data model (`apps/api/prisma`)
Cart, CartItem, Coupon, CouponRedemption, Order (+ price snapshot + unique idempotencyKey), OrderItem,
Payment, WebhookEvent (unique eventId). Seed adds demo coupons (WELCOME10, FLAT100, FREESHIP).

### Integrations
- `integrations/payment/` — `PaymentProvider` port + `MockPaymentProvider` (deterministic, sha256 webhook
  sig) + `RazorpayPaymentProvider` (Orders API via resilient HTTP, HMAC-SHA256 webhook verify with
  timing-safe compare). Env-selected.

### Services (`apps/api/src/modules`)
- `cart/cart.service.ts` — guest + user carts, quantity clamping, save-for-later, guest→user merge,
  live price/stock revalidation.
- `checkout/coupon.service.ts` — validation (window, min-order, usage/per-user limits) + redemption.
- `checkout/pricing.service.ts` — shipping/COD/seller-state rules around the shared engine.
- `checkout/checkout.service.ts` — side-effect-free preview; **idempotent** place that reserves stock
  (U3 InventoryService), snapshots items+prices, creates Order + Payment in a transaction.
- `checkout/payment.service.ts` — gateway order initiation; **webhook-only** capture (signature verified,
  idempotent by eventId); on capture confirms order + converts reservation to sale + enqueues
  fulfilment/notification/invoice jobs; on failure releases stock; refunds.

### HTTP
- Controllers: `cart` (public, guest-token or bearer), `checkout` (preview/place, Idempotency-Key),
  `coupons` (validate), `payments/webhook` (public, raw-body, signature-verified). `main.ts` enables
  `rawBody`. `CartCheckoutModule` wired into `AppModule`.

### Web (`apps/web`)
- `lib/cart-api.ts` (guest token), cart page (qty/remove/subtotal), checkout page (address, coupon, GST
  breakup, payment method, place order), order-result page (simulates the mock signed webhook for a
  full local demo), and PDP add-to-cart wired.

## Verification (executed)
- shared: **29 tests pass**, built. `prisma generate` OK. **API typecheck clean**. **API tests: 38/38
  pass** (adds checkout idempotency unit tests; pricing PBT lives in shared).
- Bug caught & fixed during build: a broken inline mapping in `checkout.preview` (removed a placeholder
  hack, mapped from the item snapshot); and a `Money`/`number` type mismatch in the pricing engine
  (`paise()` wrap for `addMoney`).

## Extension compliance (U4)
- **Security**: SECURITY-05 (zod on all endpoints), SECURITY-08 (checkout/coupon authenticated; payment
  capture accepted only via signature-verified webhook, never client-side), SECURITY-11 (throttling),
  SECURITY-12 (no card data stored — gateway tokenisation), SECURITY-13 (timing-safe signature compare).
  No blocking findings.
- **Resiliency**: RESILIENCY-10 (Razorpay calls via circuit-breaker HTTP client; post-payment work
  decoupled onto BullMQ; idempotent webhooks). No blocking findings.
- **PBT**: PBT-02 (PriceBreakup round-trip), PBT-03 (GST split sums to tax, state-based split, discount ≤
  subtotal, grand total ≥ 0, percent cap, free-shipping), PBT-04 (checkout idempotency) — all passing.
  No blocking findings.

## Follow-ups
- Order lifecycle beyond `confirmed` (packed→shipped→delivered), invoices, and fulfilment are U5 (jobs
  are already enqueued on capture).
- Real Razorpay keys + webhook secret are supplied at deploy (adapter + HMAC verify already implemented).
- Seller state for GST is env `STORE_STATE` (default Karnataka); U7 settings will make it configurable.
