# U8.1 Delivery Core: Code Summary

Nothing is deployed. All work is local and verified (see "Verification").
Plan: `aidlc-docs/construction/plans/u8-1-delivery-core-code-generation-plan.md` (17 steps).

## What now exists

Partners (admin-created, own login), zones, assigning an order to a partner, the 10-status delivery machine, the delivery OTP, and the sync of every step into the Belzo order, its shipment and the customer's tracking timeline. Background jobs run in the worker. No screens yet (U8.3 admin, U8.4 partner app) and no cash, QR or proof yet (U8.2).

## Files created

### packages/shared (`src/delivery/`)
`status.ts` (10 statuses, 15 moves, who may run them, requirements), `sync-table.ts` (order, shipment and timeline effect of each move, order walk), `format.ts` (mobile, pincode, job code, map link), `settings.ts` (11 `delivery.*` settings, ranges, defaults), `password-denylist.ts`, `schemas.ts` (zod request schemas), `views.ts` (response shapes, preview vs detail), `index.ts`, `testing/arbitraries.ts` (property-test generators), and tests `status.test.ts`, `status.pbt.test.ts`, `sync-table.test.ts`, `format.test.ts`, `schemas.test.ts`.

### apps/api
- Database: `prisma/migrations/20261023005134_delivery_core/migration.sql` (8 tables, enums, partial unique indexes, 3 triggers, check constraints).
- `src/modules/delivery/`
  - `delivery.module.ts`, `delivery-worker.module.ts`, `dto.ts`, `delivery-errors.ts`, `security-events.ts`
  - `partners/`: `partner-token.service.ts`, `partner-auth.service.ts`, `partner-auth.guard.ts`, `partner-auth.decorators.ts`, `partner-auth.types.ts`, `partner-auth.controller.ts`, `partner.service.ts`, `zone.service.ts`, `suggestions.ts`
  - `jobs/`: `job-rules.ts` (pure state machine), `job.service.ts` (commands), `job.repository.ts`, `job-query.service.ts`, `job-view.ts`, `order-sync.service.ts`, `event-writer.ts`, `gates.ts` (extension points for U8.2/U8.5)
  - `otp/`: `otp-rules.ts` (pure), `delivery-otp.service.ts`
  - `settings/delivery-settings.service.ts`
  - `admin/`: `admin-partners.controller.ts`, `admin-zones.controller.ts`, `admin-delivery.controller.ts`, `admin-delivery-settings.controller.ts`
  - `partner-api/`: `partner-me.controller.ts`, `partner-jobs.controller.ts`
  - `worker/delivery.worker.ts`
  - `testing/fake-db.ts` (in-memory Prisma stand-in for unit tests)
  - 18 spec files, including `delivery.db.spec.ts` (real database, see below)
- `src/common/health/worker-heartbeat.ts`, `health.controller.spec.ts`
- `src/common/filters/all-exceptions.filter.spec.ts`
- `src/modules/orders/order.service.undeliverable.spec.ts`, `fulfilment.service.inhouse.spec.ts`

## Existing files modified (U8.1 only)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `PrincipalKind.partner`; 8 delivery models and 7 enums; back-relations on `Order` and `Shipment` |
| `common/config/env.schema.ts` (+ spec) | `JWT_PARTNER_SECRET`, `DELIVERY_OTP_PEPPER` (32+ chars, partner secret must differ), `PARTNER_REFRESH_TTL` |
| `common/auth/jwt-auth.guard.ts`, `jwt.types.ts` | partner kind added; the customer/admin guard refuses a partner token |
| `modules/identity/token.service.ts` | a partner refresh token can never mint a customer or admin token |
| `modules/identity/refresh-cookie.ts` | partner scope: cookie `belzo_prt`, path `/api/v1/partner` |
| `modules/identity/identity.module.ts` | exports `LockoutService` |
| `common/queue/queue.constants.ts`, `queue.service.ts` | `DELIVERY` queue, `upsertScheduler`, job id option |
| `common/logger/logger.module.ts` | redaction of otp, passwords, tracking token |
| `common/health/health.controller.ts` | soft `deliveryWorker` check |
| `common/filters/all-exceptions.filter.ts` | passes `code` and `details` of structured errors to the client |
| `modules/orders/order.service.ts` | `cancel` queues `order.cancelled`; new `cancelUndeliverable` |
| `modules/orders/fulfilment.service.ts` | skips orders with an active job; no courier calls for in-house shipments |
| `modules/orders/orders.module.ts` | exports `OrderService` |
| `app.module.ts`, `worker.module.ts` | register the delivery modules |
| `packages/shared`: `constants.ts`, `orders.ts`, `order-tracking.ts`, `index.ts` | system-cancel paths, tracking labels for assigned, accepted, arrived, failed attempt |
| `.env.example`, `.env.prod.example`, `DEPLOY.md` | the two new secrets |

## HTTP endpoints (prefix `/api/v1`)

| Who | Routes |
|---|---|
| Partner, no token | `POST partner/auth/login`, `refresh`, `logout` |
| Partner | `POST partner/auth/password`; `GET partner/me`, `POST partner/me/online`, `POST partner/me/heartbeat`; `GET partner/jobs`, `GET partner/jobs/:id`; `POST partner/jobs/:id/{accept,reject,pickup,start,arrive,fail,retry,complete}`; `POST partner/jobs/:id/otp/verify`, `otp/resend` |
| Admin (`order_manager`, `super_admin`) | `GET admin/orders/:orderId/assign-options`, `POST admin/orders/:orderId/assign`; `GET admin/delivery/{dashboard,jobs,jobs/:id}`; `POST admin/delivery/jobs/:id/{reassign,unassign,cancel,return,force-fail,otp-unlock,contact}`; partners CRUD, `:id/active`, `:id/password`, `:id/zones`; zones CRUD, `:id/pincodes` |
| Admin (`super_admin` only) | `GET`/`PUT admin/delivery/settings` |

There is no admin route that marks a job delivered.

## Environment

New required variables: `JWT_PARTNER_SECRET`, `DELIVERY_OTP_PEPPER` (both 32+ characters; the partner secret must differ from the other two secrets). Optional `PARTNER_REFRESH_TTL` (seconds, default 604800).
They are already in the server's `.env.prod` (added on request, backup `.env.prod.bak-partner-*`). They are in the local `.env` and `apps/api/.env`.

## How to run the tests

```bash
cd packages/shared && npx tsc -p tsconfig.json && npx jest        # rebuild first: the API reads shared from dist
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx eslint "src/**/*.ts" && npx jest

# database-level checks (indexes, triggers, locks, real queries); skipped unless a URL is given
createdb belzo_delivery_scratch && DATABASE_URL=<url> npx prisma migrate deploy
DELIVERY_DB_TEST_URL=<url> npx jest src/modules/delivery/delivery.db.spec.ts
```

Property tests use fast-check; a failing run prints the seed and the shrunk counterexample.

## Verification (run on 2026-10-23)

| Check | Result |
|---|---|
| shared: `tsc`, `eslint`, `jest` | clean, 25 suites, 422 tests |
| api: `tsc --noEmit`, `eslint`, `jest` | clean, 77 suites, 880 tests with the database spec running (862 plus 18 that skip without a database; was 579 before this unit) |
| api: delivery database spec against PostgreSQL with all migrations applied | 18 of 18 pass |
| web: `tsc`, `jest` | clean, 194 tests |
| mobile: `tsc`, `jest src` | clean, 245 tests (one earlier run showed 2 failures; two reruns passed 245 of 245, so they were timing noise under load) |
| Local end-to-end over HTTP (API + worker + Redis + Postgres) | admin creates zone and partner, assigns a COD order, partner accepts, picks up, starts (OTP sent), arrives; delivery is refused without the OTP; wrong code refused; right code accepted; delivered; order, job, shipment and customer timeline agree; the OTP is nowhere in the database |
| Worker | starts, registers the 4 schedulers once, jobs complete, health shows `deliveryWorker: true` |

Not verified: a real Fast2SMS send of the delivery OTP (local runs use the mock SMS provider, which prints the code in the log; production uses the live provider), and anything on the production server.

## Findings and decisions during generation

1. **Redis mix-up found and cleaned.** `apps/api/.env` has `REDIS_URL=redis://localhost:6379`, which on this machine is the SecAudit project's Redis, not Belzo's (`belzo-redis` is on 6380, as in the root `.env`). My first smoke run wrote Belzo queue keys there. I deleted exactly those keys (`bull:delivery*`, empty meta keys of Belzo queues, the heartbeat, one cached setting, one counter). SecAudit's own queues were not touched. All later runs used 6380. I did not change your `.env`; please point `apps/api/.env` at 6380.
2. **Error codes were being dropped** by the global exception filter, so apps could not tell `OTP_LOCKED` from other 4xx errors. The filter now passes `code` and `details` for structured errors only. Found by the HTTP smoke test.
3. **Partner password message** reuses the customer helper, whose text reads "one capital letter (a-z)". Cosmetic, shared with customers, left as is.
4. **Design refinements made while building** (all within the approved design): a mock or courier shipment already made for the order is taken over by the in-house shipment instead of being cancelled next to a new one; a `returned` job cancels its order after commit and a 5-minute sweep repairs it if that step fails; reassigning to the same partner is allowed only after a failed attempt (fresh attempts); `GPS` points on events are cleared after 90 days by the hourly job.

## Deploy notes (when you say "deploy")

- The migration `20261023005134_delivery_core` is additive. It runs with the normal migrate step.
- `.env.prod` already has the two secrets. Restart both `api` and `worker` containers.
- After deploy, `GET /api/v1/health/ready` should show `deliveryWorker: true` within a minute.
- Create the first zone and partner from the admin API (U8.3 adds the screens). Partners must change their password at first login.
- Nothing customer-facing changes until an admin assigns an order.

## Hooks left for the next units

`DeliveryGateRegistry.registerGuard` / `registerGate` (U8.2: payment collected must be voided first, payment and proof before delivered); `DeliveryJobHooks.afterCommit` (U8.5: customer e-mail and in-app message); `attention: payment_review` value; tracking link on the shipment.

## Extension compliance

- **Security**: separate partner realm and secret; deny by default and object-level scoping tested; hashed OTP with pepper and lockout; rate limits; input validated by zod on every route; audit log and append-only triggers; generic errors; no secrets in code. MFA is not offered to partners (decision). No blocking findings.
- **Resiliency**: SMS after commit, idempotent bounded jobs, row locks, health heartbeat, graceful fallback when SMS fails. No blocking findings.
- **Property-based testing**: P1 to P14 implemented (status machine, sync, mobile format, OTP, attempts, replay, scoping, suggestions, tracking-safe views) with generators in `testing/arbitraries.ts`; example tests pin the key scenarios.
