# Design review, round 2 (final re-run): Belzo eMart Android app + backend enablement (design.md, iteration 4)

Reviewer: design-review step. Document review only; nothing implemented. Each §18 claim was checked against the real code under `apps/api`, `apps/web` and `packages/shared`. This replaces the previous `design-review-r2.md`, which reviewed iteration 3 (0 HIGH, 2 MEDIUM, 10 NIT).

Extra checks run this round:

- `pnpm exec tsc --noEmit -p tsconfig.json --noUncheckedIndexedAccess` in `apps/web`, filtered to the three tests §10 moves.
- Direct reads of `payment.service.ts`, `checkout.controller.ts`, `checkout.service.ts`, `order.service.ts`, `return.service.ts`, `inventory.service.ts` / `inventory.logic.ts`, `payment.provider.ts`, `schema.prisma` (`Payment`, `Order.idempotencyKey`), `all-exceptions.filter.ts`, `ci.yml`, the web checkout page, `order-sections.tsx`, `data-request.service.ts`, and the shared/base/web tsconfigs and shared jest config.

**Verdict: APPROVED** (0 HIGH, 0 MEDIUM, 13 NIT).

## Summary

Both remaining MEDIUMs from the previous run are fixed in the sections a coder implements from, and every round-1 HIGH/MEDIUM is resolved.

- **Round-1 HIGH (replayed `place` resets a captured payment / duplicate gateway orders).** §7 A7 now replaces the read-then-update with an atomic `payment.updateMany({ where: { id, status: 'created' }, data: { status: 'pending' } })` claim. `createOrder` runs only after a won claim, the later `update` writes only `providerOrderId`, and a `createOrder` failure reverts the claim under `providerOrderId: null`. Sequential and concurrent replays both see `count: 0` and return `{ provider, clientConfig: {} }` without a gateway call or a status write. Tests cover all non-`created` statuses, concurrent `Promise.all`, rejection-revert, and the reused-mock controller case.
- **Round-1 #2 (moved `order-view.test.ts`).** §10 now lists all four flagged accesses including line 250, drops "no other edit", and sets shared `test` + `typecheck` as acceptance. Confirmed with `tsc`.

What remains are NITs: the backlogged items from earlier rounds, plus three small new observations (a pre-existing reserve/capture race reachable only with online payment on, an orphan-pending edge in the concurrent-revert path, and a stale status line).

## Round-1 HIGH/MEDIUM status (verified against code)

| R1 # | Sev | Status | Evidence |
|---|---|---|---|
| 1 | HIGH | **Resolved** | See "HIGH deep-check" below |
| 2 | MED | **Resolved** | `tsc --noUncheckedIndexedAccess` reports exactly `order-view.test.ts` (147,12), (152,12), (170,12) TS2532 and (250,35), (250,78) TS2322; nothing in `format-inr.test.ts` or `price-breakup.test.ts`. §10 lists all four lines with the exact `!` edits. `tsconfig.base.json` sets `noUncheckedIndexedAccess: true`; `packages/shared/tsconfig.json` extends it and excludes `**/*.test.ts`; shared jest is `preset: 'ts-jest'` with no `isolatedModules`/diagnostics override, so ts-jest is the type gate, as §10 says. The moved tests use no DOM globals, so shared's `lib: ["ES2022"]` is fine |
| 3 | MED | Resolved | `order-sections.tsx` lines 9–10 import `formatDate`, `formatDateTime` from `@/lib/order-view`; §10 adds `export { formatDate, formatDateTime } from '@belzo/shared'` and a `git diff --stat -- apps/web/src/app` acceptance check |
| 4 | MED | Resolved | §6.6 `unavailable` → exactly one `POST /orders/:id/cancel`; `order.service.ts › cancel` gates on `canCustomerCancel` (pending allowed), releases stock, refunds only `captured`, and has no coupon handling (recorded in §14). Copy never mentions the website |
| 5 | MED | Resolved | §2.1 typed params; §11 select mode with `popTo('Checkout', { addressId }, { merge: true })`, selection order param → default → first, zero-address EmptyState, no-method banner, single-method preselect; `checkout-selection.test.ts` |
| 6 | MED | Resolved | `ci.yml` today: `build-test` on Node 20.14.0 with `pnpm typecheck/lint/test/build`, `PNPM_VERSION` in top-level `env`. §8.4 replaces the three run lines with `pnpm -r --filter '!@belzo/mobile' …` and adds a `mobile` job on `MOBILE_NODE_VERSION: '22.13.0'`. Mobile has no `build` script, so `pnpm build` skips it |
| 7 | MED | Resolved | §16.1 `metro-config.test.ts`; §16.2 step 7 renames `packages/shared/dist`, exports with `--source-maps`, asserts `packages/shared/src/index.ts` and no `dist`, always restores |
| 8 | MED | Resolved | `data-request.service.ts:94` is `Buffer.from(payload).toString('base64')` (UTF-8 bytes). §11 `decodeExport` percent-decodes the bytes, rejects other prefixes, catches `atob`/`URIError`; round-trip test with `राम ₹` |
| 9 | MED | Resolved | §13.1 `onlinePaymentEnabled: env.EXPO_PUBLIC_ONLINE_PAYMENT === 'on'` in both variants; LIVE-store warning in §0 and README; `app-config.test.ts` covers both defaults |

Round-2 MEDIUMs from the earlier runs (#10 §18 scope, #11 A8, #12 `.easignore`) stay resolved; nothing in those sections changed in iteration 4.

## HIGH deep-check: replayed `POST /checkout/place`

Code facts:

- `checkout.controller.ts › place` calls `this.payments.initiate(result.orderId)` for every `dto.paymentMethod !== 'cod'`, including `reused: true`, and uses only `init.clientConfig`. It is the only caller of `initiate` in `apps/api/src`.
- `checkout.service.ts › place` returns `reused: true` from the `findUnique({ where: { idempotencyKey } })` branch before any address, stock, coupon or payment work. A fresh non-COD payment is created `status: 'created'`; COD `pending`.
- `Order.idempotencyKey` is `@unique`, so two first-time requests with the same key cannot both create an order. The loser's Prisma P2002 is not mapped by `AllExceptionsFilter`, so it is a 500, which §6.6 classifies as ambiguous and retries with the same key → `reused: true`. No duplicate orders.
- `payment.service.ts › initiate` today: `createOrder` then an unconditional `update({ providerOrderId, status: 'pending' })`, then the mock auto-capture through `handleWebhook` → `markCaptured`, which returns early unless the order is `pending`.
- `Payment.providerOrderId` is `String?`; `PaymentStatus` has `created | pending | captured | failed | refunded | partially_refunded`.

A7 as written in §7:

- **Sequential replay after capture:** the claim matches 0 rows (`captured`), so return `{}`; no `createOrder`, no write. The row stays `captured` with its original `providerOrderId`. `OrderService.cancel` (`status === 'captured'`), `ReturnService` (`SETTLED_PAYMENT_STATUSES`, `captured` lookup) and `PaymentService.refund` (`status: 'captured'`) keep working.
- **Concurrent replay:** a single conditional `UPDATE … WHERE status = 'created'` has exactly one winner. Only the winner calls `createOrder`, so there is one gateway order. After the claim, `initiate` never writes `status` again, so a loser cannot flip `captured` back to `pending`.
- **Committed `place` whose `initiate` never ran:** the row is still `created`, so the retry initiates normally.
- **`createOrder` rejects:** the revert `where { status: 'pending', providerOrderId: null }` restores `created`, so a later replay can initiate. The error is rethrown as a 5xx.
- **Refunded / partially refunded / failed:** the claim matches 0 rows; untouched.
- **COD:** the branch is unchanged and placed before the claim.
- **Compile-level:** `Awaited<ReturnType<PaymentProvider['createOrder']>>` resolves (`createOrder(amountPaise, receipt): Promise<ProviderOrder>`). `let providerOrder` assigned in `try` with a rethrowing `catch` is definitely assigned afterwards. `payment.provider` (`PaymentProviderKind`) is assignable to the `string` return type.
- **Web:** `checkout/page.tsx` generates `safeUuid()` per click, so the web never replays a key; a fresh web/Razorpay `place` behaves exactly as today.

Conclusion: a reused POST `/checkout/place` can no longer re-initiate or reset a captured payment, and cannot create a second gateway order. The round-1 HIGH is resolved.

---

## Findings

All findings are NIT. None blocks.

### 1. NIT: Pre-existing reserve/capture race on a concurrent reused **online** `place` (new observation; unreachable by default)

**Where:** §6.6 "A reused key is safe on the server too … also holds when a timed-out request 1 is still running"; `checkout.service.ts › place` reserves stock **after** the order transaction commits; `payment.service.ts › markCaptured` calls `inventory.confirmSale`.

**Problem:** if request 2 (same key) arrives while request 1 sits between the order commit and the end of its `inventory.reserve` loop, request 2 sees `reused: true` and its `initiate` can win the claim. With `mock` it auto-captures and runs `confirmSale` before request 1 has reserved. `confirmSale` is bounded by `reserved` (`inventory.logic.ts`), so it consumes nothing (or another order's reservation). Request 1's later `reserve` then leaves units reserved indefinitely. A7 does not cause this and does not make it worse; it exists today for any same-key overlap. The mobile client is the first that sends same-key overlaps, but only for online orders, and online payment is off by default in every variant (§13.1). COD replays never call `initiate`.

**Fix:** add one §14 row: "Phase 5: move stock reservation inside the order transaction (or gate `initiate` on reservation completion) before enabling online payment in the app."

### 2. NIT: A concurrent loser can return success while the winner's `createOrder` later fails

**Where:** §7 A7 failure handling.

**Problem:** the loser returns `{}` (2xx). The mobile client settles the attempt as definitive and goes to OrderConfirmation. If the winner's `createOrder` then rejects, the claim is reverted to `created`, but no request will replay the key, so the order stays `pending` until the 12-poll "still processing" state. Mock `createOrder` is local and does not fail, so this is Phase-5-only.

**Fix:** fold it into the §14 Phase-5 Razorpay note ("a pending/created payment after a lost claim needs the Phase-5 retry-payment route or expiry job").

### 3. NIT: Status line is stale

**Where:** line 4 says "iteration 3. Revised against … (1 HIGH, 11 MEDIUM, 7 NIT)", while §18 describes iteration 4 against the 0 HIGH / 2 MEDIUM re-run.

**Fix:** "Status: iteration 4. Revised against the round-2 re-run (0 HIGH, 2 MEDIUM, 10 NIT)."

### 4. NIT: §6.6 step 4 still uses `qk.cart(id)` (backlogged R2 #13)

**Fix:** `invalidateQueries({ queryKey: qk.cart('customer') })`.

### 5. NIT: §6.4 pseudo-code lists step "0" after step 1 (backlogged R2 #14)

**Fix:** move the "(caller) parse" line above step 1.

### 6. NIT: `.dockerignore` contents conflict between §0 and §8.3 (backlogged R2 #18 / R1 #17)

§0 says `apps/mobile` + `**/node_modules`; §8.3 item 1 says "exactly `apps/mobile` … No other entries".

**Fix:** list both entries in §8.3.

### 7. NIT: §17 step-0 baseline list omits `apps/api/src/modules/identity/token.service.spec.ts` (backlogged R1 #12 / R2 #16)

**Fix:** add it to the list.

### 8. NIT: Pin `@babel/runtime` explicitly (backlogged R1 #13 / R2 #17)

`@shopify/flash-list@2.0.2` has a non-optional `@babel/runtime` peer.

**Fix:** add it as a direct dependency pinned to the resolved 7.x version.

### 9. NIT: Phase-5 carry-overs not in §14 (backlogged R1 #18, #20 / R2 #19)

**Fix:** record the whole-line `removePurchased` refinement and the optional principal-kind check in `TokenService.rotate`.

### 10. NIT: Document that A7 deliberately freezes a `pending` payment whose mock auto-capture failed

**Fix:** add one sentence to A7 "Web effect" or §14, so nobody later "fixes" A7 by letting `pending` through.

### 11. NIT: Auto-cancel copy may lead to a coupon rejection

**Fix:** append "(any coupon used on the cancelled order may not be reusable)" to the `payment_unavailable` copy, or note it in §14.

### 12. NIT: Node 20.14 `pnpm install --frozen-lockfile` with mobile importers is assumed warnings-only

`apps/mobile/package.json` declares no `engines`, so pnpm's default `engine-strict=false` should only warn for RN/RNTL engines. This is **UNVERIFIED** until a lockfile exists.

**Fix:** add it to §15, or run the install under Node 20.14 in §16.2 step 6 if `nvm`/`fnm` is available.

### 13. NIT: §2.5 "only bound is the 10 s refresh timeout" ignores unbounded local I/O (backlogged R2 #15)

**Fix:** say that hydrate and SecureStore reads are local and unbounded.

---

## Verified assumptions

- `checkout.controller.ts › place` calls `initiate` for all non-COD requests, including reused; it is the only caller; the response uses only `init.clientConfig`.
- `checkout.service.ts › place` short-circuits on an existing `idempotencyKey` before any side effect. Non-COD payments are created `created`, COD `pending`. Stock reservation and coupon redemption run after the order transaction.
- `Order.idempotencyKey` is `@unique`; `Payment.providerOrderId` is `String?`; `PaymentStatus` is the six values above.
- `payment.service.ts › initiate` has no status guard today and does an unconditional `update({ providerOrderId, status: 'pending' })`; `markCaptured`/`markFailed` return early unless the order is `pending`; `refund` requires `captured`.
- `PaymentProvider.createOrder(amountPaise, receipt): Promise<ProviderOrder>`; `kind: 'razorpay' | 'mock'`.
- `order.service.ts › cancel` refunds only `captured` and has no coupon handling; `return.service.ts` uses `SETTLED_PAYMENT_STATUSES = ['captured','refunded','partially_refunded']` and the `captured` payment for `refund_source`.
- `AllExceptionsFilter` maps only `ZodError` and `HttpException`; everything else is a 500 logged at `error`.
- Web checkout uses `safeUuid()` per click.
- `tsc --noUncheckedIndexedAccess` errors are exactly the five §10 lists; the base/shared/web tsconfigs and the shared jest config are as §10 describes.
- `order-sections.tsx` imports `formatDate`/`formatDateTime` from `@/lib/order-view`.
- `data-request.service.ts:94` base64-encodes UTF-8 bytes.
- `ci.yml` matches §8.4's description of the current job.

## Unverified or wrong assumptions

- **Wrong (minor, NIT 1):** §6.6 implies a concurrent reused online `place` is fully safe. Payment state and gateway orders are; stock reservation ordering is not (pre-existing, unreachable with online payment off).
- **Wrong (minor, NIT 6):** §8.3's `.dockerignore` contents vs §0.
- **Unverified (NIT 12):** Node 20.14 install of mobile's importers is warnings-only.
- **Unverified (design-tagged, accepted):** Caddy XFF replacement, Hermes `Intl`/`atob`, RN `boxShadow`, multipart `file://` upload, `eslint-config-expo` legacy config, EAS `.easignore` handling, the partial-importer `pnpm install`, and live production env values. Each has a stated verification step or owner check.
