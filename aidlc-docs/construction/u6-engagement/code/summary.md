# U6 engagement — Code Generation Summary

Completes the customer-facing feature set: wishlist, reviews/Q&A, wallet/loyalty/referrals,
multi-channel notifications, and CMS. Builds on U1–U5.

## What was built

### Shared (`packages/shared`)
- `wallet.ts` — pure ledger logic (`applyEntry`, `canRedeem`, `runningBalance`, `InsufficientBalanceError`)
  + `wallet.test.ts` (property tests: balance ≥ 0, redeem guard, ledger integrity).

### Data model (`apps/api/prisma`)
WishlistItem, Review (+ status), Question/Answer, WalletAccount, WalletEntry (unique per customer+ref),
Referral, Notification, CmsPage, Banner. Seed adds 6 CMS legal/info pages + a home banner.

### Integrations
- `integrations/notifications/` — Email/WhatsApp/Push provider ports + mock adapters (SMS reuses U2).

### Services (`apps/api/src/modules/engagement`)
- `wishlist.service.ts` — idempotent add/remove.
- `wallet.service.ts` — earn/redeem (idempotent by ref, ledger with balanceAfter, uses shared logic).
- `referral.service.ts` — unique codes, attribution, reward both parties via wallet.
- `review.service.ts` — verified-purchase detection, moderation, rating recompute; `qna.service.ts`.
- `notification.service.ts` — localized templates (EN/HI), in-app + channel fan-out (best-effort);
  `notification.worker.ts` — NOTIFICATIONS queue consumer (order + abandoned-cart events);
  `abandoned-cart.service.ts` — idle-cart sweep.
- `cms.service.ts` — pages + scheduled banners.

### HTTP
- Controllers: `engagement` (customer), `public-engagement` (public reviews/Q&A/CMS/banners),
  `admin-engagement` (review moderation, CMS/banner writes behind RBAC).
- `EngagementModule` wired into `AppModule`; `EngagementWorkerModule` (dispatcher) into `WorkerModule`.
- **U5 hook connected**: OrdersModule imports EngagementModule; `refund_wallet` returns now credit the
  customer's wallet (idempotent by return id).

### Web (`apps/web`)
- Wishlist, wallet (balance + ledger + referral code), notification centre, product reviews section on
  the PDP, and a CMS page renderer (`/page/[slug]`). Header wishlist/orders links; footer legal links.

## Verification (executed)
- shared: **39 tests pass** (wallet PBT added), built. `prisma generate` OK. **API typecheck clean**.
  **API tests: 45/45 pass**.
- Note: the terminal was temporarily unresponsive mid-unit; all verification was re-run successfully once
  it recovered.

## Extension compliance (U6)
- **Security**: SECURITY-05 (zod validation), SECURITY-08 (customer endpoints scoped; admin moderation/
  CMS behind `@Roles`). No blocking findings.
- **Resiliency**: RESILIENCY-10 (notification dispatch on BullMQ, best-effort channel fan-out via
  `Promise.allSettled` so one channel failure doesn't block others). No blocking findings.
- **PBT**: PBT-03/04/06 — wallet balance ≥ 0 across sequences, redeem guard, idempotency, ledger
  integrity — all passing. No blocking findings.

## Follow-ups
- Live email (SES)/WhatsApp/push (FCM) adapters are dropped in at deploy behind the existing ports.
- Abandoned-cart `sweep()` is invoked by a scheduler in Operations (method ready).
- Referral reward trigger (on first delivered order) is exposed via `ReferralService.reward`; U7 admin or
  an order-event hook can invoke it.
