# Services & Orchestration — Belzo eMart (Phase 1)

Defines how components collaborate to fulfil key business transactions. The backend is a modular monolith:
"services" here are NestJS providers that orchestrate domain components. Async work runs on BullMQ workers.

## Service Layering

```
Controllers (REST)  ->  Application/Orchestration Services  ->  Domain Services  ->  Repositories (DB)
                                     |                                   |
                                     v                                   v
                              Ports/Adapters                      Cache (Redis)
                        (Payment/Shipping/Msg/Storage)
                                     |
                                     v
                              Queue (BullMQ) -> Workers
```

## Orchestration Services

### S-1 CheckoutOrchestrator
Coordinates: Cart, Pricing, Tax, Coupon, Inventory, Order, Payment.
- Flow (place order):
  1. Load cart (Cart), validate items & stock (Inventory).
  2. Compute totals (Pricing + Tax) and apply coupon (Coupon).
  3. Create order in `Pending` (Order) with idempotency key.
  4. Reserve stock (Inventory).
  5. Initiate payment (Payment → PaymentProvider) or mark COD.
  6. Return client payment token / confirmation.
- Idempotent: repeated submit with same key returns the same order (PBT-04).
- Fail-closed: any step failure releases reservations and marks order failed (SECURITY-15).

### S-2 PaymentReconciliationService (webhook-driven)
Coordinates: Payment, Order, Inventory, Notification, Wallet, Fulfilment.
- On verified webhook: mark payment captured → transition order to `Confirmed` → enqueue invoice,
  confirmation notifications, and shipment creation.
- On failure/timeout: mark payment failed → release stock → auto-refund if charged → notify.
- Never trusts client-side success; only webhook signature verification (SECURITY-08).

### S-3 FulfilmentOrchestrator (worker-driven)
Coordinates: Order, Fulfilment (ShippingProvider), Notification.
- Create AWB after confirmation; update order to `Packed`/`Shipped`; poll/receive tracking; push timeline
  updates and notifications; handle RTO.

### S-4 ReturnsOrchestrator
Coordinates: Returns, Order, Inventory, Refund (Payment/Wallet), Notification.
- Validate return eligibility by order status/policy → schedule pickup → on receipt restock (Inventory) →
  initiate refund to source/wallet → notify.

### S-5 NotificationDispatcher (worker-driven)
Coordinates: Notification + Email/SMS/WhatsApp/Push ports + I18n + CMS templates.
- Render localized template, fan out to channels, record in-app notification, retry with backoff.

### S-6 AbandonedCartService (scheduled)
Coordinates: Cart, Notification.
- Detect carts idle beyond threshold → enqueue recovery messages per schedule (FR-10.5).

### S-7 CatalogueAdminService
Coordinates: Catalogue, Inventory, Media, Search, AuditLog.
- Product/category CRUD, CSV bulk import with validation report, media/ZIP handling, reindex, audit.

### S-8 ReportingService
Coordinates: Order, Payment, Inventory, Identity.
- Aggregate queries for sales/GST/inventory/returns/customer reports; export via Media to S3.

## Key Business Transactions (cross-component)

| Transaction | Participating components | Sync/Async |
|---|---|---|
| Browse & search | Search, Catalogue, Inventory, Media | Sync |
| Add to cart | Cart, Catalogue, Inventory, Pricing | Sync |
| Checkout preview | Cart, Pricing, Tax, Coupon, Fulfilment (rate) | Sync |
| Place order | CheckoutOrchestrator (S-1) | Sync + enqueue |
| Payment confirm | PaymentReconciliation (S-2) | Async (webhook) |
| Invoice generation | Order/Invoice | Async (worker) |
| Shipment & tracking | FulfilmentOrchestrator (S-3) | Async (worker) |
| Order notifications | NotificationDispatcher (S-5) | Async (worker) |
| Returns & refund | ReturnsOrchestrator (S-4) | Sync + async refund |
| Abandoned-cart recovery | AbandonedCartService (S-6) | Scheduled |
| Admin catalogue mgmt | CatalogueAdminService (S-7) | Sync (+ async bulk) |
| Reports & export | ReportingService (S-8) | Sync (+ async export) |

## Resiliency Patterns in Services (RESILIENCY-10)
- All provider (port) calls: explicit timeouts, retries with backoff, circuit breaker; on open circuit,
  degrade gracefully (e.g., show cached shipping estimate, queue instead of fail).
- Idempotency keys on order placement and webhook processing.
- Queue-based decoupling for all external side effects (payments capture handling, shipping, messaging).
