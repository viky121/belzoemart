# U8.1 Delivery Core: NFR Design Patterns

Answers applied: NQ1 = A (security events as structured logs plus dashboard counters, no external alert yet), NQ2 = A (GPS on events kept 90 days, then cleared).
Inputs: requirements NFR-D1 to NFR-D7, functional design (BR-D rules), earlier resiliency decisions.

## 1. Security patterns

### SP1 Separate partner realm (SECURITY-08, 11, 12)
- Partner access tokens are signed with `JWT_PARTNER_SECRET` and carry `kind = partner`, `sub = partnerId`, `mcp` (must change password). The global `JwtAuthGuard` verifies with `JWT_ACCESS_SECRET`, so a partner token fails on every customer and admin route without any extra code. Partner controllers are marked `@Public()` for the global guard and use `PartnerAuthGuard` instead, which verifies with the partner secret and loads the partner from the database on each request (active check, so deactivation is immediate).
- Fail closed: if `JWT_PARTNER_SECRET` is missing or shorter than 32 characters, the environment schema stops the API at start-up.
- `RolesGuard` already refuses non-admin tokens, so admin routes reject partner tokens twice.

### SP2 Object-level access (SECURITY-08)
- Every partner query takes the partner id from the token, never from the URL or body. The repository method is `findForPartner(jobId, partnerId)` and returns nothing for another partner's job (`404`). There is no repository method that lists jobs without a partner or admin scope.
- Field-level view models: `PartnerJobPreview` (before accept) and `PartnerJobDetail` (after accept) are separate types, so hidden fields cannot be added by accident (BR-D70, BR-D71).
- Admin routes use `@Roles('order_manager')`, settings use `@Roles('super_admin')` (SECURITY-08 function level).
- Public tracking (U8.5) uses only the unguessable token and a different view model.

### SP3 Credentials and brute force (SECURITY-12)
- Password rules: the shared `strongPasswordSchema` (8+, capital, small, symbol, max 128) plus a deny list of common passwords and a check that the password does not contain the partner's mobile number.
- argon2id with the same parameters as customers; a dummy hash is verified when the mobile is unknown, so response time does not reveal which mobiles exist.
- Lockout: 5 failures per mobile in 15 minutes (existing `LockoutService`, kind `partner`), plus route throttle of 10 logins per minute per IP.
- Sessions: access token 15 minutes, refresh 7 days with rotation and reuse detection (revokes the family), cookie `belzo_prt` with `HttpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/partner`. Logout and deactivation revoke the family. Password change revokes the other families.
- No credentials in code: secrets come from the environment (`JWT_PARTNER_SECRET`, `DELIVERY_OTP_PEPPER`); no default values.

### SP4 Delivery OTP protection (SECURITY-11 abuse cases)
- 6 random digits from a cryptographically strong source; HMAC-SHA256 with a server pepper over `jobId:attemptNo:code`; constant-time compare; never returned or logged.
- Abuse cases handled: guessing (5 wrong guesses lock for 15 minutes, per job), SMS pumping (60 s cooldown, 5 sends per attempt, only for a job the partner holds), a partner trying to deliver without the customer (database trigger plus service rule), replaying an old code (new code supersedes the old, 4-hour expiry), admin bypass (no admin delivered action).

### SP5 Input validation (SECURITY-05)
- Every route validates body, query and params with zod schemas from `packages/shared` through the existing `ZodValidationPipe`. All strings have length limits; mobile, pincode, UUID and enum formats are allow-lists; reasons and notes are trimmed and stripped of control characters; free text is stored as text and rendered escaped by React.
- All database access goes through Prisma parameterised queries; the few raw queries (`SELECT ... FOR UPDATE`) use tagged templates with bound parameters.
- Body size limits come from the existing 1 MB JSON limit.

### SP6 Data integrity and audit (SECURITY-13)
- Admin commands write `AdminAuditLog` with actor, action, target, before and after (never passwords or OTPs). Partner moves write `DeliveryEvent`.
- Database triggers (migration 1): events cannot be updated or deleted; final job statuses cannot change; `delivered` needs a verified OTP. The application cannot bypass them with its normal role.
- No deserialisation of untrusted data other than zod-validated JSON.

### SP7 Personal data (DPDP, NFR-D1)
- Partner GPS: last known position on the partner record; GPS on events cleared after 90 days by the cleanup job (NQ2 = A); the event stays.
- Customer data on a job (name, phone, address) is a snapshot used only to deliver; shown to a partner only after accept (BR-D71); not in logs; masked in admin lists except the detail page.
- Logs: mobile numbers masked to the last 4 digits; OTP, password, tokens redacted by the logger's redaction list.

### SP8 Security events and alerting (SECURITY-14, NQ1 = A)
- Fixed log event names: `partner.login.failed`, `partner.login.locked`, `partner.token.reuse`, `partner.access.denied` (404 for a foreign job), `delivery.otp.locked`, `delivery.otp.unlocked`, `delivery.admin.override`.
- Counters for the last 24 hours on the admin delivery dashboard: failed partner logins, locked logins, OTP locks, foreign-job attempts.
- No push alert yet (same MVP stance as the rest of Belzo). Log retention is whatever the platform keeps (see compliance table).

### SP9 Error handling (SECURITY-09, 15)
- The existing global exception filter returns generic messages; no stack traces or internals. Business conflicts use stable error codes (`INVALID_TRANSITION`, `OTP_NOT_VERIFIED`, ...) with plain text.
- Every external call (SMS, Prisma, storage) is inside try/catch with a defined result; failures deny or leave the job unchanged (fail closed).
- Transactions roll back on any error; no locks are held across the SMS call.

## 2. Resiliency patterns

### RP1 Consistency under concurrency (RESILIENCY-10 adjacent)
- One transaction per command, `SELECT ... FOR UPDATE` on the job row, compare-and-set on the old status, partial unique indexes as the last line of defence. A losing racer gets `409` and can retry.
- Idempotent partner commands (BR-D23) make double taps and client retries safe.

### RP2 Dependency isolation (RESILIENCY-10)
- SMS goes through the existing resilient HTTP client (timeout, circuit breaker). The send happens after commit. If it fails: `sendStatus = failed`, job unaffected, partner can resend. Graceful degradation is documented in BR-D33.
- Database access uses the shared Prisma connection pool; the delivery worker uses the same pool settings as the other workers.
- Redis is used only for the queue; commands do not need Redis to succeed. If the enqueue fails after a commit, the failure is logged and the next sweep (timeouts, cleanup) still works because state lives in Postgres.

### RP3 Background jobs (RESILIENCY-05, 06)
- BullMQ repeatable schedulers with fixed ids on queue `delivery`; default job options (5 attempts, exponential backoff) from the shared constants; failed jobs stay in the failed set for inspection.
- Every job is idempotent and bounded (limit 100 per run) so a backlog cannot starve the worker.
- Worker heartbeat row updated each minute; `/health/ready` reports `degraded` for the delivery worker when older than 3 minutes (shallow `/health/live` unchanged). The existing health checks already cover database and Redis (deep check).

### RP4 Observability (RESILIENCY-05)
- Metrics are derived from structured logs and database counts: jobs by status, accept timeouts per day, OTP sends and failures, partner logins, worker heartbeat age. They appear on the admin delivery dashboard (U8.3).
- Traces: N/A (single service).
- Request ids are already attached to every log line by the existing logger.

### RP5 Data protection (RESILIENCY-12)
- New tables are in the existing Postgres and covered by the existing automated backups. Migration 1 is additive; rollback is "redeploy the previous image"; the new tables stay unused and harmless (decision R5 = A).

### RP6 Capacity (RESILIENCY-09)
- Expected load is small (tens of partners, hundreds of jobs a day). Partner polling every 15 seconds for 50 partners is about 3 requests a second; list queries use the index `(partnerId, status)` and return under 300 ms (NFR-D4). No autoscaling change; the platform stays as decided earlier.

## 3. Testing patterns (PBT-01 to PBT-10)

| Rule | How U8.1 meets it |
|---|---|
| PBT-01 | "Testable Properties" table P1 to P14 in `business-rules.md` section 11, each with a category |
| PBT-02 | P11 (mobile format and normalise round-trip) |
| PBT-03 | P1, P2, P5, P6, P7, P8, P9, P12, P13, P14 (invariants) |
| PBT-04 | P10 and P11 (idempotence of partner commands and of normalising) |
| PBT-05 | P3 (transition table as oracle) |
| PBT-06 | P4 (random command sequences against `JobService` with an in-memory repository and a simple model, checked after every step) |
| PBT-07 | Reusable generators in `packages/shared/src/delivery/testing/arbitraries.ts` and `apps/api/src/modules/delivery/testing/arbitraries.ts` |
| PBT-08 | fast-check defaults (shrinking on); the Jest setup prints the seed and path on failure; CI uses the default random seed and logs it |
| PBT-09 | fast-check 3.20.0, already in `apps/api` and `packages/shared` |
| PBT-10 | Example tests pin each key scenario (happy path, reject, timeout, wrong OTP, lockout, max attempts, order cancelled, foreign job 404); shrunk counterexamples become permanent examples |

## 4. Misuse cases considered (SECURITY-11)

1. A partner opens or changes a job that is not theirs: `404`, security event logged.
2. A partner guesses the OTP: lock after 5, admin must clear.
3. A partner marks delivered without the customer: blocked by the OTP rule at service and database level.
4. A deactivated partner keeps a stolen token: refused on the next request (active check) and refresh tokens revoked.
5. Two admins assign the same order: unique index, one gets `409`.
6. A customer cancels the order while it is out: partner commands get `409`, worker cancels the job.
7. Someone floods partner login: lockout per mobile and throttle per IP.
8. Someone tries to use a partner token on customer or admin routes: signature fails.
