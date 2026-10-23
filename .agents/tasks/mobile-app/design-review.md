# Design review: Belzo eMart Android app + backend enablement (design.md, iteration 1)

Reviewer: design-review step. This is a document review only. No builds or test suites were run.
I checked the claims against the repo source, `git ls-files`, the npm registry (`npm view`) and `unpkg.com/expo@57.0.27/bundledNativeModules.json`.

**Verdict: CHANGES_REQUESTED** (1 HIGH, 8 MEDIUM, 11 NIT).

The design is detailed and mostly sound:

- Every pinned version exists.
- The six backend changes match the real code shapes.
- Docker isolation follows from how the Dockerfiles are written.
- Push and Razorpay are honest stubs.

What blocks it:

- One backend data-integrity bug. The design's own checkout retry strategy triggers it routinely, and the design calls that path "a no-op".
- Several smaller specification errors that would break the build, or would quietly ship wrong behaviour if the coder follows the text literally.

---

## Findings

### 1. HIGH: Idempotent `place` retries corrupt the payment record (initiate re-runs on `reused:true`)

**Where:** §6.6, step 3 "Ambiguous … Retrying reuses the same key"; §7 A4 "Replay safety: The controller still calls `initiate` on reuse, which reaches `markCaptured`, and that is a no-op".

**Problem.** `CheckoutController.place` (`checkout.controller.ts`) calls `this.payments.initiate(result.orderId)` for every non-COD request, including `reused: true`. `PaymentService.initiate` (`payment.service.ts`) then:

1. calls `provider.createOrder` again, and
2. runs `payment.update({ data: { providerOrderId: <new>, status: 'pending' } })` before the mock webhook.

`markCaptured` is a no-op, but the update is not. The captured payment row is flipped back to `pending` with a new `providerOrderId`. As a result:

- **Cancelling a confirmed prepaid order skips the refund silently.** `order.service.ts:223` looks for `p.status === 'captured'` and finds nothing.
- **`refund_source` returns are skipped too** (`return.service.ts:237`).
- **Payment info on screen is wrong.** OrderDetail `paymentSummary` shows "pending" for a paid order.
- **With Razorpay (Phase 5), a real capture webhook for the original gateway order matches no payment.** It is logged "no matching payment", so money is taken and the order is never confirmed.

The web hits this only on a double-submit. The mobile design deliberately retries with the same key after every timeout, network error or 5xx, so the bug becomes routine.

**Fix.** Add a seventh small, web-compatible backend change (A7) and spec it:

```ts
// payment.service.ts › initiate, right after `if (payment.provider === 'cod') …`
if (payment.status !== 'created') {
  // Already initiated (or captured/failed/refunded): never create a second gateway
  // order or touch the row on an idempotent replay.
  return { provider: payment.provider, clientConfig: {} };
}
```

Tests, in `payment.service.spec.ts`:

- `initiate` on a `captured` payment does not call `provider.createOrder` or `payment.update`, and returns `clientConfig: {}`.
- On a `created` payment, behaviour is unchanged.

Also add a `checkout.controller.spec.ts` case: a reused mock order keeps its payment `captured`.

Note for Phase 5: re-opening Razorpay for a reused `pending` order then needs the stored `providerOrderId` plus key. Record that in §14.

---

### 2. MEDIUM: Moved `order-view.test.ts` will not compile under shared's `noUncheckedIndexedAccess`

**Where:** §10 Tests, "Rewrite only their import lines … assertions are unchanged".

**Problem.**

- `packages/shared/tsconfig.json` extends `tsconfig.base.json`, which sets `noUncheckedIndexedAccess: true`.
- Shared's ts-jest type-checks test files. The existing shared tests use `groups[0]?.…` and `res.shipments[0]!` for exactly this reason (`bulk-sheet.test.ts:362`, `order-tracking.test.ts:59`).
- `apps/web/tsconfig.json` does **not** set it. `apps/web/src/lib/order-view.test.ts` lines 147, 152 and 170 (`steps[0].at`, `withInvoice[1].at`, `steps[2].at`) will fail with TS2532 once the file is moved.

**Fix.** Pick one and state it in §10:

- (a) Allow the moved tests to add `!` on indexed accesses (for example `steps[0]!.at`), with no change to the asserted values. Or:
- (b) Leave `order-view.test.ts` in `apps/web`, where it then exercises the re-export.

Recommendation: (a), so the shared module owns its tests.

---

### 3. MEDIUM: The web `lib/order-view.ts` re-export list omits `formatDate` and `formatDateTime`

**Where:** §10. "`lib/order-view.ts` → an explicit named re-export list of every symbol in the table". The table's `order-view.ts` row deliberately excludes `formatDate` and `formatDateTime`, which it moves to `format.ts`.

**Problem.** `apps/web/src/app/(shop)/orders/[id]/order-sections.tsx` (lines 9–11) imports `formatDate` and `formatDateTime` from `@/lib/order-view`. Following the list literally breaks the web build. It also contradicts the design's own promise that "no web page or component file changes".

**Fix.** State that `lib/order-view.ts` re-exports the table row's symbols **plus** `formatDate` and `formatDateTime`:

```ts
export { formatDate, formatDateTime } from '@belzo/shared';
```

Add an acceptance check: `pnpm --filter @belzo/web typecheck` passes with **zero** edits under `apps/web/src/app/**`.

---

### 4. MEDIUM: The Razorpay-stub "unavailable" path strands a real order and gives false recovery advice

**Where:** §6.6 step 4 (`unavailable` → "Your order is awaiting payment; contact support or pay on the website.") and §6.7.

**Problem.** When `place` succeeds with `provider: 'razorpay'` (owner flips `PAYMENT_PROVIDER=live` while any build has online payment on), the app has already done all of this:

- created a `pending` order,
- reserved stock (`inventory.reserve`),
- redeemed the coupon.

Then the stub returns `unavailable`. The proposed copy is factually wrong: the website **cannot** pay for an existing pending order. Phase 1 §3 confirms there is no retry-payment endpoint and no unpaid-order expiry job, so the stock stays reserved indefinitely. The stub itself is honest (not faked), but its side effects are left dangling.

**Fix.** Specify the cleanup and the copy:

- On `unavailable`, the app immediately calls `POST /orders/:id/cancel { reason: 'Online payment unavailable in app' }`. A customer may cancel while the order is `pending` (shared `canCustomerCancel`); this releases stock, and no capture means no refund.
- It then shows OrderConfirmation with `notice: 'payment_unavailable'` and the text "Online payment isn't available in this app version yet. We cancelled this order and no money was taken. Please place it again with Cash on Delivery."
- If the cancel call itself fails, fall back to "Contact support with order #<shortOrderId>". Never say "pay on the website".
- Add a unit test for the adapter-outcome handler: `unavailable` triggers exactly one cancel call.
- Record in §14 that coupon redemption is not reversed by cancel, if that is the case (UNVERIFIED; check `order.service.ts › cancel`).

---

### 5. MEDIUM: Checkout's address and payment selection flow is underspecified and inconsistent

**Where:**

- §2.1: `Checkout [auth]` has no params; `AddressForm { addressId? }`; `Addresses { selectForCheckout? }`.
- §11 Addresses: `navigation.navigate('Checkout', { addressId })` with `merge: true`.
- §11 Checkout.

**Problems.**

1. The `Checkout` route is declared with no params, but it is navigated to with `{ addressId }`.
2. Selecting an **existing** address while `Addresses` is in `selectForCheckout` mode is unspecified. Only "the new address id" is covered.
3. `AddressForm` has no way to know it is in select mode, because its params lack the flag.
4. Two empty or blocked cases are unspecified:
   - The customer has **zero** addresses.
   - **No payment method is available.** This is the production default: online payment is off, so it happens whenever the admin sets `payment.codEnabled=false`. The checkout would have no payment option and no message.

**Fix.** Spec the following:

```ts
Checkout: { addressId?: string } | undefined;
Addresses: { selectForCheckout?: boolean } | undefined;
AddressForm: { addressId?: string; selectForCheckout?: boolean } | undefined;
```

- In `Addresses` with `selectForCheckout`, tapping an `AddressCard` runs `navigation.popTo('Checkout', { addressId: a.id }, { merge: true })`. `popTo` is React Navigation 7.
- `AddressForm` with `selectForCheckout`: on a successful create, run `navigation.popTo('Checkout', { addressId: created.id }, { merge: true })`.
- In `Checkout`, the selected address is `route.params?.addressId`, else the default address, else the first one.
- With zero addresses, show an inline EmptyState "Add a delivery address" whose button opens `AddressForm { selectForCheckout: true }`. Place stays disabled.
- When `!preview.codEnabled && !extra.onlinePaymentEnabled`, show the banner "No payment method is available right now. Please try again later." Place stays disabled. When only one method is available, preselect it.

---

### 6. MEDIUM: CI will start failing because root recursive scripts now include mobile on Node 20.14

**Where:** §8.4: "CI (`.github/workflows/ci.yml`) is not modified" and "The root `pnpm -r typecheck`, `lint` and `test` include mobile".

**Problem.**

- CI pins `NODE_VERSION: '20.14.0'` and runs `pnpm typecheck`, `pnpm lint` and `pnpm test`, which are `pnpm -r …`.
- `@testing-library/react-native@14.1.0` declares `engines.node: "^22.13.0 || >=24"`, and `react-native@0.86.3` declares `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25` (both verified with `npm view`).
- Adding `apps/mobile` with a `test` script therefore makes the existing CI job run jest-expo/RNTL on an unsupported Node. That regresses working CI.

CI is dormant today (it triggers on `main`, while the local branch is `master` and there is no remote), but the brief says not to break existing working functionality, and it will bite as soon as a remote is added.

**Fix.** Change CI in the same commit as the mobile scaffold:

- Make the existing job's steps run with `--filter '!@belzo/mobile'`, for example `pnpm -r --filter '!@belzo/mobile' test`, or add `typecheck:server` style root scripts.
- Add a separate `mobile` job on Node `22.13.0` (pinned, matching the SECURITY-10 style) that runs `pnpm --filter @belzo/mobile typecheck lint test`.
- The Dockerfiles stay on 20.14.0 and are unaffected.
- If the orchestrator forbids touching CI, at minimum list this as a known regression in `phase2-4-report.md` with the exact patch.

---

### 7. MEDIUM: Metro "shared from source" could be falsely verified against a stale `packages/shared/dist`

**Where:** §8.2 (custom `resolveRequest`) and §16.2 step 7 (`expo export` is the only check; §15 item 3).

**Problem.**

- `packages/shared/dist/` **exists locally**. It is gitignored build output from an earlier build.
- pnpm links `apps/mobile/node_modules/@belzo/shared`, whose `package.json` `main` is `dist/index.js`.
- If Expo's resolver chain doesn't consult the custom `resolveRequest` (or the tsconfig-paths mapping) before node_modules, a local `expo export` silently bundles the stale CommonJS dist. Metro does not validate CJS named exports at bundle time, and the new helpers would just be `undefined` at runtime.
- The check would then pass here and fail on EAS, where no dist exists.

**Fix.** Make the verification conclusive:

1. Before `expo export`, rename `packages/shared/dist` to `dist.verify-bak`. Restore it afterwards, or rebuild with `pnpm --filter @belzo/shared build`.
2. Assert that the exported bundle's source map lists `packages/shared/src/index.ts`. `--source-maps` is required; grep the `.map`.
3. Add a tiny Jest test that `require('../metro.config.js').resolver.resolveRequest(ctx, '@belzo/shared', 'android')` returns `{ type: 'sourceFile', filePath: …/packages/shared/src/index.ts }`.

Record all three in §16.2.

---

### 8. MEDIUM: DataExportView's `atob` decoding garbles any non-ASCII personal data

**Where:** §11 PrivacyData: "decodes `resultUrl` (`data:application/json;base64,…` via `atob`…)".

**Problem.** `DataRequestService.processExport` encodes `Buffer.from(payload).toString('base64')`, which is UTF-8 bytes. `atob` returns a binary (Latin-1) string, so names, addresses or landmarks in Devanagari (the app explicitly supports Hindi product text) or symbols like "₹" render as mojibake. A data-rights export that corrupts the user's own data is a correctness bug.

**Fix.** Specify a pure-JS UTF-8 decode, which is testable in Jest and has no Hermes `TextDecoder` dependency:

```ts
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  return decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}
```

- Add a unit test: the round-trip of `{"name":"राम ₹"}` encoded by `Buffer.from(…).toString('base64')` returns the original text.
- Reject `resultUrl` values that don't start with `data:application/json;base64,` and show "Export format not supported" instead.

---

### 9. MEDIUM: Dev and preview builds default to the production store with mock "online" orders auto-confirmed

**Where:** §13.1 (`apiBaseUrl` dev default `http://13.48.85.9`; `onlinePaymentEnabled` in dev = `env.EXPO_PUBLIC_ONLINE_PAYMENT !== 'off'`, i.e. **on**) and §13.2 (preview APK to testers).

**Problem.**

- `13.48.85.9` is the live production host (Phase 1 §1).
- With `PAYMENT_PROVIDER=mock`, every tester's "UPI / Card" order is auto-captured inside `place`. That sets the order to `confirmed`, converts the stock reservation to a sale, and enqueues `shipments`, `invoices` and `notifications` jobs.
- If `SHIPPING_PROVIDER` is live (UNVERIFIED), that creates real Shiprocket shipments for orders nobody paid for.
- The design never warns about this. It also makes the faked-payment path the default in every tester build, which sits awkwardly with "online payment is out of scope / stubbed".

**Fix.**

- Make the dev default the same as production: `onlinePaymentEnabled: env.EXPO_PUBLIC_ONLINE_PAYMENT === 'on'` for both variants. A developer opts in explicitly.
- Add a README and phase-report warning: "Dev/preview builds talk to the LIVE store. Orders you place are real orders in the admin panel (COD orders stay pending until an admin acts). Do not place test orders without telling the owner."
- Keep `BELZO`-style env override documentation for pointing a dev build at a local API (`http://10.0.2.2:4000`).

---

### 10. NIT: `OrderConfirmation` params don't include `notice`

**Where:** §2.1 has `{ orderId, provider }`, but §6.6 passes `notice: 'payment_unavailable'`, plus an implied "payment not completed" notice.

**Fix.**

```ts
OrderConfirmation: { orderId: string; provider: string; notice?: 'payment_unavailable' | 'payment_incomplete' };
```

### 11. NIT: The cart query key identity is undefined during boot

**Where:** §6.2 `cart(identity)` with "identity = customerId or 'guest'", and §6.3 `useSessionStore.customer` (null until `/me` loads after a boot refresh).

**Fix.** Use `identity = session.status === 'authenticated' ? 'customer' : 'guest'`. That is enough, because `queryClient.clear()` already runs on every identity change. Alternatively, define the rule explicitly.

Also add `CustomerProfile` (used in §4.1 for `/me`) to the §4.3 type list.

### 12. NIT: The baseline-commit list misses `token.service.spec.ts`

**Where:** §17 step 0. `apps/api/src/modules/identity/token.service.spec.ts` is untracked (verified with `git ls-files --error-unmatch`), and A2 modifies it.

**Fix.** Add it to the step-0 list. The planner's re-check would catch it, but the list should be right.

### 13. NIT: Pin `@babel/runtime` explicitly

**Where:** §12 relies on `auto-install-peers` for Babel packages.

`@shopify/flash-list@2.0.2` has a **non-optional** peer `@babel/runtime: "*"`. babel-preset-expo lists it as an optional peer and injects helper imports when it is resolvable. Shared source compiled from `packages/shared/src` must also resolve those helpers through `nodeModulesPaths`.

**Fix.** Add `@babel/runtime` as a direct `apps/mobile` dependency, pinned to the exact 7.x version pnpm resolves (never 8.x).

### 14. NIT: ImageViewer behaviour is unspecified

**Where:** §2.1 and §11.

Without gesture-handler or reanimated, which the design deliberately excludes, Android `ScrollView` has no pinch zoom.

**Fix.** State "a horizontal paging `FlatList` of `RemoteImage` with `contentFit="contain"`, a page indicator and a close button; no pinch-zoom in v1". That keeps the coder from adding gesture-handler.

### 15. NIT: Boot can exceed the stated 10 s bound

**Where:** §2.5 ("the only bound is the refresh request's 10 s timeout") versus §5.3 `doRefresh` with `retry429: true` (up to 2 × Retry-After ≤ 10 s).

**Fix.** Use `retry429: false` for the boot-time refresh, so a 429 keeps the token and the session stays authenticated with a lazy retry.

### 16. NIT: EAS profile details

- Add `"environment": "production"` (and `"preview"` / `"development"`) to the `eas.json` profiles, so EAS dashboard variables such as `EXPO_PUBLIC_API_BASE_URL` are present when the config is evaluated. Otherwise `app.config.ts` throws for production (UNVERIFIED against eas-cli 24).
- Consider an `apps/mobile/.easignore`, or a root one per EAS monorepo rules, that excludes `apps/api`, `apps/web`, `.agents`, `aidlc-docs` and `infra`, and repeats every root `.gitignore` pattern (`.env`, `*.pem`, …). pnpm then skips the absent importers, exactly as in Docker, and EAS never installs argon2 or prisma. If one is added, verify that `Belzo-key.pem` and `.env` are excluded.

### 17. NIT: The local `docker build` check (§8.3 c) would not represent the server

The root has no `.dockerignore` today, and the new one excludes only `apps/mobile`. A local `docker build -f apps/api/Dockerfile .` would therefore send this Windows host's `node_modules` into `COPY . .`, which the server never sees because the tarball excludes `node_modules`.

**Fix.** Either also add `**/node_modules` to `.dockerignore` (safe: the server context never contains them), or drop (c) and rely on (a) and (b).

### 18. NIT: A4 online path deletes the whole line even if the cart changed after `place`

`removePurchased` in `markCaptured` deletes the line for each ordered variant. With asynchronous Razorpay capture (Phase 5), a customer who adds more of the same variant between `place` and capture loses those extra units.

**Fix.** Acceptable for now. Note it in §14 as a Phase 5 refinement: decrement by the ordered quantity and delete only if the result is ≤ 0.

### 19. NIT: "Move to cart" uses a two-request workaround when the service already supports it

`CartService.saveForLater(ref, variantId, saved = true)` already accepts `saved=false`. Only the controller hardcodes `true`.

**Fix.** Either add a 3-line additive endpoint, `POST /cart/items/:variantId/move-to-cart` → `saveForLater(ref, id, false)`, with a spec (web-compatible), or keep the workaround and record that the fix is trivial.

### 20. NIT: Customer refresh accepts admin refresh tokens (pre-existing, adjacent to A2)

`CustomerAuthService.refresh` → `TokenService.rotate` rotates any principal kind, so the new body path also accepts an admin token. A2 already edits `rotate`.

**Fix.** Consider passing an expected kind, for example `rotate(token, undefined, 'customer')`, and rejecting a mismatch with 401. Optional.

### 21. NIT: Deploy ordering

A mobile build parses `mobileAuthResponseSchema`, which requires `refreshToken`. Against a backend without A1, every login fails with a parse error.

**Fix.** State in the README and report: "Deploy backend A1 before distributing any build." The client could also map a missing `refreshToken` to the message "This app needs a newer server version".

---

## Verified assumptions

- **Auth controller (A1).** `auth.controller.ts`: `login` already has `@Req()`; `verifyOtp`, `register` and `google` do not. `refresh` and `logout` read the `belzo_rt` cookie through `readRefreshCookie(req[, false])`. `CustomerAuthService.refresh(token)` returns `{accessToken, refreshToken, expiresIn}`, and `logout(token)` revokes the family.
- **Validation errors.** `AllExceptionsFilter` maps a raw `ZodError` thrown inside a handler to 400 `ValidationError` with "path: msg" segments. So in-handler `mobileRefreshSchema.parse` behaves as designed, and `fieldErrorsFrom` matches the format.
- **Web refresh and logout are unaffected.** The web calls `/auth/refresh` and `/auth/logout` with no body and no custom header (`apps/web/src/lib/auth-context.tsx`, `api-client.ts`). Its refresh failures are caught and treated as logged out, so a 403 for blocked accounts (A2) is handled.
- **Log redaction.** `logger.module.ts` redacts `*.refreshToken` only one level deep, so the extra `req.body.refreshToken` path is a valid defence-in-depth addition.
- **Token storage (A2).** The `RefreshToken` model has `principalId`, `principalKind`, `familyId` and `revokedAt`. `Customer.status` is `active | blocked`, `name` is non-null and `locale` defaults to `"en"`, which matches `customerSummarySchema`. `CustomerAuthService.ensureActive` throws 403 "Account is blocked".
- **DPDP deletion transaction (A2).** `processDeletion` runs inside `$transaction(async (tx) => …)`, so `tx.refreshToken.updateMany` fits.
- **Queues (A5).**
  - `QueueService` creates a `Queue` for every value in `QUEUES`, and `enqueue(queue, name, data)` matches the forwarding call.
  - `QueueModule` is `@Global()` and imported by `WorkerModule`.
  - `DpdpWorker` and `NotificationWorker` both consume `QUEUES.NOTIFICATIONS`; the notification worker silently returns on `dpdp.*`.
  - The only DPDP producers are `requestExport` and `requestDeletion`.
- **Checkout (A4).**
  - `CheckoutService.place` returns early on reuse.
  - `ref.customerId`, `snapshot` and `isCod` exist, and there is no logger today.
  - `PaymentService.markCaptured` loads `include: { items: true }` and returns early when the order is not `pending`.
  - `PaymentService` and `CartService` are both providers of `CartCheckoutModule`, and no other module re-provides `PaymentService`, so injecting `CartService` is DI-safe.
  - `Cart.customerId` is `@unique`, so `findUnique({ where: { customerId } })` is valid.
- **Mock capture timing.** The mock provider auto-captures synchronously inside `initiate`, which the controller calls after `place`.
- **Preview payment method (A6).**
  - `CheckoutService.preview` already accepts `isCod = false`, and the controller does not pass it.
  - `PAYMENT_METHODS` exists in shared `constants.ts`.
  - The web preview body is `{ addressId, couponCode }` only (`checkout/page.tsx:108`), so A6 leaves web output unchanged.
  - `z.object` strips unknown keys, so a newer app against an older server is also safe.
- **Throttling (A3).**
  - `@nestjs/throttler` 6.2.1: `getTracker` returns `req.ip`.
  - The `Retry-After` header (no suffix for `default`) is set before throwing.
  - `NestFactory.create<NestExpressApplication>` is already used in `main.ts`.
  - `apps/api/src/common/http/` exists (it holds `http.module.ts` and `resilient-http.service.ts`); `trust-proxy.ts` would be new in it.
- **Caddy.** The Caddyfile has a plain `reverse_proxy api:4000` with no custom `header_up`.
- **Docker isolation.**
  - Both Dockerfiles copy only `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `packages/shared/package.json` and `apps/<x>/package.json` before `pnpm install --frozen-lockfile`.
  - The build stage runs filtered builds only.
  - Compose uses `context: .`.
  - No `*.dockerignore` file exists anywhere (searched), so a root `.dockerignore` is effective under BuildKit.
  - The deploy script's `tar` has no `apps/mobile` exclusion today.
  - The API image already builds while the lockfile carries the absent `apps/web` importer, which supports the partial-importer assumption. The design still verifies it by simulation.
- **Root scripts.** `build`, `typecheck`, `lint` and `test` are `pnpm -r`, and `dev` is `--filter "./apps/*" dev`. The root `.eslintrc.json` is `root: true`, and mobile's own `root: true` config keeps them apart.
- **Shared extraction.**
  - Shared's `index.ts` has no export collisions with the names to be added (grepped).
  - `order-view.ts` imports `pickAttr` from `variant-edit.ts`, which is why the design moves `pickAttr` first.
  - `home-sections.ts` and `site-content.ts` keep their `catalogueApi` / `apiFetch` parts in web.
  - The web tsconfig maps `@belzo/shared` to source, and Next uses `transpilePackages`.
- **Profile schema.** `profilePatchSchema` in `identity/dto.ts` is plain zod and can move verbatim.
- **Order result parity.** `resolveView` in `apps/web/src/app/(shop)/order-result/page.tsx` matches the design (cancelled → failed, non-pending → confirmed, COD → cod, else awaiting; 12 polls at 2.5 s).
- **Endpoints.** All endpoints in §4.1 were spot-checked on the controllers: `resolve-pincode`, `me/data/requests`, `orders/:id/invoice|cancel|reorder`, `orders/returns`, `coupons/validate`, `notifications`, `notifications/read`, `search/autocomplete`, `settings/public|serviceability`. `DataRequestStatus` is exactly `pending | processing | completed`.
- **Pinned versions.** Every pinned version in §12 exists on npm: 42 packages checked with `npm view`, including expo 57.0.27, RN 0.86.3, React 19.2.3, TS 6.0.3, jest-expo 57.0.5, RNTL 14.1.0, test-renderer 1.3.0, eslint-config-expo 57.0.2, @react-native/jest-preset 0.86.3, eas-cli 24.12.1 and expo-doctor 1.20.4.
- **SDK 57 native module ranges.** `bundledNativeModules.json` matches the design: screens ~4.26.0, safe-area ~5.7.0, flash-list 2.0.2, svg 15.15.4, async-storage 2.2.0, netinfo 12.0.1, and the expo-* tildes.
- **Peer dependencies.** jest-expo 57 requires the `@react-native/jest-preset ^0.86.3` peer, which is non-optional. React Navigation 7.20 tabs and stack need only screens and safe-area, with no gesture-handler.
- **Contrast ratios.** The §3.1 figures recompute correctly: `#2874f0` 4.33:1, `#16a34a` 3.30:1, `#fb641b` with `#212121` 5.3:1.
- **Working tree.** Tracked files are clean (`git status --untracked-files=no` is empty), the branch is `master` and there is no remote. The design's untracked-file list is correct except for item 12.
- **Stubs.** Out-of-scope items are clearly stubbed, not faked: `push.ts` returns `unsupported`, `expo-notifications` and `react-native-razorpay` are not installed, and the Razorpay adapter returns `unavailable`. Findings 4 and 9 concern side effects around those stubs, not fake success.

## Unverified or wrong assumptions

- **Wrong:** "The controller still calls `initiate` on reuse, which reaches `markCaptured`, and that is a no-op" (§7 A4). `initiate` rewrites the payment row first (finding 1).
- **Wrong:** "Rewrite only their import lines … assertions are unchanged" for `order-view.test.ts` under shared's compiler options (finding 2).
- **Wrong:** "Every existing web import path keeps working" is not true of the explicit re-export list as specified (finding 3).
- **Wrong:** "contact support or pay on the website". There is no way to pay an existing order on the web (finding 4).
- **Unverified, with a verification gap:** Expo's resolver honours the custom `resolveRequest` or tsconfig paths ahead of `node_modules/@belzo/shared` → `dist`. The local stale `dist` can mask a failure (finding 7).
- **Unverified (risk recorded):** jest-expo and RNTL on CI Node 20.14. The npm `engines` fields show they are unsupported there (finding 6).
- **Unverified:** that cancelling a pending order reverses the coupon redemption (finding 4 asks for a check).
- **Unverified (design-tagged, accepted):**
  - Caddy replacing client XFF.
  - Hermes Intl output.
  - RN `boxShadow` on Android.
  - Multipart upload from `file://`.
  - eslint-config-expo's legacy config with eslint 8.57.
  - TypeScript 6 handling of `types`.
  - EAS Node image and `.gitignore` behaviour.
  - Live production env values (`PAYMENT_PROVIDER`, `SHIPPING_PROVIDER`, `JWT_ACCESS_TTL`).
- **Not verifiable by me:** the brief's full §6 screen list. It was truncated in the prompt I received. Screen coverage was checked against the brief's §4 feature domains and Phase 1's phased plan; all domains have screens and API mappings.
