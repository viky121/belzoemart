# Component Dependencies — Belzo eMart (Phase 1)

## Dependency Matrix (row depends on column)

Legend: X = direct dependency.

| Component \ depends on | Identity | Catalogue | Inventory | Cart | Pricing | Coupon | Checkout | Payment | Order | Fulfilment | Returns | Wallet | Notification | Media | Search | Settings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cart | X | X | X | - | X | - | - | - | - | - | - | - | - | - | - | - |
| Pricing | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | X |
| Coupon | - | X | - | - | X | - | - | - | - | - | - | - | - | - | - | - |
| Checkout | X | X | X | X | X | X | - | X | X | X | - | X | X | - | - | X |
| Payment | - | - | - | - | - | - | - | - | X | - | - | - | X | - | - | X |
| Order | X | X | X | - | X | - | - | X | - | X | - | - | X | - | - | X |
| Fulfilment | - | - | - | - | - | - | - | - | X | - | - | - | X | - | - | X |
| Returns | X | - | X | - | - | - | - | X | X | X | - | X | X | - | - | X |
| Review | X | X | - | - | - | - | - | - | X | - | - | - | - | X | - | - |
| Wallet | X | - | - | - | - | - | - | - | - | - | - | - | X | - | - | - |
| Search | - | X | X | - | - | - | - | - | - | - | - | - | - | X | - | - |
| Reporting | X | X | X | - | - | - | - | X | X | - | X | - | - | - | - | - |
| CMS | - | X | - | - | - | - | - | - | - | - | - | - | - | X | - | - |
| Notification | X | - | - | - | - | - | - | - | X | X | - | - | - | - | - | X |
| AdminSettings | X | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |

All domain components depend on platform-core cross-cutting modules (Config, Auth/RBAC, Validation,
Logger, ErrorHandler, I18n, Queue, Health) — omitted from the matrix for brevity.

## Communication Patterns
- **In-process** (module-to-module): direct service injection within the NestJS monolith.
- **External systems** via ports/adapters: Payment (Razorpay), Shipping (ShipRocket), Email/SMS/WhatsApp/
  Push, ObjectStorage (S3). All behind interfaces with Mock adapters for local/test.
- **Asynchronous** via BullMQ (Redis): payment webhook processing, invoice generation, notifications,
  shipment creation/tracking, abandoned-cart, report export.
- **Caching** via Redis: product/category reads, search results, settings, rate-limit counters.

## Data Flow — Place Order (happy path)
```
Customer -> Web (checkout) -> API CheckoutController
  -> CheckoutOrchestrator
     -> Cart.getCart -> Inventory.reserve
     -> Pricing.computeTotals + Tax.computeGst + Coupon.validate
     -> Order.create(Pending) [idempotencyKey]
     -> Payment.initiate -> PaymentProvider(Razorpay).createOrder
  <- payment token to Web -> customer pays on gateway
Razorpay -> Webhook -> PaymentController.handleWebhook
  -> PaymentProvider.verifySignature
  -> PaymentReconciliationService
     -> Payment.capture -> Order.transition(Confirmed)
     -> enqueue: InvoiceJob, NotificationJob(order-confirmed), ShipmentJob
Workers:
  InvoiceJob   -> InvoiceService.generate -> S3 -> notify
  ShipmentJob  -> FulfilmentOrchestrator -> ShippingProvider.createAwb -> Order.transition(Packed)
  NotifyJob    -> NotificationDispatcher -> Email/SMS/WhatsApp/Push + in-app
```

## Build/Dependency Order (informs Units Generation)
```
platform-core
   -> identity
   -> catalogue (+inventory, media, search)
        -> cart-checkout (cart, pricing, tax, coupon, checkout, payment)
             -> orders-fulfilment (order, invoice, fulfilment, returns, refund)
                  -> engagement (review, wallet, notification, cms)
                       -> admin (dashboard, settings/rbac, reporting; consumes all above)
```

## Text Alternative (dependency summary)
- platform-core: no domain deps; everything depends on it.
- identity: platform-core only.
- catalogue/inventory/media/search: identity (for admin actions) + platform-core.
- cart-checkout: catalogue, inventory, identity, pricing, coupon, payment.
- orders-fulfilment: cart-checkout outputs, catalogue, inventory, payment, shipping, notification.
- engagement: identity, order, catalogue, notification.
- admin: consumes all domains + settings/rbac/reporting.
