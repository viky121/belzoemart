# U2 identity — Domain Entities

Technology-agnostic domain model for the identity unit. These map to Prisma models in code generation.
Customers and admin users are kept separate (Application Design decision A6) for a cleaner security
boundary.

## Customer
- `id` (uuid), `phone` (unique, nullable if email-only), `email` (unique, nullable if phone-only),
  `passwordHash` (nullable — OTP-only customers have none), `name`, `gender` (nullable), `dob` (nullable),
  `photoUrl` (nullable), `locale` (`en`|`hi`, default `en`), `status` (`active`|`blocked`),
  `createdAt`, `updatedAt`.
- Invariant: at least one of `phone`/`email` is present.

## Address
- `id`, `customerId` (FK), `label` (`home`|`work`|`other`), `fullName`, `phone`, `line1`, `line2?`,
  `city`, `state`, `pincode`, `isDefault` (bool), timestamps.
- Invariant: at most one default address per customer.

## AdminUser
- `id`, `email` (unique), `passwordHash`, `name`, `mfaSecret` (nullable), `mfaEnabled` (bool),
  `status` (`active`|`disabled`), timestamps.

## Role / Permission (RBAC)
- `Role`: `id`, `name` (unique, one of ADMIN_ROLES), `description`.
- `Permission`: `id`, `key` (e.g. `catalogue.write`), `description`.
- `RolePermission`: join. `AdminUserRole`: join (admin ↔ role).
- `super_admin` implicitly holds every permission.

## Session / RefreshToken
- `id`, `principalId`, `principalKind` (`customer`|`admin`), `tokenHash` (hash of refresh token),
  `familyId` (rotation family), `expiresAt`, `revokedAt` (nullable), `replacedById` (nullable),
  `createdAt`.
- Refresh tokens are single-use; using one issues a new token and revokes the old (rotation).

## OtpRequest
- `id`, `phone`, `codeHash`, `attempts` (int, default 0), `maxAttempts` (default 5), `expiresAt`,
  `consumedAt` (nullable), `createdAt`.

## LoginAttempt (brute-force protection)
- `id`, `identifier` (email/phone), `kind`, `succeeded` (bool), `ip`, `createdAt`.
- Used to count recent failures for lockout.

## DataRequest (DPDP)
- `id`, `customerId`, `type` (`export`|`deletion`), `status` (`pending`|`processing`|`completed`),
  `resultUrl` (nullable, for export), `createdAt`, `completedAt` (nullable).
