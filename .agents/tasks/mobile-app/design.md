# Belzo eMart Android App — Technical Design (Phases 2–4 + order screens + backend enablement)

Status: iteration 3. Revised against `design-review-r2.json` / `design-review-r2.md` (round-2 verdict CHANGES_REQUESTED: 1 HIGH, 11 MEDIUM, 7 NIT), which found that most round-1 fixes had reached only §0. This iteration carries every HIGH and MEDIUM fix into the sections a coder implements from (§6.6, §7, §8.3, §8.4, §10, §11, §13, §14, §16, §17). §18 maps every round-1 and round-2 finding to the section that resolves it, or records why it is backlogged. Author date: 2026-10-11.

Inputs: `.agents/tasks/mobile-app/phase1-assessment.md` (ground truth), plus a fresh read of `apps/api`, `apps/web`, `packages/shared`, the Dockerfiles, `scripts/deploy.ps1`, `docker-compose.prod.yml`, `Caddyfile`, `.github/workflows/ci.yml`, and the npm registry / unpkg (versions and package internals re-checked today).

Anything I could not confirm is tagged **UNVERIFIED** and collected again in §15.

---

## 0. Overview

We build `apps/mobile`, an Expo SDK 57 (React Native 0.86.3, React 19.2.3, Hermes, New Architecture) Android app in the existing pnpm workspace. It talks only to the existing NestJS API at `{API}/api/v1`. It reuses `@belzo/shared` from **source** (no build step), the same way the web and API Jest configs already do. Server state (catalogue, server-side cart, orders) lives in TanStack Query. A small set of Zustand stores holds client state (session status, delivery PIN, recently viewed, recent searches, checkout draft). A typed `fetch` client owns timeouts, the guest-cart header, a proactive and reactive **single-flight** token refresh, 401 → logout and 429 backoff. The refresh token sits in `expo-secure-store`; the access token only in memory.

The backend gets the six briefed changes (A1–A6) plus two small ones the review surfaced (A7, A8), each unit-tested, with web behaviour unchanged: header-gated body refresh tokens, blocked-customer rejection and DPDP token revocation, `trust proxy`, cart clearing after a successful order, a dedicated DPDP queue, `paymentMethod` on checkout preview, an idempotent `PaymentService.initiate` so retried `place` calls never corrupt a captured payment (A7), and a `move-to-cart` endpoint (A8). `@belzo/shared` gains the web's pure view helpers (`formatInr`, price-breakup view, order-view logic, home defaults), and the web re-exports them so its imports and behaviour stay identical.

Server Docker images and the deploy tarball stay React-Native-free: the Dockerfiles already install only the importers whose `package.json` they copy. We add a root `.dockerignore` (`apps/mobile`, `**/node_modules`) and a deploy-script exclusion for `apps/mobile`, and we verify both by simulation. CI keeps its Node 20.14 job for the server packages (mobile filtered out) and gains a separate mobile job on Node 22.13.0. A root `.easignore` keeps EAS uploads to the mobile app, shared package and root workspace files, with every secret pattern excluded.

**Deploy order (owner/orchestrator):** deploy the backend changes (at least A1, A7 and A8) **before** distributing any mobile build. A build against an older server cannot log in; the app maps that case to "This app needs a newer server version" (§5.3).

**Dev and preview builds talk to the LIVE store** at `http://13.48.85.9`. Orders placed from them are real orders. Online payment is off by default in every variant (§13.1).

No APK is built in this run. There is no Android SDK on this machine, and an EAS build needs the owner's Expo account. Verification is typecheck, lint, Jest, `expo config`, `expo-doctor`, `expo prebuild` (file generation only) and `expo export` where it works offline.

### Key decisions at a glance (locked once this design is approved)

| Topic | Decision |
|---|---|
| Framework | Expo SDK 57 development build, Continuous Native Generation (no committed `android/`), EAS Build profiles. Not Expo Go. |
| Navigation | React Navigation 7: root native-stack, 4 bottom tabs, modal groups, `linking` config with custom scheme. |
| Server state | TanStack Query 5 (cart included). |
| Client state | Zustand 5: session, pincode, recently viewed, recent searches, checkout draft. |
| HTTP | Own typed `fetch` client (no axios). |
| Forms | react-hook-form 7.89 + `@hookform/resolvers` 3.10 + zod 3.23.8, using shared schemas. |
| Shared package | Consumed from `packages/shared/src` through tsconfig `paths`, Jest `moduleNameMapper` and a Metro `resolveRequest`. No dist build, and no change to shared's `package.json`. |
| pnpm layout | Keep the default isolated `node_modules`. No `.npmrc`, no hoisting. |
| Docker isolation | Root `.dockerignore` excludes `apps/mobile` and `**/node_modules`; the deploy tarball excludes `apps/mobile`; Dockerfiles unchanged. |
| CI | Existing Node 20.14.0 job runs with `--filter '!@belzo/mobile'`; new `mobile` job on Node 22.13.0 runs mobile typecheck, lint and test. |
| EAS upload | Root `.easignore` (replaces all `.gitignore` files for EAS): repeats every ignore/secret pattern and drops `apps/api`, `apps/web` and docs folders. |
| Variants | `development` (package `in.belzo.emart.dev`, cleartext only for listed hosts) and `production` (package `in.belzo.emart`, no cleartext, https base URL enforced at config time). |
| Payments | COD always. The `mock` online flow (poll the order, as web `/order-result` does) exists but is **off by default in every variant** (`EXPO_PUBLIC_ONLINE_PAYMENT=on` opts in). Razorpay sits behind a `PaymentAdapter` interface whose implementation is an unavailable stub (Phase 5); if it is ever reached, the app cancels the just-placed order so no stock stays reserved. |
| Push | Out of scope. A stub module only; `expo-notifications` is NOT installed. |
| Cart clearing (A4) | COD: in `CheckoutService.place` after a fresh order. Online: in `PaymentService.markCaptured`. Both call one new `CartService.removePurchased`. |

---

## 1. Architecture and `apps/mobile` folder structure

### 1.1 Layers

```
Screens (features/*/screens)        UI only: compose ui/ components, call feature hooks
   │
Feature hooks (features/*/hooks.ts) TanStack Query queries/mutations, navigation side-effects
   │
Feature API (features/*/api.ts)     typed endpoint functions: path, method, body, response type
   │
API core (src/api)                  client.ts (fetch, timeout, auth, guest token, refresh, 429),
                                    token-manager.ts, errors.ts, query-client.ts, query-keys.ts
   │
Platform (src/lib, src/store)       SecureStore/AsyncStorage wrappers, Zustand stores, logger
```

Rules:

- Screens never call `fetch` or `apiRequest` directly. They use feature hooks.
- `features/*/api.ts` functions are plain async functions with no React, so they are unit-testable with a mocked `fetch`.
- Pure logic (formatting, price breakup rows, order stepper, return rules, home-section defaults) comes from `@belzo/shared`. Mobile-only pure logic lives in `*.ts` files next to the feature and is unit-tested (for example `order-result.ts`, `href.ts`, `image-url.ts`, `checkout-attempt.ts`).

### 1.2 Folder structure

```
apps/mobile/
  package.json                 # @belzo/mobile; scripts in §8.4
  app.config.ts                # variants (development | production), plugins, extra
  eas.json                     # development | preview (APK) | production (AAB)
  babel.config.js              # presets: ['babel-preset-expo']
  metro.config.js              # Expo default + @belzo/shared source resolution + blockList (§8.2)
  jest.config.js               # preset jest-expo, moduleNameMapper, setupFiles
  jest.setup.ts                # mocks: secure-store, async-storage, netinfo, expo-crypto, expo-image, flash-list
  tsconfig.json                # extends expo/tsconfig.base, strict, paths (§8.2)
  .eslintrc.js                 # root: true, extends: ['expo']
  .gitignore                   # android/ ios/ .expo/ dist/ *.jks *.keystore google-services.json ...
  index.ts                     # registerRootComponent(App)
  README.md                    # setup, variants, EAS, LIVE-store warning, deploy order, owner TODOs (placeholder logo, Expo account, HTTPS)
  __tests__/
    app-config.test.ts         # §13.1
    metro-config.test.ts       # §8.2: resolveRequest maps @belzo/shared to packages/shared/src/index.ts
  plugins/
    with-network-security-config.js   # dev-only cleartext allowlist (§13.3)
  scripts/
    sync-brand.mjs             # copies apps/web/public/belzo-logo.svg into src/ui/brand/belzo-logo.generated.ts
    generate-placeholder-assets.mjs   # rasterises the SVG into assets/placeholder/*-PLACEHOLDER.png
    check-easignore.mjs        # verifies the root .easignore is a superset of every .gitignore and uploads no secrets (§13.2)
  assets/placeholder/
    icon-PLACEHOLDER.png                 # 1024x1024
    adaptive-foreground-PLACEHOLDER.png  # 1024x1024, logo at 66% safe zone
    splash-icon-PLACEHOLDER.png          # 512x512
  src/
    app/
      App.tsx                  # providers + RootNavigator + ErrorBoundary
      providers.tsx            # QueryClientProvider, SafeAreaProvider, ToastProvider, NavigationContainer
      boot.ts                  # useBoot(): hydrate stores, restore session, onboarding flag; hides native splash
      ErrorBoundary.tsx
    config/
      env.ts                   # typed+validated Constants.expoConfig.extra (§13.1)
    api/
      client.ts                # apiRequest<T>() (§5)
      token-manager.ts         # access token in memory, refresh single-flight, session generation
      errors.ts                # ApiError, toApiError(), userMessage(), fieldErrorsFrom()
      guest-token.ts           # getGuestToken(), rotateGuestToken()
      query-client.ts          # QueryClient defaults, onlineManager/focusManager wiring
      query-keys.ts            # qk.* factory (§6.2)
      image-url.ts             # resolveImageUrl()
      upload.ts                # uploadImage(path, localUri) multipart
      types.ts                 # response DTOs not already in @belzo/shared (§4.3)
    navigation/
      RootNavigator.tsx        # root native-stack incl. modal groups
      MainTabs.tsx             # bottom tabs
      linking.ts               # deep-link config
      types.ts                 # RootStackParamList, MainTabParamList
      href.ts                  # hrefToRoute(webHref) for CMS/banner/promo links
      RequireAuth.tsx          # wrapper for protected screens
      after-auth.ts            # pure state transform used after login (§2.4)
    theme/
      tokens.ts                # colors, spacing, radius, typography, shadows, touch (§3)
      index.ts                 # export const theme
    ui/                        # reusable, themed, accessible components (§3.4)
      Button.tsx IconButton.tsx TextField.tsx OtpField.tsx SearchBar.tsx
      ProductCard.tsx ProductRail.tsx CategoryCard.tsx PriceDisplay.tsx DiscountBadge.tsx
      QuantitySelector.tsx Skeleton.tsx EmptyState.tsx ErrorState.tsx ConfirmDialog.tsx
      AddressCard.tsx OrderStatusBadge.tsx OrderStepper.tsx RemoteImage.tsx Rating.tsx
      Screen.tsx SectionHeader.tsx Toast.tsx OfflineBanner.tsx RadioRow.tsx Chip.tsx Sheet.tsx
      brand/BelzoLogo.tsx brand/belzo-logo.generated.ts
    store/
      session.ts pincode.ts recently-viewed.ts recent-searches.ts checkout-draft.ts
    lib/
      storage.ts               # AsyncStorage JSON helpers
      secure.ts                # SecureStore wrappers (keys in §6.3)
      logger.ts                # __DEV__-only console; never logs tokens/PII
      debounce.ts              # useDebouncedValue
    features/
      auth/        api.ts hooks.ts session.ts screens/{LoginScreen,OtpVerifyScreen,RegisterScreen}.tsx __tests__/
      onboarding/  screens/OnboardingScreen.tsx onboarding-flag.ts
      home/        api.ts hooks.ts screens/HomeScreen.tsx components/{HeroBanner,PromoGrid,WhyGrid,HomeBlocks,CategoryShortcuts}.tsx
      categories/  api.ts hooks.ts tree.ts screens/CategoriesScreen.tsx
      products/    api.ts hooks.ts screens/{ProductListScreen,ProductDetailScreen,ImageViewerScreen}.tsx components/{VariantPicker,SlabTable,DeliveryCheck,ReviewsList,Gallery}.tsx
      search/      api.ts hooks.ts screens/SearchScreen.tsx
      wishlist/    api.ts hooks.ts screens/WishlistScreen.tsx
      cart/        api.ts hooks.ts screens/CartScreen.tsx components/{CartLineRow,CouponBox}.tsx
      checkout/    api.ts hooks.ts checkout-attempt.ts checkout-selection.ts payment-outcome.ts order-result.ts screens/{CheckoutScreen,OrderConfirmationScreen}.tsx
      payments/    adapter.ts mock-adapter.ts razorpay-adapter.stub.ts registry.ts
      addresses/   api.ts hooks.ts screens/{AddressesScreen,AddressFormScreen}.tsx
      orders/      api.ts hooks.ts screens/{OrdersScreen,OrderDetailScreen,CancelOrderScreen,ReturnRequestScreen}.tsx components/{TrackingTimeline,PriceBreakupRows,ReturnPhotoPicker}.tsx
      notifications/ api.ts hooks.ts push.ts screens/NotificationsScreen.tsx
      profile/     api.ts hooks.ts screens/{AccountScreen,ProfileEditScreen}.tsx
      support/     api.ts hooks.ts screens/{HelpScreen,CmsPageScreen}.tsx
      privacy/     api.ts hooks.ts export-decode.ts screens/{PrivacyDataScreen,DataExportViewScreen}.tsx
```

Import alias: `@/` → `apps/mobile/src/` (tsconfig `paths`, which jest-expo and Expo's Metro both honour). Cross-feature imports go through a feature's `hooks.ts` or `api.ts` only.

---

## 2. Navigation (React Navigation 7)

### 2.1 Tree

```
NavigationContainer (linking, theme; mounted only after boot settles, see §2.5)
└─ RootStack (native-stack)
   ├─ Onboarding                      initial route only when the onboarding flag is unset
   ├─ Main  (bottom tabs, backBehavior: 'firstRoute', headerShown false)
   │   ├─ HomeTab        → HomeScreen
   │   ├─ CategoriesTab  → CategoriesScreen
   │   ├─ CartTab        → CartScreen        (badge = active units in cart)
   │   └─ AccountTab     → AccountScreen     (guest: sign-in CTA + help; customer: menu)
   ├─ ProductList        { categoryId?, categorySlug?, brandId?, sort?, title? }
   ├─ ProductDetail      { idOrSlug }
   ├─ Search             { q?, sort? }
   ├─ Checkout           [auth] { addressId? }
   ├─ OrderConfirmation  [auth] { orderId, provider, notice? }
   ├─ Orders             [auth]
   ├─ OrderDetail        [auth] { id }
   ├─ Wishlist           [auth]
   ├─ Addresses          [auth] { selectForCheckout?: boolean }
   ├─ Notifications      [auth]
   ├─ ProfileEdit        [auth]
   ├─ PrivacyData        [auth]
   ├─ DataExportView     [auth] { requestId }
   ├─ Help
   ├─ CmsPage            { slug }
   ├─ Group presentation:'modal'
   │   ├─ Login          { redirect?: RedirectTarget }
   │   ├─ OtpVerify      { requestId, target, channel, expiresAt, devCode?, redirect? }
   │   ├─ Register       { redirect? }
   │   ├─ AddressForm    [auth] { addressId?, selectForCheckout? }
   │   ├─ CancelOrder    [auth] { orderId }
   │   └─ ReturnRequest  [auth] { orderId }
   └─ Group presentation:'fullScreenModal'
       └─ ImageViewer    { images: string[], index }
```

`RedirectTarget = { name: keyof RootStackParamList; params?: object }`.

Exact param types for the routes whose params carry behaviour (`navigation/types.ts`):

```ts
Checkout: { addressId?: string } | undefined;
Addresses: { selectForCheckout?: boolean } | undefined;
AddressForm: { addressId?: string; selectForCheckout?: boolean } | undefined;
OrderConfirmation: { orderId: string; provider: string; notice?: 'payment_unavailable' | 'payment_unavailable_cancel_failed' | 'payment_incomplete' };
ImageViewer: { images: string[]; index: number };
```

**ImageViewer** is a horizontal paging `FlatList` (`pagingEnabled`, `initialScrollIndex = index`, `getItemLayout` from the window width) of `RemoteImage` with `contentFit="contain"` on a black background, a "3 / 7" page indicator and a 48 dp close `IconButton` ("Close image viewer"). There is **no pinch-zoom in v1**, so no `react-native-gesture-handler` or `react-native-reanimated` is added.

Detail screens sit on the root stack above the tabs, so they can be pushed from any tab and the tab bar is hidden on them. Each tab holds exactly one screen, so there are no nested tab stacks.

### 2.2 Auth-aware behaviour

- Guests can browse, search, view products and use the guest cart.
- `[auth]` screens are always registered. Their component is wrapped in `<RequireAuth>`. If `session.status === 'guest'`, it renders a "Sign in to continue" `EmptyState` whose button opens `Login` with `redirect` set to the current route. Registering them always is what lets deep links like `orders/:id` resolve for logged-out users.
- `requireAuth(navigation, target)` is the helper every protected action uses: Checkout CTA, wishlist heart, coupon apply, Buy now. A customer navigates directly; a guest navigates to `Login { redirect: target }`.
- While `session.status === 'restoring'`, the native splash is still visible (§2.5), so no screen ever sees `restoring`.
- On logout or session expiry: `queryClient.clear()`, then `navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'HomeTab' } }] })`.

### 2.3 Android back behaviour

| Situation | Behaviour | Mechanism |
|---|---|---|
| Any pushed screen or modal | Pops or dismisses | native-stack default |
| Categories, Cart or Account tab | Switches to Home tab | `backBehavior: 'firstRoute'` |
| Home tab | Exits the app (system default) | — |
| Checkout while `place` is in flight | Back is blocked; toast "Placing your order…" | `usePreventRemove(isPlacing, …)` |
| CancelOrder or ReturnRequest with a non-empty draft | ConfirmDialog "Discard this request?" | `usePreventRemove(isDirty, …)` |
| OrderConfirmation | Back goes to Home, never back into Checkout | after `place` succeeds, `navigation.reset({ index: 1, routes: [{name:'Main'}, {name:'OrderConfirmation', params}] })` |
| ImageViewer | Closes the viewer | modal default |
| OtpVerify | Returns to Login | stack default |

### 2.4 Returning after login

Login, OtpVerify and Register carry `redirect`. On success, `navigation.dispatch(afterAuth(redirect))` runs, where `afterAuth` is a pure function in `navigation/after-auth.ts`:

```ts
const AUTH_ROUTES = ['Login', 'OtpVerify', 'Register'];
export function afterAuth(redirect?: RedirectTarget) {
  return (state: StackNavigationState<RootStackParamList>) => {
    const routes = state.routes.filter((r) => !AUTH_ROUTES.includes(r.name));
    if (redirect) routes.push({ key: `${redirect.name}-${Date.now()}`, name: redirect.name, params: redirect.params } as never);
    return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
  };
}
```

It is unit-tested: auth routes are removed, the redirect is appended, and with no redirect the user returns to the previous screen.

### 2.5 Splash, boot and onboarding

1. `index.ts` calls `SplashScreen.preventAutoHideAsync()` at module scope.
2. `useBoot()` runs `Promise.all([hydrateStores(), restoreSession(), readOnboardingFlag()])`. Stores are Zustand `persist` with AsyncStorage, hydrated through `persist.rehydrate()`. There is no artificial delay; the only bound is the refresh request's 10 s timeout. The boot refresh runs with `retry429: false` (§5.4), so a 429 cannot stretch boot past 10 s.
3. When boot settles, call `SplashScreen.hideAsync()` and render the navigator with `initialRouteName = onboardingDone ? 'Main' : 'Onboarding'`.
4. `restoreSession()` (§5.4) never blocks on `/me`; the profile loads as a normal query.
5. Onboarding has three static slides (copy adapted from the existing `DEFAULT_HOME_EMART.why` items; no new imagery), with Skip, Next and Get started. Finishing writes AsyncStorage `belzo.onboarding.v1 = "done"` and calls `navigation.replace('Main')`.

### 2.6 Deep links

- Schemes: production `belzoemart://`, development `belzoemart-dev://` (`app.config.ts` › `scheme`). Distinct schemes avoid an Android chooser when both apps are installed.
- `prefixes: [Linking.createURL('/')]` (expo-linking).
- https App Links are out of scope until the domain and HTTPS exist (§14).

```ts
config: { screens: {
  Main: { screens: { HomeTab: '', CategoriesTab: 'categories', CartTab: 'cart', AccountTab: 'account' } },
  ProductDetail: 'product/:idOrSlug',
  ProductList: 'category/:categorySlug',
  Search: 'search',              // ?q=&sort=
  Orders: 'orders',
  OrderDetail: 'orders/:id',
  Wishlist: 'wishlist',
  Notifications: 'notifications',
  CmsPage: 'page/:slug',
} }
```

`ProductList` with only `categorySlug` resolves the id from the cached `/categories` tree (`categories/tree.ts` › `findBySlug`). If the slug is not found, it shows the EmptyState "Category not found" with a "Browse categories" action.

### 2.7 Web href mapping (`navigation/href.ts`)

Home content, banners (`linkUrl`) and CMS links are web paths. `hrefToRoute(href, apiBaseUrl)` returns `{ kind: 'route', name, params } | { kind: 'external', url } | null`:

| Input | Result |
|---|---|
| `null`, `''`, `'#'` | `null` (the element is not tappable) |
| `/` | `Main › HomeTab` |
| `/search?q=x[&sort=s]` | `Search { q, sort }` |
| `/search` or `/search?sort=s` (no `q`) | `ProductList { sort: s ?? 'relevance', title: 'All products' }` |
| `/category/:slug` | `ProductList { categorySlug }` |
| `/product/:slug` | `ProductDetail { idOrSlug: slug }` |
| `/page/:slug` | `CmsPage { slug }` |
| `/cart`, `/wishlist`, `/orders`, `/orders/:id`, `/notifications`, `/account` | the matching route |
| absolute `http(s)://` with the same host as `apiBaseUrl` | the path is mapped as above |
| other absolute `http(s)://` | `{ kind: 'external', url }`, opened with `WebBrowser.openBrowserAsync` |
| anything else | `null` |

Unit-tested with a table of cases.

---

## 3. Design system and theme tokens

Source: `apps/web/src/app/globals.css` `:root` plus the live eMart overrides (`.theme-root[data-theme='emart']`), as recorded in Phase 1 §4. The app always uses the eMart look, because the live theme is `emart`. If `/settings/public` returns `classic`, only the home *content* defaults switch (`mergeHome(theme, …)`); styling does not.

### 3.1 Colour tokens (`theme/tokens.ts`)

| Token | Value | Web source | Use |
|---|---|---|---|
| `primary` | `#2874f0` | `--brand` / `--fk-blue` | Home header bar background, icons, focus ring, selected chips (with dark text), large text |
| `primaryStrong` | `#1c5cd6` | `--brand-dark` | **Filled primary buttons** (white label), link text, active tab label |
| `brand` | `#16a34a` | eMart `--fk-green` | Brand accents, icons, large text, success icons |
| `brandStrong` | `#15803d` | eMart (×8 in CSS) | "Buy now" filled button (white label), discount text, "In stock" text |
| `price` | `#e11d48` | `--em-price` | Selling price text |
| `danger` | `#b91c1c` | eMart (×17) | Errors, destructive buttons |
| `dangerSoft` | `#ff6161` | `--fk-red` | Decorative only (never text on white) |
| `navy` | `#172337` | `--fk-navy` | Dark surfaces (onboarding footer), headings on light backgrounds |
| `ink` | `#212121` | `--ink` | Primary text |
| `inkStrong` | `#0f172a` | eMart (×7) | Titles |
| `muted` | `#6b7280` | `--muted-2` | Secondary text and placeholders (AA on white) |
| `mutedSoft` | `#878787` | `--muted` | Disabled text and decorative only (fails AA for small text) |
| `orange` | `#fb641b` | `--fk-orange` | Accent fills with `ink` text only (badges); never a white label |
| `yellow` | `#ff9f00` | `--fk-yellow` | Rating star fill |
| `logoOrange` | `#f4601a` | logo SVG | Brand accent (logo only) |
| `bg` | `#f6faf6` | eMart background | Screen background |
| `surface` | `#ffffff` | `--surface` | Cards, sheets, header on non-home screens |
| `surface2` | `#f9fafb` | `--surface-2` | Grouped list backgrounds, skeleton base |
| `border` | `#e0e0e0` | `--border` | Card and input borders |
| `border2` | `#eef0f3` | `--border-2` | Dividers |
| `slate` | `#cbd5e1` | eMart (×8) | Disabled borders |
| `successBg` | `#e8f5ec` | derived (tint of `brand`) | "x% off" chip background (text `brandStrong`) |
| `dangerBg` | `#fdecec` | derived (tint of `danger`) | Inline error background |
| `overlay` | `rgba(15,23,42,0.5)` | derived | Dialog scrim |
| `button.primaryFill` / `button.accentFill` | `= primaryStrong` / `= brandStrong` | — | The only place Button reads its fill from (see the deviation note below) |

**Contrast decisions.** I computed WCAG ratios against white:

- `#2874f0` is 4.33:1, which fails AA for normal-size text. That is why filled buttons and link text use `primaryStrong` `#1c5cd6` (5.9:1).
- `#16a34a` is 3.3:1, so white labels go on `#15803d` instead (5.0:1).
- `#e11d48` is 4.7:1, so the price colour passes.
- `#6b7280` is 4.95:1, so muted text passes.
- `#878787` is 3.6:1, so it is used for disabled or decorative text only.
- `#fb641b` with white text is 3.0:1, so orange fills always carry `ink` text (5.3:1).

The resulting palette keeps the web's blue-primary, green-brand look. Full WCAG validation still needs manual TalkBack testing and an accessibility review.

**Deliberate deviation from the brief.** The brief names `#2874f0` for primary actions and `#16a34a` for green accents. Both stay the brand tokens and are used for accents, icons, the header bar and large text. *Filled* buttons with 16 sp labels instead use the darker web tokens `#1c5cd6` (`--brand-dark`) and `#15803d`, because white 16 sp text fails WCAG AA at 4.33:1 and 3.3:1. If the owner prefers exact `#2874f0` fills, change one token (`button.primaryFill`) and accept the AA failure.

**Owner decision (carried from Phase 1).** Confirm blue as the primary action colour. The web itself is inconsistent here (manifest `#0f766e`, Razorpay widget `#2563eb`).

### 3.2 Typography, spacing, shape and depth

- **Font.** System font, so Roboto on Android: `fontFamily` is left undefined. Android's system fallback renders Devanagari (Noto Sans Devanagari) automatically for Hindi product text, so no font is bundled (Phase 1 §4: the web never actually loads Inter either). UI copy is English only in this run.
- **Type scale** (`fontSize` / `lineHeight` in sp):
  - `caption` 12/16
  - `body` 14/20
  - `bodyLg` 16/22
  - `title` 18/24 (weight 700)
  - `heading` 20/26 (700)
  - `display` 24/30 (700)
  - `price` 18/24 (700, colour `price`)
  - Weights: `regular '400'`, `medium '500'`, `bold '700'`
  - `allowFontScaling` stays on. `maxFontSizeMultiplier: 1.6` applies to dense rows (price rows, tab labels, badges).
- **Spacing** (4-pt grid): `xxs 2, xs 4, sm 8, md 12, lg 16, xl 24, xxl 32`. Screen horizontal padding is `lg`.
- **Radius:** `sm 4, md 8` (web `--radius`), `lg 12, pill 999`. Cards and inputs use `md`; chips use `pill`.
- **Shadows.** The web values are used verbatim through RN's `boxShadow` style prop, which is supported on Android under the New Architecture (RN ≥ 0.76; **UNVERIFIED** on a device):
  - `sm: '0 1px 2px rgba(0,0,0,0.06)'`
  - `md: '0 2px 8px rgba(0,0,0,0.08)'`
  - `lg: '0 6px 20px rgba(0,0,0,0.12)'`
- **Touch.** `minTouch: 48` (dp). Every pressable gets `minHeight`/`minWidth` 48 or a `hitSlop` that reaches 48.
- **Motion.** `expo-image` transition 150 ms. The skeleton pulse is an `Animated` opacity loop, disabled when `AccessibilityInfo.isReduceMotionEnabled()` is true. The banner carousel does not autoplay. Nothing else is animated.

### 3.3 Brand assets

- **In-app logo.** `ui/brand/BelzoLogo.tsx` renders `SvgXml` (react-native-svg 15.15.4) from `belzo-logo.generated.ts`, which is the verbatim content of `apps/web/public/belzo-logo.svg`.
  - `scripts/sync-brand.mjs` regenerates the TS module.
  - A Jest test reads both files and asserts that the embedded XML equals the web file, so drift is caught.
  - The SVG's `<text>` uses "Segoe UI, Arial", which falls back to Roboto on Android. This is the known limitation from Phase 1, and only an outlined master logo fixes it.
- **Launcher icon, adaptive icon and splash.** `scripts/generate-placeholder-assets.mjs` uses `@resvg/resvg-js` 2.6.2 (devDependency) with `loadSystemFonts: true` to rasterise the same SVG into the three `*-PLACEHOLDER.png` files listed in §1.2:
  - The adaptive foreground is the logo scaled to 66% on a transparent 1024 canvas, with background `#ffffff`.
  - The PNGs are committed.
  - `README.md` states that these are placeholders generated from the web SVG and that **the owner must supply the official master logo** (vector with outlined text plus a 1024 px PNG).
  - No new logo is designed.

### 3.4 Reusable components (`src/ui`)

All components are typed, themed from `tokens.ts`, and accessible: `accessibilityRole`, `accessibilityLabel`, `accessibilityState` and a 48 dp target.

| Component | Props (key) | Notes |
|---|---|---|
| `Button` | `variant: 'primary' or 'accent' or 'secondary' or 'ghost' or 'danger'`, `loading`, `disabled`, `onPress`, `icon?` | primary = `primaryStrong` fill; accent = `brandStrong` fill; secondary = white with `primaryStrong` border and text; `loading` shows a spinner and sets `accessibilityState.busy` |
| `IconButton` | `icon`, `label` (required, for a11y), `badge?` | `@expo/vector-icons` MaterialCommunityIcons |
| `TextField` | RHF `control`, `name`, `label`, `error?`, keyboard props | Visible label, error text linked through `accessibilityHint` |
| `OtpField` | `value`, `onChange`, `length=6` | One input with `textContentType="oneTimeCode"` and `autoComplete="sms-otp"` |
| `SearchBar` | `value`, `onChangeText`, `onSubmit`, `editable`, `onPress` | Non-editable "fake" variant on Home opens Search |
| `ProductCard` | `product: ProductCardDto`, `onPress`, `onAdd?`, `adding?` | Image, title, unit, `PriceDisplay`, rating; the Add button is hidden when `defaultVariantId` is missing |
| `ProductRail` | `title`, `products`, `onViewAll?` | Horizontal `FlatList` of compact `ProductCard`s |
| `CategoryCard` | `node: CategoryNodeDto`, `onPress` | Image, or a lettered circle placeholder when `imageUrl` is unusable |
| `PriceDisplay` | `price`, `mrp?`, `size` | `formatInr`; MRP struck through only when `mrp > price`; `DiscountBadge` from shared `discountPct`; a11y label "Price ₹X, MRP ₹Y, Z% off" |
| `DiscountBadge` | `pct` | Hidden when 0; `brandStrong` text on `successBg` |
| `QuantitySelector` | `value`, `min=1`, `max=99`, `onChange`, `disabled`, `busy` | Increment/decrement buttons disabled at bounds; `accessibilityRole="adjustable"` with `accessibilityActions` increment and decrement |
| `Skeleton` | `width`, `height`, `radius` | Plus presets `ProductGridSkeleton`, `ListSkeleton`, `DetailSkeleton` |
| `EmptyState` | `icon`, `title`, `body?`, `action?` | — |
| `ErrorState` | `error: ApiError`, `onRetry` | Message from `userMessage(error)`; small "Ref: <correlationId first 8>" when present |
| `ConfirmDialog` | `visible`, `title`, `body`, `confirmLabel`, `destructive?`, `onConfirm`, `onCancel` | RN `Modal`, focus trapped, back closes it |
| `AddressCard` | `address`, `selected?`, `onPress?`, `actions?` | Default badge |
| `OrderStatusBadge` | `status` | Shared `statusBadge(status)` → label and tone; tone → colour map `ok brandStrong`, `info primaryStrong`, `warn #92400e on #fef3c7`, `bad danger`, `muted muted` |
| `OrderStepper` | `steps: Step[]` (shared `buildStepper`) | Vertical; `done`, `current`, `upcoming` and `terminal` styles; times through shared `formatDateTime` |
| `RemoteImage` | `uri`, `width`, `height`, `contentFit`, `alt`, `fallbackLabel` | `expo-image` with `cachePolicy="memory-disk"`, `recyclingKey={uri}`, a neutral `surface2` placeholder view, and on error a fallback with an icon and the first letter of `fallbackLabel`; URIs pass through `resolveImageUrl` |
| `Toast` | via `useToast().show({ message, tone })` | Bottom snackbar, 3 s; `AccessibilityInfo.announceForAccessibility` |
| `OfflineBanner` | — | Shown when NetInfo reports offline |
| `Screen` | `scroll?`, `refreshControl?`, `edges` | SafeArea plus `bg` (edge-to-edge is enforced on SDK 57) |
| `Rating`, `SectionHeader`, `RadioRow`, `Chip`, `Sheet` | — | Small primitives |

---

## 4. API mapping

Base: `${apiBaseUrl}/api/v1`.

- Every request carries `X-Client-Platform: mobile` (§5).
- "Bearer" means the client attaches `Authorization: Bearer <access>`.
- "Cart identity" means: if authenticated, Bearer only; else the `x-guest-token` header.
- Money is integer paise everywhere.
- "Shared" names refer to `@belzo/shared` exports; items marked *(new)* are added in §10 or §7.

### 4.1 Screen → endpoint table

| Screen / flow | Method and path | Auth | Request | Response (fields used) | Shared schema/type reused |
|---|---|---|---|---|---|
| Boot: restore session | POST `/auth/refresh` | none (body token) | `{refreshToken}` | `{accessToken, expiresIn, refreshToken}` | `mobileRefreshSchema` *(new)*, `mobileRefreshResponseSchema` *(new)* |
| Boot / Account | GET `/me` | Bearer | — | `{id,name,email,phone,gender,dob,photoUrl,locale,status}` | `CustomerProfile` *(new type)* |
| Login: phone or email OTP request | POST `/auth/otp/request` | none | `{phone}` or `{email}` | `{requestId, expiresAt, devCode?}` | `otpRequestSchema` |
| OtpVerify | POST `/auth/otp/verify` | none | `{requestId, code}` | `{accessToken, expiresIn, refreshToken, customer}` | `otpVerifySchema`, `mobileAuthResponseSchema` *(new)* |
| Login: password | POST `/auth/login` | none | `{email, password}` | same as verify | `emailLoginSchema`, `mobileAuthResponseSchema` |
| Register | POST `/auth/register` | none | `{name, email, password}` | same as verify | `emailRegisterSchema`, `mobileAuthResponseSchema` |
| Logout | POST `/auth/logout` | none (body token) | `{refreshToken}` | `{success:true}` | `mobileLogoutSchema` *(new)* |
| Post-login cart merge | POST `/cart/merge` | Bearer | `{guestToken}` | `CartView` | — (`CartView` type in `api/types.ts`) |
| Home: content | GET `/settings/public` | none | — | `{theme, home, footer, sections}` | `HomeContent`, `HomeSection`, `mergeHome`, `getHomeSections`, `DEFAULT_HOME_EMART`, `DEFAULT_SECTIONS` *(moved to shared)* |
| Home: banners | GET `/banners?placement=home_hero` | none | — | `[{id,imageUrl,linkUrl,title,displayOrder}]` | — |
| Home / Categories | GET `/categories` | none | — | `CategoryNodeDto[]` (3 levels) | `CategoryNodeDto` |
| Home: rails (sort source) | GET `/products?sort=<s>&pageSize=<limit>` | none | — | `{items: ProductCardDto[], total, page, pageSize}` | `ProductCardDto`, `productQuerySchema` (param typing) |
| Home: rails (category source) | GET `/products?categoryId=<id>&pageSize=<limit>` | none | — | same | same |
| Home: rails (manual source) and recently viewed | GET `/products?ids=<a,b,c>&pageSize=<n>` | none | — | same (order preserved, not paginated) | same |
| Home: PIN chip | GET `/settings/serviceability?pincode=<pin>` | none | — | `{serviceable, configured}` | `pincodeSchema` (input) |
| ProductList | GET `/products?page&pageSize=20&sort&categoryId?&brandId?` | none | — | paginated `ProductCardDto` | `productQuerySchema` |
| ProductList: brand filter | GET `/brands` | none | — | `[{id,name,slug,logoUrl,isActive}]` | — |
| Search: suggestions | GET `/search/autocomplete?q=` | none | — | `string[]` (≤8 titles) | — |
| Search: results | GET `/search?q&page&pageSize=20&sort` | none | — | paginated `ProductCardDto` | `productQuerySchema` |
| ProductDetail | GET `/products/:idOrSlug` | none | — | `ProductDetailDto` | `ProductDetailDto`, `VariantDto`, `resolveSlabPrice`, `discountPct` |
| ProductDetail: reviews | GET `/products/:productId/reviews` | none | — | `[{id,rating,title,body,imagesJson,verifiedPurchase,createdAt}]` (`customerId` is ignored and never shown) | — |
| ProductDetail: related | GET `/products?categoryId=<p.categoryId>&sort=popularity&pageSize=12` | none | — | paginated; the current product is filtered out client-side | — |
| ProductDetail: delivery check | GET `/settings/serviceability?pincode=` | none | — | `{serviceable, configured}` | `pincodeSchema` |
| ProductDetail / Cart: add | POST `/cart/items` | cart identity | `{variantId, quantity}` | `CartView` | `cartItemInputSchema` |
| Cart | GET `/cart` | cart identity | — | `CartView {cartId, items: CartLine[]}` | — |
| Cart: quantity | PUT `/cart/items/:variantId` | cart identity | `{variantId, quantity}` (variantId repeated, as required) | `CartView` | `cartItemInputSchema` |
| Cart: remove | DELETE `/cart/items/:variantId` | cart identity | — | `CartView` | — |
| Cart: save for later | POST `/cart/items/:variantId/save-for-later` | cart identity | — | `CartView` | — |
| Cart: move to cart | POST `/cart/items/:variantId/move-to-cart` *(new, A8)* | cart identity | — | `CartView` (line keeps its quantity, `savedForLater:false`) | — |
| Cart: coupon | POST `/coupons/validate` | Bearer | `{code, subtotal}` | `{code, valid, reason?, discount}` | — |
| Wishlist | GET `/wishlist` | Bearer | — | `[{id,variantId,createdAt,title,slug,imageUrl,unit,mrp,sellingPrice,discountPct,inStock}]` | — |
| Wishlist / PDP heart | POST `/wishlist` | Bearer | `{variantId}` | same list | — |
| Wishlist / PDP heart | DELETE `/wishlist/:variantId` | Bearer | — | same list | — |
| Addresses list / Checkout | GET `/me/addresses` | Bearer | — | `Address[]` (default first) | `AddressInput` (type) |
| AddressForm: create | POST `/me/addresses[?default=true]` | Bearer | `AddressInput` | `Address` | `addressInputSchema`, `GST_STATES` (state picker) |
| AddressForm: edit / set default | PUT `/me/addresses/:id[?default=true]` | Bearer | full `AddressInput` | `Address` | `addressInputSchema` |
| Addresses: delete | DELETE `/me/addresses/:id` | Bearer | — | `{success:true}` | — |
| AddressForm: autofill | GET `/me/addresses/resolve-pincode?pincode=` | Bearer | — | `{city, state}` (null for unknown PINs) | `pincodeSchema` |
| AddressForm: serviceability badge | GET `/settings/serviceability?pincode=` | none | — | `{serviceable, configured}` | — |
| Checkout: preview | POST `/checkout/preview` | Bearer | `{addressId, couponCode?, paymentMethod}` | `{breakup, coupon, items, serviceable, codEnabled, shippingWaived}` | `checkoutPreviewSchema` *(extended)*, `PriceBreakup`, `breakupView`, `snapshotFromBreakup` *(moved)* |
| Checkout: place | POST `/checkout/place?idempotencyKey=<uuid>` | Bearer | `{addressId, paymentMethod, couponCode?}` | `{orderId, reused, breakup, payment:{provider, amount, clientConfig?}}` | `placeOrderSchema`, `PaymentMethod` |
| OrderConfirmation (poll) | GET `/orders/:id` | Bearer | — | `OrderDetail` (status, payments, grandTotal) | `OrderDetail` *(moved)* |
| Orders | GET `/orders` | Bearer | — | `[{id,status,grandTotal,createdAt,itemCount,imageUrl,items[]}]` | `statusBadge`, `formatInr`, `formatDate` *(moved)* |
| OrderDetail | GET `/orders/:id` | Bearer | — | `OrderDetail` incl. `tracking: ReconciledTracking`, `returns`, `payments` | `OrderDetail`, `buildStepper`, `paymentSummary`, `breakupView`, `returnEligibility`, `cancelEligibility`, `cancelUnavailableReason`, `variantText`, `returnStatusLabel`, `resolutionLabel`, `shortOrderId`, `isLiveStatus` *(moved)*; `ReconciledTracking`, `statusLabel` |
| OrderDetail: invoice | GET `/orders/:id/invoice` | Bearer | — | `{url, number}` (HTML document) | — |
| CancelOrder | POST `/orders/:id/cancel` | Bearer | `{reason}` (≤300) | `{orderId, status:'cancelled'}` | `CANCEL_REASONS`, `cancelReasonError`, `cancelReasonText`, `refundNote`, `commentMaxChars` *(moved)* |
| Checkout: auto-cancel when online payment is unavailable (§6.6) | POST `/orders/:id/cancel` | Bearer | `{reason: 'Online payment unavailable in app'}` | `{orderId, status:'cancelled'}` | — |
| ReturnRequest: photo | POST `/orders/returns/media/upload` | Bearer | multipart field `file` (jpeg, ≤15 MB) | `{url, key}` | `MAX_RETURN_IMAGES` |
| ReturnRequest: submit | POST `/orders/returns` | Bearer | `buildReturnPayload(order, draft)` | return row | `RETURN_REASONS`, `returnStepError`, `resolutionOptions`, `photosRequired`, `buildReturnPayload`, `ReturnDraft`, `RETURN_STEPS` *(moved)* |
| OrderDetail: reorder | POST `/orders/:id/reorder` | Bearer | — | `CartView` | — |
| Notifications | GET `/notifications` | Bearer | — | `[{id,type,title,body,readAt,createdAt}]` (last 50) | — |
| Notifications: mark read | POST `/notifications/read` | Bearer | `{ids: uuid[] ≤100}` | — | — |
| Profile | PATCH `/me` | Bearer | changed fields only | updated profile | `profilePatchSchema` *(moved to shared)* |
| Help | GET `/cms/pages` | none | — | `[{slug,title}]` | — |
| CmsPage, privacy, terms | GET `/cms/pages/:slug` | none | — | `{id,slug,title,body,isActive,updatedAt}`; `body` is plain text split on `\n` | — |
| PrivacyData: export | POST `/me/data/export` | Bearer | — | `{jobId}` | — |
| PrivacyData: deletion | POST `/me/data/deletion` | Bearer | — | `{jobId}` | — |
| PrivacyData: list | GET `/me/data/requests` | Bearer | — | `[{id,type,status:'pending' or 'processing' or 'completed',resultUrl,createdAt,completedAt}]` | — |

Not used in this run: `/auth/google` (no Google login), `/wallet*`, `/referral/code`, `/reviews` POST and helpful votes, `/questions`, `/orders/:id/tracking` (the detail payload already contains `tracking`), `/orders/returns/mine`.

### 4.2 Endpoint caveats the UI must respect

- **Page-local price sort** (`/products`). `price_asc`, `price_desc` and `discount` are sorted after the DB page is fetched (Phase 1 §3). ProductList offers them, but when one is active it shows the caption "Price order applies within each loaded page". Price-range filters are not offered at all, because `total` ignores them.
- **`/search` sorts.** Price and discount sorts fall back to `ratingCount desc`, and `categoryId` is exact. The Search screen therefore offers only `relevance`, `newest`, `popularity` and `rating`, and no category filter.
- **Reviews** are unpaginated and expose `customerId`. The client never renders `customerId` and shows "Verified buyer" or "Customer" instead.
- **`PUT /cart/items/:variantId` on a missing line** returns 500 (P2025). The client responds by refetching the cart and showing a toast; see the §9 error table.
- **Invalid or expired Bearer on cart routes** silently falls back to guest resolution (`cart-context.ts` › `resolveCartRef`). This is why the client refreshes proactively before every Bearer-capable request (§5.3) and, when authenticated, never sends `x-guest-token`, so it can never be served the guest cart by accident.
- **`/settings/serviceability` failure.** The web fails open; mobile instead shows "Couldn't check delivery. Try again." The server enforces the gate at `place` regardless.
- **`resolve-pincode`** knows only 8 PINs. When it returns `{city:null, state:null}`, the form stays fully manual.

### 4.3 Response types defined in `src/api/types.ts`

These are TypeScript interfaces mirroring the server shapes in §4.1, used without runtime parsing:

- `CartView`, `CartLine` (field list exactly as in `apps/web/src/lib/cart-api.ts` plus `unavailable`)
- `WishlistItem`, `Address` (`AddressInput` + `id, isDefault, createdAt, updatedAt`), `Banner`, `Brand`, `PublicSettings`
- `OrderListItem`, `NotificationItem`, `CmsPageSummary`, `CmsPage`, `DataRequest`, `Review`
- `OtpRequestResult`, `CheckoutPreviewResult`, `PlaceOrderResult`, `Paginated<T>`
- `CustomerProfile` (`/me`: `id, name, email, phone, gender, dob, photoUrl, locale, status`)

Runtime zod parsing is applied only where a wrong shape would corrupt the session: auth responses (`mobileAuthResponseSchema`), refresh (`mobileRefreshResponseSchema`), and the error envelope (`apiErrorSchema`). Everything else is a typed cast of trusted first-party JSON, which keeps parse cost off list screens.

---

## 5. Typed fetch client (`src/api`)

### 5.1 Public surface

```ts
// api/client.ts
export type AuthMode = 'none' | 'optional' | 'required';
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';   // default GET
  query?: Record<string, string | number | undefined>;     // undefined values dropped; encoded with encodeURIComponent
  body?: unknown;                                            // JSON-encoded unless FormData
  auth?: AuthMode;                                           // default 'none'
  cart?: boolean;                                            // adds cart identity rules (§4)
  timeoutMs?: number;                                        // default 15_000; uploads 60_000; refresh 10_000
  signal?: AbortSignal;                                      // TanStack Query's signal, composed with the timeout
  retry429?: boolean;                                        // default true (see §5.5)
}
export async function apiRequest<T>(path: string, opts?: RequestOptions): Promise<T>;
```

```ts
// api/errors.ts
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'parse' | 'auth' | 'config';
export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number;          // 0 for non-HTTP kinds
  code: string;            // envelope `error` (e.g. 'BadRequestException', 'ValidationError'), or kind
  correlationId?: string;
  retryAfterSec?: number;  // from the Retry-After header on 429
}
export function userMessage(e: unknown): string;                            // §9.1
export function fieldErrorsFrom(e: ApiError): Record<string, string>;       // parses "path: msg; path2: msg2"
```

### 5.2 Request pipeline (in order)

1. **URL.** `${env.apiBaseUrl}/api/v1${path}` plus the query string.
2. **Headers.**
   - Always: `Accept: application/json`, `X-Client-Platform: mobile` (shared `CLIENT_PLATFORM_HEADER` / `MOBILE_CLIENT_PLATFORM`).
   - `Content-Type: application/json` only for non-FormData bodies. For FormData, no content type is set, so RN adds the boundary.
3. **Auth** (`auth !== 'none'`):
   - If `session.status === 'authenticated'`: `token = await tokenManager.getValidAccessToken()` (proactive refresh, §5.3), then `Authorization: Bearer ${token}`.
   - If that throws `kind:'auth'` (the session ended): for `required`, rethrow; for `optional`, continue as guest.
   - If the status is `guest`: for `required`, throw `ApiError{kind:'auth', status:401, code:'NotAuthenticated'}` without any network call; for `optional`, continue.
4. **Cart identity** (`cart: true`). When no Bearer was attached, add `x-guest-token: await getGuestToken()`. When a Bearer is attached, the guest header is **never** sent.
5. **Fetch.** A local `AbortController` aborts after `timeoutMs`; if `opts.signal` aborts, the local controller aborts too (listener removed in `finally`).
6. **Response.**
   - 2xx: read text; empty becomes `null`, otherwise `JSON.parse`. A parse failure is `kind:'parse'`.
   - Non-2xx: `apiErrorSchema.safeParse(json)`. On success, use its fields; otherwise `{status, code:'RequestFailed', message: 'Request failed (status)'}`.
7. **401 handling.** Applies when a Bearer was sent and this is the first attempt:
   - Call `tokenManager.refresh({ force: true, failedToken: token })` (single-flight).
   - Retry the request once with the new token.
   - If the retry is 401 again, call `tokenManager.expireSession('unauthorized')` and throw `kind:'auth'`.
   - Requests sent with `auth:'none'` (login, OTP, register, refresh, logout) never enter this branch, so "Invalid email or password" 401s are surfaced as-is.
8. **429 handling** (§5.5).
9. **Errors.**
   - A `TypeError` from fetch becomes `kind:'network'`.
   - An abort caused by our timer becomes `kind:'timeout'`.
   - An abort caused by the caller's signal becomes `kind:'aborted'`, which TanStack ignores.

### 5.3 Token manager (`api/token-manager.ts`)

State is module-level, never in React state and never persisted except the refresh token:

- `accessToken: string | null`
- `accessExpiresAt: number` (`Date.now() + expiresIn*1000`)
- `inflight: Promise<string> | null`
- `generation: number`

Functions:

- **`getValidAccessToken()`.** If `accessToken` is set and `accessExpiresAt - 60_000 > Date.now()`, return it. Otherwise `return refresh()`.
- **`refresh({ force?, failedToken?, retry429 = true })`.** This is the single-flight path.
  - If `inflight` is set, return it. This makes N concurrent callers share one `/auth/refresh` call; it is the key test.
  - If `force && accessToken && failedToken !== accessToken` (another caller already rotated after this request was sent), return the current `accessToken` without a network call.
  - Otherwise `inflight = doRefresh({ retry429 }).finally(() => (inflight = null))`.
- **`doRefresh({ retry429 })`:**
  1. `const gen = generation; const rt = await secure.getRefreshToken()`. If there is none, call `expireSession('missing')` and throw `auth`.
  2. `POST /auth/refresh` with `auth:'none'`, body `{ refreshToken: rt }`, timeout 10 s, the given `retry429` (boot passes `false`). Parse with `mobileRefreshResponseSchema`. If the parse fails because `refreshToken` is missing from a 2xx body (a server without A1 that rotated the cookie instead), throw `ApiError{kind:'config', code:'ServerTooOld'}` and keep the stored token untouched; `userMessage` maps it to "This app needs a newer server version. Please try again later."
  3. If `gen !== generation` (a logout happened meanwhile): fire-and-forget `POST /auth/logout {refreshToken: new}` to revoke the new family member, then throw `auth`.
  4. **Persist first:** `await secure.setRefreshToken(res.refreshToken)`. Then set `accessToken` and `accessExpiresAt`, and return the access token.
  5. On `http` 400, 401 or 403 (invalid, expired, reuse-detected, blocked): `expireSession('rejected')`, throw `auth`.
  6. On `network`, `timeout`, 5xx or 429-exhausted: rethrow as-is. The refresh token is **kept**, so a later request can retry.
- **`setSession(tokens)`** (after login). Writes SecureStore, then memory, then `generation++`.
- **`expireSession(reason)`.** `generation++`, clear memory, `secure.deleteRefreshToken()`, then `session.store.setGuest()` and emit `sessionEvents.emit('expired', reason)`. The app root listens: it calls `queryClient.clear()`, shows the toast "Your session has expired. Please sign in again." (except for reason `logout`), and resets navigation to Home.
- **`logout()`.** Reads the refresh token, best-effort `POST /auth/logout {refreshToken}` (timeout 5 s, errors ignored), then `expireSession('logout')`.

Known, unavoidable race: if the OS kills the app after the server rotated the token but before SecureStore finished writing, the next start presents the old (revoked) token. The server's reuse detection then revokes the family, and the user signs in again. This is documented in the README.

### 5.4 Session restore (boot)

1. `rt = await secure.getRefreshToken()`. If there is none: `session.setGuest()` and stop.
2. `session.setStatus('authenticated')` optimistically, then `await tokenManager.refresh({ retry429: false })`.
   - 429 (not retried at boot): treated like `network`, so the session stays authenticated and the first later request refreshes.
   - Success: authenticated, and the `qk.me` query loads `/me`.
   - `auth` error: guest (already done by `expireSession`).
   - `network` or `timeout`: stay `authenticated` with no access token. The app works with cached or offline data, and the first online request refreshes. If that later fails with `auth`, the normal expiry path runs.
3. If `secure.getPendingMergeToken()` is set and the session is authenticated, retry the cart merge once (§6.4).

### 5.5 Retries and 429 backoff

- **Client-level 429 retry** (any method) happens only when the `Retry-After` header is present and ≤ 10 s, at most 2 times. The wait is `Retry-After*1000 + jitter(0–250 ms)`.
  - This is safe for POSTs because `ThrottlerGuard` rejects before the handler runs. I checked `@nestjs/throttler` 6.2.1 `throttler.guard.js`: it sets `Retry-After` and throws before the controller.
  - A 429 without `Retry-After` is the business lockout from `LockoutService` ("Too many attempts. Try again later."). It is not retried.
  - A 429 with `Retry-After` > 10 s (for example the 5/min OTP request limit) is not retried. It surfaces as `ApiError{status:429, retryAfterSec}`, and the UI shows a countdown: "Too many attempts. Try again in 42 s."
- **Query retries** (`query-client.ts`):
  ```ts
  retry: (n, e) => n < 2 && e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout' || e.status >= 500)
  retryDelay: (n) => Math.min(1000 * 2 ** n, 4000) + Math.random() * 250
  ```

- **Mutations:** `retry: 0` everywhere. Checkout `place` has its own manual retry with key reuse (§6.6).
- **Deduplication.** TanStack dedupes identical query keys. Debounced inputs (search, autocomplete, PIN) prevent request storms, and superseded queries are aborted through `signal`.

### 5.6 Guest token (`api/guest-token.ts`)

- `getGuestToken()`: read SecureStore `belzo.guestToken`; if absent, generate `Crypto.randomUUID()` (expo-crypto), store it and return it. The result is memoised in memory after the first read.
- `rotateGuestToken()`: replace it with a new UUID, called after a successful merge.
- The value is ≥ 8 chars, which satisfies the server check in `resolveCartRef`.

### 5.7 Uploads (`api/upload.ts`)

`uploadImage('/orders/returns/media/upload', localUri)`:

- Builds `FormData` with `append('file', { uri, name: 'return-<uuid>.jpg', type: 'image/jpeg' } as never)`.
- Calls `apiRequest` with `method:'POST'`, `auth:'required'`, `timeoutMs: 60_000`, `retry429: false`.
- Returns `{url, key}`.
- Before upload, the image is normalised with `expo-image-manipulator`: resize to a max of 1600 px on the long edge and save as JPEG quality 0.8. This keeps it well under the 15 MB server limit and guarantees an extension the server's `isOwnReturnImageUrl` check accepts.

---

## 6. State, caching and key data flows

### 6.1 QueryClient defaults

- `staleTime`: 30 s by default.
- Overrides: categories, brands and CMS pages 10 min; `settings/public` and banners 2 min; product detail 60 s; cart 0 s (refetch on screen focus); orders and notifications 30 s.
- `gcTime`: 10 min.
- `refetchOnWindowFocus` is driven by `focusManager` with `AppState` `active`.
- `onlineManager` uses `@react-native-community/netinfo` (`setOnline(state.isConnected !== false)`), so offline queries pause and resume.

### 6.2 Query keys (`api/query-keys.ts`)

```ts
qk = {
  settings: ['settings','public'], banners: ['banners','home_hero'], categories: ['categories'], brands: ['brands'],
  products: (p: ProductParams) => ['products', p], productsByIds: (ids: string[]) => ['products','ids', ids.join(',')],
  product: (idOrSlug) => ['product', idOrSlug], related: (categoryId) => ['products','related', categoryId],
  reviews: (productId) => ['reviews', productId], search: (p) => ['search', p], autocomplete: (q) => ['autocomplete', q],
  serviceability: (pin) => ['serviceability', pin],
  cart: (identity: 'customer' | 'guest') => ['cart', identity], // identity = session.status === 'authenticated' ? 'customer' : 'guest'
  wishlist: ['wishlist'], me: ['me'], addresses: ['addresses'],
  preview: (addressId, coupon, method) => ['checkout','preview', addressId, coupon ?? '', method],
  orders: ['orders'], order: (id) => ['order', id], notifications: ['notifications'],
  cmsPages: ['cms','pages'], cmsPage: (slug) => ['cms','page', slug], dataRequests: ['dpdp','requests'],
}
```

The cart key includes the identity, so a guest cart is never shown after login, or a customer's cart after logout. The identity is derived only from `session.status` (never from `customer.id`, which is null at boot until `/me` loads), via a `useCartIdentity()` hook. That is sufficient because the cache is reset on every identity change: logout and expiry run `queryClient.clear()`, and login runs `queryClient.removeQueries({ queryKey: ['cart'] })` before the merge result is written (§6.4). While `status === 'restoring'` no screen is mounted (§2.5), so the key is never computed in that state.

### 6.3 Client stores and storage

| Store / key | Medium | Contents | Notes |
|---|---|---|---|
| `belzo.refreshToken` | SecureStore | opaque refresh token | Never in AsyncStorage, Zustand or logs |
| `belzo.guestToken` | SecureStore | UUID | Grants guest-cart access |
| `belzo.pendingMerge` | SecureStore | guest token awaiting merge | Set only when a merge failed |
| `useSessionStore` (Zustand, **not** persisted) | memory | `status: 'restoring' or 'authenticated' or 'guest'`, `customer: CustomerSummary or null` | `customer` is filled from the login response and refreshed from `qk.me` |
| `usePincodeStore` (persist `belzo.pincode`) | AsyncStorage | `pincode: string or null` (validated with `pincodeSchema` on hydrate) | When logged in with no PIN, adopts the default address PIN (as the web's `use-pincode.ts` does) |
| `useRecentlyViewedStore` (persist `belzo.recentlyViewed`) | AsyncStorage | product ids, max 20, newest first | Fetched with `qk.productsByIds` |
| `useRecentSearchesStore` (persist `belzo.recentSearches`) | AsyncStorage | strings, max 10, deduped case-insensitively | "Clear" action |
| `useCheckoutDraft` (Zustand, not persisted) | memory | `couponCode: string or null` | Carried from Cart to Checkout (the web uses sessionStorage) |
| `belzo.onboarding.v1` | AsyncStorage | `"done"` | Plain helper, not a store |
| `belzo.checkout.attempt` | AsyncStorage | `{ key, fingerprint, createdAt }` | §6.6 |

`app.config.ts` sets `android.allowBackup: false`, and the `expo-secure-store` plugin uses `configureAndroidBackup: true`, so neither encrypted values nor AsyncStorage end up in cloud backups.

### 6.4 Login success and cart merge (`features/auth/session.ts` › `completeLogin`)

```
completeLogin(res: MobileAuthResponse, queryClient):
  1. tokenManager.setSession({accessToken, expiresIn, refreshToken})
  0. (caller) res = mobileAuthResponseSchema.parse(json); a missing refreshToken → ApiError{kind:'config', code:'ServerTooOld'} (§5.3)
  2. session.setAuthenticated(res.customer); queryClient.removeQueries({ queryKey: ['cart'] })
  3. guest = await secure.peekGuestToken()        // does NOT create one
  4. if guest:
       try   view = await apiRequest('/cart/merge', {method:'POST', auth:'required', body:{guestToken: guest}})
             queryClient.setQueryData(qk.cart('customer'), view)
             await rotateGuestToken(); await secure.deletePendingMerge()
       catch await secure.setPendingMerge(guest)  // retried once on next boot (§5.4); never blocks login
  5. queryClient.invalidateQueries({ queryKey: ['wishlist'] }); invalidate qk.addresses, qk.orders
  6. if !pincodeStore.pincode: fetch addresses → adopt default.pincode
```

Tests cover: a merge is called with the guest token and the cart cache is set from the response; the guest token rotates after success; a merge failure stores the pending merge and still completes the login; with no guest token, no merge call is made.

### 6.5 Cart behaviour

- **Badge.** The sum of `quantity` over lines with `!savedForLater`, from the cart query.
- **Add (PDP, ProductCard, Wishlist).** `POST /cart/items`. The response replaces the cart cache, followed by the toast "Added to cart". The server sums quantities and clamps at 99.
- **Quantity.**
  - The `QuantitySelector` for a line is disabled while that line's mutation is in flight. Requests are serialised per line, with no optimistic race.
  - On success the cart cache is replaced.
  - On error: toast plus refetch.
  - The bound is `max = 99`.
- **Save for later.** `POST …/save-for-later`.
- **Move to cart.** `POST /cart/items/:variantId/move-to-cart` (new A8 endpoint, §7), which calls the existing `CartService.saveForLater(ref, variantId, false)`. One request; the quantity is preserved. The response replaces the cart cache. On a 500 (line no longer exists, P2025) the same "This item changed…" toast and refetch as the quantity PUT apply.
- **Line states.**
  - `unavailable` → "No longer available", with Remove only, the quantity hidden, and Checkout disabled.
  - `!inStock && available > 0` → "Only {available} left — reduce quantity".
  - `!inStock && available === 0` → "Out of stock".
  - If any active line is blocking, Checkout is disabled with the reason. The server enforces the same rule in `buildLines`.
- **Totals.** Display only: Σ `unitPrice*quantity`, Σ `mrp*quantity`, and savings. "Final amount, delivery and GST shown at checkout."
- **Coupon.** `CouponBox` calls `POST /coupons/validate {code, subtotal}`; a guest is sent through `requireAuth`. A valid code is stored in `useCheckoutDraft.couponCode`; an invalid one shows `reason`.
- **Bulk-slab hint.** When `priceSlabs.length > 0`, show "Bulk price applies on total quantity of this product (all packs)", because the server prices on `tierQty`.

### 6.6 Checkout and idempotency (`features/checkout/checkout-attempt.ts`)

```ts
fingerprint = sha256Hex([addressId, paymentMethod, couponCode ?? '', ...activeLines.map(l => `${l.variantId}:${l.quantity}`).sort()].join('|'))  // expo-crypto digestStringAsync
getOrCreateAttempt(fp): stored = read('belzo.checkout.attempt');
  if (stored && stored.fingerprint === fp && Date.now() - stored.createdAt < 30*60_000) return stored.key;
  key = Crypto.randomUUID(); write({ key, fingerprint: fp, createdAt: Date.now() }); return key;
settleAttempt(outcome): 'definitive' → delete('belzo.checkout.attempt'); 'ambiguous' → keep
```

Place flow (`usePlaceOrder`):

1. `key = await getOrCreateAttempt(fp)`.
2. Call `POST /checkout/place?idempotencyKey=${key}` with `{addressId, paymentMethod, couponCode?}`, `timeoutMs: 30_000`, `retry429: true`.
3. Classify the outcome:
   - **Definitive:** 2xx, or any 4xx including 429-exhausted. Call `settleAttempt('definitive')`. For a 4xx, show the server message, for example the non-serviceable PIN or "…out of stock".
   - **Ambiguous:** `network`, `timeout` or 5xx. Keep the key and show "We couldn't confirm your order. Check your connection and tap Place order again — you won't be charged twice." Retrying reuses the same key, and the server returns `reused: true` for an order it already created.
4. On success:
   - `invalidateQueries(qk.cart(id))` and `qk.orders`; clear `useCheckoutDraft.couponCode`.
   - `payment.provider === 'cod'`: reset to `[Main, OrderConfirmation {orderId, provider:'cod'}]`.
   - Otherwise `adapter = getPaymentAdapter(payment.provider)`, then `outcome = await adapter.pay({ orderId, clientConfig, amount, prefill })`:
     - `submitted` (mock): reset to OrderConfirmation, which polls.
     - `unavailable` (razorpay stub, unknown provider): `handlePaymentOutcome` in `features/checkout/payment-outcome.ts` calls `POST /orders/:id/cancel` with `{ reason: 'Online payment unavailable in app' }` **exactly once** (`retry429: false`, no retry loop; the order is `pending`, which `canCustomerCancel` allows, and `OrderService.cancel` releases the reserved stock).
       - Cancel succeeds: reset to OrderConfirmation with `notice: 'payment_unavailable'`. Copy: "Online payment isn't available in this app version yet. We cancelled this order and no money was taken. Please place it again with Cash on Delivery."
       - Cancel fails (any `ApiError`): reset to OrderConfirmation with `notice: 'payment_unavailable_cancel_failed'`. Copy: "We couldn't complete this order. Please contact support with order #{shortOrderId(orderId)}." Logged with `logger.warn` (`__DEV__` only).
       - The copy never mentions the website: no route can pay an existing pending order.
       - The flag in §13.1 (online payment off by default in every variant) keeps this path from being reached in normal builds.
     - `dismissed` or `failed`: same screen, "Payment was not completed".

The cart fingerprint guarantees that a reused key never maps an edited cart onto an old order. A reused key is safe on the server too: on `reused: true` the controller still calls `PaymentService.initiate`, which A7 makes a no-op for any payment that is no longer `created`. A7 claims the `created` → `pending` move atomically, so this also holds when a timed-out request 1 is still running on the server while the retry arrives (§7 A7).

`payment-outcome.ts` exports `handlePaymentOutcome(outcome, { orderId, cancelOrder })`, a plain async function returning the OrderConfirmation params, so it is unit-tested without React (`features/checkout/__tests__/payment-outcome.test.ts`):

- `unavailable` issues exactly one cancel call with the reason above and returns `notice: 'payment_unavailable'`.
- A rejected cancel returns `notice: 'payment_unavailable_cancel_failed'` and is not retried.
- `submitted`, `dismissed` and `failed` never call cancel.

Tests cover:

- The key is reused after network, timeout and 5xx errors.
- A new key is generated after 2xx and after 4xx.
- A new key is generated when the fingerprint changes, and after 30 min.
- The key survives a simulated restart: reset the module registry and keep the AsyncStorage mock.

### 6.7 Payment adapter (`features/payments`)

```ts
export type PaymentOutcome = { kind: 'submitted' } | { kind: 'dismissed' } | { kind: 'failed'; message: string } | { kind: 'unavailable'; message: string };
export interface PaymentRequest { orderId: string; amount: number; clientConfig?: Record<string, unknown>; prefill?: { name?: string; contact?: string; email?: string } }
export interface PaymentAdapter { readonly provider: string; isAvailable(): boolean; pay(req: PaymentRequest): Promise<PaymentOutcome> }
export function getPaymentAdapter(provider: string): PaymentAdapter  // 'mock' → mockAdapter; 'razorpay' → razorpayAdapterStub; else unavailableAdapter
```

- `mockAdapter.pay` resolves `{kind:'submitted'}`. The server's mock provider already auto-captured inside `place`.
- `razorpay-adapter.stub.ts` returns `isAvailable() === false` and `pay()` resolves `unavailable`. It carries a `// TODO(Phase 5): integrate react-native-razorpay 3.0.0 — open({key, order_id: clientConfig.orderId, amount, currency:'INR', name:'Belzo eMart', prefill}), treat success as "processing" and poll the order; never mark paid client-side.` comment and is **not** wired as working.
- `react-native-razorpay` is NOT installed in this run.

### 6.8 Order confirmation polling (`features/checkout/order-result.ts`)

A pure `resolveOrderResultView(order | null, provider)` returns `'confirmed' | 'cod' | 'awaiting' | 'failed' | 'notfound'`, with logic identical to the web `order-result/page.tsx` › `resolveView`. The screen uses `useQuery(qk.order(id), { refetchInterval: (q) => view === 'awaiting' && polls < 12 ? 2500 : false })`. After 12 polls it shows the "still processing" state. Copy is adapted from the web page.

### 6.9 Order detail refresh

`useQuery(qk.order(id), { refetchInterval: isLiveStatus(order.status) && isFocused ? 30_000 : false })` matches the web's 30 s polling while live. Cancel, return and reorder mutations invalidate `qk.order(id)` and `qk.orders`; reorder also sets the cart cache.

---

## 7. Backend changes (Scope A) — exact files, methods, web compatibility, tests

All eight (A1–A8) are additive. With no `X-Client-Platform` header, every response, cookie and status code the web sees stays byte-for-byte what it is today, except for the deliberate fixes in A2 to A7, which also apply to the web, and the new A8 route, which the web does not call. Each change gets Jest specs next to the existing ones (`apps/api` uses ts-jest with `*.spec.ts`; `@belzo/shared` is mapped to source). The suites run with `pnpm --filter @belzo/api test`, `pnpm --filter @belzo/shared test` and `pnpm --filter @belzo/web test`. Nothing is deployed.

### A1. Body-based refresh token for native clients

**Shared** (`packages/shared/src/constants.ts`, `schemas.ts`):

```ts
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';
export const MOBILE_CLIENT_PLATFORM = 'mobile';
export const mobileRefreshSchema = z.object({ refreshToken: z.string().min(1).max(512) });
export const mobileLogoutSchema = mobileRefreshSchema.partial();
export const customerSummarySchema = z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), locale: z.string() });
export const mobileAuthResponseSchema = z.object({ accessToken: z.string().min(1), expiresIn: z.number().int().positive(), refreshToken: z.string().min(1), customer: customerSummarySchema });
export const mobileRefreshResponseSchema = mobileAuthResponseSchema.omit({ customer: true });
export type MobileAuthResponse = z.infer<typeof mobileAuthResponseSchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
```

**New helper** `apps/api/src/modules/identity/client-platform.ts`:

```ts
export function isMobileClient(req: Request): boolean {
  const v = req.headers[CLIENT_PLATFORM_HEADER];           // express lower-cases header names
  return typeof v === 'string' && v.trim().toLowerCase() === MOBILE_CLIENT_PLATFORM;
}
export function readMobileRefreshToken(req: Request): string { return mobileRefreshSchema.parse(req.body ?? {}).refreshToken; } // ZodError → 400
export function readMobileLogoutToken(req: Request): string | undefined { return mobileLogoutSchema.parse(req.body ?? {}).refreshToken; }
```

A repeated header arrives as `string[]` and is treated as web; that is deliberate.

**Controller** `apps/api/src/modules/identity/auth.controller.ts`:

- Add `@Req() req: Request` to `verifyOtp`, `register` and `google`; `login` already has it.
- Add a private `deliver(req, res, tokens, customer)`:
  - Mobile: return `{ accessToken, expiresIn, refreshToken, customer }` and **do not** call `setRefreshCookie`.
  - Otherwise: `setRefreshCookie(res, tokens.refreshToken)` and return `{ accessToken, expiresIn, customer }`, exactly as today.
- `refresh(req, res)`:
  - Mobile: `const token = readMobileRefreshToken(req)`, then `auth.refresh(token)`, then return `{accessToken, expiresIn, refreshToken}` with no cookie.
  - Otherwise: today's code unchanged (`readRefreshCookie` then `setRefreshCookie`).
- `logout(req, res)`:
  - Mobile: `const token = readMobileLogoutToken(req)`; `if (token) await auth.logout(token)`; return `{ success: true }` **without** `clearRefreshCookie`.
  - Otherwise: unchanged.
- Body validation is done inside the handler, not with an `@Body()` DTO, because the web sends no body to refresh and logout, and a DTO-bound `ZodValidationPipe` would reject it.

**Logging.** Add `'req.body.refreshToken'` to the pino `redact.paths` in `apps/api/src/common/logger/logger.module.ts`. This is defence in depth: pino-http does not log bodies today, and `*.refreshToken` only matches one level deep.

**Errors the mobile client gets:**

| Case | Response |
|---|---|
| Missing or invalid body | 400 `ValidationError` "refreshToken: Required" |
| Unknown token | 401 "Invalid refresh token" |
| Reuse | 401 "Refresh token reuse detected" (family revoked) |
| Expired | 401 "Refresh token expired" |
| Blocked customer (A2) | 403 "Account is blocked" |

All are logged at `warn` by the existing `AllExceptionsFilter`.

**Web unchanged.** Without the header, the code paths are literally the existing statements. CORS needs no change: browsers never send the header, so no new preflight is triggered.

**Tests** (new `auth.controller.spec.ts`; controller built with a fake `CustomerAuthService`; `res = { cookie: jest.fn(), clearCookie: jest.fn() }`; `req = { headers, cookies, body, ip }`):

1. Web verify, register, login and google: the cookie is set with the token, and the body has no `refreshToken`.
2. Mobile verify, register, login and google: no cookie, and the body includes `refreshToken` plus `customer`.
3. Web refresh reads the cookie, rotates and sets the cookie. Web refresh with no cookie gives 401 "Missing refresh token" (unchanged).
4. Mobile refresh reads the body and returns all three fields with no cookie. Mobile refresh with `{}` throws `ZodError`.
5. Mobile logout revokes the body token and does not call `clearRefreshCookie`. Mobile logout with no body succeeds without calling revoke. Web logout clears the cookie.
6. The header value `Mobile ` (case and whitespace) counts as mobile; `['mobile','mobile']` counts as web.

### A2. Reject blocked customers on rotation; revoke tokens on DPDP deletion

**`apps/api/src/modules/identity/token.service.ts` › `rotate`.** After the revoked and expired checks, and before `issue`:

```ts
if (existing.principalKind === 'customer') {
  const customer = await this.prisma.customer.findUnique({ where: { id: existing.principalId }, select: { status: true } });
  if (!customer || customer.status === 'blocked') {
    await this.prisma.refreshToken.updateMany({ where: { familyId: existing.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new ForbiddenException('Account is blocked');
  }
}
```

The status is 403, matching `CustomerAuthService.ensureActive`. Admin rotation is untouched. On the web, `AuthProvider` treats any refresh failure as logged out, which is the correct behaviour for a blocked account.

**`apps/api/src/modules/identity/data-request.service.ts` › `processDeletion`.** Inside the existing `$transaction`, after the customer update:

```ts
await tx.refreshToken.updateMany({ where: { principalId: req.customerId, principalKind: 'customer', revokedAt: null }, data: { revokedAt: new Date() } });
```

**Tests:**

- `token.service.spec.ts`: extend `makeFakePrisma` with an in-memory `customer.findUnique` (default `active`). Add: a blocked customer is rejected with `ForbiddenException` and the family revoked, so the next rotate of a sibling fails; a missing customer is rejected; an admin principal is never looked up.
- New `data-request.service.spec.ts`: with a fake `$transaction`, `processDeletion` revokes every unrevoked customer token, leaves other principals' tokens alone, and still anonymises the profile.

### A3. `trust proxy` (one Caddy hop)

- **New** `apps/api/src/common/http/trust-proxy.ts`: `export const TRUSTED_PROXY_HOPS = 1; export function configureTrustProxy(app: NestExpressApplication): void { app.set('trust proxy', TRUSTED_PROXY_HOPS); }`.
- **`apps/api/src/main.ts`** calls `configureTrustProxy(app)` right after `NestFactory.create`.

Effects:

- `req.ip` becomes the rightmost `X-Forwarded-For` entry. That entry is the address Caddy observed, because Caddy 2 by default does not trust inbound `X-Forwarded-*` from clients and sets its own (**UNVERIFIED** against the server's `caddy:2-alpine` build; check with the curl in §15 item 2).
- `ThrottlerGuard.getTracker` returns `req.ip` (verified in `node_modules/@nestjs/throttler/dist/throttler.guard.js`), so buckets become per client.
- `LockoutService` IP records improve as a side effect.
- Web SSR calls `http://api:4000` directly with no XFF, so `req.ip` stays the web container address, as today.
- The API port is internal-only (`expose: ['4000']`), so clients cannot bypass Caddy to spoof XFF.

**Test** (new `apps/api/src/common/http/trust-proxy.spec.ts`; `@nestjs/testing` + supertest 7.0.0, both already devDependencies):

- A test module has one `@Get('ip')` controller returning `req.ip`, `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])`, and `APP_GUARD: ThrottlerGuard`. Call `configureTrustProxy(app)` and `app.init()`.
- Assert:
  1. `X-Forwarded-For: 203.0.113.1` → 200 with body `203.0.113.1`.
  2. The same XFF again → 429, with a `Retry-After` header.
  3. `X-Forwarded-For: 203.0.113.2` → 200 (separate bucket).
  4. `X-Forwarded-For: 198.51.100.7, 203.0.113.9` → `203.0.113.9` (only one hop trusted).
- Control case without `configureTrustProxy`: two different XFF values share one bucket, so the second request gets 429. This documents the bug being fixed.

### A4. Clear purchased cart lines after a successful order (blocker 7)

**`apps/api/src/modules/cart/cart.service.ts`**: new method.

```ts
/** Remove the active (not saved-for-later) lines for the given variants from a customer's cart. Never creates a cart. */
async removePurchased(customerId: string, variantIds: string[]): Promise<number> {
  if (variantIds.length === 0) return 0;
  const cart = await this.prisma.cart.findUnique({ where: { customerId } });
  if (!cart) return 0;
  const { count } = await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId: { in: variantIds }, savedForLater: false } });
  return count;
}
```

**When it is called.** I considered two options:

- (a) Always clear at `place`, which is the literal reading of "after a successful place".
- (b) Clear at `place` for COD, and at payment capture for online orders.

**Chosen: (b).** For COD, the order is final at `place`. For online orders, `place` only creates a `pending` order. With Razorpay, a dismissed or failed payment cancels the order (`markFailed`), and the web's result page then tells the customer "You can try again from your cart", while no retry-payment endpoint exists. Clearing at `place` would leave them with neither a cart nor a way to pay. Under the current `mock` provider, capture happens synchronously inside the same `place` request (`PaymentService.initiate` → `handleWebhook` → `markCaptured`), so in today's production the cart is cleared before the `place` response returns in both cases. That matches the brief's intent exactly.

Call sites:

1. **`checkout.service.ts` › `place`.** Only on the fresh-order path (never on `reused`), after stock reservation and coupon redemption:
   ```ts
   if (isCod) {
     try { await this.cart.removePurchased(ref.customerId, snapshot.map((s) => s.variantId)); }
     catch (e) { this.logger.warn(`Cart clear failed for order ${order.id}: ${String(e)}`); }
   }
   ```

   The class gets `private readonly logger = new Logger('CheckoutService')`.
2. **`payment.service.ts` › `markCaptured`.** After the capture transaction and `confirmSale` loop, before the enqueues; same try/catch and warn. It uses `order.customerId` and `order.items.map(i => i.variantId)`. `PaymentService` gets `CartService` injected; both are providers of `CartCheckoutModule`, so no module change is needed. Because `markCaptured` returns early when the order is not `pending`, webhook replays never clear twice.

**Replay safety.**

- A `place` replay with the same key returns `reused: true` before any of this code, so a cart the customer rebuilt after ordering is never touched.
- On reuse the controller still calls `initiate`, which A7 makes a no-op for any payment whose status is not `created` (an atomic conditional claim, so concurrent replays are covered too). Without A7, `initiate` would create a second gateway order and reset a captured payment to `pending` before `markCaptured` is ever reached.
- Cart-clear failures are non-fatal (`warn`). The order has already been created, and failing the request would only push the client into a reused-key retry.

**Web effect** (intended improvement): after placing, the web cart is empty for COD, mock and captured Razorpay orders, and keeps its contents for failed Razorpay payments.

**Tests:**

- `cart.service.spec.ts`: deletes only active lines for the given variants; keeps saved-for-later and other lines; returns 0 without creating a cart when none exists; empty input skips the DB.
- `checkout.service.spec.ts` (extend `build()` with a `removePurchased` jest.fn on the fake cart):
  - A fresh COD order clears `['v1']`.
  - A fresh `upi` order does not clear.
  - A reused key does not clear.
  - A `removePurchased` rejection still returns the order (and logs).
  - The existing four tests stay green unchanged.
- New `payment.service.spec.ts`: a fake provider whose `verifyWebhook` returns a valid `payment.captured`, plus a fake prisma.
  - Capture of a pending order calls `removePurchased(customerId, variantIds)` once.
  - A replayed event (`processedAt` set) does not call it.
  - An order that is no longer pending does not call it.
  - `markFailed` does not call it.

### A5. Dedicated DPDP queue (blocker 6)

- **`apps/api/src/common/queue/queue.constants.ts`**: add `DPDP: 'dpdp'` to `QUEUES`. `QueueService` already creates a `Queue` for every value in `QUEUES`, so there is no further change there.
- **`apps/api/src/modules/identity/data-request.service.ts`**: `requestExport` and `requestDeletion` enqueue to `QUEUES.DPDP`. Job names `dpdp.export` and `dpdp.deletion` and their payloads are unchanged, so the public method signatures (the "existing enqueuers") keep working.
- **`apps/api/src/modules/identity/dpdp.worker.ts`**: `new Worker(QUEUES.DPDP, …)`. Unknown job names now throw `Error('Unknown DPDP job …')`, so they fail visibly instead of silently completing.
- **`apps/api/src/modules/engagement/notification.worker.ts`**: replace the silent `if (job.name.startsWith('dpdp.')) return;` with a forward of legacy jobs still sitting in the `notifications` queue (enqueued before deploy):
  ```ts
  if (job.name.startsWith('dpdp.')) { await this.queue.enqueue(QUEUES.DPDP, job.name, job.data); this.logger.log({ jobId: job.id }, 'Forwarded legacy DPDP job to the dpdp queue'); return; }
  ```

  `QueueService` is injectable because `QueueModule` is `@Global()` and imported by `WorkerModule`. Add it to the `NotificationWorker` constructor.
- After this change, only `NotificationWorker` consumes `notifications`, so order and abandoned-cart notifications are no longer swallowed by `DpdpWorker`.

**Deploy note** (for the orchestrator): API and worker share one image and restart together. DPDP jobs enqueued in between wait in Redis, and BullMQ creates the `dpdp` queue lazily.

**Tests** (new `dpdp.worker.spec.ts` and `notification.worker.spec.ts`): mock `bullmq`'s `Worker` constructor to capture `(queueName, processor)`.

- DpdpWorker listens on `'dpdp'`; its processor routes export and deletion to `DataRequestService` and throws for unknown names.
- NotificationWorker listens on `'notifications'`; a `dpdp.deletion` job is re-enqueued to `'dpdp'` with identical data and `notifications.send` is not called; an `order.confirmed` job still calls `send`.
- `data-request.service.spec.ts` asserts that `enqueue` is called with `'dpdp'`.

### A6. `checkout/preview` accepts an optional `paymentMethod`

- **Shared** `schemas.ts`: `checkoutPreviewSchema = z.object({ addressId: uuidSchema, couponCode: z.string().trim().max(40).optional(), paymentMethod: z.enum(PAYMENT_METHODS).optional() })`.
- **`apps/api/src/modules/checkout/checkout.controller.ts` › `preview`**: `return this.checkout.preview({ customerId: user.sub }, dto.addressId, dto.couponCode, dto.paymentMethod === 'cod');`. `CheckoutService.preview` already has the `isCod = false` parameter and passes it to `pricing.compute`.
- **Web unchanged.** The web checkout sends `{addressId, couponCode}` only, so `isCod` stays false, exactly as now. The web keeps showing the COD fee only after placing; changing that is a separate, optional web task and is not done here.

**Tests:**

- Shared `schemas.test.ts`: `paymentMethod` is optional; `cod` and `upi` are accepted; `bitcoin` is rejected.
- New `checkout.controller.spec.ts`: `preview` passes `isCod=true` for `cod` and `false` for `upi` or missing.
- Service: `preview(..., true)` includes the COD fee in `breakup.codFee` and `grandTotal`. The fee is `PricingService.codFee`, 3900 paise by default (verified in `pricing.service.ts`).

### A7. Idempotent `PaymentService.initiate` (replayed `place` must never touch a settled payment)

**Problem (verified).** `checkout.controller.ts` › `place` calls `this.payments.initiate(result.orderId)` for every non-COD request, including `reused: true`. `payment.service.ts` › `initiate` has no status guard: it calls `provider.createOrder` again (a second gateway order), then `payment.update({ providerOrderId: <new>, status: 'pending' })`. With `mock`, the auto-capture webhook for the new id reaches `markCaptured`, which returns early because the order is already `confirmed`, so the row stays `pending`. After that:

- `OrderService.cancel` finds no `captured` payment and refunds nothing.
- `ReturnService.request` no longer sees the order as prepaid, so `refund_source` is rejected; `processReceived` skips the refund.
- `PaymentService.refund` throws "No captured payment to refund".
- Phase 5 Razorpay: the real capture webhook for the original gateway order matches no payment.

The mobile client's ambiguous-retry path (§6.6) reuses the key routinely, so this must be fixed before any mobile build ships.

**Change** (`apps/api/src/modules/checkout/payment.service.ts` › `initiate`), immediately after the existing `if (payment.provider === 'cod') { … }` block. The existing `createOrder` call and the unconditional `payment.update({ providerOrderId, status: 'pending' })` are replaced by an atomic claim. The mock auto-capture block and the final `return` stay unchanged.

```ts
// Atomic claim: only one caller may move created → pending. Every replay,
// sequential or concurrent, sees count 0 and returns without side effects,
// so an idempotent replay never creates a second gateway order or touches the row.
const claim = await this.prisma.payment.updateMany({
  where: { id: payment.id, status: 'created' },
  data: { status: 'pending' },
});
if (claim.count === 0) {
  return { provider: payment.provider, clientConfig: {} };
}

let providerOrder: Awaited<ReturnType<PaymentProvider['createOrder']>>;
try {
  providerOrder = await this.provider.createOrder(payment.amount, order.id);
} catch (e) {
  // Undo the claim so a later replay can initiate again; rethrow (5xx → client keeps its key).
  await this.prisma.payment.updateMany({
    where: { id: payment.id, status: 'pending', providerOrderId: null },
    data: { status: 'created' },
  });
  throw e;
}
await this.prisma.payment.update({
  where: { id: payment.id },
  data: { providerOrderId: providerOrder.providerOrderId }, // status is already 'pending'; never overwrite it here
});
// …existing mock auto-capture block and return, unchanged
```

Why `created` is the only actionable status, and why the transition is claimed atomically: `CheckoutService.place` creates every non-COD payment as `created`. The conditional `updateMany` is a single SQL `UPDATE … WHERE status = 'created'`, so exactly one caller wins the `created` → `pending` move, even when two same-key `place` requests overlap (the §6.6 30 s timeout plus a second tap while request 1 is still inside `provider.createOrder`). Every other caller gets `count: 0` and returns before any gateway call or write. After the claim, `status` is never written by `initiate` again, so a concurrent loser can never flip a `captured` row back to `pending`. A fresh mock order still moves `created` → `pending` → `captured` inside one `initiate`, and a later sequential replay sees `count: 0`. A `place` that committed but whose `initiate` never ran (a 5xx between the two) still finds `created` on retry and initiates normally.

Failure handling inside `initiate`:

- **`provider.createOrder` rejects:** recoverable. The claim is reverted to `created` (the `providerOrderId: null` condition makes the revert a no-op if anything else already advanced the row), and the error is rethrown. Nest returns a 5xx and logs it at `error` through the existing exception filter. The client treats it as ambiguous and retries with the same key (§6.6), and the retry initiates again.
- **The revert itself fails:** the revert's rejection propagates instead of the original error. It is still a 5xx, logged by the exception filter. The row is left `pending` with no `providerOrderId`, and replays return `{}`. The order stays `pending` until an admin acts. No gateway order exists, so nothing is double-charged.
- **The `providerOrderId` update fails after `createOrder` succeeded:** a 5xx, logged by the exception filter. The row stays `pending` with no `providerOrderId`, and replays return `{}`. The orphaned gateway order has no matching payment, so its webhook is ignored (`no matching payment`, `warn`). No payment row is corrupted.

- **Caller receives** `{ provider, clientConfig: {} }`. The controller returns it as today's response shape, so the client still gets `payment.provider` and goes to OrderConfirmation, which polls the real order status (§6.8).
- **Logging:** none added; a replay is a normal, expected event.
- **Web effect:** the web sends a fresh key per click, so it never hits the guard in practice; a web double-submit now also stays correct.

**Tests:**

- `payment.service.spec.ts` (the new file from A4, same fakes):
  - The fake prisma's `payment.updateMany` must honour its `where` conditions (`id`, `status`, `providerOrderId: null`) and return `{ count }`, so the claim is exercised for real.
  - On a `captured` payment, `initiate` calls neither `provider.createOrder` nor `payment.update`; its only write attempt is the conditional `updateMany`, which matches 0 rows. It returns `clientConfig: {}`.
  - The same holds for `pending`, `failed`, `refunded` and `partially_refunded` payments.
  - On a `created` payment, the outcome is unchanged: the claim matches 1 row, `createOrder` is called once, `update` writes only the new `providerOrderId` (no `status` field), and the mock auto-capture path runs, leaving the row `captured`.
  - Two concurrent `initiate(orderId)` calls (`Promise.all`) on a `created` payment: `provider.createOrder` is called **once**; exactly one call returns the provider's `clientConfig` and the other returns `{}`; with `mock`, the final row is `captured` with the single `providerOrderId`.
  - When `createOrder` rejects, `initiate` rejects with that error, the row is back to `created` with `providerOrderId: null`, and a second `initiate` then succeeds (`createOrder` called again, row ends `captured` with `mock`).
  - COD is unchanged (`{ provider: 'cod', clientConfig: { cod: true } }`).
- `checkout.controller.spec.ts` (new file from A6): a fake `CheckoutService.place` returns `{ reused: true, orderId, payment: { provider: 'mock' } }`; a real `PaymentService` over a fake prisma holds that order's payment as `captured` with `providerOrderId: 'mock_1'`. After `place`, the payment is still `captured` with `providerOrderId: 'mock_1'`, and the fake provider's `createOrder` was never called.

### A8. `POST /cart/items/:variantId/move-to-cart`

**Change** (`apps/api/src/modules/cart/cart.controller.ts`), next to the existing `save-for-later` route:

```ts
@Public()
@Post('items/:variantId/move-to-cart')
async moveToCart(@Req() req: Request, @Param('variantId') variantId: string) {
  return this.cart.saveForLater(await resolveCartRef(req, this.tokens), variantId, false);
}
```

- `CartService.saveForLater(ref, variantId, saved = true)` already supports `saved = false` (verified, `cart.service.ts:142`). No service change.
- **Auth and identity:** identical to `save-for-later`: `@Public()`, resolved by `resolveCartRef` (customer Bearer, else `x-guest-token` ≥ 8 chars, else 400 "Provide a bearer token or an x-guest-token header").
- **Errors:** parity with `save-for-later`. A missing line raises Prisma P2025, which surfaces as 500 through `AllExceptionsFilter` (logged at `error`); the client shows "This item changed. Your cart has been refreshed." and refetches (§6.5, §9.2).
- **Returns** the `CartView`, with the line's quantity preserved and `savedForLater: false`.
- **Web unchanged:** the web does not call the new route.

**Tests** (new `apps/api/src/modules/cart/cart.controller.spec.ts`, fake `CartService` and fake `TokenService.verifyAccess`):

- Guest: `req.headers['x-guest-token'] = 'guest-token-1'` → `saveForLater({ guestToken: 'guest-token-1' }, 'v1', false)` is called once and its view is returned.
- Customer: `authorization: 'Bearer t'` with `verifyAccess` resolving `{ kind: 'customer', sub: 'c1' }` → `saveForLater({ customerId: 'c1' }, 'v1', false)`.
- The existing `saveForLater` route still passes `true`.

### A-extra (small, additive, needed by the app)

- **`profilePatchSchema` moves** from `apps/api/src/modules/identity/dto.ts` to `packages/shared/src/schemas.ts`, verbatim. `dto.ts` imports it from shared and re-exports it, so existing imports compile. Mobile's profile form uses the identical rules.
- No other API change. Everything else the app needs already exists (Phase 1 §3).

---

## 8. Workspace integration: pnpm, Metro, TypeScript, Jest, Docker, deploy

### 8.1 pnpm layout — decision: keep the isolated layout

- Keep pnpm 9.12.0 with its default isolated `node_modules`: **no** `.npmrc`, no `node-linker=hoisted`, no `public-hoist-pattern`.
  - Expo SDK 54+ supports isolated installs (Phase 1 §6, docs.expo.dev/guides/monorepos).
  - Hoisting would change how `apps/api` and `apps/web` resolve their dependencies.
- `apps/mobile` joins through the existing `apps/*` glob.
- `@belzo/shared` is a `"workspace:*"` dependency.
- Fallback, only if Metro or autolinking provably fails to resolve a transitive dependency: add that single package as an explicit pinned dependency of `apps/mobile`. This is what pnpm intends for undeclared dependencies. Do **not** introduce hoisting. Record any such addition in the README.
- `pnpm install` is run once at the root after `apps/mobile/package.json` exists. It updates `pnpm-lock.yaml`.
- The lockfile diff must only **add** the `apps/mobile` importer and new packages. The `apps/api`, `apps/web` and `packages/shared` importer blocks must be unchanged (check with `git diff pnpm-lock.yaml`). If pnpm re-resolves any of them, stop and investigate before committing.
- `pnpm install --frozen-lockfile` must pass afterwards.
- Verify a single React per app: `pnpm --filter @belzo/mobile why react` should show 19.2.3 only, and `pnpm --filter @belzo/web why react` 18.3.1 only.

### 8.2 Consuming `@belzo/shared` — decision: from source in all three toolchains

Shared's `package.json` points at the gitignored `dist/`. Instead of building it before Metro (Phase 1's default) or adding a `react-native` export condition, mobile resolves `@belzo/shared` straight to `packages/shared/src/index.ts`:

| Toolchain | Mechanism |
|---|---|
| `tsc` (typecheck) | `tsconfig.json` › `compilerOptions.paths: { "@belzo/shared": ["../../packages/shared/src/index.ts"], "@/*": ["./src/*"] }` |
| Jest | `jest.config.js` › `moduleNameMapper: { '^@belzo/shared$': '<rootDir>/../../packages/shared/src/index.ts', '^@/(.*)$': '<rootDir>/src/$1' }` (jest-expo's `withTypescriptMapping` would derive the same; it is stated explicitly) |
| Metro (dev, `expo export`, EAS) | `metro.config.js` › `resolver.resolveRequest` returns `{ type: 'sourceFile', filePath: <workspace>/packages/shared/src/index.ts }` for exactly `@belzo/shared`, and delegates everything else |

Why this option:

- It needs zero build step and zero change to shared's `package.json`.
- It works unchanged on EAS: no `eas-build-post-install` hook is needed.
- It mirrors what `apps/web` (tsconfig `paths` plus `transpilePackages`) and the API and web Jest configs already do.
- Shared's sources import only `zod` and each other (Phase 1 §4), so `babel-preset-expo` transpiles them like app code.
- The mobile README records the constraint "shared must stay free of Node/DOM APIs".

`metro.config.js`:

```js
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedEntry = path.join(workspaceRoot, 'packages', 'shared', 'src', 'index.ts');
const config = getDefaultConfig(projectRoot);              // SDK 57 auto-detects the pnpm workspace (watchFolders, nodeModulesPaths)
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === '@belzo/shared'
    ? { type: 'sourceFile', filePath: sharedEntry }
    : (upstream ?? context.resolveRequest)(context, moduleName, platform);
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], [
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'web', '.next'))}[\\\\/].*`),
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'api', 'dist'))}[\\\\/].*`),
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'api', 'uploads'))}[\\\\/].*`),
]);
module.exports = config;
```

- Hierarchical lookup stays enabled, which pnpm needs.
- `zod` is resolved from both `packages/shared` and `apps/mobile` to the same `.pnpm/zod@3.23.8` real path, because both pin 3.23.8 and Metro follows symlinks. So there is one zod instance, which is what `@hookform/resolvers` and the shared schemas need.
- The auto-detection claim is **UNVERIFIED** until `npx expo export --platform android` runs (§16.2).

`tsconfig.json`:

```json
{ "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "types": ["jest"], "paths": { "@belzo/shared": ["../../packages/shared/src/index.ts"], "@/*": ["./src/*"] } },
  "include": ["**/*.ts", "**/*.tsx"], "exclude": ["node_modules", "android", "ios", "dist"] }
```

- `noUncheckedIndexedAccess` matches the repo's `tsconfig.base.json`; shared already compiles under it.
- `"types": ["jest"]` is explicit because TypeScript 6 changed default `types` handling (**UNVERIFIED** detail). Being explicit is harmless either way.

### 8.3 Keeping React Native out of the server images and the deploy

Facts, verified by reading the files:

- `apps/api/Dockerfile` and `apps/web/Dockerfile` copy only `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `packages/shared/package.json` and their own `apps/<x>/package.json` before `RUN pnpm install --frozen-lockfile`.
- pnpm installs only the workspace projects that exist on disk. This already happens today: the API image builds while the lockfile contains the `apps/web` importer, whose `package.json` it never copies.
- The build stage then does `COPY . .` and runs filtered builds (`pnpm --filter @belzo/shared build`, `--filter @belzo/api …` or `--filter @belzo/web …`). Nothing there touches mobile.

Changes:

1. **New root `.dockerignore`** containing exactly `apps/mobile`. The `COPY . .` context then never includes mobile sources, `assets/`, a generated `android/` or `.expo/`. No other entries are added, so the api and web image contents are otherwise unchanged.
2. **`scripts/deploy.ps1`**: add `--exclude=./apps/mobile` to the `tar` call. The server never receives mobile sources (smaller tarball; the 2 GB EC2 build is unaffected).
3. Dockerfiles are **unchanged**.

Verification, done before committing:

- **(a) Simulated Docker deps stage**, for both api and web:
  1. Copy the same five files into `%TEMP%\belzo-docker-sim-<app>` with the same relative paths.
  2. Run `pnpm install --frozen-lockfile --ignore-scripts`. It must succeed.
  3. Assert that `node_modules/.pnpm` contains no `react-native@`, `expo@` or `metro@` directory.
  4. Delete the temp dirs afterwards.
  - This checks the **UNVERIFIED** assumption that pnpm skips absent importers' packages.
- **(b) Tarball listing.** Create the deploy tarball into `%TEMP%` with the exact exclude list, then `tar -tzf` it and assert zero `apps/mobile` entries. Delete it afterwards.
- **(c) Docker build.** If Docker is available locally, run `docker build -f apps/api/Dockerfile .` (**UNVERIFIED** that Docker exists here; skip and report if absent).

### 8.4 Root scripts and CI

`apps/mobile/package.json` scripts:

```json
{ "start": "expo start --dev-client",
  "android": "expo run:android",
  "typecheck": "tsc --noEmit",
  "lint": "eslint \"src/**/*.{ts,tsx}\" app.config.ts",
  "test": "jest",
  "doctor": "expo-doctor",
  "config:dev": "expo config --type public",
  "export:android": "expo export --platform android --output-dir dist",
  "assets:placeholder": "node scripts/generate-placeholder-assets.mjs",
  "brand:sync": "node scripts/sync-brand.mjs" }
```

- There is **no `build` script**, so the root `pnpm -r build` (and CI `pnpm build`) skips mobile. The README documents EAS build commands instead.
- There is no `dev` script, so the root `pnpm dev` (`--filter "./apps/*" dev`) does not start Metro.
- Locally (Node 24), the root `pnpm -r typecheck`, `lint` and `test` include mobile, and all must pass. CI filters mobile out of the Node 20.14 job and runs it in its own job (below).
- `expo run:android` is listed for owners with an SDK; it cannot run here.

**CI (`.github/workflows/ci.yml`) is modified** so the existing server job is unaffected and mobile gets its own job. The existing job pins Node 20.14.0 and runs the root `pnpm typecheck`, `lint` and `test` (all `pnpm -r …`). RN 0.86.3 declares `engines.node ^20.19.4 || ^22.13.0 || ^24.3.0` and `@testing-library/react-native` 14.1.0 `^22.13.0 || >=24` (both verified on npm), so mobile must not run on 20.14.

1. In the existing `build-test` job, replace three `run` lines. Every other step, including `pnpm build` (mobile has no `build` script) and `pnpm audit`, is unchanged:

   ```yaml
         - name: Typecheck
           run: pnpm -r --filter '!@belzo/mobile' typecheck

         - name: Lint
           run: pnpm -r --filter '!@belzo/mobile' lint

         - name: Test (unit + property-based)
           run: pnpm -r --filter '!@belzo/mobile' test
   ```

2. Add a `mobile` job (same top-level `on:` triggers; `MOBILE_NODE_VERSION: '22.13.0'` added to the top-level `env:`):

   ```yaml
     mobile:
       runs-on: ubuntu-24.04
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup pnpm
           uses: pnpm/action-setup@v4
           with:
             version: ${{ env.PNPM_VERSION }}

         - name: Setup Node
           uses: actions/setup-node@v4
           with:
             node-version: ${{ env.MOBILE_NODE_VERSION }}
             cache: 'pnpm'

         - name: Install (frozen lockfile)
           run: pnpm install --frozen-lockfile

         - name: Typecheck (mobile)
           run: pnpm --filter @belzo/mobile typecheck

         - name: Lint (mobile)
           run: pnpm --filter @belzo/mobile lint

         - name: Test (mobile)
           run: pnpm --filter @belzo/mobile test
   ```

   The mobile job needs no Prisma generate: mobile imports only `@belzo/shared` source.

- `ci.yml` is currently **untracked**, so it is part of the §17 step-0 baseline commit, and the CI change is its own later commit.
- CI only triggers on `main`, which does not exist locally, so the workflow cannot be run here. Verification is local: the filtered commands in §16.2 step 6, plus a YAML syntax parse with the repo's own Prettier 3.3.3 (`pnpm exec prettier .github/workflows/ci.yml > $null` in PowerShell, which exits non-zero on a parse error). The local verification runs on Node 24.12.0.

### 8.5 ESLint for mobile

- `apps/mobile/.eslintrc.js`: `module.exports = { root: true, extends: ['expo'], ignorePatterns: ['dist', 'android', 'ios', '.expo', 'coverage', 'scripts/*.mjs'], rules: { 'no-console': ['warn', { allow: ['warn', 'error'] }] } };`
- It uses eslint 8.57.0, the same as the repo, with `eslint-config-expo` 57.0.2, whose `peerDependencies.eslint` is `>=8.10` (verified).
- Its bundled `@typescript-eslint` 8.x accepts eslint `^8.57.0` and TypeScript `<6.1.0`, which covers 6.0.3 (verified).
- That the legacy (`.eslintrc`) entry works with `eslint-plugin-react-hooks` 7 is **UNVERIFIED**. If it fails, switch mobile alone to flat config (`eslint.config.js` using `eslint-config-expo/flat`) and keep eslint 8.57.0 with `ESLINT_USE_FLAT_CONFIG=true` in the mobile `lint` script.

---

## 9. Error, empty, loading and success strategy

### 9.1 Error taxonomy → user message (`api/errors.ts` › `userMessage`)

| Condition | Message (or behaviour) |
|---|---|
| `network` | "You're offline. Check your connection and try again." |
| `timeout` | "The server is taking too long. Please try again." |
| `http` ≥ 500 | "Something went wrong on our side. Please try again." plus "Ref: xxxxxxxx" from `correlationId` |
| `http` 400 `ValidationError` | Forms: `fieldErrorsFrom()` maps "field: msg" segments onto RHF `setError`; fallback "Please check the details and try again." |
| `http` 400, 403, 404, 409 with a server message | The server message verbatim. These are customer-facing English strings, e.g. "Sorry, we don't deliver to PIN 560001 yet…", "Account is blocked", "Email or phone linked to another account" |
| `http` 401 on `auth:'none'` calls | Server message, e.g. "Invalid email or password", "Email already registered" (shown on the email field) |
| `auth` (session ended) | Handled globally (toast, reset to Home); screens show nothing extra |
| `http` 429 | `retryAfterSec` set: "Too many attempts. Try again in {n} s." with the submit button disabled for the countdown. Otherwise the server message |
| `parse` or `config` | "Something went wrong. Please try again." (logged in `__DEV__`) |
| `aborted` | Ignored |

### 9.2 Per-operation failure handling (recoverable or fatal, what the user sees, logging)

All logging is client-side `logger.warn` in `__DEV__` only. The backend logs with `AllExceptionsFilter` as today. There is no remote crash reporting in this run.

| Operation | Failure | Recoverable? | User sees |
|---|---|---|---|
| Boot refresh | network or timeout | yes (stay authenticated, retry lazily) | Normal app; profile query shows its own error |
| Boot refresh | 400, 401 or 403 | yes (as guest) | Guest home; no toast on boot |
| Any query (first load) | any | yes | Screen `ErrorState` with Retry |
| Any query (background refetch with data) | any | yes | Data stays; toast once per screen focus |
| Cart mutation | 400 (inactive variant, "no longer available") | yes | Toast with the server message; refetch cart |
| Cart PUT | 500 (missing line, P2025) | yes | Toast "This item changed. Your cart has been refreshed."; refetch |
| Merge after login | any | yes | Silent; pending merge retried on next boot; the guest cart is not lost (the server deletes it only on success) |
| Checkout preview | 400 (empty cart, unavailable, out of stock), 404 address | yes | Inline banner with the message plus "Back to cart"; the Place button is disabled |
| Checkout place | 4xx | yes (definitive) | Inline error; key regenerated next time |
| Checkout place | network, timeout, 5xx | yes (ambiguous) | Inline "couldn't confirm…" with Retry, same key |
| Payment adapter | `failed`, `dismissed` | yes | OrderConfirmation notice "Payment was not completed" (§6.6) |
| Payment adapter | `unavailable` | yes | One `POST /orders/:id/cancel`, then the "We cancelled this order…" notice; if the cancel fails, the "contact support with order #…" notice (§6.6) |
| Return photo upload | 400 type or size, network | yes | Photo tile shows an error with Retry or Remove; Submit disabled until all are uploaded |
| Return submit | 400 rule violations | yes | Message on the step it belongs to (photos, reason, quantities) |
| Cancel | 400 (not cancellable) | yes | Message; order refetched |
| Invoice | 4xx or 5xx, or `openBrowserAsync` throws | yes | Toast "Couldn't open the invoice. Try again." |
| DPDP export/deletion request | any | yes | Inline error; nothing changes locally |
| Missing or invalid `extra` config | — | **fatal** | Full-screen "App configuration error" (dev shows details). Only possible with a broken build |
| Render error | — | recoverable | Root `ErrorBoundary`: "Something went wrong" + "Try again" (resets the boundary and navigates Home) |

### 9.3 Loading, empty and success patterns

- **Loading:** a screen-shaped skeleton for first loads: `ProductGridSkeleton` (lists, rails), `DetailSkeleton` (PDP, order detail), `ListSkeleton` (orders, notifications, addresses). There are no full-screen spinners except the short "Finalising your order…" state.
- **Pull-to-refresh** on Home, ProductList, Search results, Cart, Wishlist, Orders, OrderDetail, Notifications and Addresses. It uses `refetch()` and shows the `RefreshControl` spinner.
- **Infinite lists** (ProductList, Search): FlashList 2 with 2 columns; footer spinner while `isFetchingNextPage`; footer "Couldn't load more — Retry" on a next-page error; end-of-list footer "That's everything".
- **Empty states:**

  | Screen | Empty state |
  |---|---|
  | Cart | "Your cart is empty" → Shop now |
  | Wishlist | "No saved items yet" |
  | Orders | "No orders yet" → Start shopping |
  | Notifications | "You're all caught up" |
  | Addresses | "Add your first address" |
  | Search no-results | "No results for 'x'", plus recent searches and top categories |
  | Category with no products | "Nothing here yet" |
  | Reviews | "No reviews yet" |
  | Home rails | Rails that resolve to zero products are omitted (as on the web) |

- **Success feedback:** a toast for add to cart, wishlist toggles, address saved or deleted, profile saved, cancel requested, return requested, export requested, and coupon applied. Navigation success screens are OrderConfirmation and the deletion-requested confirmation.
- **Offline:** an `OfflineBanner` at the top. Queries pause, and mutations fail fast with the offline message. The checkout Place button is disabled while offline.

---

### 9.4 Client-side input validation (all external inputs)

Server validation stays authoritative. Client validation exists for UX and to avoid pointless requests.

| Input | Required | Rule (source) | On failure |
|---|---|---|---|
| Phone (login, address, profile) | yes where shown | `phoneSchema`; for profile, `profilePatchSchema.phone` (both shared) | Inline field error; submit disabled |
| Email (login, register, profile) | yes where shown | `emailSchema` (trim, lowercase, ≤254) | Inline |
| Password | yes | `passwordSchema` 8–128 | Inline |
| Name (register, profile) | register yes, profile optional | 1–120 trimmed | Inline |
| OTP code | yes | `otpVerifySchema.code` `^\d{4,6}$`; field accepts digits only, maxLength 6 | Inline; server errors ("Incorrect code", "Code expired", "Too many attempts") shown verbatim |
| PIN code (chip, PDP, address) | yes | `pincodeSchema` `^[1-9]\d{5}$`; numeric keyboard, maxLength 6 | Inline; no request until valid |
| Address fields | per `addressInputSchema` | label enum; fullName 1–120; line1 1–200; line2 ≤200 optional; city 1–80; state from the `GST_STATES` picker | Inline per field |
| Coupon code | optional | trimmed, upper-cased, ≤40 (`checkoutPreviewSchema.couponCode`) | Apply disabled when empty; server `reason` shown when invalid |
| Cart quantity | yes | integer 1–99 (`cartItemInputSchema`) | Stepper bounds; no free text entry |
| Search `q` | optional | trimmed, truncated to 120 (`productQuerySchema.q`); queries only fire at ≥ 2 chars | — |
| Cancel comments | per reason | `commentMaxChars(label)` max; ≥ `OTHER_REASON_MIN_CHARS` when `commentRequired` (`cancelReasonError`) | Inline |
| Return draft | yes | `returnStepError(order, draft, step)` for each step (quantities, reason, resolution, photos, comments) | Step "Next" disabled; error text shown |
| Return photos | per reason | ≤ `MAX_RETURN_IMAGES` (6); images only; normalised to JPEG ≤ 1600 px | Picker hidden at the cap; upload errors per tile |
| Deep-link params | — | `idOrSlug`: non-empty string ≤ 200; `orders/:id`: must match `uuidSchema`, otherwise the OrderDetail not-found state shows without a request; `page/:slug`: `^[a-z0-9-]{1,80}$` | Not-found EmptyState |
| Account deletion confirm | yes | typed text equals `DELETE` (case-sensitive) | Confirm button disabled |
| Build config (`extra`) | yes | zod in `config/env.ts`; https enforced for production at config time | Fatal config screen (§9.2) |

### 9.5 Invariants and the layer that owns them

| Invariant | Owner | Why that layer |
|---|---|---|
| An order is created at most once per checkout attempt | **Server** (unique `idempotencyKey` in `CheckoutService.place`); the client only keeps the key stable (§6.6) | Only the DB can make it atomic; the client can't know whether a timed-out request committed |
| Prices, GST, totals, COD fee, coupon validity | **Server** (`PricingService`, `CouponService`) | Client values are display-only (`resolveSlabPrice` previews, cart totals), so a tampered client cannot change what is charged |
| Delivery-PIN serviceability | **Server** at `place`; the client check is advisory | The allowlist is admin-configured and can change between preview and place |
| Payment is captured only through the gateway webhook | **Server** (`PaymentService.handleWebhook`) | Never trusted from the client; the app only polls |
| A refresh token is single-use; reuse revokes the family | **Server** (`TokenService.rotate`). The client prevents accidental reuse through single-flight (§5.3) | Security must not depend on client behaviour; the client only avoids self-inflicted logouts |
| Blocked or deleted customers cannot refresh | **Server** (A2) | Account status lives in the DB |
| A logged-in user is never served the guest cart | **Client** (no `x-guest-token` when authenticated; proactive refresh) | The server's fallback to guest on a bad Bearer is existing behaviour the web relies on, so the client must avoid triggering it |
| Return and cancel eligibility rules | **Server** (`ReturnService.request`, `canCustomerCancel`); the client mirrors them with the same shared functions | Shared code keeps UX and server consistent; the server is final |
| `devCode` is never shown in production | **Client config** (`showDevOtp` false in the production variant) plus server env (`devCode` only when the provider is not live) | Defence in both layers; the server is the real fix (blocker 4, owner) |
| No cleartext HTTP in production builds | **Build config** (`app.config.ts` throws on non-https; no network-security plugin in production; Android default) | Enforced before a binary can exist |

---

## 10. Shared-helper extraction (web → `@belzo/shared`, web re-imports)

The goal is a single source of these pure helpers for both clients, with web behaviour identical. Approach: move each module's code verbatim into shared, then turn the web module into a thin re-export. **Every existing web import path keeps working, and no web page or component file changes.**

| New shared module | Moved from (verbatim) | Exports |
|---|---|---|
| `packages/shared/src/format.ts` | `apps/web/src/lib/format-inr.ts`; `formatDate`, `formatDateTime` from `order-view.ts` | `formatInr`, `formatDate`, `formatDateTime` |
| `packages/shared/src/attributes.ts` | `pickAttr` from `apps/web/src/lib/variant-edit.ts` | `pickAttr` |
| `packages/shared/src/price-breakup.ts` | `apps/web/src/lib/price-breakup.ts` | `OrderMoneySnapshot`, `snapshotFromBreakup`, `BreakupRow`, `BreakupView`, `breakupView` |
| `packages/shared/src/order-view.ts` | `apps/web/src/lib/order-view.ts` (everything except `formatDate`/`formatDateTime`, which it now imports from `./format`; `pickAttr` from `./attributes`; `formatInr` from `./format`; `OrderMoneySnapshot` from `./price-breakup`; shared symbols from their modules, never `'@belzo/shared'`) | `OrderAddress`, `OrderDetailItem`, `OrderPayment`, `ReturnStatus`, `ReturnResolution`, `OrderReturn`, `OrderDetail`, `Tone`, `shortOrderId`, `statusBadge`, `isLiveStatus`, `StepState`, `Step`, `buildStepper`, `PaymentSummary`, `paymentSummary`, `refundNote`, `cancelEligibility`, `cancelUnavailableReason`, `commentMaxChars`, `cancelReasonError`, `cancelReasonText`, `ReturnItemEligibility`, `ReturnEligibility`, `returnEligibility`, `photosRequired`, `ResolutionOption`, `resolutionOptions`, `ReturnDraft`, `RETURN_STEPS`, `returnStepError`, `ReturnPayload`, `buildReturnPayload`, `returnStatusLabel`, `returnStatusTone`, `resolutionLabel`, `variantText` |
| `packages/shared/src/home.ts` | `DEFAULT_SECTIONS`, `sanitizeHomeSections`, `getHomeSections` from `apps/web/src/lib/home-sections.ts`; `ThemeName`, `DEFAULT_HOME_EMART`, `DEFAULT_HOME_CLASSIC`, `mergeHome` (with its private `DEFAULTS`) from `apps/web/src/lib/site-content.ts` | same names |

- `packages/shared/src/index.ts` adds `export * from './format'; './attributes'; './price-breakup'; './order-view'; './home';`.
- I grepped the shared sources for every exported name above and found **no** collisions.

Web modules after the change:

- `lib/format-inr.ts` → `export { formatInr } from '@belzo/shared';`
- `lib/price-breakup.ts` → `export { snapshotFromBreakup, breakupView, type OrderMoneySnapshot, type BreakupRow, type BreakupView } from '@belzo/shared';`
- `lib/order-view.ts` → an explicit named re-export list of every symbol in the `order-view.ts` row of the table, with `type` modifiers for types (web `isolatedModules: true`), **plus** `export { formatDate, formatDateTime } from '@belzo/shared';`. The extra line is required: `apps/web/src/app/(shop)/orders/[id]/order-sections.tsx` (lines 10–11) imports `formatDate` and `formatDateTime` from `@/lib/order-view`.
- `lib/variant-edit.ts` → removes the local `pickAttr`, adds `import { pickAttr } from '@belzo/shared'`, and keeps `export { pickAttr }` so `variant-edit.test.ts` and other importers are unaffected.
- `lib/home-sections.ts` → re-exports `DEFAULT_SECTIONS`, `sanitizeHomeSections` and `getHomeSections` from shared. `resolveHomeSections`, `ResolvedSection` and the category flattening stay in web, because they call `catalogueApi`.
- `lib/site-content.ts` → re-exports `ThemeName`, `DEFAULT_HOME_EMART`, `DEFAULT_HOME_CLASSIC` and `mergeHome` from shared. `FooterContent`, `DEFAULT_FOOTER`, the `DEFAULT_HOME` alias, `SiteContent` and `getSiteContent` stay in web.

Tests:

- `git mv` `apps/web/src/lib/format-inr.test.ts`, `price-breakup.test.ts` and `order-view.test.ts` to `packages/shared/src/` (names `format.test.ts`, `price-breakup.test.ts`, `order-view.test.ts`). Rewrite their import lines to relative shared paths. Shared's tsconfig extends `tsconfig.base.json` (`noUncheckedIndexedAccess: true`) and its ts-jest type-checks tests, while the web tsconfig does not set the flag. So in `order-view.test.ts`, add non-null assertions to the indexed accesses flagged under `noUncheckedIndexedAccess`. These are exactly (verified with `tsc --noEmit -p apps/web/tsconfig.json --noUncheckedIndexedAccess`, which reports TS2532 at 147, 152 and 170 and TS2322 at 250:35 and 250:78; `format-inr.test.ts` and `price-breakup.test.ts` are clean):
  - line 147 `steps[0]!.at`;
  - line 152 `withInvoice[1]!.at`;
  - line 170 `steps[2]!.at`;
  - line 250 `makeOrder({ items: [{ ...base.items[0]!, isReturnable: false }, base.items[1]!] })`.

  No asserted value changes, and nothing else in the moved tests is edited besides the import lines. Acceptance: `pnpm --filter @belzo/shared test` and `pnpm --filter @belzo/shared typecheck` pass. Shared's `tsconfig.json` excludes `**/*.test.ts`, so the ts-jest run is the gate that type-checks the moved tests.
- `site-content.test.ts` and `variant-edit.test.ts` stay in web unmodified. They exercise the re-exports, which proves the web surface is identical.
- Web `typecheck` and `build` prove every page still compiles against the re-exports.
- **Acceptance check:** `pnpm --filter @belzo/web typecheck` passes with zero edits under `apps/web/src/app/**` (confirm with `git diff --stat -- apps/web/src/app` showing nothing).

Runtime notes:

- `formatInr`, `formatDate` and `formatDateTime` use `Intl` / `toLocale*('en-IN')`. Hermes on Android supports Intl; whether lakh grouping and `toLocaleString` options render exactly like V8 is **UNVERIFIED** on a device. Jest runs on Node, so tests are unaffected.
- Shared's lint and typecheck (ES2022 lib, no DOM) cover the new files. `toLocaleDateString(locales, options)` is declared in `lib.es5.d.ts`, so no DOM lib is needed.

---

## 11. Screen behaviour (concise spec for the coder)

- **Home.**
  - Header on `primary`: `BelzoLogo` (height 32), PIN chip "Deliver to {pin}" or "Set delivery PIN" (opens the PIN sheet, validated by `pincodeSchema` and then serviceability), notification bell with unread badge (customer only), and a fake `SearchBar` that opens Search.
  - Body, in order:
    1. Banners carousel (`/banners`), or when there are none, the hero from `mergeHome(theme, settings.home).hero` (text + `imageUrl`; CTA via `hrefToRoute`).
    2. Category shortcuts (top-level `/categories`, horizontal).
    3. Promos (`home.promos`).
    4. Section rails: `getHomeSections(settings.sections)`, one query per rail (§4.1), empty rails dropped, "View all" → ProductList (sort or category) and hidden for manual rails.
    5. Recently viewed rail.
    6. Why grid (`home.why`).
    7. Blocks (`banner` / `cards`; disabled blocks skipped).
  - When `/settings/public` returns `home: null` or `sections: null` (the live state), the app uses `DEFAULT_HOME_EMART` and `DEFAULT_SECTIONS` via `mergeHome` and `getHomeSections`, exactly like the web.
  - When the request **fails**, the web's `getSiteContent` falls back to the *classic* defaults. Mobile deliberately uses `mergeHome('emart', null)` + `DEFAULT_SECTIONS` instead. The app is eMart-branded and the live theme is `emart`, while the classic promos link to categories (`/category/electronics`, …) that may not exist. Home still renders and retries in the background.
  - Pull-to-refresh refetches all Home queries.
- **Categories.** Two-pane layout: left list of level-1 categories; right pane shows level-2 headers with level-3 chips. Tapping any node opens ProductList with `categoryId` (`/products` includes descendants). Loading, error and empty states apply.
- **ProductList.**
  - Title from params or the category name.
  - Sort sheet: relevance, popularity, newest, rating, discount, price low→high, price high→low, with the page-local caption (§4.2).
  - Filter sheet: brand (single select from `/brands`, active only) and category (tree picker).
  - Infinite scroll at 20 per page: next page while `page*pageSize < total`.
  - `ProductCard` Add uses `defaultVariantId` with quantity 1.
- **Search.**
  - Autofocused input.
  - `q` debounced 250 ms → `/search/autocomplete` (when `q.length ≥ 2`) shown as a suggestion list.
  - `q` debounced 400 ms → `/search` results grid (infinite).
  - Submit or tapping a suggestion saves it to recent searches and sets `q`.
  - Sort chips: relevance, newest, popularity, rating.
  - Empty input shows recent searches with Clear.
  - States: no-results, error with Retry.
- **ProductDetail.**
  - Gallery: `images[]`; the selected variant's `imageUrl` goes first when present; tap opens ImageViewer.
  - Title, brand, rating.
  - `VariantPicker` lists variants by `attributes` text (`variantText`, falling back to SKU).
  - `PriceDisplay` uses the selected variant: `sellingPrice` or the live slab price `resolveSlabPrice(sellingPrice, priceSlabs, qty)`, plus `mrp` and the shared `discountPct`.
  - `SlabTable` when `priceSlabs.length > 0`.
  - Stock: "In stock" / "Out of stock" from `inStock`. Quantity is not exposed by the API, so no count is shown.
  - `QuantitySelector`: min 1, max 99 (the server clamp), disabled when out of stock.
  - `DeliveryCheck`: PIN from the store (editable) → serviceability: "Delivers to 560001" or "Not deliverable to 560001 yet"; when `configured === false`, "Delivery available everywhere".
  - Description (plain text), attributes table, SHG story, "Not returnable" note when `isReturnable === false`.
  - Reviews list: rating, title, body, "Verified buyer", date, up to 3 thumbnails from `imagesJson` when it is a `string[]`.
  - Related products rail.
  - Sticky footer: Add to cart (primary) and Buy now (accent). Buy now = add, then `requireAuth(Checkout)`. The checkout covers the whole cart, because the API has no single-item checkout; the checkout summary shows every item.
  - Wishlist heart for the selected variant.
  - On mount, push the product id to recently viewed.
  - 404 → EmptyState "This product is no longer available".
- **Wishlist.** Per-variant list with RemoteImage, title, `unit`, price, "Add to cart" (POST `/cart/items` qty 1; the item stays wishlisted, since removal is a separate explicit action) and Remove. Tap opens PDP by `slug`.
- **Cart.** See §6.5. Sections: Items, then "Saved for later". The sticky footer shows the active subtotal and a "Checkout" CTA.
- **Auth.**
  - Login tabs: Phone OTP (only when `extra.phoneOtpEnabled`), Email OTP, Email & password.
  - OTP request → OtpVerify: 6-digit `OtpField`; expiry countdown from `expiresAt`; Resend after 30 s, or after the 429 countdown.
  - When `extra.showDevOtp && res.devCode`, a clearly labelled box reads "Demo code (development build only): 123456" with "Use code". `showDevOtp` is true only for the `development` variant, meaning the dev client and the preview APK, both package `.dev`. It is false in the production variant, so the box never renders in production builds.
  - Register: name, email, password via `emailRegisterSchema`.
  - Links to Terms (`/cms/pages/terms`) and Privacy (`privacy`) open CmsPage.
  - Success → `completeLogin` → `afterAuth(redirect)`.
  - No Google login.
- **Account.**
  - Guest: "Sign in / Create account", Help, Terms, Privacy, app version.
  - Customer: name (with a prompt when it is "Belzo Customer"), email/phone; menu: Orders, Wishlist, Addresses, Notifications, Edit profile, Privacy & data, Help, Logout (confirm), app version.
- **ProfileEdit.**
  - Fields name, email, phone, validated by `profilePatchSchema`; only changed fields are sent.
  - 409 maps to the email or phone field by matching the server message ("email" or "phone" substring), else a form-level error.
- **Addresses / AddressForm.**
  - Fields:
    - label (home/work/other)
    - fullName, phone (prefilled from the profile when not "Belzo Customer")
    - pincode (on 6 valid digits: `resolve-pincode` autofill when known, plus a serviceability badge)
    - line1, line2
    - city
    - state (picker from `GST_STATES` names)
    - "Make default"
  - Delete with ConfirmDialog; set default via PUT with the full body and `?default=true`.
  - **Select mode** (`route.params?.selectForCheckout === true`, set only when opened from Checkout):
    - Addresses: tapping an `AddressCard` runs `navigation.popTo('Checkout', { addressId: a.id }, { merge: true })`. Edit, delete and set-default stay available through the card's secondary actions. "Add address" opens `AddressForm { selectForCheckout: true }`.
    - AddressForm: after a successful **create**, invalidate `qk.addresses` and run `navigation.popTo('Checkout', { addressId: created.id }, { merge: true })`. After an **edit**, go back as in normal mode.
    - Outside select mode, card taps open AddressForm for editing and a create goes back, as before.
- **Checkout.**
  - **Address selection** (pure `selectCheckoutAddress(addresses, paramId)` in `features/checkout/checkout-selection.ts`): `route.params?.addressId` when it is in the list, else the address with `isDefault`, else the first one, else none. "Change" opens `Addresses { selectForCheckout: true }`.
  - **Zero addresses:** an inline EmptyState "Add a delivery address", whose button opens `AddressForm { selectForCheckout: true }`. No preview request is made, and Place stays disabled.
  - **Payment methods** (pure `availableMethods(preview.codEnabled, extra.onlinePaymentEnabled)` in the same file): COD when `preview.codEnabled`; "UPI / Card / Netbanking" when `extra.onlinePaymentEnabled`, sending `'upi'`. With exactly one method, preselect it. With two, preselect COD.
  - **No method** (`!preview.codEnabled && !extra.onlinePaymentEnabled`): the banner "No payment method is available right now. Please try again later." Place stays disabled.
  - `checkout-selection.test.ts` covers the address order (param, default, first, none; a param id that is not in the list falls through) and the method cases (none, COD only, online only, both).
  - Then: items summary, coupon (prefilled from the draft; Apply re-runs preview), breakup rows from `breakupView(snapshotFromBreakup(preview.breakup))`, "You save" (MRP savings + coupon + `shippingWaived`, computed as on the web), `gstNote`, not-serviceable banner, Place button (disabled when offline, not serviceable, no address, no payment method, or preview loading or failed). Then §6.6.
- **OrderConfirmation.** §6.8. Buttons: View order, Continue shopping (resets to Home).
- **Orders.** List items: thumbnail, `shortOrderId`, `formatDate(createdAt)`, `itemCount` items, `formatInr(grandTotal)`, `OrderStatusBadge`.
- **OrderDetail.**
  - Header: id, Copy (expo-clipboard), date, badge.
  - Content: `OrderStepper(buildStepper(order))`; `TrackingTimeline` from `order.tracking.shipments[].events` (newest first; courier, AWB, `trackingUrl` opened in the browser, `estimatedDelivery`); items (tap → PDP by `slug` when present); address; payment (`paymentSummary`); `PriceBreakupRows(breakupView(order))` with `gstNote`; returns list (`returnStatusLabel`, `returnStatusTone`, `resolutionLabel`, image thumbnails).
  - Actions: Invoice (`/orders/:id/invoice` → `WebBrowser.openBrowserAsync(url)`); Cancel when `cancelEligibility`, else the `cancelUnavailableReason` hint; Return when `returnEligibility(order).eligible`, else its `reason`; Reorder.
- **CancelOrder.** Radio list from `CANCEL_REASONS`; comments (max `commentMaxChars(label)`; required for `commentRequired`); validation via `cancelReasonError`; `refundNote(order)` shown; submit `{reason: cancelReasonText(code, comments)}`.
- **ReturnRequest.**
  - Five steps, driven by shared `returnStepError(order, draft, step)`:
    1. Items and quantities, from `returnEligibility().items`.
    2. Reason, from `RETURN_REASONS`.
    3. Resolution, from `resolutionOptions(order, reasonCode)`.
    4. Photos and comments.
    5. Review.
  - Photos: `ReturnPhotoPicker` with camera or library (`expo-image-picker`, `mediaTypes: ['images']`, `quality: 1`), then `expo-image-manipulator` normalisation, then `uploadImage`. Up to `MAX_RETURN_IMAGES`; required when `photosRequired(code)`.
  - Submit `buildReturnPayload(order, draft)`.
  - Permissions: camera is requested on first camera use; on denial, show "Allow camera access in Settings" with `Linking.openSettings()`. The library picker needs no permission on Android 13+ (photo picker).
- **Notifications.** List (title, body, relative time, unread dot). On screen focus, `POST /notifications/read {ids: unread.slice(0,100)}`, then update the cache. The bell badge is the unread count from the cached `qk.notifications`, fetched on Home focus for customers.
- **Help / CmsPage.** Help lists `/cms/pages`. CmsPage renders the title and body paragraphs (`body.split('\n')`, empty lines skipped), with selectable text. 404 → "This page is not available". Contact details come only from the CMS `contact` page; the web `DEFAULT_FOOTER` phone and email are **not** copied (they look like placeholders: "+91 98765 43210"; **UNVERIFIED**).
- **PrivacyData.**
  - "Download my data": POST export, then the requests list `GET /me/data/requests` with `refetchInterval: 5000` while any request is `pending` or `processing` and the screen is focused. A completed export → DataExportView decodes `resultUrl` with `decodeExport` (below) and shows `JSON.stringify(JSON.parse(json), null, 2)` as selectable text, with a "Copy" button. `{ ok: false }`, or a `JSON.parse` failure, shows "Export format not supported".
  - `features/privacy/export-decode.ts`. The server builds the URL as `Buffer.from(payload).toString('base64')` (`data-request.service.ts:94`), i.e. base64 of **UTF-8 bytes**. Bare `atob` returns a Latin-1 binary string, which garbles Devanagari and "₹", so the bytes are percent-decoded as UTF-8:

    ```ts
    const PREFIX = 'data:application/json;base64,';
    export function decodeExport(resultUrl: string): { ok: true; json: string } | { ok: false } {
      if (!resultUrl.startsWith(PREFIX)) return { ok: false };
      try {
        const bin = atob(resultUrl.slice(PREFIX.length));
        const json = decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        return { ok: true, json };
      } catch {
        return { ok: false }; // invalid base64 (atob throws) or invalid UTF-8 (URIError)
      }
    }
    ```

  - `export-decode.test.ts`: `{"name":"राम ₹"}` encoded with `Buffer.from(s).toString('base64')` and prefixed round-trips to the original string; a non-matching prefix (`https://…`, `data:text/plain;base64,…`) returns `ok: false`; invalid base64 returns `ok: false`.
  - "Delete my account": a ConfirmDialog explaining the consequences (orders and invoices kept as legally required; personal data anonymised; signed out on all devices) and requiring the typed word `DELETE`. Then POST deletion → `tokenManager.logout()` → a confirmation screen "Deletion requested".
  - The Play-required public web deletion URL is an owner task (§14).
- **Push stub** `features/notifications/push.ts`: `export async function registerForPushNotifications(): Promise<{ status: 'unsupported' }> { return { status: 'unsupported' }; } // TODO(Phase 7): expo-notifications + FCM, POST /me/devices`. Nothing calls it in this run, and it adds no dependency.

---

## 12. Pinned dependencies (exact versions; all re-verified on the npm registry on 2026-10-11)

I checked each version with `npm view <pkg>@<ver> version`, and native modules against `expo@57.0.27/bundledNativeModules.json` (fetched from unpkg).

**`dependencies`**

| Package | Version | SDK 57 bundled range |
|---|---|---|
| expo | 57.0.27 | — |
| react | 19.2.3 | 19.2.3 |
| react-native | 0.86.3 | 0.86.3 |
| @react-navigation/native | 7.5.0 | — |
| @react-navigation/native-stack | 7.20.0 | — |
| @react-navigation/bottom-tabs | 7.20.0 | — |
| react-native-screens | 4.26.2 | ~4.26.0 |
| react-native-safe-area-context | 5.7.0 | ~5.7.0 |
| @tanstack/react-query | 5.104.1 | — |
| zustand | 5.0.15 | — |
| react-hook-form | 7.89.0 | — |
| @hookform/resolvers | 3.10.0 | — (5.x needs zod ≥ 3.25) |
| zod | 3.23.8 | — (same as api, web and shared) |
| expo-secure-store | 57.0.4 | ~57.0.4 |
| expo-image | 57.0.5 | ~57.0.5 |
| expo-splash-screen | 57.0.9 | ~57.0.9 |
| expo-status-bar | 57.0.1 | ~57.0.1 |
| expo-system-ui | 57.0.4 | ~57.0.4 (needed because `userInterfaceStyle` is set) |
| expo-constants | 57.0.21 | ~57.0.21 |
| expo-linking | 57.0.12 | ~57.0.12 |
| expo-font | 57.0.4 | ~57.0.4 (peer of @expo/vector-icons) |
| @expo/vector-icons | 15.1.1 | ^15.0.2 |
| expo-image-picker | 57.0.20 | ~57.0.20 |
| expo-image-manipulator | 57.0.21 | ~57.0.21 |
| expo-web-browser | 57.0.3 | ~57.0.3 |
| expo-crypto | 57.0.3 | ~57.0.3 |
| expo-clipboard | 57.0.2 | ~57.0.2 |
| expo-dev-client | 57.0.19 | ~57.0.19 |
| @react-native-async-storage/async-storage | 2.2.0 | 2.2.0 |
| @react-native-community/netinfo | 12.0.1 | 12.0.1 |
| @shopify/flash-list | 2.0.2 | 2.0.2 |
| react-native-svg | 15.15.4 | 15.15.4 (latest is 15.15.5; stay on the bundled pin) |
| @belzo/shared | workspace:* | — |

**`devDependencies`**

| Package | Version | Note |
|---|---|---|
| typescript | 6.0.3 | SDK 57 template's ~6.0.3 |
| @types/react | 19.2.18 | |
| @types/jest | 29.5.12 | same as repo |
| jest | 29.7.0 | same as repo; jest-expo 57 uses babel-jest ^29 |
| jest-expo | 57.0.5 | ~57.0.5 |
| @react-native/jest-preset | 0.86.3 | required peer of jest-expo 57 (`^0.86.3`) |
| @testing-library/react-native | 14.1.0 | peers: jest ≥ 29, react ≥ 19, RN ≥ 0.78, test-renderer ^1 |
| test-renderer | 1.3.0 | peer react ^19 |
| babel-preset-expo | 57.0.14 | explicit, because pnpm isolation means `babel.config.js` must resolve it from `apps/mobile` |
| eslint | 8.57.0 | same as repo |
| eslint-config-expo | 57.0.2 | |
| @resvg/resvg-js | 2.6.2 | placeholder asset script only |
| ignore | 5.3.2 | `scripts/check-easignore.mjs` only; already in the lockfile (eslint), the same library eas-cli uses for `.easignore` |

**Tooling (not installed; run on demand):** `npx eas-cli@24.12.1`, `npx expo-doctor@1.20.4`.

**Explicitly NOT added:**

- `react-native-razorpay` (Phase 5)
- `expo-notifications` (push is out of scope)
- `react-native-gesture-handler`, `react-native-reanimated` (not needed by native-stack, bottom-tabs or FlashList v2)
- `expo-build-properties` (no Gradle overrides needed)
- axios
- `@babel/core` directly (pnpm `auto-install-peers` supplies it). If pnpm reports it missing, add it pinned to the exact 7.x version already in the lockfile for `babel-preset-expo`, **never 8.x** (8.0.7 is npm `latest`).

---

## 13. Configuration: `app.config.ts`, config plugin, `eas.json`

### 13.1 `app.config.ts`

`buildConfig(env)` is exported for unit tests; the default export is `({ config }) => buildConfig(process.env)`.

```ts
type Variant = 'development' | 'production';
const variant: Variant = env.APP_VARIANT === 'production' ? 'production' : 'development';
const isProd = variant === 'production';
const apiBaseUrl = (env.EXPO_PUBLIC_API_BASE_URL ?? (isProd ? '' : 'http://13.48.85.9')).trim().replace(/\/+$/, '');
// validation (throws → `expo config` / EAS fail fast):
//   must parse with new URL(); production requires https://; development allows http(s)
const cleartextHosts = isProd ? [] : uniq(['13.48.85.9', '10.0.2.2', 'localhost', '127.0.0.1',
  ...(env.BELZO_DEV_CLEARTEXT_HOSTS ?? '').split(',').map(s => s.trim()).filter(Boolean)]);
return {
  name: isProd ? 'Belzo eMart' : 'Belzo eMart (Dev)',
  slug: 'belzo-emart',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: isProd ? 'belzoemart' : 'belzoemart-dev',
  userInterfaceStyle: 'light',
  icon: './assets/placeholder/icon-PLACEHOLDER.png',
  android: {
    package: isProd ? 'in.belzo.emart' : 'in.belzo.emart.dev',
    adaptiveIcon: { foregroundImage: './assets/placeholder/adaptive-foreground-PLACEHOLDER.png', backgroundColor: '#ffffff' },
    allowBackup: false,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  plugins: [
    ['expo-splash-screen', { image: './assets/placeholder/splash-icon-PLACEHOLDER.png', imageWidth: 200, backgroundColor: '#ffffff' }],
    ['expo-secure-store', { configureAndroidBackup: true }],
    ['expo-image-picker', { photosPermission: 'Allow Belzo eMart to use your photos for return requests.', cameraPermission: 'Allow Belzo eMart to use the camera for return photos.', microphonePermission: false }],
    ...(isProd ? [] : [['./plugins/with-network-security-config', { cleartextHosts }]]),
  ],
  extra: {
    variant, apiBaseUrl, cleartextHosts,
    showDevOtp: !isProd,
    phoneOtpEnabled: !isProd || env.EXPO_PUBLIC_PHONE_OTP === 'on',
    onlinePaymentEnabled: env.EXPO_PUBLIC_ONLINE_PAYMENT === 'on',   // off by default in every variant
    ...(env.EAS_PROJECT_ID ? { eas: { projectId: env.EAS_PROJECT_ID } } : {}),
  },
};
```

Notes:

- Online payment is **off by default in every variant** (development, preview and production). Dev and preview builds talk to the live store, where `PAYMENT_PROVIDER` is `mock`: a "UPI/Card" order there is auto-captured inside `initiate`, which confirms the order, converts stock to a sale and enqueues shipment, notification and invoice jobs. Only an explicit `EXPO_PUBLIC_ONLINE_PAYMENT=on` (local env or EAS env) shows the online method. No `eas.json` profile sets it.
- The production default also keeps phone OTP **off**: production phone OTP would require exposing `devCode` (SMS is mock) (blockers 1 and 4). The owner turns these on through EAS env once the real gateways exist.
- `src/config/env.ts` validates `Constants.expoConfig.extra` with a zod schema (`variant` enum, `apiBaseUrl` url, booleans, `cleartextHosts: string[]`). On failure it renders the fatal config screen (§9.2).
- `image-url.ts` › `resolveImageUrl(url)`:
  - null, empty, or starting with `/seed/` → `null`, which makes RemoteImage show its fallback.
  - Leading `/` → `apiBaseUrl + url`.
  - `http://` whose host is in `extra.cleartextHosts` → unchanged.
  - Other `http://` → rewritten to `https://`. If that fails to load, `onError` shows the fallback (this covers the stored `http://13.48.85.9/api/uploads/banners/…` URLs in production).
  - `https://` and `data:` → unchanged.
  - Anything else → `null`.
- No `owner` and no `extra.eas.projectId` are committed. `eas init` by the owner supplies them, via `EAS_PROJECT_ID` or by editing.

### 13.2 `eas.json`

```json
{
  "cli": { "version": ">= 24.12.1", "appVersionSource": "remote" },
  "build": {
    "base": { "pnpm": "9.12.0" },
    "development": { "extends": "base", "developmentClient": true, "distribution": "internal", "environment": "development",
      "android": { "buildType": "apk" },
      "env": { "APP_VARIANT": "development", "EXPO_PUBLIC_API_BASE_URL": "http://13.48.85.9" } },
    "preview": { "extends": "base", "distribution": "internal", "environment": "preview",
      "android": { "buildType": "apk" },
      "env": { "APP_VARIANT": "development", "EXPO_PUBLIC_API_BASE_URL": "http://13.48.85.9" } },
    "production": { "extends": "base", "autoIncrement": true, "environment": "production",
      "android": { "buildType": "app-bundle" },
      "env": { "APP_VARIANT": "production" } }
  },
  "submit": { "production": {} }
}
```

- **Preview** is a standalone release APK of the *development variant* (package `.dev`, cleartext to the HTTP API). It is the only kind of tester build that works until HTTPS exists. The README says so explicitly.
- **Production** gets `EXPO_PUBLIC_API_BASE_URL` (https) and the optional `EXPO_PUBLIC_ONLINE_PAYMENT` / `EXPO_PUBLIC_PHONE_OTP` from EAS environment variables configured by the owner. If the URL is missing or not https, `app.config.ts` throws, so an http production build is impossible.
- `"environment"` selects the EAS environment-variable set per profile (owner-configured on expo.dev). The `env` blocks above still apply on top.

**Root `.easignore` (decision: created).** EAS uploads the repository root for a monorepo. When a `.easignore` exists, EAS uses it **instead of every** `.gitignore`, so it must repeat each ignore pattern; a pattern left out would upload that file (the repo root holds `Belzo-key.pem` and `.env` today). The file, exactly (patterns that only make sense at the root are anchored with a leading `/`):

```gitignore
# EAS upload rules. This file REPLACES every .gitignore for EAS uploads.
# Keep it a superset of /.gitignore and /apps/mobile/.gitignore
# (apps/mobile/scripts/check-easignore.mjs enforces this).

# --- from /.gitignore ---
node_modules/
.pnpm-store/
dist/
build/
.next/
out/
*.tsbuildinfo
.env
.env.local
.env.*.local
*.pem
logs/
*.log
npm-debug.log*
pnpm-debug.log*
coverage/
.nyc_output/
playwright-report/
test-results/
apps/api/prisma/*.db
.DS_Store
Thumbs.db
.idea/
.vscode/
.docker-data/

# --- from /apps/mobile/.gitignore ---
apps/mobile/android/
apps/mobile/ios/
apps/mobile/.expo/
apps/mobile/dist/
*.jks
*.keystore
google-services.json

# --- secrets, broader than .gitignore ---
.env*
*.p12
*.p8
*.key

# --- not needed to build the app ---
apps/api/
apps/web/
/infra/
/aidlc-docs/
/.agents/
/.kiro/
/.github/
/docs/
/scripts/
/Caddyfile
/docker-compose*.yml
/DEPLOY.md
/tmp-*.sh
```

- What remains in the upload: root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, the root lint/format configs, `packages/shared` (sources, `package.json`, tsconfig; its `dist/` is excluded, and Metro uses `src`, §8.2) and `apps/mobile`. EAS's `pnpm install --frozen-lockfile` then sees only the shared and mobile importers, which is the same partial-importer case the Docker deps stage relies on (§8.3 (a), §15 item 1).
- Nothing the EAS build needs lives in `apps/web`: `scripts/sync-brand.mjs` reads `apps/web/public/belzo-logo.svg` only locally and writes the committed `belzo-logo.generated.ts`; the brand-drift Jest test also runs only locally and in CI, never on EAS.
- `apps/mobile/.gitignore` contains exactly the seven patterns of the second block, written relative to `apps/mobile` (`android/`, `ios/`, `.expo/`, `dist/`, `*.jks`, `*.keystore`, `google-services.json`).

**`.easignore` verification** (`apps/mobile/scripts/check-easignore.mjs`, run by the implementer and reported in §16.2; not part of `pnpm test`, because it walks the real working tree):

1. Load `.easignore` with the `ignore` package (devDependency `ignore` **5.3.2**, already in the lockfile through eslint; eas-cli 24.12.1 itself uses `ignore` 5.3.0, so the matching semantics are the same library).
2. Candidate paths = `git ls-files --cached --others --exclude-standard` (everything git would keep) plus `git ls-files --others --ignored --exclude-standard --directory` (everything git ignores, directories collapsed), run from the repo root.
3. Assert that every path git ignores is also ignored by `.easignore` (so the file is a superset of all `.gitignore`s).
4. Assert that none of the uploaded paths matches `*.pem`, `.env*`, `*.jks`, `*.keystore`, `*.p12`, `*.p8`, `*.key` or `google-services.json`, or starts with `apps/api/`, `apps/web/` or `.agents/`.
5. Assert that `apps/mobile/package.json`, `apps/mobile/app.config.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` are uploaded.
6. Exit non-zero with the offending paths on any failure.

If the owner has an Expo account, additionally run `npx eas-cli@24.12.1 build:inspect --platform android --profile preview --stage archive --output %TEMP%\belzo-eas-archive` and confirm the same (then delete the folder). That EAS reads `.easignore` from the repository root in a monorepo is **UNVERIFIED** until that check or the first EAS build.
- Whether the EAS default Node image satisfies RN's `^20.19.4 || ^22.13 || ^24.3` is **UNVERIFIED**. If not, add `"node": "22.x"`-style pinning after checking the EAS docs.

### 13.3 Config plugin `plugins/with-network-security-config.js` (development variant only)

- Uses `require('expo/config-plugins')`. Not `@expo/config-plugins`, which pnpm isolation does not expose to `apps/mobile`.
- `withDangerousMod('android')` writes `android/app/src/main/res/xml/network_security_config.xml`:

  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
      <domain includeSubdomains="false">13.48.85.9</domain>
      <domain includeSubdomains="false">10.0.2.2</domain>
      <domain includeSubdomains="false">localhost</domain>
      <domain includeSubdomains="false">127.0.0.1</domain>
      <!-- + each BELZO_DEV_CLEARTEXT_HOSTS entry (validated: hostname or IPv4 only; anything else throws) -->
    </domain-config>
  </network-security-config>
  ```

- `withAndroidManifest` sets `application.$['android:networkSecurityConfig'] = '@xml/network_security_config'`.
- `localhost` and `127.0.0.1` are included in addition to the brief's `13.48.85.9` / `10.0.2.2` / LAN, so that loopback traffic (`adb reverse` to Metro or a local API) keeps working. Loopback never leaves the device.
- Production gets no plugin, so Android's default applies: targetSdk ≥ 28 means cleartext is blocked, and no `usesCleartextTraffic` is set.
- Gotcha, documented in the README: when `networkSecurityConfig` is present, Android ignores the debug manifest's `usesCleartextTraffic="true"`. The dev client can then reach Metro over plain HTTP only on listed hosts. So either list the dev PC's LAN IP in `BELZO_DEV_CLEARTEXT_HOSTS` before building the dev client, or use `expo start --tunnel` (HTTPS) or `adb reverse` (localhost) (Android docs; **UNVERIFIED** on a device).
- Verified by `APP_VARIANT=development npx expo prebuild -p android --no-install --clean`, which generates files only and needs no SDK. Then inspect the XML and manifest, and delete `android/` (gitignored). The production variant check is that the manifest has no `networkSecurityConfig`.

---

## 14. Out of scope / stubbed in this run

| Item | State |
|---|---|
| Push notifications (FCM, device tokens) | Stub `push.ts` only; no `expo-notifications`; no backend device-token model |
| Razorpay online payments | `PaymentAdapter` interface plus a non-working stub; `onlinePaymentEnabled` is off by default in every variant; no `react-native-razorpay` |
| `POST /payments/verify`, `POST /orders/:id/pay`, unpaid-order expiry job | Not built (Phase 5) |
| Phase-5 note: re-opening Razorpay for a reused order | A7's guard returns `clientConfig: {}` for a `pending` payment, so a replayed `place` cannot re-open the checkout sheet. Phase 5 must return the stored `providerOrderId` and key for a `pending` Razorpay payment (without creating a new gateway order) if re-opening is wanted |
| Coupon on auto-cancel (§6.6 `unavailable`) | `OrderService.cancel` releases stock but does **not** reverse a coupon redemption (verified: no coupon handling in `order.service.ts › cancel`). Accepted, because the path is unreachable with online payment off; Phase 5 decides whether cancel should reverse redemptions |
| Google login | Not offered (the backend returns 401 in production) |
| Wallet, referral, write review, review photos, helpful votes, Q&A | Not in this run's screen list |
| HTTPS, domain, Android App Links, migrating http banner URLs | Owner and infra tasks (blocker 2) |
| Public web account-deletion URL (Play requirement) | Owner: add a CMS page and link it in the Play listing |
| Official master logo, launcher icon, splash | Placeholders generated from the web SVG; owner supplies the official assets |
| EAS project, Expo account, keystore, Play Console | Owner; **no APK or AAB is built in this run** |
| Local Android build, emulator, device testing, Maestro E2E | Not possible here (no Android SDK, adb or emulator); E2E deferred |
| Hindi localisation | English UI only; Devanagari product text renders through system fonts |
| Server-side price sort and filters, review privacy fix, thumbnails, PUT P2025 → 404 | Backlog (Phase 1 §5g). The cart "unsave" endpoint is no longer backlog: it is A8 |
| Crash reporting and analytics | None |
| iOS | Architecture stays iOS-ready (no Android-only APIs outside the config plugin), but iOS is not configured or tested |

---

## 15. Unverified assumptions (consolidated)

1. pnpm 9.12 `install --frozen-lockfile` with a partial set of workspace `package.json` files (the Docker deps stage) installs nothing for absent importers. Verified by simulation in §8.3 (a) before commit.
2. Caddy 2 (`caddy:2-alpine`) replaces client-supplied `X-Forwarded-For` by default, so `trust proxy 1` cannot be spoofed. Check after deploy: `curl -H 'X-Forwarded-For: 1.2.3.4' http://13.48.85.9/api/v1/...` twice past the limit from one machine, and confirm the logged `req.ip` is the real client.
3. Expo SDK 57 `getDefaultConfig` auto-detects the pnpm workspace, and Metro follows pnpm symlinks to one zod instance. Checked via `expo export`.
4. TypeScript 6.0.3 compiles shared's sources (written for TS 5.5) without new errors, and default `types` handling in TS 6.
5. `eslint-config-expo` 57.0.2's legacy config works with eslint 8.57.0 (fallback in §8.5).
6. Hermes `Intl` en-IN currency grouping and `toLocaleString` options match Node output (device check).
7. Android ignores `usesCleartextTraffic` when a network security config is present (dev-client LAN Metro note).
8. RN `boxShadow` renders on Android under the New Architecture.
9. EAS reads the root `.easignore` (in place of every `.gitignore`) for this monorepo, accepts the `pnpm` and `environment` fields, and its default Node satisfies RN 0.86's engines. The `.easignore` contents are checked locally by `check-easignore.mjs` (§13.2); EAS's own reading of it is confirmed only by `build:inspect` or the first EAS build.
10. Live API response shapes are unchanged since Phase 1's checks on 2026-10-11.
11. Production env values (`PAYMENT_PROVIDER=mock`, `SMS_PROVIDER` not live, `JWT_ACCESS_TTL=900`) are as Phase 1 inferred.
12. RN Android `fetch` multipart upload with a `file://` URI from `expo-image-manipulator` works against multer's `file` field.
13. `atob` is available globally in Hermes on RN 0.86 (`decodeExport` uses it only for base64 → bytes; UTF-8 decoding is done with `decodeURIComponent`, §11). Jest runs on Node, where `atob` is global, so the unit test does not prove the Hermes global.
14. The `DEFAULT_FOOTER` phone and email in the web are placeholders, so they are not reused.
15. The web wishlist's add-to-cart behaviour was not inspected. Mobile keeps the item wishlisted, which is a reasonable default.

---

## 16. Testing and verification

### 16.1 Unit and component tests

| Area | Location | Cases |
|---|---|---|
| API client | `apps/mobile/src/api/__tests__/client.test.ts` | Bearer attached when authenticated; `X-Client-Platform: mobile` on every call; guest header only when guest and `cart:true`; **single-flight**: 3 concurrent 401s → exactly one `/auth/refresh`, all 3 retried with the new token; proactive refresh when `accessExpiresAt` is within 60 s; refresh 401 → `expireSession` called, SecureStore cleared, `auth` error; refresh network error → token kept; 401 after a successful refresh → logout; 429 with `Retry-After: 1` → retried, succeeds (fake timers); 429 without `Retry-After` → no retry; timeout → `kind:'timeout'` (fake timers); caller abort → `kind:'aborted'`; non-JSON error body → generic `ApiError`; logout during an in-flight refresh discards the new token (generation) |
| Session / merge | `features/auth/__tests__/session.test.ts` | §6.4 cases |
| Checkout idempotency | `features/checkout/__tests__/checkout-attempt.test.ts` | §6.6 cases |
| Order result | `features/checkout/__tests__/order-result.test.ts` | Parity with the web `resolveView` |
| Navigation helpers | `navigation/__tests__/href.test.ts`, `after-auth.test.ts` | §2.7 table; §2.4 |
| Image URL | `api/__tests__/image-url.test.ts` | §13.1 rules |
| App config | `__tests__/app-config.test.ts` | Dev defaults; dev with no env → `extra.onlinePaymentEnabled === false`; prod with no env → `false`; either variant with `EXPO_PUBLIC_ONLINE_PAYMENT=on` → `true`; prod requires https (throws on http or missing); prod has no plugin; dev cleartext host validation |
| Metro config | `__tests__/metro-config.test.ts` | `require('../metro.config').resolver.resolveRequest(ctx, '@belzo/shared', 'android')` returns `{ type: 'sourceFile', filePath: <workspace>/packages/shared/src/index.ts }`; any other name (e.g. `zod`) delegates to the upstream/`ctx.resolveRequest` jest.fn with the same arguments |
| Checkout helpers | `features/checkout/__tests__/payment-outcome.test.ts`, `checkout-selection.test.ts` | §6.6 `handlePaymentOutcome` cases; §11 address and payment-method selection |
| Export decode | `features/privacy/__tests__/export-decode.test.ts` | §11 `decodeExport` cases |
| Brand drift | `ui/brand/__tests__/logo.test.ts` | Embedded XML equals `apps/web/public/belzo-logo.svg` |
| Components | `ui/__tests__/*.test.tsx` | `ProductCard` (title, price, MRP strike only when higher, discount badge, a11y label, onPress, Add hidden without `defaultVariantId`); `PriceDisplay`; `QuantitySelector` (bounds, disabled states, a11y actions); `OrderStatusBadge` (labels and tones from `statusBadge`) |
| Screens (mocked `fetch`) | `features/search/__tests__/SearchScreen.test.tsx` | Typing → debounced suggestions and results rendered; no-results state; error → Retry refetches |
| | `features/cart/__tests__/CartScreen.test.tsx` | Lines render; unavailable line shows Remove only; quantity + calls PUT with `{variantId, quantity}` and updates; guest request carries `x-guest-token` |
| Backend | `apps/api` specs listed in §7 A1–A8 | Including A7 (`payment.service.spec.ts` atomic-claim cases: non-`created` statuses, concurrent `initiate`, `createOrder` rejection revert; `checkout.controller.spec.ts` reused-mock case) and A8 (`cart.controller.spec.ts` guest and Bearer cases) |
| Shared | moved web tests + `schemas.test.ts` additions | — |

Test infrastructure:

- `jest.setup.ts` mocks:
  - `expo-secure-store`: in-memory Map.
  - `@react-native-async-storage/async-storage`: its official `jest/async-storage-mock`.
  - `@react-native-community/netinfo`: official `jest/netinfo-mock.js`.
  - `expo-crypto`: `randomUUID` → `node:crypto`; `digestStringAsync` → sha256 via `node:crypto`.
  - `expo-image`: render `View`.
  - `@shopify/flash-list`: its `jestSetup` if provided, else mapped to `FlatList`.
  - `expo-web-browser` and `expo-clipboard`: `jest.fn`.
- `global.fetch` is a `jest.fn` per test.
- A `renderWithProviders()` helper wraps QueryClient (retry off), SafeArea test metrics, NavigationContainer and ToastProvider.
- jest-expo 57's default `transformIgnorePatterns` already allow `.pnpm` paths (verified in `jest-expo@57.0.5/jest-preset.js`). Extend them only if a dependency fails with ESM syntax.

### 16.2 Commands the implementation must run and report

1. `pnpm install` (root), then `pnpm install --frozen-lockfile`; lockfile diff review (§8.1).
2. `pnpm --filter @belzo/shared test && pnpm --filter @belzo/shared typecheck && pnpm --filter @belzo/shared lint`
3. `pnpm --filter @belzo/api db:generate`, then `pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api test && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api build`
4. `pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web lint && pnpm --filter @belzo/web build`
5. `pnpm --filter @belzo/mobile typecheck && pnpm --filter @belzo/mobile lint && pnpm --filter @belzo/mobile test`
6. Root `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` (these include mobile locally on Node 24) and `pnpm -r build` (mobile has no `build` script, so it is skipped). Then the exact CI forms: `pnpm -r --filter '!@belzo/mobile' typecheck`, `lint` and `test` (must not list `@belzo/mobile` in their output), and `pnpm --filter @belzo/mobile typecheck`, `lint` and `test`. Parse `ci.yml` as in §8.4.
7. In `apps/mobile`:
   - `npx expo config --type public` (development).
   - With `APP_VARIANT=production` and `EXPO_PUBLIC_API_BASE_URL=https://shop.example.com`, the same command (production). Also confirm that `APP_VARIANT=production` with an http URL fails.
   - `npx expo-doctor@1.20.4`. Report the result. A duplicate-`react` warning caused by web's React 18 is expected and must be explained if it appears.
   - `npx expo prebuild -p android --no-install --clean` for both variants (§13.3), then delete `android/`.
   - Shared-from-source bundle check (it must not be able to pass against the stale, gitignored `packages/shared/dist`, which exists on disk and is what shared's `main`/`exports` point to):
     1. Rename `packages/shared/dist` to `packages/shared/dist.verify-bak`.
     2. Run `npx expo export --platform android --output-dir dist --source-maps` (if it works offline or online without an account).
     3. Assert that at least one `.map` file under `apps/mobile/dist` has a `sources` entry ending in `packages/shared/src/index.ts`, and that no `sources` entry contains `packages/shared/dist`.
     4. Restore the folder by renaming it back (or, if that fails, rebuild it with `pnpm --filter @belzo/shared build`). Always run this step, also when step 2 or 3 fails.
     5. Delete `apps/mobile/dist`.
8. §8.3 (a) and (b) simulations; (c) only if Docker is present. Then `node apps/mobile/scripts/check-easignore.mjs` (§13.2) must exit 0; report its upload-set summary (file count, and confirmation that no `*.pem` or `.env*` is included).
9. State explicitly in `phase2-4-report.md` that **no APK was built** and that EAS needs the owner's Expo account.

### 16.3 What remains unverified after this run

On-device behaviour (rendering, Intl, uploads, cleartext, back gestures, TalkBack), EAS builds, the Caddy XFF behaviour on the server (curl check in §15 item 2), and the deployed backend changes (the orchestrator deploys).

---

## 17. Implementation order and commits (for the planner)

1. **Shared:** schemas and constants additions (A1, A6, `profilePatchSchema`), plus the helper extraction (§10) with moved tests. Then the web re-exports. Run shared and web suites. *Commit: `feat(shared): mobile auth schemas, preview paymentMethod, shared view helpers (web re-exports)`.*
2. **API A1–A8** with specs. Run the API suites. One commit per change, e.g. `feat(api): header-gated body refresh tokens for mobile clients`, `fix(api): reject blocked customers on refresh; revoke tokens on DPDP deletion`, `fix(api): trust one proxy hop so throttling keys on the client IP`, `fix(checkout): clear purchased cart lines after a successful order`, `fix(worker): give DPDP jobs their own queue`, `feat(checkout): preview accepts paymentMethod for the COD fee`, `fix(payments): idempotent initiate so replayed place calls never reset a captured payment` (A7), `feat(cart): move-to-cart endpoint` (A8). A4 and A7 both create `payment.service.spec.ts`; whichever lands first creates it and the other extends it.
3. **Workspace isolation:** `.dockerignore`, `deploy.ps1` exclude, and the simulations. *Commit `chore: keep apps/mobile out of server images and the deploy tarball`.* Then the `ci.yml` change (§8.4). *Commit `ci: filter mobile out of the Node 20.14 job and add a Node 22.13 mobile job`.* The root `.easignore` lands with the mobile scaffold in step 4, together with `check-easignore.mjs`, and step 4 runs the script before committing.
4. **Mobile scaffold:** package.json with pins, configs (app.config, eas, babel, metro, jest, tsconfig, eslint, .gitignore, root `.easignore`), plugin, scripts (including `check-easignore.mjs`), placeholder assets, theme, ui kit, api core, navigation shell, boot. Then `pnpm install` and the lockfile. *Commit `feat(mobile): Expo SDK 57 app scaffold, design system and API client`.*
5. **Features in order:** auth and session → home, categories, product list, search, PDP → cart and wishlist → addresses, checkout and confirmation → orders, cancel and return → notifications, help, CMS, profile, privacy. Tests land with each. *One commit per feature group.*
6. **Docs:** `apps/mobile/README.md` and `.agents/tasks/mobile-app/phase2-4-report.md`.

Commit hygiene:

- Add files explicitly.
- Never stage `.env*`, `*.pem`, keystores (`*.jks`, `*.keystore`), `google-services.json`, `apps/mobile/android/`, `apps/mobile/dist/` or `apps/mobile/.expo/`.
- Commit on `master`; no worktree.
- Do not deploy.
- **Baseline commit first.** The repo has 205 untracked paths that predate this work (Phase 1). Several files this work modifies are among them. I checked with `git ls-files`: these are untracked:
  - `apps/api/src/modules/identity/auth.controller.ts`, `token.service.ts`, `data-request.service.ts`, `dpdp.worker.ts`
  - `apps/api/src/modules/engagement/notification.worker.ts`
  - `apps/api/src/common/queue/queue.constants.ts`, `apps/api/src/common/logger/logger.module.ts`
  - `apps/api/src/modules/checkout/checkout.controller.ts`
  - `apps/api/src/modules/cart/cart.controller.ts` (A8)
  - `packages/shared/src/constants.ts`
  - `scripts/deploy.ps1`
  - `.github/workflows/ci.yml` (§8.4)

  Step 0 is therefore one commit, `chore: track pre-existing files touched by the mobile work (unchanged)`, which adds **exactly those files at their current content**. Every later commit then shows a reviewable diff. The planner re-runs `git ls-files --error-unmatch` on the final touch list to catch any other file. Other untracked paths are not committed; that remains an owner decision.

---

## 18. Review findings addressed

Iteration 2 addressed round 1 (`design-review.json`); iteration 3 addressed round 2 (`design-review-r2.json`, first run). Round 2 found that iteration 2 had fixed most round-1 items only in §0, so iteration 3 carried each fix into the implementing sections. Iteration 4 addresses the round-2 re-run (the current `design-review-r2.json`, which reviewed iteration 3). Every fix was re-checked against the code under `apps/api`, `apps/web` and `packages/shared`.

### 18.0 Round 2 re-run (`design-review-r2.json`, CHANGES_REQUESTED: 0 HIGH, 2 MEDIUM, 10 NIT)

| # | Sev | Response | Where |
|---|---|---|---|
| 1 | MED | **Fixed.** A7's read-based `payment.status !== 'created'` guard is replaced by an atomic claim: `payment.updateMany({ where: { id, status: 'created' }, data: { status: 'pending' } })`; `count === 0` returns `{ provider, clientConfig: {} }`. `createOrder` runs only after a won claim; on rejection the claim is reverted (`where status 'pending' and providerOrderId null` → `created`) and the error rethrown. The follow-up `update` writes only `providerOrderId`, never `status`. Failure handling per step added. New tests: two concurrent `initiate` calls give one `createOrder` and a final `captured` row (mock); `createOrder` rejection reverts to `created` and a later `initiate` succeeds; the fake prisma's `updateMany` honours its `where`. The "no write" test wording now says "its only write attempt is the conditional `updateMany`, which matches 0 rows". §6.6 and A4 now state the concurrent case. Verified in `checkout/payment.service.ts › initiate` (unconditional `update` after `createOrder` today), `schema.prisma` (`providerOrderId String?`), and `all-exceptions.filter.ts` (5xx logged at `error`) | §6.6, §7 A4, §7 A7 |
| 2 | MED | **Fixed.** §10 now lists all four flagged accesses, including line 250 `makeOrder({ items: [{ ...base.items[0]!, isReturnable: false }, base.items[1]!] })`, and drops "no other edit is made" in favour of "nothing else besides the import lines". Acceptance: shared `test` and `typecheck` pass. Re-verified with `tsc --noEmit -p apps/web/tsconfig.json --noUncheckedIndexedAccess`: TS2532 at 147, 152 and 170, TS2322 at 250:35 and 250:78, nothing in the other two moved tests. Noted that shared's `tsconfig.json` excludes `**/*.test.ts`, so ts-jest is the gate | §10 Tests |
| 3–12 | NIT | Backlogged: this iteration fixes HIGH and MEDIUM only, as instructed. #3, #4, #5, #6, #7, #8 and #12 are the same items already backlogged as R2 #13, #14, #18, #16, #17, #19 and #15 below. #9 (A7 deliberately stops a replay from retrying a failed mock auto-capture), #10 (coupon may not be reusable after the auto-cancel) and #11 (Node 20.14 install of mobile's engines is warnings-only, unverified) are documentation-only and do not change what is built | — |

### 18.1 Round 2 (`design-review-r2.json` first run, CHANGES_REQUESTED: 1 HIGH, 11 MEDIUM, 7 NIT)

| R2 # | Sev | Response | Where |
|---|---|---|---|
| 1 | HIGH | **Fixed** (made atomic in iteration 4, §18.0 #1). New §7 A7: `initiate` returns `{ provider, clientConfig: {} }` for any payment whose status is not `created`. A4 "Replay safety" corrected. Tests: `payment.service.spec.ts` (captured, pending, failed, refunded, partially_refunded untouched; created and COD unchanged) and a `checkout.controller.spec.ts` reused-mock case. Added to §16.1 and §17 step 2; Phase-5 re-open note in §14. Verified: `checkout.controller.ts › place` calls `initiate` regardless of `reused`; `initiate` has no status guard | §7 A4, §7 A7, §6.6, §14, §16.1, §17 |
| 2 | MED | **Fixed** (completed in iteration 4, §18.0 #2). §10 adds `!` on `order-view.test.ts` lines 147, 152, 170 and 250 (verified with `tsc --noUncheckedIndexedAccess`; shared inherits the flag) | §10 Tests |
| 3 | MED | **Fixed.** `lib/order-view.ts` also re-exports `formatDate` and `formatDateTime` (verified imported by `order-sections.tsx` lines 10–11). Acceptance check: web typecheck with zero edits under `apps/web/src/app/**` | §10 |
| 4 | MED | **Fixed.** `unavailable` → exactly one `POST /orders/:id/cancel`, cancelled copy, or support copy with `shortOrderId` if the cancel fails (new `notice: 'payment_unavailable_cancel_failed'`). Never mentions the website. `payment-outcome.test.ts` added. §14 records that cancel does not reverse coupon redemption (verified in `order.service.ts › cancel`) | §2.1, §6.6, §9.2, §14, §16.1 |
| 5 | MED | **Fixed.** `popTo('Checkout', { addressId }, { merge: true })` from an AddressCard tap and after an AddressForm create in select mode; selection order param → default → first; zero-address EmptyState; no-method banner with Place disabled; single method preselected. Pure helpers in `checkout-selection.ts` with tests | §11 Addresses, Checkout; §16.1 |
| 6 | MED | **Fixed.** §8.4 now specifies the `ci.yml` change: `pnpm -r --filter '!@belzo/mobile'` for typecheck, lint and test in the Node 20.14 job, plus a `mobile` job on Node 22.13.0. §14 "CI Node bump" row deleted; §16.2 step 6 aligned; `ci.yml` (verified untracked) added to step 0 | §8.4, §14, §16.2, §17 |
| 7 | MED | **Fixed.** `metro-config.test.ts` row in §16.1; §16.2 step 7 renames `packages/shared/dist` before `expo export --source-maps`, asserts the map lists `packages/shared/src/index.ts` and no `dist`, then restores | §16.1, §16.2 |
| 8 | MED | **Fixed.** `decodeExport` specified (prefix check, `atob`, UTF-8 percent-decode, `ok: false` → "Export format not supported"), with a Devanagari/₹ round-trip test. Verified: `data-request.service.ts:94` base64-encodes UTF-8 bytes | §11 PrivacyData, §15 item 13, §16.1 |
| 9 | MED | **Fixed.** `onlinePaymentEnabled: env.EXPO_PUBLIC_ONLINE_PAYMENT === 'on'` for both variants; note says off in every variant and why; `app-config.test.ts` dev and prod default cases | §13.1, §14, §16.1 |
| 10 | MED | **Fixed.** This section rewritten; §7 intro says "All eight"; A7 and A8 in §16.1 and the §17 commit list | §7, §16.1, §17, §18 |
| 11 | MED | **Fixed.** New §7 A8 (`@Public() @Post('items/:variantId/move-to-cart')` → `saveForLater(ref, variantId, false)`) with guest and Bearer `cart.controller.spec.ts` cases; removed from the §14 backlog; `cart.controller.ts` (verified untracked) added to step 0 | §7 A8, §14, §17 |
| 12 | MED | **Fixed.** §0's option chosen: §13.2 now specifies the exact root `.easignore` (every pattern of both `.gitignore`s, extra secret patterns, server and docs folders), adds `"environment"` to each `eas.json` profile, and adds `check-easignore.mjs` (superset and no-secret assertions using the same `ignore` library as eas-cli) plus an optional `build:inspect`. §15 item 9 updated | §1.2, §12, §13.2, §15, §16.2, §17 |
| 13 | NIT | Backlogged: this iteration fixes HIGH and MEDIUM only. The coder uses `qk.cart('customer')` per §6.2, which is unambiguous | — |
| 14 | NIT | Backlogged (same reason). The parse in step "0" is labelled "(caller)" and is done before `completeLogin` is called | — |
| 15 | NIT | Backlogged (same reason). Local hydrate and SecureStore reads are unbounded; acceptable as local I/O | — |
| 16 | NIT | Partly done through findings 6 and 11 (`ci.yml`, `cart.controller.ts` added). `token.service.spec.ts` is backlogged; the planner's `git ls-files --error-unmatch` re-check on the final touch list (§17) catches it | §17 |
| 17 | NIT | Backlogged (same reason). §12's fallback rule (add an undeclared peer pinned to the lockfile version) covers `@babel/runtime` if pnpm reports it | — |
| 18 | NIT | Backlogged (same reason). §0 lists `**/node_modules` in `.dockerignore`; §8.3 still says only `apps/mobile`. Either is safe for the server images | — |
| 19 | NIT | Backlogged (same reason): Phase-5 whole-line `removePurchased` refinement and the optional principal-kind check in `rotate` | — |

### 18.2 Round 1 (`design-review.json`), final status

| R1 # | Sev | Status after iteration 4 | Where |
|---|---|---|---|
| 1 | HIGH | Resolved (R2 #1; atomic claim in iteration 4, §18.0 #1) | §7 A7 |
| 2 | MED | Resolved (R2 #2; line 250 added in iteration 4, §18.0 #2) | §10 |
| 3 | MED | Resolved (R2 #3) | §10 |
| 4 | MED | Resolved (R2 #4) | §6.6 |
| 5 | MED | Resolved: params in iteration 2, flow in iteration 3 (R2 #5) | §2.1, §11 |
| 6 | MED | Resolved (R2 #6) | §8.4 |
| 7 | MED | Resolved (R2 #7) | §16.1, §16.2 |
| 8 | MED | Resolved (R2 #8) | §11 |
| 9 | MED | Resolved (R2 #9); the LIVE-store warning is in §0 and the README | §13.1 |
| 10 | NIT | Resolved in iteration 2 (`notice` union; extended in iteration 3) | §2.1 |
| 11 | NIT | Resolved in iteration 2 | §6.2, §4.3 |
| 12 | NIT | Backlogged (R2 #16) | §17 |
| 13 | NIT | Backlogged (R2 #17) | — |
| 14 | NIT | Resolved in iteration 2 | §2.1 |
| 15 | NIT | Resolved in iteration 2 | §2.5, §5.4 |
| 16 | NIT | Resolved (R2 #12) | §13.2 |
| 17 | NIT | Backlogged (R2 #18) | — |
| 18 | NIT | Backlogged (R2 #19) | — |
| 19 | NIT | Resolved (R2 #11, A8) | §7 A8 |
| 20 | NIT | Backlogged (R2 #19; optional) | — |
| 21 | NIT | Resolved in iteration 2 | §0, §5.3 |
