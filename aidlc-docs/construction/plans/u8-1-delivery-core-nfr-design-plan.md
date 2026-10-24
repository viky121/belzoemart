# NFR Design Plan: U8.1 Delivery Core

Inputs: requirements NFR-D1 to NFR-D7, U8.1 functional design, the existing code, and the three enabled extensions (Security Baseline, Resiliency Baseline, Property-Based Testing).
NFR Requirements was skipped (stack fixed, NFRs already in the requirements), so the NFRs come from `delivery-module-requirements.md` section 5.

## Plan (checklist)

- [x] Read the NFRs, the functional design and the existing security and resilience building blocks
- [x] Fix PBT-01 in the functional design: "Testable Properties" table with categories added (`business-rules.md` section 11)
- [x] Answer the two questions below
- [x] Generate `aidlc-docs/construction/u8-1-delivery-core/nfr-design/nfr-design-patterns.md`
- [x] Generate `.../nfr-design/logical-components.md`
- [x] Record compliance for SECURITY-01 to 15, RESILIENCY-01 to 15 and PBT-01 to 10
- [x] Present for approval

## Decisions already made earlier that apply here (not asked again)

From `resiliency-decisions-questions.md`: backup and restore DR (hours), single region multi-zone, lightweight change management, GitHub Actions proposal, rollback by redeploying the previous version, rolling deployment, lightweight incident response, resiliency drills deferred to Operations. The new delivery tables sit in the same Postgres, so they are covered by the existing backups.

## Decisions I made (tell me if you disagree)

1. **Partner passwords** follow the customer rules (8+ characters with a capital, a small letter and a symbol, at most 128) plus a short list of common passwords and "contains your own mobile number" are refused. Hashing is argon2id as for customers.
2. **MFA**: not offered to partners in Phase 1 (SECURITY-12 says MFA is mandatory for admin accounts, which already have TOTP, and optional for others). The strong password, lockout, short access tokens and device-bound refresh rotation stand in for it.
3. **Sessions**: access token 15 minutes, refresh token 7 days with rotation and reuse detection, httpOnly + Secure + SameSite=Strict cookie scoped to `/api/v1/partner`.
4. **Rate limits** (per IP unless noted): partner login 10 per minute plus the 5-failures-per-mobile lockout; OTP verify 10 per minute per job; OTP resend limited by the 60 s cooldown and 5 sends; other partner routes use the global 100 per minute.
5. **Logging**: the existing structured logger with request ids; delivery events use fixed event names; mobile numbers are masked (last 4 digits), OTPs, passwords and tokens are never logged (redaction list extended with `code`, `otp`, `password`, `refreshToken`).
6. **Timeouts**: SMS sends go through the resilient HTTP client (timeout and circuit breaker); the send runs after the database transaction commits so a slow SMS never holds a row lock.
7. **Health**: `/health/ready` gains a "delivery worker" check that fails softly (reports `degraded`) when the worker heartbeat is older than 3 minutes.

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question NQ1
Security events (SECURITY-14): repeated partner login failures, OTP lockouts, a partner trying to open someone else's job, an admin clearing an OTP lock. How should you be told about them?

A) They are written as structured log events with fixed names and counted on the admin delivery dashboard ("OTP locks today", "failed partner logins today"). No e-mail or SMS alert yet, like the rest of the MVP (recommended)

B) Same as A, and an e-mail to an ops address (set in delivery settings) when an OTP lock or 5 failed logins happen

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A dab", read as "A sab")

## Question NQ2
Partner GPS points are personal data of your staff (DPDP). How long should they be kept?

A) Keep the last known position on the partner record, and the GPS points on delivery events for 90 days; then the cleanup job clears the coordinates and keeps the event itself (recommended)

B) Keep the GPS points as long as the job exists

C) Do not store GPS on events; keep only the partner's last known position

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A dab", read as "A sab")
