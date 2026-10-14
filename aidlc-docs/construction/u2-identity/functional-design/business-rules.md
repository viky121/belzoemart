# U2 identity — Business Rules & Testable Properties

## Authentication rules
- BR-1 OTP: a 6-digit code is generated, hashed, stored with a 5-minute expiry. Verification fails if
  expired, already consumed, or `attempts >= maxAttempts`. Each wrong attempt increments `attempts`.
  A correct code marks the request consumed and issues tokens.
- BR-2 Passwords: hashed with argon2id (SECURITY-12). Minimum 8 chars (enforced by shared schema). Never
  stored or logged in plaintext.
- BR-3 Brute-force (SECURITY-12): after 5 failed login attempts for an identifier within 15 minutes,
  further attempts are locked for 15 minutes (429).
- BR-4 JWT: access token TTL 15m; refresh token TTL 14d. Access token carries `sub`, `kind`, `roles`.
- BR-5 Refresh rotation (SECURITY-12): presenting a refresh token issues a new access+refresh pair and
  revokes the presented token. Re-using an already-revoked token revokes the entire family (reuse
  detection).
- BR-6 Logout: revokes the presented refresh token (and family).
- BR-7 Admin MFA: admins with `mfaEnabled` must supply a valid TOTP code at login (SECURITY-12).

## Authorization rules
- BR-8 Deny-by-default: all endpoints require authentication unless `@Public()`.
- BR-9 RBAC: an admin is authorized for a permission if any assigned role grants it; `super_admin` grants
  all (SECURITY-08).
- BR-10 Object ownership: a customer may only read/modify their own profile/addresses (IDOR prevention,
  SECURITY-08).

## Account & data rules
- BR-11 Address: setting an address `isDefault=true` clears the flag on the customer's other addresses.
- BR-12 Block: a `blocked` customer cannot authenticate.
- BR-13 DPDP export: creates a `DataRequest(type=export)`, enqueues a job that compiles the customer's
  data to a downloadable file (NFR-2.2).
- BR-14 DPDP deletion: creates a `DataRequest(type=deletion)`; on processing, PII is erased/anonymised
  while preserving legally-required order/invoice records (NFR-2.2).

## Testable Properties (PBT-01)

| Property | Category | Rule |
|---|---|---|
| argon2 hash→verify round-trips: `verify(hash(pw), pw) === true` for any valid password | Round-trip (PBT-02) | BR-2 |
| Wrong password never verifies: `verify(hash(pw), other) === false` when `other != pw` | Invariant (PBT-03) | BR-2 |
| OTP `attempts` is monotonic non-decreasing across verify calls and never exceeds `maxAttempts+1` | Invariant (PBT-03) | BR-1 |
| RBAC: `super_admin` authorizes every permission; permission grant = union of role permissions | Invariant/Oracle (PBT-03/05) | BR-9 |
| Refresh rotation: a token verifies at most once (second use is rejected) | Invariant (PBT-03) | BR-5 |
| JWT round-trip: `verify(sign(payload)).sub/kind/roles === payload` | Round-trip (PBT-02) | BR-4 |

Components with no PBT properties: thin controllers and Prisma repositories (integration-tested instead).
