# U6 engagement — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds wishlist, reviews/Q&A, wallet/loyalty/referrals,
notifications, and CMS to `apps/api`; storefront wishlist/reviews/wallet/notifications UI + CMS pages to
`apps/web`. Depends on U1–U5.

## Unit Context
- **Requirements**: FR-3.8-3.10 (reviews/Q&A/wishlist/share), FR-6.1-6.5 (wishlist/alerts/wallet/
  referral/notifications/support), FR-10.3/10.5/10.7 (banners/abandoned-cart/CMS backend), FR-13.5
  (notification templates).
- **Business rules**: `construction/u6-engagement/functional-design/business-rules.md`.
- **Depends on**: U2 (auth), U3 (Product for reviews), U5 (delivered orders for verified-purchase +
  refund_wallet hook), notification queue from U4/U5.

## Steps

- [ ] Step 1 — Shared: wallet ledger pure logic in `packages/shared` (`wallet.ts`: applyEntry, canRedeem,
  runningBalance) + PBT (`wallet.test.ts`).
- [ ] Step 2 — Prisma models: WishlistItem, Review, Question, Answer, WalletAccount, WalletEntry,
  Referral, Notification, CmsPage, Banner (+ enums). Migration + seed sample CMS pages/banner.
- [ ] Step 3 — Notification channel ports: `EmailProvider`/`SmsProvider(reuse)`/`WhatsAppProvider`/
  `PushProvider` + Mock adapters + module (email/whatsapp/push new; SMS reused from U2).
- [ ] Step 4 — WishlistService (idempotent add/remove/list).
- [ ] Step 5 — WalletService (DB-backed, uses shared ledger logic; earn/redeem idempotent by ref;
  balanceAfter) + ReferralService (code gen, attribute, reward via wallet). Wire the U5 `refund_wallet`
  hook.
- [ ] Step 6 — ReviewService (verified-purchase check via delivered orders; moderation; recompute
  product rating) + QnaService.
- [ ] Step 7 — NotificationService + NotificationDispatcher worker (consume NOTIFICATIONS queue: render
  localized templates, write in-app entry, send via channel ports) + AbandonedCartService (scheduled).
- [ ] Step 8 — CmsService (pages + banners; public read, admin write).
- [ ] Step 9 — Controllers: customer (wishlist, reviews, qna, wallet, notifications), public (cms/
  banners, product reviews read), admin (review moderation, cms/banner write @Roles marketing).
- [ ] Step 10 — EngagementModule + EngagementWorkerModule + wiring (api + worker); wire U5 refund_wallet.
- [ ] Step 11 — Web: wishlist page, product reviews section + write-review, wallet page, notification
  centre, CMS page renderer; header wishlist link.
- [ ] Step 12 — Tests: wallet PBT (shared), wishlist idempotency, review verified-purchase unit, rating
  recompute; summary doc + verify (build shared, prisma generate, tsc, jest).

## Testable Properties carried into code (PBT-01 → PBT-03/04/06)
- wallet balance ≥ 0; redeem guarded; earn/redeem idempotent by ref; ledger balanceAfter = running sum;
  wishlist add idempotent.

## Traceability
FR-3.8-3.10 → 6/11; FR-6.1 (wishlist/alerts) → 4/11; FR-6.2 (wallet/referral) → 5/11; FR-6.3
(notifications) → 7/11; FR-6.4 (review prompts) → 7; FR-10.3/10.7 (banners/CMS) → 8/9/11; FR-10.5
(abandoned-cart) → 7; FR-13.5 (templates) → 7.
