# Unit & Property-Based Test Instructions — Belzo eMart

## Run all tests
```bash
pnpm -r test                       # all workspaces
pnpm --filter @belzo/shared test   # shared (money, pricing, orders, wallet, reporting, catalogue)
pnpm --filter @belzo/api test      # api (jest, ts-jest)
```

## Reproducing property-based test failures (fast-check, PBT-08)
fast-check prints a `seed` and shrunk counterexample on failure. Re-run a specific seed:
```bash
# example: jest -t "<test name>"  then set the seed in the property options, or
FASTCHECK_SEED=<seed> pnpm --filter @belzo/shared test
```
Counterexamples discovered during development were converted into permanent example-based tests
(PBT-10): e.g. the money round-half-up pin (`packages/shared/src/money.test.ts`).

## Verified results (this stage)
- **@belzo/shared: 42 tests pass** (7 suites) — money, pricing/tax/coupon, order state machine, wallet
  ledger, reporting/CSV, catalogue helpers.
- **@belzo/api: 45 tests pass** (13 suites) — env validation, RBAC guard, token rotation, argon2,
  RBAC logic, OTP, customer-auth, TOTP, inventory (stateful PBT), product bulk-upsert, order
  transitions/cancel, return refund-clamp, checkout idempotency.

## Property-based coverage (PBT extension)
| Area | Property |
|---|---|
| Money | rupee↔paise round-trip; commutativity; inverse; percent bounds |
| Pricing/Tax | GST split sums to tax; discount ≤ subtotal; grand total ≥ 0; determinism |
| Coupons | percent cap; free-shipping zeroes shipping |
| Inventory | reserve/release round-trip + non-negativity + conservation (stateful) |
| Auth | JWT sign→verify round-trip; refresh single-use; argon2 hash→verify |
| RBAC | union of role grants; super_admin ⊇ all; prototype-safe |
| Orders | transition validity; stateful sequences; invoice-number format; refund clamp |
| Wallet | balance ≥ 0 across sequences; idempotent by ref; ledger integrity |
| Reporting | CSV escaping keeps stable column count; AOV |
