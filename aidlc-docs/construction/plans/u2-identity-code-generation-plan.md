# U2 identity — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds the identity domain to `apps/api`, plus customer auth +
admin auth pages in `apps/web`. Depends on U1 platform-core.

## Unit Context
- **Requirements**: FR-1.1–1.7 (auth, profile, addresses, DPDP), FR-13.1 (RBAC + admin audit hook),
  NFR-1.3/1.4/1.6, NFR-2.2.
- **Business rules**: see `construction/u2-identity/functional-design/business-rules.md`.
- **Depends on**: U1 (config, guards, prisma, redis, queue, logging, error handling).

## Steps

- [ ] Step 1 — Prisma models: Customer, Address, AdminUser, Role, Permission, RolePermission,
  AdminUserRole, RefreshToken, OtpRequest, LoginAttempt, DataRequest. Migration + extend seed (super_admin
  user + roles/permissions + one test customer).
- [ ] Step 2 — Integrations: `SmsProvider` port + `MockSmsProvider` (logs OTP) selected by env.
- [ ] Step 3 — Token service: JWT issue, refresh-token creation/hash, rotation with reuse detection.
  Unit tests + PBT (JWT round-trip, single-use rotation).
- [ ] Step 4 — Password service: argon2 hash/verify wrapper. Unit tests + PBT (hash→verify round-trip,
  wrong-password invariant).
- [ ] Step 5 — RBAC service: permission resolution (union of roles, super_admin implies all). Unit tests
  + PBT (super_admin authorizes all; grant = union).
- [ ] Step 6 — Customer auth: OtpService (request/verify with attempts + expiry), EmailAuthService
  (register/login), SocialAuthService (Google verify — mock in dev), brute-force lockout via
  LoginAttempt. Unit tests (+ PBT for OTP attempts monotonicity).
- [ ] Step 7 — Profile + Address services (CRUD, default-address invariant, pincode resolve stub,
  ownership checks). Unit tests.
- [ ] Step 8 — Admin auth: AdminAuthService (login + TOTP MFA), AdminUserService (create, assign role).
- [ ] Step 9 — DPDP: DataRequestService (export/deletion) + worker processors (compile export file via
  storage port; anonymise on deletion preserving order records).
- [ ] Step 10 — Controllers (REST, zod-validated, Swagger, rate-limited, @Public where needed):
  `auth.controller` (customer), `admin-auth.controller`, `me.controller` (profile), `addresses.controller`,
  `dpdp.controller`. Refresh token set as httpOnly/secure/sameSite cookie.
- [ ] Step 11 — IdentityModule + register in AppModule and WorkerModule (DPDP processors).
- [ ] Step 12 — Web: customer login/signup (OTP + email) pages, profile + addresses pages, admin login
  page; wire to api-client; auth context/session handling via httpOnly cookie + access token in memory.
- [ ] Step 13 — Integration tests (auth flow: request OTP → verify → refresh → logout; email
  register/login; address CRUD ownership).
- [ ] Step 14 — Docs: `construction/u2-identity/code/summary.md`. Verify shared+identity typecheck/tests.

## Testable Properties carried into code (PBT-01 → PBT-02/03/05)
- argon2 hash→verify round-trip; wrong password never verifies.
- OTP attempts monotonic, bounded.
- RBAC super_admin ⊇ all; permission = union of role grants.
- Refresh token single-use (rotation + reuse detection).
- JWT sign→verify round-trip.

## Traceability
FR-1.1 (OTP/email/social) → Steps 3/4/6/10; FR-1.4 (profile) → 7/12; FR-1.5 (addresses) → 7/12;
FR-1.6 (tokenised payments) → hook only (implemented in U4); FR-1.7 + NFR-2.2 (DPDP) → 9/10;
FR-13.1 (RBAC) → 1/5/8.
