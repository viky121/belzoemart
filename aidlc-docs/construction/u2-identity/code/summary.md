# U2 identity — Code Generation Summary

Delivers authentication, accounts, RBAC, and DPDP data-rights for Belzo eMart. Builds on U1 platform-core.

## What was built

### Data model (`apps/api/prisma/schema.prisma`)
Customer, Address, AdminUser, Role, Permission, RolePermission, AdminUserRole, RefreshToken, OtpRequest,
LoginAttempt, DataRequest (+ enums). Seed creates RBAC permissions/roles, a super_admin, and a test
customer.

### Integrations
- `integrations/sms/` — `SmsProvider` port + `MockSmsProvider` (logs OTP), env-selected.

### Identity services (`apps/api/src/modules/identity/`)
- `token.service.ts` — JWT access tokens + opaque refresh tokens (stored hashed) with single-use rotation
  and reuse detection (family revocation).
- `password.service.ts` — argon2id hashing, fail-closed verify.
- `rbac.logic.ts` (pure) + `rbac.service.ts` — permission resolution (super_admin ⊇ all; union of role
  grants), prototype-safe lookup.
- `otp.service.ts` — hashed 6-digit codes, expiry, bounded attempts.
- `lockout.service.ts` — brute-force lockout (5 failures / 15 min).
- `social-auth.service.ts` — Google verify (dev stub; live at deploy).
- `customer-auth.service.ts` — OTP/email/social orchestration + lockout + token issue.
- `profile.service.ts`, `address.service.ts` (ownership + default-address invariant),
  `pincode.service.ts`.
- `admin-auth.service.ts` — admin login with TOTP MFA (`totp.util.ts`, RFC 6238, no external dep).
- `admin-user.service.ts` — create admin, assign role, enable MFA.
- `data-request.service.ts` + `dpdp.worker.ts` — DPDP export/deletion via BullMQ.

### HTTP layer
- `zod-dto.ts` + `dto.ts` + `common/pipes/zod-validation.pipe.ts` — shared zod schemas validate requests
  (registered globally).
- `common/auth/current-user.decorator.ts`, `refresh-cookie.ts` (httpOnly/secure/sameSite refresh cookie).
- Controllers: `auth` (customer), `admin-auth`, `me` (profile), `addresses`, `dpdp`, `admin-users`
  (`@Roles('super_admin')`). Sensitive routes throttled.
- Wired into `AppModule`; DPDP worker into `WorkerModule`. cookie-parser added.

### Web (`apps/web`)
- `lib/auth-context.tsx` — in-memory access token + auto-refresh on 401.
- Pages: `(shop)/login` (OTP + email), `(shop)/signup`, `(shop)/account` (profile, addresses, DPDP
  export, logout), `admin/login` (with MFA field). `data-testid`s throughout.

## Verification (executed)
- `pnpm install` at root succeeded (argon2 native build OK); `prisma generate` OK.
- **API tests: 28/28 pass** (`token`, `password`, `rbac`, `otp`, `totp`, `roles.guard`, `env.schema`,
  `customer-auth`). **API typecheck: clean.**
- Two real bugs were caught and fixed during verification:
  1. `randomUUID()` template-literal type narrowed `TokenService.issue(familyId)` — fixed by typing the
     param `string`.
  2. RBAC grant lookup inherited `Object.prototype` members for role names like `constructor`/`toString`
     (a property test found this) — fixed with a `hasOwnProperty` guard (authorization-safety fix).
- tsconfig: API now consumes `@belzo/shared` from its built `dist` (shared built first), matching the CI/
  Docker build order.

## Extension compliance (U2)
- **Security**: SECURITY-05 (zod validation on every endpoint), SECURITY-08 (deny-by-default + RBAC +
  IDOR ownership checks), SECURITY-11 (throttling on auth/OTP), SECURITY-12 (argon2id, JWT rotation +
  reuse detection, httpOnly/secure/sameSite refresh cookie, brute-force lockout, admin MFA, no hardcoded
  secrets), SECURITY-15 (fail-closed). No blocking findings.
- **Resiliency**: RESILIENCY-10 (DPDP side-effects decoupled via BullMQ with retries/backoff). No blocking
  findings.
- **PBT**: PBT-02 (JWT + password + money round-trips), PBT-03 (OTP attempts bounded, RBAC union
  invariant), PBT-05 (RBAC super_admin oracle) — all passing. No blocking findings.

## Follow-ups
- Live Google token verification and a DLT-approved SMS adapter are added at deploy (ports already in
  place).
- DPDP deletion currently anonymises the customer + addresses; U5 extends it to retain anonymised order/
  invoice records for legal compliance.
