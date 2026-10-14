# Integration & E2E Test Instructions — Belzo eMart

Integration tests exercise interactions between units against a real PostgreSQL + Redis (via
docker-compose) with mock external providers.

## Setup
```bash
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env.test    # NODE_ENV=test, separate DATABASE_URL
pnpm --filter @belzo/api db:migrate:dev
pnpm --filter @belzo/api db:seed
```

## Critical end-to-end flow (manual or Playwright)
The core revenue path spans U2–U6:
1. **Auth (U2)**: request OTP → verify (OTP printed in API logs by MockSmsProvider) → receive tokens.
2. **Browse (U3)**: `GET /api/v1/products`, `GET /api/v1/products/:slug` — seeded catalogue.
3. **Cart (U4)**: `POST /api/v1/cart/items` (bearer or `x-guest-token`).
4. **Checkout (U4)**: `POST /api/v1/checkout/preview` → `POST /api/v1/checkout/place` with an
   `Idempotency-Key` → returns order + payment init.
5. **Payment (U4)**: mock webhook `POST /api/v1/payments/webhook` with `x-webhook-signature =
   sha256(body)` (the storefront `order-result` page does this automatically for the mock provider).
6. **Fulfilment (U5)**: worker consumes `order.confirmed` → invoice generated + shipment/AWB created →
   tracking advances the order.
7. **Engagement (U6)**: post-delivery review (verified-purchase), wallet credit on wallet-refund returns.

## Suggested E2E (Playwright) targets
- Storefront: home → category → product → add to cart → checkout (COD) → order-result → orders list.
- Admin: login → dashboard → orders (advance status, create shipment) → reviews (moderate) → reports
  (CSV download) → settings (save).
- `data-testid` attributes are present throughout both apps to make selectors stable.

## Cross-unit checkpoints
- After U4+U5: place order → pay (mock) → confirm invoice + shipment created (worker running).
- Returns (U5) with `refund_wallet` → wallet balance increases (U6) — verifies the cross-module hook.

## Status
- Unit + property + API integration-style tests (with in-memory fakes) are automated and green (87
  tests). Full DB-backed integration and Playwright E2E are scaffolded here and run in CI/staging where
  Docker services are available; they are the recommended next automation step in Operations.
