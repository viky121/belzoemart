# U4 cart-checkout — Domain Entities

Technology-agnostic domain model for cart, coupons, pricing, checkout, and payment.

## Cart
- `Cart`: `id`, `customerId?` (null for guest), `guestToken?` (for anonymous carts), `updatedAt`.
- `CartItem`: `id`, `cartId`, `variantId`, `quantity` (>=1), `savedForLater` (bool), timestamps.
- Invariants: one active cart per customer; merging a guest cart into a user cart sums quantities per
  variant.

## Coupon
- `Coupon`: `id`, `code` (unique, uppercased), `type` (`flat`|`percent`|`free_shipping`),
  `value` (paise for flat, percent int for percent), `minOrder` (paise), `maxDiscount?` (paise cap for
  percent), `usageLimit?` (global), `perUserLimit?`, `startsAt`, `endsAt`, `isActive`,
  `categoryId?` (restrict to a category), timestamps.
- `CouponRedemption`: `id`, `couponId`, `orderId`, `customerId`, `createdAt` (enforces usage limits).

## Pricing (computed, not persisted except as order snapshot)
- `PriceBreakup` (shared type): subtotal, discount, shipping, codFee, tax, gst{cgst,sgst,igst},
  grandTotal — all in paise.

## Payment
- `Payment`: `id`, `orderId`, `provider` (`razorpay`|`cod`|`mock`), `providerOrderId?`,
  `providerPaymentId?`, `amount` (paise), `status` (`created`|`pending`|`captured`|`failed`|`refunded`),
  `method?`, `createdAt`, `updatedAt`.
- `WebhookEvent`: `id`, `provider`, `eventId` (unique — idempotent webhook processing), `payloadJson`,
  `processedAt?`, `createdAt`.

## Order (created at checkout; lifecycle owned by U5)
U4 creates the Order in `pending` with an order-items snapshot and the computed PriceBreakup; U5 owns the
subsequent state machine, invoices, and fulfilment. Minimal fields here: `id`, `customerId`,
`addressId`, `status`, price fields, `idempotencyKey` (unique), timestamps; `OrderItem`: `orderId`,
`variantId`, `title`, `sku`, `unitPrice`, `quantity`, `taxRatePct`.

## Notes
- All money is integer paise (shared `Money`).
- Stock is reserved (via U3 InventoryService) at order creation and confirmed/released by U5 on
  payment success/failure.
