# Belzo eMart — Android app (`@belzo/mobile`)

The customer Android app for Belzo eMart, built with Expo (SDK 57) and React Native. It shares
business logic (validation schemas, pricing, order/return view helpers) with the web app through the
`@belzo/shared` workspace package, so money, GST and order rules stay identical across platforms.

## Prerequisites

- Node `>= 20.11` and `pnpm 9` (same as the monorepo root).
- A running Belzo API (see the repo root `README.md`). Point the app at it via `apiBaseUrl` (below).
- For device/emulator builds: Android Studio + an Android SDK, or a physical device with the
  **Expo Dev Client** build installed. This app uses native modules (secure store, image picker),
  so **Expo Go is not sufficient** — a dev client build is required.

## Install

From the monorepo root:

```bash
pnpm install
```

## Configure

Runtime config lives in `app.config.ts` under `extra`, selected by the `APP_VARIANT`
(`development` | `preview` | `production`) env var. The important values:

- `apiBaseUrl` — the API origin the app calls (e.g. `http://10.0.2.2:4000` for the Android
  emulator talking to a local API, or your deployed `https://…` origin).
- `cleartextHosts` — hosts allowed over plain HTTP (development only; production forces HTTPS).
- `phoneOtpEnabled`, `showDevOtp`, `onlinePaymentEnabled` — feature flags.

Example for local development against the Android emulator:

```bash
APP_VARIANT=development pnpm start
```

Override the API origin without editing the file by exporting it before `start` (see
`app.config.ts` for the exact env names it reads).

## Run

```bash
pnpm --filter @belzo/mobile start        # Metro + dev client
pnpm --filter @belzo/mobile android      # build & launch on a connected device/emulator
```

The first `android` run compiles the native project and installs the dev client. Subsequent JS
changes reload over Metro.

## Publishing a new app version (in-app "Download new app")
The app checks `https://<site>/app-version.json` (file: `apps/web/public/app-version.json`) and
shows a "New version available" banner on Home plus a "Download new app" row in Account. The web
site has the same link at `/download` (also in the footer).
1. Bump `version` in `app.config.ts`.
2. Build an APK: `eas build -p android --profile preview` (needs `eas login`), download the `.apk`.
3. Put the APK at `apps/web/public/downloads/belzo-emart.apk` (or host it anywhere).
4. Edit `apps/web/public/app-version.json`: `version` (same as step 1), `apkUrl`
   (`/downloads/belzo-emart.apk` or a full URL) and a short `notes` line.
5. Deploy the web (`pnpm deploy`). Installed apps with an older version then show the banner.
An empty `apkUrl` hides the download option everywhere.

## Scripts

| Script           | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| `start`          | Metro bundler for the dev client (`expo start --dev-client`). |
| `android`        | Build and run the native app (`expo run:android`).            |
| `typecheck`      | `tsc --noEmit`.                                               |
| `lint`           | ESLint over `src/**` and `app.config.ts`.                     |
| `test`           | Jest (jest-expo).                                             |
| `doctor`         | `expo-doctor` environment checks.                             |
| `export:android` | JS bundle export for inspection (`dist/`).                    |

Run the full gate from the root:

```bash
pnpm --filter @belzo/mobile typecheck && pnpm --filter @belzo/mobile lint && pnpm --filter @belzo/mobile test
```

## Project structure

```
src/
  api/          Typed fetch client, token manager, query client/keys, image-url, upload, errors
  app/          App entry, providers, boot, error boundary
  config/       Env parsing/validation (app.config.ts → extra)
  features/     One folder per domain: auth, home, categories, products, search, cart,
                wishlist, addresses, checkout, payments, orders, notifications, content,
                profile, privacy, onboarding — each with api.ts, hooks.ts, screens/, components/
  lib/          storage (AsyncStorage), secure (SecureStore), debounce, logger
  navigation/   RootNavigator, MainTabs, RequireAuth, href mapping, deep-link config, types
  store/        Zustand stores (session, pincode, recently-viewed, recent-searches, checkout-draft)
  theme/        Design tokens and theme
  ui/           Reusable presentational components (Button, TextField, ProductCard, …)
```

## Architecture notes

- **Data**: TanStack Query for server state (keys in `api/query-keys.ts`); Zustand for small
  client/UI state. The typed client (`api/client.ts`) handles auth modes, the guest cart token,
  429 backoff and a single-flight refresh.
- **Auth**: native clients use a body refresh token (not a cookie). Guest carts merge into the
  customer cart on login (`features/auth/session.ts`).
- **Checkout** is idempotent: a stable key is derived from the cart fingerprint
  (`features/checkout/checkout-attempt.ts`) so a retried "place order" never double-charges.
- **Shared logic**: pricing, GST, order stepper, cancel/return eligibility and the price breakup
  all come from `@belzo/shared` and are unit-tested there.

## Not wired in this build (intentional stubs)

- **Online payments (Razorpay)** — `features/payments/razorpay-adapter.stub.ts` reports
  `unavailable`; the app places COD orders and, for online, cancels and tells the user to retry
  with COD. Phase 5 will integrate `react-native-razorpay`.
- **Push notifications** — `features/notifications/push.ts` returns `{ status: 'unsupported' }`.
  Phase 7 will add `expo-notifications` + FCM and `POST /me/devices`.
- The Play-required public account-deletion web URL is an owner/ops task.

## Testing

Jest + `@testing-library/react-native`. Native modules are mocked in `jest.setup.ts`. Pure logic
(checkout attempt/selection/payment-outcome/order-result, category tree, auth session merge, DPDP
export decode) and key screens (search, cart) have tests. `forceExit` is enabled because async
screen tests leave TanStack Query/debounce batch timers pending after teardown.
