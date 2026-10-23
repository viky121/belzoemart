# Implementation Plan — Belzo eMart Android app, Phases 2–4 + backend enablement

Source of truth: `.agents/tasks/mobile-app/design.md` (approved, iteration 4) and `phase1-assessment.md`. Section references (§n) point into design.md. This plan sequences the design; it does not re-decide it. Where the design left a NIT open, the decision is recorded inline as **Decision:**.

## Ground rules (apply to every item)

- Work directly in `c:\xampp\htdocs\Belzo` on `master`. No worktree, no branch, no push, no deploy.
- Add files to git **explicitly by path**. Never stage `.env*` (e.g. `apps/web/.env.local`, `.env`), `*.pem` (`Belzo-key.pem`), `*.jks`, `*.keystore`, `google-services.json`, `apps/mobile/android/`, `apps/mobile/dist/`, `apps/mobile/.expo/`, or anything under `.agents/`, `.kiro/`, `aidlc-docs/`.
- The repo has ~200 untracked pre-existing paths. Do not commit them except the explicit baseline list in item 0.
- Environment facts (verified 2026-10-12): Windows, PowerShell, Node 24.12.0, pnpm 9.12.0, JDK 17, npm registry reachable, Docker CLI installed but the daemon is **not running**, no Android SDK/adb/emulator (do not install one). `packages/shared/dist` exists (stale, gitignored).
- `apps/api` typechecks/builds against `@belzo/shared`'s **dist** (`apps/api/tsconfig.json` has `"paths": {}`), so after any shared source change run `pnpm --filter @belzo/shared build` before `pnpm --filter @belzo/api typecheck|build`. API and web Jest map `@belzo/shared` to source. Web uses tsconfig `paths` + `transpilePackages`.
- Backend test command: `pnpm --filter @belzo/api test -- <pattern>` (ts-jest, `*.spec.ts`). Shared: `pnpm --filter @belzo/shared test` (`*.test.ts`). Web: `pnpm --filter @belzo/web test` (`*.test.ts`).
- **No APK or AAB is built in this run.** There is no Android SDK, and EAS Build needs the owner's Expo account. Mobile verification is typecheck, lint, Jest, `expo config`, `expo-doctor`, `expo prebuild` (file generation only) and `expo export`.

---

## Part A — Baseline and backend changes (A1–A8)

- [ ] 0. Baseline commit of pre-existing untracked files this work modifies (unchanged content).
      Re-run `git ls-files --error-unmatch <path>` on the whole touch list of this plan first and add any other untracked file that a later item edits.
      Files (known untracked today): `apps/api/src/modules/identity/{auth.controller.ts,token.service.ts,token.service.spec.ts,data-request.service.ts,dpdp.worker.ts}`, `apps/api/src/modules/engagement/notification.worker.ts`, `apps/api/src/common/queue/queue.constants.ts`, `apps/api/src/common/logger/logger.module.ts`, `apps/api/src/modules/checkout/checkout.controller.ts`, `apps/api/src/modules/cart/cart.controller.ts`, `packages/shared/src/constants.ts`, `scripts/deploy.ps1`, `.github/workflows/ci.yml`.
      **Decision:** `token.service.spec.ts` is included (review NIT #7). Root `package.json`, `pnpm-workspace.yaml`, `.gitignore` and `packages/shared/package.json` are untracked but are **not edited** by this plan, so they stay out (owner decision); if an item ends up editing one, add it to this baseline first.
      Commit: `chore: track pre-existing files touched by the mobile work (unchanged)`.
      Verify: `git show --stat HEAD` lists exactly those files; `git diff HEAD --stat` is empty for them.

- [ ] 1. Shared contract additions for A1, A6 and the profile form.
      Add `CLIENT_PLATFORM_HEADER`, `MOBILE_CLIENT_PLATFORM` (constants.ts); `mobileRefreshSchema`, `mobileLogoutSchema`, `customerSummarySchema`, `mobileAuthResponseSchema`, `mobileRefreshResponseSchema` + types (schemas.ts) exactly as §7 A1; extend `checkoutPreviewSchema` with optional `paymentMethod: z.enum(PAYMENT_METHODS)` (§7 A6); move `profilePatchSchema` verbatim from `apps/api/src/modules/identity/dto.ts` into shared `schemas.ts`, and make `dto.ts` import + re-export it (§7 A-extra).
      Files: `packages/shared/src/constants.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/schemas.test.ts`, `apps/api/src/modules/identity/dto.ts`.
      Tests (schemas.test.ts): mobile schemas accept/reject (empty token, >512 chars, missing customer); `checkoutPreviewSchema` accepts no method, `cod`, `upi`, rejects `bitcoin`; `profilePatchSchema` behaves as before.
      Verify: `pnpm --filter @belzo/shared test && pnpm --filter @belzo/shared typecheck && pnpm --filter @belzo/shared lint && pnpm --filter @belzo/shared build`, then `pnpm --filter @belzo/api typecheck`.
      Commit: `feat(shared): mobile auth schemas, preview paymentMethod, shared profilePatchSchema`.

- [ ] 2. A1 — header-gated body refresh tokens for native clients (§7 A1).
      New `client-platform.ts` (`isMobileClient`, `readMobileRefreshToken`, `readMobileLogoutToken`); in `auth.controller.ts` add `@Req()` to `verifyOtp`, `register`, `google`, a private `deliver(req,res,tokens,customer)`, mobile branches in `refresh` and `logout` (body validation in the handler, not via `@Body()`); add `'req.body.refreshToken'` to pino `redact.paths`. Web branch must stay the literal existing statements.
      Files: `apps/api/src/modules/identity/client-platform.ts` (new), `apps/api/src/modules/identity/auth.controller.ts`, `apps/api/src/common/logger/logger.module.ts`, `apps/api/src/modules/identity/auth.controller.spec.ts` (new).
      Spec: the six cases in §7 A1 "Tests" (web cookie flows unchanged incl. 401 "Missing refresh token"; mobile body flows with no cookie; `{}` → ZodError; logout variants; `Mobile ` counts as mobile, `['mobile','mobile']` as web).
      Verify: `pnpm --filter @belzo/api test -- auth.controller` passes; `pnpm --filter @belzo/api typecheck` passes.
      Commit: `feat(api): header-gated body refresh tokens for mobile clients`.

- [ ] 3. A2 — reject blocked customers on rotation; revoke tokens on DPDP deletion (§7 A2).
      `TokenService.rotate`: customer status lookup after revoked/expired checks, revoke family + `ForbiddenException('Account is blocked')`; admin untouched. `DataRequestService.processDeletion`: `tx.refreshToken.updateMany` for the customer inside the existing transaction.
      Files: `apps/api/src/modules/identity/token.service.ts`, `token.service.spec.ts` (extend `makeFakePrisma` with `customer.findUnique`, default `active`), `apps/api/src/modules/identity/data-request.service.spec.ts` (new).
      Spec: blocked → 403 + family revoked (sibling rotate fails); missing customer → rejected; admin principal never looked up; deletion revokes only that customer's unrevoked tokens and still anonymises.
      Verify: `pnpm --filter @belzo/api test -- token.service data-request` passes; existing token specs stay green.
      Commit: `fix(api): reject blocked customers on refresh; revoke tokens on DPDP deletion`.

- [ ] 4. A3 — `trust proxy` one hop (§7 A3).
      New `configureTrustProxy(app)` with `TRUSTED_PROXY_HOPS = 1`; call it in `main.ts` right after `NestFactory.create` (type the app as `NestExpressApplication`).
      Files: `apps/api/src/common/http/trust-proxy.ts` (new), `apps/api/src/common/http/trust-proxy.spec.ts` (new), `apps/api/src/main.ts`.
      Spec (supertest + `ThrottlerModule.forRoot([{ttl:60_000,limit:1}])`): the four XFF assertions plus the control case without trust proxy (§7 A3).
      Verify: `pnpm --filter @belzo/api test -- trust-proxy` passes; `pnpm --filter @belzo/api typecheck`.
      Commit: `fix(api): trust one proxy hop so throttling keys on the client IP`.

- [ ] 5. A4 — clear purchased cart lines after a successful order, replay-safe (§7 A4).
      `CartService.removePurchased(customerId, variantIds)`; call it in `CheckoutService.place` on the fresh-order COD path only (try/catch + `Logger.warn`), and in `PaymentService.markCaptured` after the capture transaction/`confirmSale` loop, before enqueues (inject `CartService` into `PaymentService`; both live in `cart-checkout.module.ts`, no module change).
      Files: `apps/api/src/modules/cart/cart.service.ts`, `cart.service.spec.ts`, `apps/api/src/modules/checkout/checkout.service.ts`, `checkout.service.spec.ts` (add `removePurchased` jest.fn to the fake cart in `build()`), `apps/api/src/modules/checkout/payment.service.ts`, `apps/api/src/modules/checkout/payment.service.spec.ts` (new — shared with item 8).
      Spec: all cases in §7 A4 "Tests" (active-only delete; no cart created; empty input skips DB; fresh COD clears, fresh upi does not, reused does not, rejection still returns the order; capture clears once, replayed/non-pending/markFailed do not). Existing 4 checkout tests unchanged and green.
      Verify: `pnpm --filter @belzo/api test -- cart.service checkout.service payment.service` passes.
      Commit: `fix(checkout): clear purchased cart lines after a successful order`.

- [ ] 6. A5 — DPDP jobs on their own BullMQ queue (§7 A5).
      Add `DPDP: 'dpdp'` to `QUEUES`; `DataRequestService.requestExport/requestDeletion` enqueue to `QUEUES.DPDP` (same job names/payloads); `DpdpWorker` listens on `QUEUES.DPDP` and throws on unknown names; `NotificationWorker` injects `QueueService` and forwards legacy `dpdp.*` jobs to the dpdp queue instead of silently returning.
      Files: `apps/api/src/common/queue/queue.constants.ts`, `apps/api/src/modules/identity/data-request.service.ts`, `apps/api/src/modules/identity/dpdp.worker.ts`, `apps/api/src/modules/engagement/notification.worker.ts`, new `dpdp.worker.spec.ts`, new `apps/api/src/modules/engagement/notification.worker.spec.ts`, extend `data-request.service.spec.ts`.
      Spec: mock `bullmq` `Worker` to capture `(queueName, processor)`; cases in §7 A5 "Tests".
      Verify: `pnpm --filter @belzo/api test -- dpdp.worker notification.worker data-request` passes; `pnpm --filter @belzo/api typecheck`.
      Commit: `fix(worker): give DPDP jobs their own queue`.

- [ ] 7. A6 — `checkout/preview` accepts optional `paymentMethod` (§7 A6).
      Controller passes `dto.paymentMethod === 'cod'` as the existing `isCod` argument of `CheckoutService.preview`.
      Files: `apps/api/src/modules/checkout/checkout.controller.ts`, new `apps/api/src/modules/checkout/checkout.controller.spec.ts`, `checkout.service.spec.ts` (preview with `isCod=true` includes `PricingService.codFee` 3900 in `breakup.codFee` and `grandTotal`).
      Verify: `pnpm --filter @belzo/api test -- checkout` passes.
      Commit: `feat(checkout): preview accepts paymentMethod for the COD fee`.

- [ ] 8. A7 — idempotent `PaymentService.initiate` (round-1 HIGH; §7 A7).
      Replace the unconditional `createOrder` + `payment.update({providerOrderId,status:'pending'})` with the atomic claim `payment.updateMany({where:{id,status:'created'},data:{status:'pending'}})`; `count===0` → `{provider, clientConfig:{}}`; on `createOrder` rejection revert (`where status 'pending' AND providerOrderId null` → `created`) and rethrow; follow-up `update` writes only `providerOrderId`. COD block, mock auto-capture block and return unchanged.
      Files: `apps/api/src/modules/checkout/payment.service.ts`, `payment.service.spec.ts` (extend; fake `updateMany` must honour `where` and return `{count}`), `checkout.controller.spec.ts` (reused-mock case).
      Spec: every case in §7 A7 "Tests" — captured/pending/failed/refunded/partially_refunded untouched with no `createOrder`/`update`; created path unchanged ending `captured` under mock; two concurrent `initiate` → one `createOrder`, one real clientConfig + one `{}`; rejection reverts then a second initiate succeeds; COD unchanged; controller `reused:true` keeps `captured`/`mock_1` and never calls `createOrder`.
      Verify: `pnpm --filter @belzo/api test -- payment.service checkout.controller` passes.
      Commit: `fix(payments): idempotent initiate so replayed place calls never reset a captured payment`.

- [ ] 9. A8 — `POST /cart/items/:variantId/move-to-cart` (§7 A8).
      `@Public() @Post('items/:variantId/move-to-cart')` → `this.cart.saveForLater(await resolveCartRef(req, this.tokens), variantId, false)`, next to `save-for-later`.
      Files: `apps/api/src/modules/cart/cart.controller.ts`, new `apps/api/src/modules/cart/cart.controller.spec.ts`.
      Spec: guest header → `saveForLater({guestToken:'guest-token-1'},'v1',false)`; Bearer customer → `({customerId:'c1'},'v1',false)`; existing save-for-later still passes `true`.
      Verify: `pnpm --filter @belzo/api test -- cart.controller` passes; then the whole backend gate: `pnpm --filter @belzo/shared build && pnpm --filter @belzo/api db:generate && pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api test && pnpm --filter @belzo/api build` all pass.
      Commit: `feat(cart): move-to-cart endpoint`.

## Part B — Shared-helper extraction with web re-exports (§10)

- [ ] 10. Move pure web helpers into `@belzo/shared` verbatim.
      New `packages/shared/src/{format.ts,attributes.ts,price-breakup.ts,order-view.ts,home.ts}` with exactly the exports in the §10 table (order-view imports siblings relatively, never `'@belzo/shared'`); add the five `export *` lines to `packages/shared/src/index.ts`. `git mv` `apps/web/src/lib/{format-inr.test.ts,price-breakup.test.ts,order-view.test.ts}` → `packages/shared/src/{format.test.ts,price-breakup.test.ts,order-view.test.ts}`; rewrite only import lines; add the `!` assertions at `order-view.test.ts` lines 147, 152, 170 and 250 exactly as §10 lists.
      Files: the five new shared modules, `packages/shared/src/index.ts`, the three moved tests.
      Verify: `pnpm --filter @belzo/shared test && pnpm --filter @belzo/shared typecheck && pnpm --filter @belzo/shared lint && pnpm --filter @belzo/shared build` pass (ts-jest is the gate that type-checks the moved tests).

- [ ] 11. Turn the web modules into thin re-exports (depends on 10).
      `format-inr.ts`, `price-breakup.ts`, `order-view.ts` (explicit named list with `type` modifiers **plus** `export { formatDate, formatDateTime } from '@belzo/shared'`), `variant-edit.ts` (import + re-export `pickAttr`), `home-sections.ts` (re-export `DEFAULT_SECTIONS`, `sanitizeHomeSections`, `getHomeSections`; keep `resolveHomeSections`/`ResolvedSection`), `site-content.ts` (re-export `ThemeName`, `DEFAULT_HOME_EMART`, `DEFAULT_HOME_CLASSIC`, `mergeHome`; keep footer/`getSiteContent`).
      Files: `apps/web/src/lib/{format-inr,price-breakup,order-view,variant-edit,home-sections,site-content}.ts`.
      Verify: `pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web lint && pnpm --filter @belzo/web build` pass (`site-content.test.ts`, `variant-edit.test.ts` unmodified); `git diff --stat -- apps/web/src/app` is empty; `pnpm --filter @belzo/api typecheck` still passes.
      Commit (items 10–11 together): `feat(shared): shared view helpers (formatInr, price breakup, order view, home defaults); web re-exports`.

## Part C — Mobile app (design §17 steps 3–6)

- [ ] 12. Keep React Native out of server images and the deploy tarball (§8.3).
      New root `.dockerignore` with `apps/mobile` and `**/node_modules`. **Decision** (review NIT #6): include `**/node_modules`; the server context never contains node_modules (the tarball excludes them), so it is a no-op there and prevents a host `node_modules` from overwriting the deps stage in a local build. Add `--exclude=./apps/mobile` to the `tar` call in `scripts/deploy.ps1` (keep every existing exclude). Dockerfiles unchanged.
      Files: `.dockerignore` (new), `scripts/deploy.ps1`.
      Verify: inspection now (`apps/api/Dockerfile`, `apps/web/Dockerfile` deps stages copy only the five manifests); the install/tarball simulations run in item 14 once mobile is in the lockfile.
      Commit: `chore: keep apps/mobile out of server images and the deploy tarball` (may be made after item 14's simulations pass).

- [ ] 13. CI: filter mobile out of the Node 20.14 job; add a Node 22.13 mobile job (§8.4).
      Replace the three `run` lines in `build-test` with `pnpm -r --filter '!@belzo/mobile' typecheck|lint|test`; add `MOBILE_NODE_VERSION: '22.13.0'` to top-level `env`; add the `mobile` job verbatim from §8.4.
      Files: `.github/workflows/ci.yml`.
      Verify: `pnpm exec prettier .github/workflows/ci.yml > $null` exits 0 (YAML parses).
      Commit: `ci: filter mobile out of the Node 20.14 job and add a Node 22.13 mobile job`.

- [ ] 14. Mobile scaffold, configs and install (§1.2, §8.1, §8.2, §8.5, §12, §13).
      Create `apps/mobile/package.json` (`@belzo/mobile`, scripts exactly §8.4 — **no `build`, no `dev`** — dependencies/devDependencies at the exact §12 pins, `@belzo/shared: workspace:*`), `app.config.ts` (`buildConfig(env)` exported, §13.1), `eas.json` (§13.2), `babel.config.js`, `metro.config.js` (§8.2 verbatim), `tsconfig.json` (§8.2), `jest.config.js` + `jest.setup.ts` (§16.1 mocks, `moduleNameMapper` for `@belzo/shared` and `@/`), `.eslintrc.js` (§8.5), `apps/mobile/.gitignore` (7 patterns), `index.ts` (`SplashScreen.preventAutoHideAsync()` + `registerRootComponent`), a minimal `src/app/App.tsx`, `src/config/env.ts` (zod validation of `extra`), `plugins/with-network-security-config.js` (§13.3, `require('expo/config-plugins')`, host validation), `scripts/{sync-brand.mjs,generate-placeholder-assets.mjs,check-easignore.mjs}`, generated `assets/placeholder/{icon,adaptive-foreground,splash-icon}-PLACEHOLDER.png` and `src/ui/brand/belzo-logo.generated.ts`, root `.easignore` (§13.2 verbatim). Tests: `__tests__/app-config.test.ts` (all §16.1 app-config cases), `__tests__/metro-config.test.ts`.
      Then `pnpm install` at the root. Review `git diff pnpm-lock.yaml`: only the `apps/mobile` importer and new packages may be added; `apps/api`, `apps/web`, `packages/shared` importer blocks unchanged (stop and investigate otherwise). Then `pnpm install --frozen-lockfile`. `pnpm --filter @belzo/mobile why react` → 19.2.3 only; `pnpm --filter @belzo/web why react` → 18.3.1 only. If a transitive (e.g. `@babel/runtime`, `@babel/core`) is unresolvable, add only that package pinned to the exact 7.x version already in the lockfile (never 8.x) and note it for the README.
      Isolation proof (§8.3): (a) for api and web, copy `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `packages/shared/package.json`, `apps/<x>/package.json` into `%TEMP%\belzo-docker-sim-<x>`, run `pnpm install --frozen-lockfile --ignore-scripts`, assert success and no `react-native@`, `expo@`, `metro@` dirs in `node_modules/.pnpm`, delete the temp dirs; also run `pnpm install --filter "@belzo/api..." --filter "@belzo/web..." --frozen-lockfile --dry-run` at the root (if pnpm 9 rejects `--dry-run` for install, record that and rely on (a)) and confirm no React Native package is listed; (b) build the deploy tarball into `%TEMP%` with the exact exclude list from `deploy.ps1`, `tar -tzf` it, assert zero `apps/mobile` entries, delete it; (c) `docker info` — the daemon is currently stopped, so skip `docker build` and report why.
      Files: everything under `apps/mobile/` listed above, `.easignore`, `pnpm-lock.yaml`.
      Verify: `pnpm --filter @belzo/mobile typecheck && pnpm --filter @belzo/mobile lint && pnpm --filter @belzo/mobile test` pass (if the legacy eslint config fails, apply the §8.5 flat-config fallback); in `apps/mobile`: `npx expo config --type public` (dev) and with `APP_VARIANT=production`, `EXPO_PUBLIC_API_BASE_URL=https://shop.example.com` (prod) both succeed and production with an http URL fails; `node apps/mobile/scripts/check-easignore.mjs` exits 0; simulations (a)(b) pass.

- [ ] 15. Theme, platform libs, UI kit and API core (§3, §5, §6.1–6.3).
      `src/theme/{tokens.ts,index.ts}` (§3.1–3.2 values incl. `button.primaryFill`/`accentFill`); `src/lib/{storage,secure,logger,debounce}.ts`; `src/store/{session,pincode,recently-viewed,recent-searches,checkout-draft}.ts` (§6.3); `src/api/{errors,client,token-manager,guest-token,query-client,query-keys,image-url,upload,types}.ts` exactly per §5 and §6.1–6.2 (single-flight refresh, generation counter, persist-before-memory, 401 retry once, 429 `Retry-After` ≤10 s ×2, timeout/abort kinds, `X-Client-Platform: mobile`, guest header only without Bearer, `ServerTooOld` config error); `src/ui/*` components from §3.4 including `brand/BelzoLogo.tsx`.
      Tests: `src/api/__tests__/client.test.ts` (every §16.1 API-client case: header, Bearer, guest header, 3 concurrent 401 → one refresh, proactive refresh, refresh 401 → expire + SecureStore cleared, refresh network error keeps token, 401 after refresh → logout, 429 retry with fake timers, 429 without Retry-After no retry, timeout, abort, non-JSON error body, logout during in-flight refresh), `src/api/__tests__/image-url.test.ts`, `src/ui/__tests__/{ProductCard,PriceDisplay,QuantitySelector,OrderStatusBadge}.test.tsx`, `src/ui/brand/__tests__/logo.test.ts` (embedded XML equals `apps/web/public/belzo-logo.svg`), plus a `renderWithProviders()` test helper.
      Verify: `pnpm --filter @belzo/mobile typecheck && pnpm --filter @belzo/mobile lint && pnpm --filter @belzo/mobile test` pass.

- [ ] 16. Navigation shell and boot (§2).
      `src/navigation/{types.ts,RootNavigator.tsx,MainTabs.tsx,linking.ts,href.ts,RequireAuth.tsx,after-auth.ts}` (param types §2.1, back behaviour §2.3, deep links §2.6, href table §2.7); `src/app/{App.tsx,providers.tsx,boot.ts,ErrorBoundary.tsx}` (boot §2.5 + §5.4 incl. pending-merge retry, session-expired listener → `queryClient.clear()` + toast + reset to Home); `features/onboarding/{onboarding-flag.ts,screens/OnboardingScreen.tsx}`. Unbuilt destination screens are registered with a placeholder component until their item lands.
      Tests: `src/navigation/__tests__/{href.test.ts,after-auth.test.ts}`.
      Verify: mobile typecheck/lint/test pass.
      Commit (items 14–16): `feat(mobile): Expo SDK 57 app scaffold, design system and API client` (add files explicitly; never `android/`, `dist/`, `.expo/`).

- [ ] 17. Auth and session (§2.4, §6.4, §11 Auth/Account shell).
      `features/auth/{api.ts,hooks.ts,session.ts}` (`completeLogin` per §6.4: parse with `mobileAuthResponseSchema` before calling; `removeQueries(['cart'])`; merge with `peekGuestToken`, rotate on success, pending merge on failure; invalidate wishlist/addresses/orders; adopt default address PIN), screens `LoginScreen` (Phone OTP only when `extra.phoneOtpEnabled`, Email OTP, Email & password; no Google), `OtpVerifyScreen` (expiry countdown, resend after 30 s or 429 countdown, dev-code box only when `extra.showDevOtp && devCode`), `RegisterScreen`; logout via `tokenManager.logout()`.
      Tests: `features/auth/__tests__/session.test.ts` (§6.4 four cases).
      Verify: mobile typecheck/lint/test pass.
      Commit: `feat(mobile): phone/email OTP and password sign-in with guest cart merge`.

- [ ] 18. Home and categories (§11 Home, Categories).
      `features/home/{api.ts,hooks.ts,screens/HomeScreen.tsx,components/{HeroBanner,PromoGrid,WhyGrid,HomeBlocks,CategoryShortcuts}.tsx}` using shared `mergeHome('emart', …)`, `getHomeSections`, `DEFAULT_SECTIONS` (fallback to emart defaults on request failure), rails per source, recently viewed rail, PIN chip + sheet, bell badge; `features/categories/{api.ts,hooks.ts,tree.ts,screens/CategoriesScreen.tsx}` (two-pane, 3 levels, `findBySlug`).
      Tests: `features/categories/__tests__/tree.test.ts` (findBySlug across levels, unknown slug).
      Verify: mobile typecheck/lint/test pass.

- [ ] 19. Product list, search and product detail (§11 ProductList, Search, ProductDetail; §4.2 caveats).
      `features/products/{api.ts,hooks.ts,screens/{ProductListScreen,ProductDetailScreen,ImageViewerScreen}.tsx,components/{VariantPicker,SlabTable,DeliveryCheck,ReviewsList,Gallery}.tsx}` (FlashList 2 infinite scroll, sort/filter sheets with page-local caption, slab price via `resolveSlabPrice`, PIN check, reviews without `customerId`, related rail, sticky Add/Buy now, wishlist heart, recently-viewed push, 404 state); `features/search/{api.ts,hooks.ts,screens/SearchScreen.tsx}` (250 ms autocomplete, 400 ms results, recent searches, 4 sort chips).
      Tests: `features/search/__tests__/SearchScreen.test.tsx` (debounced suggestions + results, no-results, error → Retry), with mocked `fetch` and fake timers.
      Verify: mobile typecheck/lint/test pass.
      Commit (18–19): `feat(mobile): home, categories, product listing, search and product detail`.

- [ ] 20. Cart and wishlist (§6.5, §11 Wishlist/Cart).
      `features/cart/{api.ts,hooks.ts,screens/CartScreen.tsx,components/{CartLineRow,CouponBox}.tsx}` (identity-keyed `qk.cart(useCartIdentity())`, per-line serialised quantity, save-for-later, move-to-cart via the A8 route, line states, P2025 toast + refetch, coupon → `useCheckoutDraft`, tab badge); `features/wishlist/{api.ts,hooks.ts,screens/WishlistScreen.tsx}`.
      Tests: `features/cart/__tests__/CartScreen.test.tsx` (lines render, unavailable line shows Remove only, `+` PUTs `{variantId, quantity}`, guest request carries `x-guest-token`).
      Verify: mobile typecheck/lint/test pass.
      Commit: `feat(mobile): cart with guest token, save for later, move to cart, coupons and wishlist`.

- [ ] 21. Addresses, checkout, payments and order confirmation (§6.6–6.8, §11 Addresses/Checkout/OrderConfirmation).
      `features/addresses/{api.ts,hooks.ts,screens/{AddressesScreen,AddressFormScreen}.tsx}` (select mode with `popTo('Checkout', {addressId}, {merge:true})`, resolve-pincode autofill, serviceability badge, `GST_STATES` picker); `features/checkout/{api.ts,hooks.ts,checkout-attempt.ts,checkout-selection.ts,payment-outcome.ts,order-result.ts,screens/{CheckoutScreen,OrderConfirmationScreen}.tsx}` (preview with `paymentMethod`, persisted idempotency key + fingerprint, definitive vs ambiguous outcomes, `usePreventRemove` while placing, reset to `[Main, OrderConfirmation]`, `invalidateQueries(qk.cart('customer'))` — **Decision** per review NIT #4); `features/payments/{adapter.ts,mock-adapter.ts,razorpay-adapter.stub.ts,registry.ts}` (Razorpay stub `isAvailable()===false`, TODO(Phase 5) comment, not wired as working; `react-native-razorpay` NOT installed).
      Tests: `features/checkout/__tests__/{checkout-attempt,payment-outcome,checkout-selection,order-result}.test.ts` (all §6.6/§6.8/§11 cases incl. key survives a simulated restart via `jest.resetModules()` with the AsyncStorage mock kept).
      Verify: mobile typecheck/lint/test pass.
      Commit: `feat(mobile): addresses, checkout with idempotent place, COD/mock payment and order confirmation`.

- [ ] 22. Orders, cancel and return flows (§6.9, §11 Orders/OrderDetail/CancelOrder/ReturnRequest).
      `features/orders/{api.ts,hooks.ts,screens/{OrdersScreen,OrderDetailScreen,CancelOrderScreen,ReturnRequestScreen}.tsx,components/{TrackingTimeline,PriceBreakupRows,ReturnPhotoPicker}.tsx}` using the shared helpers (`buildStepper`, `paymentSummary`, `breakupView`, `cancelEligibility`, `returnEligibility`, `returnStepError`, `buildReturnPayload`, …); live polling 30 s while focused; invoice via `WebBrowser.openBrowserAsync`; copy id via expo-clipboard; required return photos through `expo-image-picker` → `expo-image-manipulator` (≤1600 px JPEG 0.8) → `uploadImage`; camera permission denial → `Linking.openSettings()`; `usePreventRemove` on dirty drafts.
      Tests: `features/orders/__tests__/ReturnPhotoPicker.test.tsx` or an equivalent unit test of the upload/normalise helper (picker + manipulator mocked; cap at `MAX_RETURN_IMAGES`; upload error tile).
      Verify: mobile typecheck/lint/test pass.
      Commit: `feat(mobile): orders, tracking, cancel and return requests with photos`.

- [ ] 23. Notifications, help/CMS, profile, privacy and the push stub (§11 Notifications/Help/Account/ProfileEdit/PrivacyData).
      `features/notifications/{api.ts,hooks.ts,push.ts,screens/NotificationsScreen.tsx}` (mark read on focus, ≤100 ids; `push.ts` stub returns `{status:'unsupported'}`, no `expo-notifications`); `features/support/{api.ts,hooks.ts,screens/{HelpScreen,CmsPageScreen}.tsx}`; `features/profile/{api.ts,hooks.ts,screens/{AccountScreen,ProfileEditScreen}.tsx}` (`profilePatchSchema`, changed fields only, 409 field mapping); `features/privacy/{api.ts,hooks.ts,export-decode.ts,screens/{PrivacyDataScreen,DataExportViewScreen}.tsx}` (export polling, `decodeExport`, typed `DELETE` confirmation → deletion → logout → "Deletion requested"). Replace every remaining placeholder route component from item 16.
      Tests: `features/privacy/__tests__/export-decode.test.ts` (Devanagari/₹ round-trip, wrong prefix, invalid base64).
      Verify: mobile typecheck/lint/test pass; delete the placeholder component from item 16 so typecheck fails if any route still references it.
      Commit: `feat(mobile): notifications, help and CMS pages, profile, DPDP export and account deletion`.

- [ ] 24. Mobile README (§1.2 README line, §5.3 race note, §13).
      `apps/mobile/README.md`: setup, variants and schemes, `EXPO_PUBLIC_*` flags, EAS profiles and commands (owner's Expo account, `eas init`), **LIVE-store warning** for dev/preview builds, deploy-order note (backend A1/A7/A8 first), dev-client cleartext/LAN gotcha, placeholder icon/splash + owner must supply the master logo, shared-must-stay-Node/DOM-free rule, any fallback pinned dependency, push and Razorpay out of scope, HTTPS owner task, "no APK built in this run".
      Files: `apps/mobile/README.md`.
      Verify: `pnpm exec prettier --check apps/mobile/README.md`.
      Commit: `docs(mobile): README with variants, EAS, owner TODOs and live-store warning`.

## Part D — Full verification sweep (§16.2) and report

- [ ] 25. Run and record every §16.2 command; fix anything red before reporting.
      1. `pnpm install --frozen-lockfile`; lockfile importer review (item 14).
      2. `pnpm --filter @belzo/shared test && pnpm --filter @belzo/shared typecheck && pnpm --filter @belzo/shared lint && pnpm --filter @belzo/shared build`.
      3. `pnpm --filter @belzo/api db:generate`, then api `typecheck`, `test`, `lint`, `build`.
      4. web `typecheck`, `test`, `lint`, `build`.
      5. mobile `typecheck`, `lint`, `test`.
      6. Root `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` (mobile skipped by build); the CI forms `pnpm -r --filter '!@belzo/mobile' typecheck|lint|test` (output must not list `@belzo/mobile`); `ci.yml` Prettier parse.
      7. In `apps/mobile`: `npx expo config --type public` for dev and prod (and prod+http fails); `npx expo-doctor@1.20.4` (explain any duplicate-react warning caused by web's React 18); `npx expo prebuild -p android --no-install --clean` for both variants — inspect `network_security_config.xml` + manifest for dev, absence of `networkSecurityConfig` for prod — then delete `apps/mobile/android/`; shared-from-source bundle check: rename `packages/shared/dist` → `dist.verify-bak`, `npx expo export --platform android --output-dir dist --source-maps`, assert a `.map` `sources` entry ends in `packages/shared/src/index.ts` and none contains `packages/shared/dist`, **always** restore the folder (or `pnpm --filter @belzo/shared build`), delete `apps/mobile/dist`.
      8. Isolation simulations (a)(b) re-run on the final lockfile, the filtered `pnpm install --filter "@belzo/api..." --filter "@belzo/web..."` dry run, (c) skipped if `docker info` fails; `node apps/mobile/scripts/check-easignore.mjs` exits 0 with its upload-set summary (file count, no `*.pem`/`.env*`).
      9. `git status --short` shows no staged or committed secret, `android/`, `dist/` or `.expo/`.
      Files: `.agents/tasks/mobile-app/phase2-4-report.md` (not committed; `.agents/` stays untracked) recording each command, its result, deviations, remaining UNVERIFIED items (§16.3), owner TODOs, and the explicit statement **"No APK or AAB was built. There is no Android SDK on this machine, and EAS Build needs the owner's Expo account."**
      Verify: every command above exits 0 (or is reported as skipped with the reason for Docker); temp dirs, tarball, `android/`, `dist/` removed; `packages/shared/dist` restored.
