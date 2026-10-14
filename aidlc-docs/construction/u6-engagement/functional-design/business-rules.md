# U6 engagement — Domain Entities, Business Rules & Testable Properties

## Entities
- **WishlistItem**: id, customerId, variantId, createdAt (unique customerId+variantId).
- **Review**: id, productId, customerId, rating (1-5), title?, body, imagesJson, verifiedPurchase (bool),
  status (pending|approved|rejected), helpfulCount, createdAt. Denormalised into Product.ratingAvg/Count
  on approval.
- **Question / Answer**: product Q&A (id, productId, customerId, body, answers[]).
- **WalletAccount**: customerId (unique), balance (paise, ≥ 0).
- **WalletEntry**: id, customerId, delta (paise, +/-), reason, ref (unique per customerId for
  idempotency), balanceAfter, createdAt (ledger/audit).
- **Referral**: id, customerId (owner), code (unique), referredCustomerId?, rewardedAt?.
- **Notification** (in-app): id, customerId, type, title, body, readAt?, createdAt.
- **CmsPage** / **Banner**: slug/placement, content, schedule, isActive.

## Business rules
- BR-1 Wishlist add is idempotent per (customer, variant).
- BR-2 A review is `verifiedPurchase` only if the customer has a delivered order containing the product.
  Reviews start `pending` and appear publicly only when `approved` (moderation).
- BR-3 On review approval, Product.ratingAvg/ratingCount are recomputed from approved reviews.
- BR-4 Wallet balance is never negative. Earn adds; redeem subtracts only if balance ≥ amount.
- BR-5 Wallet earn/redeem are idempotent by `ref`: replaying the same ref does not double-apply.
- BR-6 Every wallet change appends a WalletEntry with `balanceAfter` (ledger equals running sum).
- BR-7 Referral: a unique code per customer; when a new customer signs up with it and places their first
  delivered order, both parties are credited wallet reward (credit via idempotent ref).
- BR-8 Notifications: the NotificationDispatcher consumes the NOTIFICATIONS queue (order.confirmed,
  order.payment_failed, order shipped/delivered, dpdp, abandoned-cart) and writes in-app entries + sends
  via channel ports (email/SMS/WhatsApp/push — mock by default).
- BR-9 CMS pages/banners are public reads; admin writes (RBAC marketing).

## Testable Properties (PBT-01)
| Property | Category | Rule |
|---|---|---|
| wallet balance never negative after any earn/redeem sequence | Stateful invariant (PBT-06) | BR-4 |
| redeem fails (no change) when amount > balance | Invariant (PBT-03) | BR-4 |
| earn/redeem idempotent by ref: replaying ref leaves balance unchanged | Idempotence (PBT-04) | BR-5 |
| ledger balanceAfter equals running sum of deltas | Invariant (PBT-03) | BR-6 |
| wishlist add idempotent per (customer,variant) | Idempotence (PBT-04) | BR-1 |

No-PBT: thin controllers, channel adapter I/O, CMS CRUD (integration/example-tested).
