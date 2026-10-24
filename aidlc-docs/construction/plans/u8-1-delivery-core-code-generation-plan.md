# Code Generation Plan: U8.1 Delivery Core

This plan is the single source of truth for U8.1 code generation. Tick each step the moment it is done.
Workspace root: `/home/viky/Belzo` (brownfield monorepo: `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`). Application code goes in those folders, never in `aidlc-docs/`. Docs summaries go in `aidlc-docs/construction/u8-1-delivery-core/code/`.

## Unit context

- **Unit**: U8.1 Delivery core (see `unit-of-work.md`). Requirements covered: DL-1.1 to DL-1.5, DL-2.1 to DL-2.5, DL-3.1 to DL-3.4, DL-4.1, DL-4.2, DL-6.1 (API side), DL-7.4, DL-8.1 (three jobs), DL-8.2. No stories (skipped); traceability is by DL id and BR-D id.
- **Design inputs**: `functional-design/` (domain-entities, business-rules BR-D1 to BR-D81, business-logic-model), `nfr-design/` (SP1 to SP9, RP1 to RP6, logical components), application design (`components.md`, `component-methods.md`, `services.md`).
- **Depends on**: nothing new. **Used by**: U8.2 (gates, collection), U8.3, U8.4, U8.5.
- **Database entities owned**: DeliveryPartner, DeliveryZone, DeliveryZonePincode, DeliveryPartnerZone, DeliveryJob, DeliveryAssignment, DeliveryEvent, DeliveryOtp (migration 1).
- **Interfaces other units rely on**: shared `status.ts` and `schemas.ts`; `JobService`; `TransitionGuard` and `CompletionGate` registries; queue `delivery`; `PartnerAuthGuard`.
- **Not in this unit**: payment, QR, ledger, proof (U8.2); screens (U8.3, U8.4); customer e-mails, `/t/[token]`, rating (U8.5). `DeliveryNotifier` calls are left as a no-op hook `onJobEvent` that U8.5 fills.
- **Rules for generation**: modify existing files in place; no `_new` or `_copy` files; follow existing code style (NestJS modules, zod DTOs via `createZodDto`, Prisma, Jest specs next to source, `@belzo/shared` imports); no new runtime dependencies.

## Steps

### A. Shared package (`packages/shared/src/delivery/`)

- [x] **Step 1 Status machine and sync table.** Create `delivery/status.ts` (10 statuses, final and active sets, `EDGES` for the 15 moves with actors and sources per BR-D20 plus `arrived` in the cancel list, `canMove`, `nextMoves`, `requirementsFor`, `FAIL_REASON_CODES`) and `delivery/sync-table.ts` (`SYNC_TABLE` per BR-D51 to BR-D57 with customer-safe tracking texts, `toOrderStatus`, `toTrackingStatus`, `furthestOrderStatus`). Add tracking labels and progress mapping in `order-tracking.ts` (BR-D60). Add `SYSTEM_CANCEL_FROM` to `constants.ts`/`orders.ts` for the system-only paths `shipped` and `out_for_delivery` to `cancelled` (BR-D56) without changing `ORDER_TRANSITIONS` for customers. (BR-D20 to D26, D50 to D60)
- [x] **Step 2 Schemas, helpers, settings defaults.** Create `delivery/schemas.ts` (zod: partner create/update/password, zone, assign, reassign, reject, fail, location, otp verify, admin reason, filters, settings patch, partner login), `delivery/format.ts` (`normalizeMobile`, `maskMobile`, `isValidPincode`, `mapsSearchUrl`, `jobCode` alphabet), `delivery/settings.ts` (`DEFAULT_DELIVERY_SETTINGS`, `deliverySettingsSchema`), `delivery/password-denylist.ts` (common passwords + own-mobile check, `deliveryPasswordSchema` built on `strongPasswordSchema`), `delivery/index.ts`; export from `packages/shared/src/index.ts`. (BR-D1, D2, D25, D26, D30, D70 to D73 view types, section 10 validation)
- [x] **Step 3 Shared tests.** `status.test.ts`, `sync-table.test.ts`, `format.test.ts`, `schemas.test.ts`, `password-denylist.test.ts` with example tests; `status.pbt.test.ts`, `sync-table.pbt.test.ts`, `format.pbt.test.ts` for P1, P2, P3, P5, P11; `delivery/testing/arbitraries.ts` (PBT-07 generators). Run `tsc`, `jest` for shared.

### B. Database (`apps/api/prisma`)

- [x] **Step 4 Prisma models and migration 1.** Edit `schema.prisma`: `PrincipalKind` adds `partner`; add the 8 models, enums (`DeliveryStatus`, `DeliveryPaymentMode`, `DeliveryAttention`, `DeliveryOtpStatus`, `DeliverySendStatus`, `DeliveryAssignmentOutcome`, `DeliveryActorKind`) and indexes per `domain-entities.md`. Generate the SQL with `prisma migrate diff` (no live DB needed), save as `prisma/migrations/<timestamp>_delivery_core/migration.sql`, and append raw SQL: partial unique indexes (one active job per order, one open assignment per job, one active OTP per job), append-only trigger on `delivery_events`, final-status trigger and delivered-needs-verified-OTP trigger on `delivery_jobs`, check constraints (mobile, pincode). Run `prisma validate` and `prisma generate`. (domain-entities section 3)

### C. API foundations (`apps/api/src`)

- [x] **Step 5 Config, queue, logging, auth types.** `common/config/env.schema.ts` (+ spec): required `JWT_PARTNER_SECRET` and `DELIVERY_OTP_PEPPER` (min 32 characters, must differ from the access secret); `QUEUES.DELIVERY`; `QueueService.upsertScheduler(queue, schedulerId, everyMs, jobName)` and `enqueue` options; logger redaction additions; `jwt.types.ts` (`partner` kind, partner principal type); `refresh-cookie.ts` scope `partner` (`belzo_prt`, path `/api/v1/partner`); `.env.example`, `docker-compose.prod.yml` and `docker-compose.yml` env entries; test env setup gets the two variables. (SP1, SP3, RP3, logical-components section 2 and 5)
- [x] **Step 6 Repository and settings.** `modules/delivery/jobs/job.repository.ts` (scoped finders, `lockForUpdate` raw query with bound params, active-count, history queries), `modules/delivery/settings/delivery-settings.service.ts` (typed read with defaults, update with audit), `modules/delivery/security-events.ts` (fixed event names, masked logging, 24 h counters). (SP2, SP8, BR-D72, D80)

### D. Partners and login

- [x] **Step 7 Partner auth.** `partners/partner-token.service.ts`, `partners/partner-auth.service.ts`, `partners/partner-auth.guard.ts`, `partners/current-partner.decorator.ts`, `partners/partner-auth.controller.ts` (login 10/min throttle, refresh, logout, change password; `mcp` handling). Specs: login success and failure, unknown mobile equals wrong password, lockout, inactive, refresh rotation and reuse, partner token rejected by `JwtAuthGuard`, admin token rejected by `PartnerAuthGuard`, must-change-password gate. (BR-D2 to D8, SP1, SP3)
- [x] **Step 8 Partner and zone management.** `partners/partner.service.ts`, `partners/zone.service.ts`, `admin/admin-partners.controller.ts`, `admin/admin-zones.controller.ts` (`@Roles('order_manager')`, audit entries, deactivate revokes tokens, reset password, suggestions per BR-D13, heartbeat and online toggle in `partner-me.controller.ts`). Specs for each service. (DL-1.1, 1.4, 1.5; BR-D1, D9, D13, D80)

### E. OTP

- [x] **Step 9 Delivery OTP.** `otp/otp-hasher.ts`, `otp/delivery-otp.service.ts` (issue with supersede, send after commit through the SMS port with purpose `delivery`, verify with constant-time compare and lockout, resend with cooldown and budget, admin unlock, contact change, cleanup). Specs: example tests plus PBT P6, P7, P8. Never log or return the code. (BR-D30 to D39, SP4)

### F. Jobs and order sync

- [x] **Step 10 Order sync service.** `jobs/order-sync.service.ts` (Shipment `inhouse` creation, tracking events from `SYNC_TABLE`, order status walk that never goes backwards, cancel other shipments on assign, undeliverable path: order cancelled with reason, stock restocked, refund of a captured prepaid payment through the existing payment service, Shipment `rto`). Spec. (BR-D14, D50 to D57)
- [x] **Step 11 Transition engine and job service.** `jobs/gates.ts` (registries for `TransitionGuard` and `CompletionGate`), `jobs/transition-engine.ts` (the single status-change function: lock, actor check, replay check, order-cancelled check, input checks, guards, event, compare-and-set, order sync, attention flags), `jobs/job.service.ts` (assign, reassign, unassign, accept, reject, pickUp, start, arrive, fail, retry, verifyOtp, resendOtp, complete, markReturned, forceFail, cancel, expireUnanswered), `jobs/job-query.service.ts` (partner preview and detail view models, admin list and detail, dashboard counts, assign options). Hook `onJobEvent` (no-op, for U8.5). Specs: example tests for every command and error code; PBT P4 (stateful model with in-memory repository), P9, P10, P12, P13; test that no admin command can reach `delivered`. (BR-D10 to D26, D40 to D46, D70 to D74)

### G. Integration with existing orders code

- [x] **Step 12 Orders integration.** `FulfilmentService.createShipment` returns early when an active job exists; `OrderService.cancel` enqueues `order.cancelled` on the delivery queue and a system-only cancel path for undeliverable returns; update `order.service.spec.ts` and `fulfilment.service.spec.ts`; make sure customer cancel rules are unchanged. (BR-D56, D58, D59)

### H. HTTP surface and worker

- [x] **Step 13 Controllers.** `partner-api/partner-jobs.controller.ts` (list, detail, accept, reject, pickup, start, arrive, fail, retry, otp verify/resend, complete), `admin/admin-delivery.controller.ts` (assign, assign options, jobs list and detail, reassign, unassign, cancel, return, force-fail, otp-unlock, contact, dashboard), `admin/admin-delivery-settings.controller.ts` (`super_admin`). All with zod DTOs, Swagger tags, and the role and guard decorators from the design. Controller specs for guards and DTO validation. (HTTP contract in `business-logic-model.md` section 9)
- [x] **Step 14 Worker, health, wiring.** `worker/delivery.worker.ts` (consumer for `accept-timeout`, `partner-stale`, `otp-cleanup`, `order.cancelled`; schedulers with fixed ids), `worker/heartbeat.ts`, `delivery-worker.module.ts` imported in `worker.module.ts`, `delivery.module.ts` imported in `app.module.ts`, health controller reports the delivery worker heartbeat softly. Specs for each job (idempotent, bounded). (DL-8.1, DL-8.2, RP3)

### I. Migration safety, docs, verification

- [x] **Step 15 Database check.** If a local Postgres is available, apply migration 1 to a scratch database and run a small script or spec that exercises the triggers and unique indexes (two active jobs, update of an event, delivered without OTP, change of a final status). If no database is available, say so and run `prisma validate` and review the SQL by hand.
- [x] **Step 16 Documentation.** `aidlc-docs/construction/u8-1-delivery-core/code/summary.md` (files created and modified, endpoints, env vars, how to run tests); update the root README/env docs section for the two new variables; list deploy notes (add secrets to server `.env.prod` before deploying; nothing is deployed until you say so).
- [x] **Step 17 Verification.** Run in order: shared `tsc`, `eslint` (if configured), `jest`; api `prisma generate`, `tsc --noEmit -p tsconfig.json`, `eslint`, `jest`; web `tsc --noEmit` and `jest` (shared types changed); mobile `tsc --noEmit` and `jest src`. Fix everything that fails. Record the counts and the PBT seed output. Re-check every BR-D and DL id of this unit against the code and tests.

## Deployment artifacts

Compose files and `.env.example` (Step 5), migration (Step 4), nothing else. The server `.env.prod` must get `JWT_PARTNER_SECRET` and `DELIVERY_OTP_PEPPER` before the next deploy or the API and worker will refuse to start (this is deliberate, SP1). I will not touch the server until you say "deploy".

## Estimated scope

About 45 new files and 15 modified files, 17 steps. Tests: roughly 150 example tests and 14 property tests.

## Extension checks at generation time

- Security: SECURITY-03, 05, 08, 09, 12, 13, 15 verified in Step 17 against the code (no secret in code, generic errors, guards on every controller, validation on every DTO).
- Resiliency: RP1 to RP3 verified by tests (idempotent jobs, no SMS inside transaction).
- PBT: PBT-02 to PBT-10 satisfied by Steps 3, 9, 11 (generators reusable, shrinking on, seed printed on failure, example tests pin key scenarios).
