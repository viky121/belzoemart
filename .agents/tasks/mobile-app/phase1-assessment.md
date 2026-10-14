# Belzo eMart — Android App, Phase 1 Technical Assessment

Read-only assessment, 2026-10-11. Nothing in the repo, its config or its data was changed. The only file written is this report.
Evidence comes from: source files (cited as `path` › symbol), read-only shell commands on this machine, unauthenticated GETs against the live API at `http://13.48.85.9`, and the npm registry and Expo docs for version checks.
"UNVERIFIED" marks anything I could not confirm, such as production env values I cannot read.

---

## Executive summary

**Verdict.** No mobile app exists yet. A search for `app.json`, `eas.json`, `metro.config.js`, `AndroidManifest.xml` and `build.gradle` (depth 4, outside node_modules) found none. The NestJS API already covers almost every customer flow the Android app needs: OTP and email auth, catalogue and search, guest cart with merge, wishlist, coupons, checkout with idempotency, orders, tracking, invoice, cancel, reorder, returns with photos, wallet, in-app notifications, CMS and DPDP. A React Native client can mostly be built against the existing API. It needs a short list of small, backward-compatible backend changes, plus a few owner decisions and accounts.

**Reusable as-is**
- REST API under `/api/v1`, with bearer JWT auth and a guest cart via the `x-guest-token` header.
- `@belzo/shared`. It depends only on `zod` and has no Node or DOM APIs. Usable directly: zod request schemas, pricing (GST-inclusive, integer paise), order status labels and tracking reconciliation, return and cancel reason rules, and the GST display helpers.
- Product and brand images are absolute `https://belzo-media-prod.s3.eu-north-1.amazonaws.com/...` URLs (checked live).
- Brand palette and logo SVG (§4).

**Top blockers, ranked, with the decision or action needed from the store owner**

| # | Blocker (verified unless noted) | Owner decision / action |
|---|---|---|
| 1 | **Payments are not real.** Production runs `PAYMENT_PROVIDER=mock` (per brief and `.env.prod.example`; live env UNVERIFIED). `PaymentService.initiate` then auto-captures every "online" order, so orders are confirmed without any money moving. | Complete Razorpay KYC. Provide live `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`. Register the webhook `https://<domain>/api/v1/payments/webhook`. Approve using the native `react-native-razorpay` SDK. |
| 2 | **No HTTPS.** Port 443 timed out from here and the Caddyfile serves `:80` only. Android 9+ blocks cleartext HTTP in release builds by default. `http://13.48.85.9/api/uploads/...` banner URLs are stored in the DB as absolute http strings. | Buy or point a domain (A record → 13.48.85.9). Open 443 in the EC2 security group. Approve switching Caddy to the domain block (auto-TLS). Update `PUBLIC_BASE_URL`/`CORS_ORIGINS`. Re-upload or migrate the http banner URLs. |
| 3 | **Refresh token is cookie-only.** Every auth endpoint sets the refresh token as an httpOnly cookie and never returns it in the body, so a native app cannot store it in SecureStore. | Approve a small, opt-in backend change: a header-gated refresh token in the response body (§5a). The web app is unaffected. |
| 4 | **Phone OTP is either insecure or broken.** `SmsModule` always binds `MockSmsProvider`; no live SMS adapter exists. With mock, the API returns the OTP as `devCode` in the response, so anyone can sign in as any phone number. With `SMS_PROVIDER=live`, no SMS is sent and phone login breaks. | Choose a DLT-registered SMS gateway (e.g. MSG91, Gupshup, Twilio India) and complete DLT template registration. Until then, launch with email OTP or password only, with `EMAIL_PROVIDER=live`. |
| 5 | **No push notifications.** There is no device-token model, endpoint or FCM adapter. `PUSH_PROVIDER` is bound to `MockPushProvider`. | Create a Firebase project (Android app plus `google-services.json` and a service account). Approve the small backend addition in §5e. |
| 6 | **Background jobs are lost at random.** `DpdpWorker` and `NotificationWorker` both consume the `notifications` BullMQ queue, and each silently completes jobs meant for the other. Account-deletion requests (a Google Play requirement) and order notifications can be dropped. | Approve the backend fix: give DPDP its own queue. |
| 7 | **Cart is never cleared after an order.** No code path in the API or web removes ordered lines (searched every `cartItem.delete*`/`cart.delete`). | Approve the backend fix: clear active lines on successful `place`. |
| 8 | **No local Android toolchain.** There is no Android SDK, adb or emulator. JDK 17 is installed. C: has 17.2 GB free. | Create an Expo account for EAS cloud builds (recommended), or install the Android SDK (§Environment). Choose the permanent app id (e.g. `in.belzo.emart`). Create a Play Console account. |

Also needed before launch (lower rank):
- **Google login does not work in production.** `SocialAuthService.verifyGoogle` throws "Google login not configured" when `NODE_ENV=production`. Owner decision: drop it, or provide a Google OAuth client.
- **Rate limiting is effectively shared by every user.** There is no `trust proxy`, so the 100 req/min/route limit keys on Caddy's container IP.
- **No official master logo.** The SVG uses live `<text>` set in Segoe UI, and the PNG app icons are missing.
- **Most of the code is not committed.** 204 untracked paths versus 152 tracked, including most of `apps/api/src`, and there is no git remote. Commit before starting mobile work.

**Recommended stack** (versions verified on the npm registry today):
- Expo SDK 57 (`expo` 57.0.27, React Native 0.86.3, React 19.2.3), using a development build with Continuous Native Generation and EAS Build. Expo Go is not an option because Razorpay is a native module.
- TypeScript 6.0.3 (strict).
- React Navigation 7 (`native` 7.5.0, `native-stack` and `bottom-tabs` 7.20.0).
- TanStack Query 5.104.1 for server state, including the server-side cart.
- Zustand 5.0.15 for session, PIN code and recently viewed.
- A typed `fetch` client with single-flight refresh.
- React Hook Form 7.89.0 with `@hookform/resolvers` 3.10.0 and zod 3.23.8, so the shared schemas are reused. Resolvers 5.x needs zod ≥3.25.
- `expo-secure-store`, `expo-image`, `expo-notifications` (FCM) and `react-native-razorpay` 3.0.0 (New Architecture support since v3.0.0).
- Jest 29.7.0 + `jest-expo` 57.0.5 + `@testing-library/react-native` 14.1.0, with Maestro for E2E.
- Location: `apps/mobile` in the existing pnpm workspace. The workspace already globs `apps/*`.

SDK 58 is still `next` (58.0.7, beta) on npm. Upgrade once it is promoted to `latest`.

---

## 1. Existing system architecture

**Monorepo.** pnpm 9.12.0 workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), with the root `package.json` named `belzo-emart`. There is no `.npmrc`, so pnpm's default isolated `node_modules` layout is in use.

| Part | Tech | Evidence |
|---|---|---|
| `apps/api` (`@belzo/api`) | NestJS 10.3.10, Prisma 5.18, PostgreSQL, Redis (ioredis 5.4), BullMQ 5.12, helmet, `@nestjs/throttler` 6.2.1, Swagger 7.4, nestjs-pino | `apps/api/package.json`, `apps/api/src/app.module.ts` |
| API worker | Same image, `node dist/worker.js`. It runs the DPDP, invoice, shipment and notification BullMQ consumers. | `apps/api/src/worker.module.ts`, `docker-compose.prod.yml` › `worker` |
| `apps/web` (`@belzo/web`) | Next.js 14.2.5 App Router with React 18.3.1 and next-intl. It serves the storefront `(shop)` and the admin (`/admin`). | `apps/web/package.json` |
| `packages/shared` (`@belzo/shared`) | Plain TS compiled to CommonJS `dist/` (target ES2022). Its only dependency is `zod` 3.23.8. | `packages/shared/package.json`, `tsconfig.base.json` |

**API bootstrap** (`apps/api/src/main.ts` › `bootstrap`):
- Global prefix `api` and URI versioning with default `1`, giving `/api/v1/...`.
- helmet with CSP/HSTS, CORS allowlist `CORS_ORIGINS` with `credentials: true`, and `cookie-parser`.
- JSON body limit 1 MB; `rawBody: true` for webhook signatures.
- Global `ZodValidationPipe` and fail-closed `AllExceptionsFilter`.
- Static `uploads/` served at `/api/uploads`.
- Swagger at `/docs`. This path is not under `/api` and Caddy proxies only `/api/*` to the API, so the docs are reachable only on the API port, e.g. `http://localhost:4000/docs`, not publicly.

**Auth model** (`apps/api/src/common/auth/jwt-auth.guard.ts`, `roles.guard.ts`):
- Deny-by-default global JWT guard, with `@Public()` opt-out.
- Bearer token taken from the `Authorization` header.
- The principal is `{sub, kind: 'customer'|'admin', roles}`.
- `RolesGuard` requires `kind === 'admin'` on `@Roles` routes.

**Data stores.**
- PostgreSQL 16.3 (Prisma schema `apps/api/prisma/schema.prisma`, 6 migrations).
- Redis 7.4 for BullMQ queues `notifications`, `invoices`, `shipments`, `payments` and `abandoned-cart` (`apps/api/src/common/queue/queue.constants.ts`). `payments` and `abandoned-cart` have no consumer.

**Storage.** A port in `apps/api/src/integrations/storage/` with two adapters:
- `LocalStorageProvider` writes to `<cwd>/uploads` and returns URLs as `${CDN_BASE_URL||PUBLIC_BASE_URL}/api/uploads/<key>`.
- `S3StorageProvider` returns `CDN_BASE_URL/<key>` or `https://<bucket>.s3.<region>.amazonaws.com/<key>`.

Live data shows production now uses S3: bucket `belzo-media-prod` in `eu-north-1` for products and brands. Some banners still point at `http://13.48.85.9/api/uploads/banners/...` from the earlier local storage.

**Integrations.** All are ports with mock adapters:

| Integration | Live adapter? | Selected by |
|---|---|---|
| Payment | Razorpay (`razorpay-payment.provider.ts`) | `PAYMENT_PROVIDER` |
| Shipping | Shiprocket (`shiprocket.provider.ts`) | `SHIPPING_PROVIDER` |
| Email | SMTP (`smtp-email.provider.ts`) | `EMAIL_PROVIDER` |
| SMS | None, always mock (`sms.module.ts`) | — |
| WhatsApp | None, always mock | — |
| Push | None, always mock (`notifications-integration.module.ts`) | — |

**Deploy topology** (`docker-compose.prod.yml`, `Caddyfile`, `DEPLOY.md`):
- A single EC2 host, `13.48.85.9`, running postgres, redis, api (port 4000, internal), worker, web (port 3000, internal) and caddy (ports 80 and 443 published).
- Caddy runs `:80` only. `/api/*` goes to `api:4000` and everything else to `web:3000`. A commented domain block exists for auto-TLS.
- The web container's SSR calls the API at `http://api:4000`; the browser bundle uses `PUBLIC_BASE_URL`.
- Live checks: `GET /api/v1/products` returned 200 via `Via: 1.1 Caddy`. `https://13.48.85.9/` timed out, so 443 is closed or filtered. `DEPLOY.md` claims 443 is open in the security group; that is contradicted by this test.

**CI.** `.github/workflows/ci.yml` runs on Node 20.14.0 / pnpm 9.12.0: install, prisma generate, typecheck, lint, test, build and audit. It triggers on the `main` branch, but the local branch is `master` and no remote is configured.

## 2. Feature inventory

**Storefront (customer)** — `apps/web/src/app/(shop)/*`:
- Home, with admin-configurable hero, promos, "why" items, blocks and product rails (`lib/home-sections.ts`, `lib/site-content.ts`). There are two themes, `classic` and `emart`; `emart` is live.
- Category pages (`category/[slug]`), search with filters (`search`, `components/filter-sidebar.tsx`) and header autocomplete (`components/header-search.tsx`).
- Product detail: gallery, variant picker, bulk price slabs, delivery-PIN check, reviews panel with photo upload.
- Delivery-PIN gate and widget (`components/pincode-gate.tsx`, `lib/use-pincode.ts`).
- Cart with guest token, save-for-later and coupon carry-over (`cart`).
- Checkout: addresses, UPI/online vs COD, coupon, preview, place, then Razorpay widget or result polling (`checkout`, `order-result`).
- Login: phone OTP and email OTP with demo-code display, email/password signup (`login`, `signup`), and a profile-completion prompt (`components/profile-prompt.tsx`).
- Account (profile, addresses, order and wishlist counts, DPDP data export), orders list, and order detail with stepper, tracking, invoice link, cancel modal, return modal with photos, and reorder.
- Wishlist, notifications (in-app list and mark-read), and CMS pages (`page/[slug]`).

There is no web UI for wallet, referral, Q&A, account deletion or Google login, even though the API exposes all but working Google login.

**Admin** (`apps/web/src/app/admin/*`, API `admin/*` behind `@Roles`):
- Catalogue: products, variants, categories, brands, media library, bulk Excel import and export.
- Orders: status transitions, shipments, invoice regenerate.
- Returns moderation.
- Coupons.
- Marketing: banners, CMS and home content.
- Reviews moderation.
- Customers.
- Admin users and RBAC with TOTP MFA.
- Settings: theme, shipping and COD pricing, serviceable PINs, store details.
- Reports and audit log.

The mobile app targets the customer side only.

## 3. API & integration inventory (customer-facing)

Base: `{API}/api/v1`. "Bearer" means `Authorization: Bearer <accessToken>` and is required by the global guard unless the route is marked Public.

Error envelope (`AllExceptionsFilter`): `{statusCode, error, message, correlationId}`. Zod failures return 400 `ValidationError`. All 5xx responses return the generic message "Internal server error". The shared `apiErrorSchema` parses this envelope.

Money is always integer paise.

### Auth — `apps/api/src/modules/identity/auth.controller.ts`
| Method & path | Auth | Request (schema › file) | Response | Notable errors |
|---|---|---|---|---|
| POST `/auth/otp/request` | Public, throttle 5/min | `otpRequestSchema` › `packages/shared/src/schemas.ts`: `{phone?, email?}`, at least one. Phone matches `(+91)?[6-9]\d{9}`. | `{requestId, expiresAt, devCode?}`. `devCode` (the real 6-digit code) is returned whenever the channel's provider env ≠ `live` (`otp.service.ts` › `request`). TTL is 5 min. | 400 when neither phone nor email is given |
| POST `/auth/otp/verify` | Public, 10/min | `otpVerifySchema`: `{requestId: uuid, code: 4–6 digits}` | `{accessToken, expiresIn, customer:{id,name,email,phone,locale}}`, plus `Set-Cookie belzo_rt`. Auto-creates the customer (name "Belzo Customer"). | 400 Invalid/expired, Code already used, Code expired, Too many attempts, Incorrect code; 403 Account is blocked |
| POST `/auth/register` | Public | `emailRegisterSchema`: `{name, email, password 8–128}` | Same as verify | 401 "Email already registered" (unusual status code) |
| POST `/auth/login` | Public, 10/min | `emailLoginSchema` | Same as verify | 429 lockout (`lockout.service.ts`), 401 invalid, 403 blocked |
| POST `/auth/google` | Public | `{idToken}` (`googleLoginSchema` › `identity/dto.ts`) | Same as verify | In production always 401 "Google login not configured". In dev it accepts base64url JSON `{email,name,sub}` (`social-auth.service.ts`). |
| POST `/auth/refresh` | Public; reads cookie `belzo_rt` only | none | `{accessToken, expiresIn}` and a rotated cookie | 401 Missing, Invalid, Refresh token reuse detected (revokes the whole family), expired |
| POST `/auth/logout` | Public; cookie optional | none | `{success:true}`; revokes the family and clears the cookie | — |
| GET `/me` | Bearer | — | `{id,name,email,phone,gender,dob,photoUrl,locale,status}` | 404 |
| PATCH `/me` | Bearer | `profilePatchSchema` › `identity/dto.ts` (name, email, phone, gender, dob ISO, photoUrl URL, locale) | Updated profile | 409 email or phone linked to another account |

There is no endpoint for uploading a profile photo. `photoUrl` must be an existing URL.

### Addresses — `identity/addresses.controller.ts`, `address.service.ts`
| Method & path | Notes |
|---|---|
| GET `/me/addresses` | Ordered with the default first. Row fields: `id, customerId, label(home/work/other), fullName, phone, line1, line2, city, state, pincode, isDefault, createdAt, updatedAt`. |
| POST `/me/addresses[?default=true]` | Body `addressInputSchema` (shared). The first address becomes the default. |
| PUT `/me/addresses/:id[?default=true]` | Full body (`addressInputSchema`). 403 if not yours, 404 if missing. |
| DELETE `/me/addresses/:id` | `{success:true}` |
| GET `/me/addresses/resolve-pincode?pincode=` | Bearer. Returns `{city,state}` from only 8 hardcoded metro PINs, otherwise `{city:null,state:null}` (`pincode.service.ts`). |

### Settings, serviceability, home content — `modules/admin/public-settings.controller.ts`
- **GET `/settings/public`** (Public) returns `{theme:'classic'|'emart', home: Partial<HomeContent>|null, footer, sections: HomeSection[]|null}`. `home` is sanitized by `sanitizeHomeContent` and `sections` by `homeSectionSchema`. The live response was `{"theme":"emart","home":null,"footer":null,"sections":null}`, so the app must ship the same defaults the web uses: `DEFAULT_HOME_EMART` (`apps/web/src/lib/site-content.ts`) and `DEFAULT_SECTIONS` (`apps/web/src/lib/home-sections.ts`). Section sources are `sort` (discount, newest, popularity, rating), `category` and `manual` (`productIds`). Manual sections are resolved with `GET /products?ids=`.
- **GET `/settings/serviceability?pincode=`** (Public) returns `{serviceable, configured}`. Live with no PIN: `{"serviceable":false,"configured":true}`, meaning a PIN allowlist is configured. The same list gates `checkout/place`.

### Catalogue — `modules/catalogue/catalogue.controller.ts`
- **GET `/categories`** (Public) returns a nested `CategoryNodeDto[]`: `{id,name,slug,imageUrl,children}`. Active only, ordered by `displayOrder`. `imageUrl` was null in the live sample. There are no product counts.
- **GET `/brands`** (Public) returns raw rows `{id,name,slug,logoUrl,isActive}`. Live `logoUrl` values are S3 https or null.
- **GET `/products`** (Public). Query is `productQuerySchema`:

  | Param | Type / values |
  |---|---|
  | `page` | ≥1, default 1 |
  | `pageSize` | 1–100, default 20 |
  | `q` | Accepted but ignored by `/products`; use `/search` |
  | `categoryId` | uuid; descendants are included (`category.service.ts` › `descendantIds`) |
  | `brandId` | uuid |
  | `minPrice`, `maxPrice` | paise |
  | `sort` | `relevance\|price_asc\|price_desc\|newest\|popularity\|rating\|discount` |
  | `ids` | Comma-separated uuids. Non-paginated, keeps the given order, sliced to `pageSize`. |

  Response: `{items: ProductCardDto[], total, page, pageSize}`. The card is `{id,title,slug,imageUrl,mrp,sellingPrice,discountPct,ratingAvg,ratingCount,defaultVariantId,unit}`, where `defaultVariantId` is the cheapest active variant, so listings can add to cart directly.

  **Caveat** (`product.service.ts` › `list`): `price_asc`, `price_desc` and `discount` sorting, and the `minPrice`/`maxPrice` filters, are applied after the DB page is fetched. They are page-local, and `total` ignores the price filter. Infinite scroll with price sort will show out-of-order results.
- **GET `/products/:idOrSlug`** (Public) returns `ProductDetailDto` (`packages/shared/src/catalogue.ts`): card fields plus `description, brand, categoryId, hsnCode, taxRatePct, images[{url,alt}], videoUrl, variants[{id,sku,mrp,sellingPrice,discountPct,attributes,imageUrl,inStock,priceSlabs[{minQty,unitPrice}]}], shgName, story, attributes, seo, isReturnable`. Returns 404 if the product is missing, unpublished or has no active variant. Stock quantity is not exposed, only `inStock`.
- **GET `/search`** (Public, same query schema; `postgres-search.provider.ts`). Matches `q` with ILIKE on title and description.
  - `categoryId` is exact (no descendants).
  - `minPrice`/`maxPrice` are ignored.
  - Price and discount sorts fall back to `ratingCount desc`.
- **GET `/search/autocomplete?q=`** (Public) returns `string[]`: up to 8 titles, most-reviewed first. There are no ids or images.

### Reviews & Q&A — `engagement/public-engagement.controller.ts`, `engagement.controller.ts`, `media/review-media.controller.ts`
- **GET `/products/:productId/reviews`** (Public) returns approved `Review` rows: `{id, productId, customerId, rating, title, body, imagesJson, verifiedPurchase, helpfulCount, status, createdAt}`. The list is not paginated, has no reviewer name, and exposes `customerId`.
- **POST `/reviews`** (Bearer). Body `reviewSchema` (in `engagement.controller.ts`): `{productId, rating 1–5, title?, body 1–2000, images?: url[] ≤6}`. Creates a `pending` review; `verifiedPurchase` is set if the customer has a delivered order containing the product.
- **POST `/reviews/:id/helpful`** (Bearer). Unlimited votes per user.
- **POST `/reviews/media/upload`** (Bearer). Multipart field `file`; jpeg, png, webp, gif or avif; ≤15 MB (`media/customer-image-upload.ts`). Returns `{url,key}` under `reviews/`.
- **GET `/products/:productId/questions`** (Public) and **POST `/questions`** (Bearer, `{productId, body ≤500}`).

### Cart — `cart/cart.controller.ts`, `cart.service.ts`, `cart-context.ts`
All routes are Public. Identity comes from the bearer token (customer) or, failing that, the **`x-guest-token`** header (string, ≥8 chars, **generated by the client**; the web uses a UUID in `localStorage`, `apps/web/src/lib/cart-api.ts` › `getGuestToken`). With neither, the API returns 400 "Provide a bearer token or an x-guest-token header".

Every mutation returns the full `CartView`: `{cartId, items[]}`. Each line is `{id, variantId, productId, quantity, savedForLater, title, sku, unit, imageUrl, unitPrice (slab-resolved), basePrice, mrp, discountPct, taxRatePct, inStock, unavailable, available, priceSlabs, tierQty}`. Bulk tiers apply to the total quantity of a product across all its variants.

| Method & path | Notes |
|---|---|
| GET `/cart` | Creates the cart if missing |
| POST `/cart/items` | `cartItemInputSchema` `{variantId, quantity 1–99}`. Adds to any existing quantity (clamped to 99) and resets `savedForLater`. 400 if the variant is inactive. |
| PUT `/cart/items/:variantId` | Body must also be `cartItemInputSchema`, so `variantId` is repeated in the body. A missing line throws Prisma P2025, which surfaces as 500. |
| DELETE `/cart/items/:variantId` | — |
| POST `/cart/items/:variantId/save-for-later` | No "move back" endpoint; POST `/cart/items` un-saves but adds to the quantity. |
| POST `/cart/merge` | Bearer, body `{guestToken}` (no zod schema). Sums quantities and deletes the guest cart. The web calls it on every `setSession`. |

### Wishlist & coupons
- **GET `/wishlist`**, **POST `/wishlist` `{variantId}`** and **DELETE `/wishlist/:variantId`** (Bearer). Each returns `[{id, variantId, createdAt, title, slug, imageUrl, unit, mrp, sellingPrice, discountPct, inStock}]`. Wishlist entries are per variant, not per product (`wishlist.service.ts`).
- **POST `/coupons/validate`** (Bearer). Body `{code ≤40, subtotal paise}`. Returns `{code, valid, reason?, spec?, discount}` (`coupon.service.ts` › `evaluate`). There is no public "available offers" list.

### Checkout & payments — `checkout/checkout.controller.ts`, `checkout.service.ts`, `payment.service.ts`
- **POST `/checkout/preview`** (Bearer). Body `checkoutPreviewSchema` `{addressId, couponCode?}`. Returns `{breakup: PriceBreakup{subtotal,discount,shipping,codFee,tax,gst{cgst,sgst,igst},grandTotal}, coupon:{code,valid,reason?}|null, items[], serviceable, codEnabled, shippingWaived}`. Two issues:
  - The controller never passes `isCod`, so the preview always shows `codFee=0`; the COD fee (default ₹39) appears only after placing the order.
  - The preview does not check that the address belongs to the caller. This is a minor IDOR; only the state and PIN are used.

  Errors: 404 Address not found; 400 Cart is empty, "…no longer available", "…out of stock".
- **POST `/checkout/place?idempotencyKey=<uuid>`** (Bearer). Body `placeOrderSchema` `{addressId, paymentMethod: upi|card|netbanking|wallet|emi|cod, couponCode?}`. Returns `{orderId, reused, breakup, payment:{provider:'cod'|'mock'|'razorpay', amount, clientConfig?}}`.
  - For any non-COD method the controller calls `PaymentService.initiate`.
    - Razorpay returns `clientConfig {provider:'razorpay', key, orderId, amount}`.
    - Mock returns `{provider:'mock', providerOrderId, amount}` and **auto-captures** through the webhook path, which sets the order to `confirmed`.
  - The client must send the key. The server fallback is `${sub}:${addressId}:${Date.now()}`, which is not idempotent.
  - On a key replay (`reused:true`), `initiate` runs again and creates a new gateway order.
  - Errors: 400 Invalid address, "Sorry, we don't deliver to PIN …", "Cash on Delivery is currently unavailable.", invalid coupon, cart errors.
  - Stock is reserved after the order is created.
  - The cart is not cleared (blocker 7).
  - "wallet" and "emi" are only labels: anything except `cod` goes to the gateway. The wallet balance is never redeemed at checkout.
- **POST `/payments/webhook`** (Public, gateway only; `payment.controller.ts`). Verifies `x-razorpay-signature` (HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`, timing-safe) or the mock signature, which is `sha256(body)` with **no secret**. The handler is idempotent by `eventId`. Capture moves the order to `confirmed`, converts stock reservations to sales, and enqueues shipment, notification and invoice jobs. Failure moves the order to `cancelled` and releases the stock.
- **Not available:**
  - A client payment-signature verify endpoint.
  - An endpoint to retry payment for an existing pending order. `initiate` is called only from `place`; the web's message "you can retry from your orders" has no backing endpoint.
  - A job that expires unpaid pending orders, so their reserved stock stays held.

### Orders, tracking, invoice, returns — `orders/orders.controller.ts`, `order.service.ts`, `return.service.ts`
- **GET `/orders`** (Bearer). All orders, unpaginated, newest first: `[{id,status,grandTotal,createdAt,itemCount,imageUrl,items[{title,sku,quantity,unitPrice,imageUrl,slug}]}]`.
- **GET `/orders/:id`** returns the Prisma order (money snapshot fields, `couponCode`, `invoiceUrl`, `cancelledReason`, …) plus:
  - `address`
  - `items[]` with `imageUrl, slug, isReturnable, attributes`
  - `payments[]`, `shipments[]` (with events), `invoice`
  - `returns[{id,status,reason,resolution,images,items,createdAt,updatedAt}]`
  - `tracking` (`ReconciledTracking`, from shared `reconcileTracking`)

  403 "Not your order", 404. The web polls it every 30 s while the order is live.
- **GET `/orders/:id/tracking`** returns only `tracking`.
- **GET `/orders/:id/invoice`** returns `{url, number}`. The invoice is generated on demand as an **HTML** document, not a PDF. Open it in a browser tab.
- **POST `/orders/:id/cancel`** with `{reason 1–300}` returns `{orderId, status:'cancelled'}`. Allowed only while `pending`/`confirmed` (shared `canCustomerCancel`). Stock is released and a captured payment is refunded through the gateway. Use the shared `CANCEL_REASONS` with `composeReason` to build the text.
- **POST `/orders/:id/reorder`** returns `CartView`; removed variants are skipped.
- **POST `/orders/returns`**: `returnSchema` (in `orders.controller.ts`) `{orderId, reason ≤300, reasonCode?: RETURN_REASON_CODES, images?: ≤6, resolution?: refund_source|refund_wallet|replace, items?: [{orderItemId, quantity}]}`. Server rules (`return.service.ts` › `request`):
  - Delivered orders only.
  - `replace` only where the reason has `allowReplace`.
  - `refund_source` only for prepaid orders.
  - "other" needs at least 10 characters of comment.
  - Per-item quantity is limited to what remains returnable.
  - Non-returnable products are rejected.
  - Photos are required for damaged, defective, wrong_item, missing_item and expired (`returnReasonRequiresPhotos`).
  - Every image URL must exactly match `storage.getUrl('returns/') + <uuid>.<ext>` (`return-images.ts` › `isOwnReturnImageUrl`).

  The default resolution is `refund_source` for prepaid orders and `refund_wallet` for COD. For COD returns, the wallet is credited only once the return is received and the order was delivered, using the `codReturnCredit` proportional formula (`cod-return-credit.ts`).
- **POST `/orders/returns/media/upload`**: multipart `file`, same limits as review photos, returns `{url,key}` under `returns/`.
- **GET `/orders/returns/mine`** returns the customer's return requests.

### Wallet, referral, notifications, DPDP, CMS
- **GET `/wallet`** returns `{balance}`. **GET `/wallet/ledger`** returns `[{id, delta, reason, ref, balanceAfter, createdAt}]`. **GET `/referral/code`** returns `{code}`.
- **GET `/notifications`** returns the last 50 `{id,customerId,type,title,body,readAt,createdAt}`. There is no unread-count endpoint and no deep-link data. **POST `/notifications/read`** takes `{ids: uuid[] ≤100}`.
- **POST `/me/data/export`** and **POST `/me/data/deletion`** return `{jobId}`; **GET `/me/data/requests`** lists them (`data-request.service.ts`). Deletion anonymises the customer and sets `status=blocked`, but it **does not revoke refresh tokens**. Export results are stored as a `data:` JSON URL. Both depend on the worker; see blocker 6.
- **GET `/cms/pages`** returns `[{slug,title}]`. Live pages: about, contact, terms, privacy, returns-policy and shipping-policy. **GET `/cms/pages/:slug`** returns `{id,slug,title,body,isActive,updatedAt}`; `body` is plain text and the web splits it on `\n`.
- **GET `/banners?placement=home_hero`** returns `[{id,placement,imageUrl,linkUrl,title,displayOrder,startsAt,endsAt,isActive}]`.
- Health: `GET /health/live` and `GET /health/ready`. `/health` alone returns 404.

## 4. Reusable assets & business logic

**Brand assets** (`apps/web/public`):
- `belzo-logo.svg`, a 520×520 badge. Colours: ring green `#3fae3f→#2f9c46`, ring orange `#f97a1f→#f4601a`, wordmark navy `#1c3fa0→#122b78`, "e" `#39a935`, "Mart" `#f4601a`, tagline `#5a6270` reading "SHOP SMART • LIVE BETTER". The wordmark is a live `<text>` element in "Segoe UI, Arial", which renders differently on Android.
- `manifest.webmanifest` sets `theme_color #0f766e`, which matches nothing else.
- `icons/` contains only a README; the 192 and 512 PNG icons are missing.
- For the launcher icon, adaptive icon and splash, the owner should supply the official master logo (vector with outlined text, plus a 1024 px PNG). I will not invent one.

**Colour tokens** (`apps/web/src/app/globals.css` `:root`):

| Group | Values |
|---|---|
| Core | `--brand/--fk-blue #2874f0`, `--brand-dark #1c5cd6`, `--fk-navy #172337`, `--fk-orange #fb641b`, `--fk-yellow #ff9f00`, `--fk-green #388e3c`, `--fk-red #ff6161` |
| Text and surfaces | `--ink #212121`, `--muted #878787`, `--muted-2 #6b7280`, `--bg #f1f3f6`, `--surface #fff`, `--surface-2 #f9fafb`, `--border #e0e0e0`, `--border-2 #eef0f3` |
| Shape and depth | `--radius 8px`; shadows `0 1px 2px rgba(0,0,0,.06)` / `0 2px 8px rgba(0,0,0,.08)` / `0 6px 20px rgba(0,0,0,.12)` |
| eMart overrides (the live theme) | `.theme-root[data-theme='emart']`: `--fk-green #16a34a`, `--em-price #e11d48`, background `#f6faf6`. A CSS comment says to keep blue as the primary action colour. |

Most-used colours in the eMart section: `#16a34a` ×42, `#b91c1c` ×17, `#15803d` ×8, `#cbd5e1` ×8, `#e11d48` ×7, `#0f172a` ×7. `admin.css` adds `--wiz-accent #2563eb`, which the web Razorpay widget also uses.

**Typography:**
- Body font stack: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', sans-serif`.
- Inter is never loaded: there is no `next/font` and no font `<link>`. Android users of the web therefore see Roboto.
- For mobile, use the system font (Roboto) with Noto Sans Devanagari for Hindi. Bundle Inter only if the owner wants it.
- Monospace: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

**`@belzo/shared` modules and React Native suitability.** I checked the imports of every non-test file. All modules import only `zod` and each other; there are no Node built-ins, `process`, `Buffer`, `window` or `document`. `money.ts` › `formatMoney` uses `Intl.NumberFormat('en-IN', currency INR)`. Hermes on Android supports Intl; Indian digit grouping still needs a device check.

| Module | Use in mobile |
|---|---|
| `schemas.ts` | Form validation and request typing: `otpRequestSchema`, `otpVerifySchema`, `emailLoginSchema`, `emailRegisterSchema`, `addressInputSchema`, `cartItemInputSchema`, `checkoutPreviewSchema`, `placeOrderSchema`, `productQuerySchema`, `homeSectionSchema`, `homeContentSchema`, `sanitizeHomeContent`, `priceBreakupSchema`, `apiErrorSchema`, `phoneSchema`, `pincodeSchema` |
| `catalogue.ts` | DTO types, `discountPct`, `resolveSlabPrice` for live slab price in the quantity stepper |
| `pricing.ts` | `isGstInclusiveSnapshot` (legacy vs GST-inclusive display), `gstSplitLabel`, `computeTotals` (server is authoritative; display only) |
| `order-tracking.ts` | `ORDER_STATUS_LABELS`, `ORDER_PROGRESS_STEPS`, `statusLabel`, `progressRank`, `reconcileTracking` |
| `orders.ts` | `canCustomerCancel`, `canTransition` |
| `returns.ts` | `RETURN_REASONS`, `CANCEL_REASONS`, `returnReasonRequiresPhotos`, `composeReason`, `MAX_RETURN_IMAGES`, `REASON_MAX_CHARS`, `OTHER_REASON_MIN_CHARS` |
| `constants.ts`, `money.ts`, `gst.ts`, `wallet.ts` | Enums, `formatMoney`, `GST_STATES` (state picker), `amountInWordsInr` |
| `bulk-sheet.ts`, `reporting.ts` | Admin only; not needed |

These pure helpers live in the web app, not in shared, and are worth moving to `@belzo/shared` so both clients use them:
- `apps/web/src/lib/format-inr.ts` › `formatInr`: shows no decimals for whole rupees, unlike shared `formatMoney`, which always shows 2.
- `apps/web/src/lib/price-breakup.ts` › `breakupView`/`snapshotFromBreakup`: implements the "Includes GST" note versus the legacy-exclusive GST row.
- The status, stepper and refund-note logic in `apps/web/src/lib/order-view.ts`. It imports `pickAttr` from the web-only `variant-edit.ts`, so it needs a small refactor before it can move.

**Packaging note.** Shared publishes `main: dist/index.js`, compiled CommonJS, and `dist/` is gitignored. Metro needs either a built `dist/` (run `pnpm --filter @belzo/shared build` first) or a source export condition added to its `package.json`; see §6.

## 5. Missing APIs / blockers for a mobile client

### a. Auth tokens
**Current behaviour**
- Access token: a JWT whose TTL is `JWT_ACCESS_TTL`, default **900 s (15 min)**. `.env.prod.example` does not set it, so production is presumably 900 (UNVERIFIED). Source: `env.schema.ts`, `token.service.ts` › `accessTtl`.
- Refresh token: an opaque 48-byte value, stored as a SHA-256 hash. TTL `JWT_REFRESH_TTL`, default **1,209,600 s (14 days)**. It rotates on every use, and reusing a revoked token revokes the whole family (`TokenService.rotate`).
- Delivery: `refresh-cookie.ts` sets cookie `belzo_rt` (customer) or `belzo_art` (admin) with `httpOnly`, `sameSite=strict`, path `/api/v1`. `Secure` is true only when `COOKIE_SECURE=true` or `PUBLIC_BASE_URL` starts with `https://`, so it is currently not Secure.
- **No endpoint returns the refresh token in the body.** OTP verify, register, login, google and refresh all return only `{accessToken, expiresIn[, customer]}`. Refresh and logout read the token only from the cookie (`readRefreshCookie`).

React Native's Android networking does keep a native cookie jar, so the cookie might happen to work. That is opaque, cannot be put in SecureStore, is hard to clear, and differs on iOS. It does not satisfy the brief, so I do not recommend relying on it.

**Proposed minimal, backward-compatible change** (one controller plus one helper, with unit tests):
1. When a request carries the header `X-Client-Platform: mobile` (any non-browser marker works), `otp/verify`, `register`, `login` and `google` add `refreshToken` to the response body and **do not** set the cookie.
2. With the same header, `refresh` and `logout` read `{refreshToken}` from a zod-validated body instead of the cookie. `refresh` returns `{accessToken, expiresIn, refreshToken}`.
3. Requests without the header keep today's cookie behaviour exactly, so the web is untouched.

**Security implications**
- The token lives in `expo-secure-store` (Android Keystore-backed). It is never in AsyncStorage or logs.
- The existing rotation and reuse detection limit the damage of a stolen token.
- A header-based token is not ambient, so CSRF does not apply.
- **The client must single-flight refresh.** Parallel 401s that each call refresh present a just-revoked token, which triggers reuse detection and logs the user out.
- Recommended alongside: `rotate()` should reject customers with `status=blocked` (today a blocked or "deleted" customer can keep refreshing), and DPDP deletion should revoke all of that customer's refresh tokens.
- Optional: record a device label per token family so the user can see and revoke sessions.

### b. Transport (HTTPS)
- Facts:
  - The production URL is `http://13.48.85.9` (`.env.prod.example`).
  - The Caddyfile serves `:80` only and already contains a commented `shop.example.com { … }` block that enables Caddy's automatic Let's Encrypt TLS.
  - Compose publishes 443, but `https://13.48.85.9/` timed out from here.
  - Let's Encrypt does not issue certificates for raw IPs in this setup, so **a domain is required**.
- Android: apps targeting API 28+ have `cleartextTrafficPermitted=false` by default. Release builds will fail every `http://` API call and image, including the `http://13.48.85.9/api/uploads/...` banners.
- Needed: domain A record → 13.48.85.9; open 443 in the security group; replace the `:80` block with the domain block; set `PUBLIC_BASE_URL=https://<domain>` and `CORS_ORIGINS=https://<domain>`; rebuild web (`DEPLOY.md` §4). This also makes the refresh cookie `Secure` automatically.
- Then fix stored absolute http URLs in the DB (`banners.imageUrl`, plus any local-storage product, category or brand images). Either re-upload them to S3 or rewrite `http://13.48.85.9/api/uploads/` to `https://<domain>/api/uploads/`. This is a data change that needs owner approval.
- **Dev-only fallback.** Add a `development` app variant (`APP_VARIANT=development` in `app.config.ts`). It gets a config plugin that writes `res/xml/network_security_config.xml` with `<domain-config cleartextTrafficPermitted="true"><domain>13.48.85.9</domain></domain-config>` (plus `10.0.2.2` and LAN IPs for a local API). It has a different `android.package` (e.g. `…emart.dev`) so it can never ship. Production builds keep cleartext disabled. Do not use the global `expo-build-properties` `usesCleartextTraffic: true` for release.

### c. CORS, CSRF, rate limiting
- CORS has no effect on native clients. React Native sends no `Origin` header, and the server does not reject unknown origins anyway: a live request with `Origin: http://evil.example` returned 200 with no `Access-Control-Allow-Origin`. No change is needed.
- helmet's CSP, `Cross-Origin-Resource-Policy: same-origin` (also sent on `/api/uploads`) and `X-Frame-Options` affect browsers only. They do not affect native fetches or `expo-image`.
- CSRF: no CSRF tokens exist, and the cookie is `sameSite=strict`. The body-token flow in §5a is not CSRF-prone.
- Throttler: global 100 requests per 60 s per route per tracker (`app.module.ts`), with tighter limits on `otp/request` (5/min) and `otp/verify` and `login` (10/min). Live responses carry `X-Ratelimit-*` headers.
  - **`trust proxy` is not set anywhere** (searched `apps/**`). Behind Caddy, `req.ip` is the proxy container's address, so in practice all clients share one bucket per route. Runtime sharing was not load-tested, but this follows from Express defaults.
  - At modest mobile traffic this causes cross-user 429s, and the 5/min OTP limit becomes global.
  - Fix: `app.set('trust proxy', 1)` in `main.ts` (one hop through Caddy).
  - The mobile client must also handle 429 with backoff.

### d. Payments
- **Web today** (`apps/web/src/lib/razorpay.ts`, `checkout/page.tsx`):
  - It places the order, then, if `clientConfig.provider === 'razorpay'`, loads `checkout.js` and opens the widget with `key` and `order_id`.
  - The success handler only navigates to `/order-result`, which polls `GET /orders/:id` 12 times at 2.5 s intervals until the webhook confirms.
  - Mock and COD go straight to the result page.
  - Nothing ever sends `razorpay_signature` to the server.
- **Backend verification today:** only the webhook. `RazorpayPaymentProvider.verifyWebhook` checks an HMAC with the webhook secret, and `PaymentService.handleWebhook` processes events idempotently. This is a sound source of truth.
- **Production state:** `mock`. Every online order auto-captures without payment. Unacceptable for a public app.
- **Android options:**
  1. **`react-native-razorpay` 3.0.0** (official; New Architecture support added in v3.0.0, Apr 2026). It wraps the native SDK, gives better UPI-intent and app-switch handling, and requires a development build, not Expo Go. It is opened with `{key, order_id: clientConfig.orderId, amount, currency:'INR', name:'Belzo eMart', prefill}` and resolves `{razorpay_payment_id, razorpay_order_id, razorpay_signature}`.
  2. Hosted `checkout.js` inside a WebView. It works without native code but is worse for UPI intents. Not recommended.

  **Decision: option 1.** Treat a successful SDK return as "processing" and poll the order, as the web does.
- **Backend additions recommended**, small and additive:
  1. `POST /payments/verify {razorpay_order_id, razorpay_payment_id, razorpay_signature}`. Verify `HMAC_SHA256(order_id|payment_id, KEY_SECRET)` and, if valid and the order is still pending, call the same `markCaptured`. This gives instant confirmation; the webhook stays idempotent.
  2. `POST /orders/:id/pay` to re-initiate payment for a customer's own `pending` non-COD order. This enables a "Retry payment" button.
  3. A delayed job (the `payments` queue exists with no consumer) that cancels unpaid pending orders after N minutes and releases stock.
  4. Preview should accept `paymentMethod` so it can show the COD fee.

  Razorpay needs a public HTTPS webhook URL, which depends on blocker 2. Whether Razorpay accepts plain-HTTP webhooks is UNVERIFIED; plan on HTTPS.

### e. Push notifications
- **Exists:**
  - The `PushProvider` port (`integrations/notifications/channels.ts`), bound to `MockPushProvider` (`notifications-integration.module.ts`).
  - `NotificationService.send` stores an in-app `Notification` row and fans out to push (by `customerId`), email (SMTP when live), SMS (mock) and WhatsApp (mock).
  - Templates for `order.confirmed`, `order.payment_failed`, `order.shipped`, `order.delivered` and `abandoned_cart`, in English and Hindi.
- **Gaps:**
  - No device-token model in `schema.prisma`, and no device-token endpoint.
  - Only `order.confirmed` and `order.payment_failed` (from `PaymentService`), `abandoned_cart` and the DPDP jobs are ever enqueued. Shipped and delivered templates are never triggered; `fulfilment.service.ts` has no `enqueue`.
  - COD orders are never enqueued at all: they stay `pending` until an admin transitions them, and `OrderService.transition` enqueues nothing.
  - Worker collision (blocker 6): `identity/dpdp.worker.ts` and `engagement/notification.worker.ts` both create `new Worker(QUEUES.NOTIFICATIONS, …)`. BullMQ hands each job to one of them, and each completes the other's jobs as a no-op.
- **Smallest FCM addition:**
  1. Prisma `DeviceToken {id, customerId, token @unique, platform, appVersion, lastSeenAt, createdAt}` with a migration.
  2. `POST /me/devices {token, platform:'android'}` (upsert) and `DELETE /me/devices/:token`, called on logout.
  3. `FcmPushProvider implements PushProvider`, selected by a new `PUSH_PROVIDER=live` env. It looks up the customer's tokens, sends via FCM HTTP v1 with a service-account credential, prunes `UNREGISTERED` tokens, and adds a data payload `{type, orderId}` for deep links.
  4. Enqueue `order.shipped` and `order.delivered` from status transitions and shipment sync.
  5. Fix the queue collision.

  Client: `expo-notifications` › `getDevicePushTokenAsync()` (a native FCM token), using `google-services.json` from the owner's Firebase project and the Android 13+ `POST_NOTIFICATIONS` runtime prompt.

  The Expo Push Service is a simpler alternative (no service account on the server), but it adds a third-party relay. I chose direct FCM to fit the existing port.

### f. Images
Checked live:
- Product and brand images are absolute `https://belzo-media-prod.s3.eu-north-1.amazonaws.com/...` and load fine on a device.
- Banners mix `http://13.48.85.9/api/uploads/banners/...`, which is cleartext and will be blocked in release builds, with external `https://images.unsplash.com/...`.
- Category `imageUrl` was `null` in the sample.

Seed data may contain relative `/seed/...` paths, which the web treats as unusable (`apps/web/src/lib/category-theme.ts` › `isUsableImageUrl`) and replaces with a generated placeholder.

The mobile client should provide `resolveImageUrl(u)`:
- null or `/seed/` → placeholder;
- other relative paths → API base + path;
- `http://` in release → try `https://` with the same host after the domain switch, otherwise placeholder.

There are no thumbnail variants; every image is the full original upload. Use `expo-image` sizing with `cachePolicy="memory-disk"`. A thumbnail pipeline (resize on upload or a CDN image service) is a later backend improvement.

### g. Other gaps

| Area | Finding | Impact / recommendation |
|---|---|---|
| Guest cart | The token is client-generated; there is no server issuance endpoint. | Generate with `expo-crypto.randomUUID()`, persist it, send `x-guest-token`, and call `/cart/merge` after login. Same as the web. |
| Cart after order | Never cleared (blocker 7). | Backend fix. Until then the app can delete the ordered variant lines after a successful place. |
| Search suggestions | `/search/autocomplete` returns titles only. | Good enough; tapping a suggestion runs `/search?q=`. |
| Search filters | `/search` ignores price filters and price/discount sort and does not include sub-categories. `/products` sorts and filters prices page-locally. | Either fix server-side (sort and filter in SQL on the cheapest active variant) or avoid price sort in infinite lists. |
| Recently viewed | None server-side. | Client-only list of ids, fetched via `/products?ids=` (≤50). |
| Product counts per category | None. | Omit counts, or add `_count` to `CategoryService.tree` later. |
| Account deletion | `/me/data/deletion` exists, but it is affected by the worker collision and does not revoke tokens. Google Play requires in-app deletion plus a public web deletion link. | Fix the queue, revoke tokens, and add a CMS page or URL describing deletion. |
| Pagination | `/orders`, `/products/:id/reviews` and `/notifications` (fixed 50) are unpaginated. | Fine at current volume; add cursor pagination later. |
| Reviews privacy | The public review list exposes `customerId` and no display name. | Backend: return a first name or initials and drop `customerId`. |
| Coupons | No "available offers" endpoint. | Optional `GET /coupons/available` later. |
| Wallet | Balance and ledger only; not redeemable at checkout. | Display-only in v1, unless the owner wants redemption, which is a backend change. |
| PIN → city/state | Only 8 metro PINs are known. | Manual entry fallback, as on the web. |
| App version gate | No min-version or force-update setting. | Optional: add `minAndroidVersionCode` to `/settings/public`. |
| API docs | Swagger is not exposed publicly (`/docs` is outside `/api/*`). | Use `http://localhost:4000/docs` locally to cross-check DTOs. |
| PUT cart item | Requires `variantId` in the body; a missing line returns 500. | The client always sends `{variantId, quantity}`. Backend should map P2025 to 404. |

## 6. Proposed Android app architecture

**Framework decision: Expo SDK 57, development build with Continuous Native Generation (prebuild) and EAS Build. Not Expo Go, and not bare React Native.**
- All native needs have maintained config plugins or autolink cleanly: Razorpay (`react-native-razorpay` 3.0.0, native), FCM (`expo-notifications` with `googleServicesFile`), secure storage (`expo-secure-store`), image picking and compression for return and review photos (`expo-image-picker`, `expo-image-manipulator`), invoice viewing (`expo-web-browser`), and network security config (a small local config plugin). So there is no reason to hand-maintain `android/`.
- CNG keeps native folders out of git and makes SDK upgrades routine. EAS Build removes the need for a local Android SDK, which is currently absent.
- Expo Go is ruled out by the Razorpay native module.
- iOS later is the same codebase.

**Versions verified on the npm registry on 2026-10-11:**
- `expo` latest 57.0.27, with `next` 58.0.7 (SDK 58 beta).
- `react-native` latest 0.87.1. SDK 57 bundles **0.86.3** with React **19.2.3** (`expo/bundledNativeModules.json`).
- The SDK 57 TypeScript template uses `typescript ~6.0.3` and `@types/react ~19.2.2`.

Stay on SDK 57 and move to 58 once it is promoted to `latest`.

**Location and monorepo:**
- `apps/mobile` (`@belzo/mobile`); `pnpm-workspace.yaml` already includes `apps/*`.
- pnpm isolated installs are supported from Expo SDK 54, and SDK 55+ enables `autolinkingModuleResolution` automatically in monorepos (docs.expo.dev/guides/monorepos). Keep the default isolated layout. Switching to `node-linker=hoisted` in `.npmrc` (pnpm 9 reads `.npmrc`; the `nodeLinker` key in `pnpm-workspace.yaml` needs pnpm 10) would change how api and web install, so use it only as a last resort.
- React majors differ per app (web 18.3.1, mobile 19.2.3). Isolated installs keep them apart. Verify with `pnpm why react` that the mobile app resolves a single React.
- Dependency `"@belzo/shared": "workspace:*"`.
- Shared resolution, decision: build `dist` before Metro. Add a mobile `prestart` script plus an `eas-build-post-install` script that runs `pnpm --filter @belzo/shared build`. This needs zero changes to shared.

  Alternative: add a `"react-native": "./src/index.ts"` export condition to shared's `package.json`. It is additive, but it does touch shared.

  Pin `zod` 3.23.8 in mobile so the schemas and the resolver use the same zod instance.
- EAS uploads the whole repo. Add an `.easignore` that excludes `apps/api/uploads`, `.agents`, `*.pem` and `.env*`, or rely on `.gitignore`. Note that `Belzo-key.pem` sits in the repo root; it is gitignored but should not be uploaded.

**Folder structure** (feature-based):
```
apps/mobile/
  app.config.ts            # variants: development | preview | production (package id, apiBaseUrl, cleartext plugin for dev only)
  eas.json                 # profiles: development (dev client, apk), preview (apk), production (aab)
  plugins/with-dev-cleartext.js
  assets/                  # icon.png, adaptive-icon.png, splash.png, notification-icon.png (from owner's master logo)
  e2e/                     # Maestro flows (*.yaml)
  src/
    app/                   # App.tsx, providers (QueryClient, Theme, SafeArea, Navigation), boot/session restore
    navigation/            # RootNavigator, MainTabs, linking.ts (deep links), route types
    api/                   # client.ts (fetch, timeout, auth header, x-guest-token, single-flight refresh, 429 backoff),
                           # errors.ts (ApiError via shared apiErrorSchema), query-keys.ts, image-url.ts
    features/
      auth/ home/ categories/ products/ search/ wishlist/ cart/ checkout/ payments/
      addresses/ orders/ returns/ notifications/ profile/ wallet/ support/   # each: screens/ components/ hooks/ api.ts __tests__/
    ui/                    # Button, TextField, ProductCard, CategoryCard, SearchBar, Price, DiscountBadge, QuantityStepper,
                           # Skeleton, EmptyState, ErrorState, ConfirmDialog, AddressCard, OrderStatusBadge, Toast
    theme/                 # tokens.ts (colors/spacing/radius/typography/shadows), ThemeProvider
    store/                 # zustand: session.ts, pincode.ts, recently-viewed.ts
    config/                # env.ts (Constants.expoConfig.extra)
```

**Key design decisions** (one line of rationale each):
- **Navigation: React Navigation 7** (`@react-navigation/native` 7.5.0, `native-stack` 7.20.0, `bottom-tabs` 7.20.0). Expo Router changes its navigation internals across SDK releases (SDK 56 dropped React Navigation, and there is a 57→58 migration guide). Our deep links are few: `product/:slug`, `category/:slug`, `orders/:id`, `search`, `page/:slug`. A linking config maps them simply, and auth-gated screens open a Login modal and return afterwards. Tabs: Home, Categories, Cart (badge), Account.
- **Server state: TanStack Query 5.104.1.** The cart is server-authoritative (guest or customer), so it is a query with optimistic mutations and the badge is derived from it.
- **Client state: Zustand 5.0.15.** It holds session status, guest token, delivery PIN and recently viewed, persisted through AsyncStorage 2.2.0. Tokens never go in Zustand storage.
- **Networking: a typed `fetch` wrapper** mirroring `apps/web/src/lib/api-client.ts`, rather than axios.
  - It needs no extra dependency and gives full control of a single-flight refresh mutex and request timeouts (AbortController, 15 s).
  - Retries: TanStack retries only idempotent GETs (2×, exponential); mutations are never retried automatically. Checkout `place` always sends a UUID `idempotencyKey`, regenerated only after a definitive response.
  - `@react-native-community/netinfo` 12.0.1 is wired to TanStack's `onlineManager`.
- **Forms:** `react-hook-form` 7.89.0 + `@hookform/resolvers` **3.10.0** + zod 3.23.8, reusing the shared schemas. Resolvers 5.x needs zod ≥3.25; moving the whole repo to zod 3.25 is a separate, optional change.
- **Secure storage:** `expo-secure-store` 57.0.4 holds the refresh token. The access token stays in memory only.
- **Images and lists:** `expo-image` 57.0.5 with a placeholder and error fallback, and `@shopify/flash-list` 2.0.2 for product grids.
- **Theme:** tokens from §4. Primary/action `#2874f0` (dark `#1c5cd6`), brand green `#16a34a` (dark `#15803d`), price `#e11d48`, danger `#b91c1c`, ink `#212121`, muted `#878787`, navy `#0f172a`, eMart background `#f6faf6`, surface `#ffffff`, border `#e0e0e0`, radius 8, Roboto. The logo orange `#f4601a` is an accent only. The owner should confirm blue as the primary colour; the web itself is inconsistent (manifest `#0f766e`, Razorpay widget `#2563eb`).
- **Accessibility:** 48 dp minimum touch targets, `accessibilityLabel` and `accessibilityRole` on every control, font scaling supported, and contrast checked against the tokens. Full WCAG validation needs manual testing with TalkBack.

**Dependency list** (exact pins, SDK 57-compatible; tilde ranges from `bundledNativeModules.json` resolved to their current patches):

| Package | Version |
|---|---|
| expo | 57.0.27 |
| react / react-native | 19.2.3 / 0.86.3 |
| @react-navigation/native / native-stack / bottom-tabs | 7.5.0 / 7.20.0 / 7.20.0 |
| react-native-screens / react-native-safe-area-context / react-native-gesture-handler | 4.26.2 / 5.7.0 / 2.32.0 |
| @tanstack/react-query | 5.104.1 |
| zustand | 5.0.15 |
| react-hook-form / @hookform/resolvers / zod | 7.89.0 / 3.10.0 / 3.23.8 |
| expo-secure-store / expo-image / expo-notifications | 57.0.4 / 57.0.5 / 57.0.22 |
| expo-splash-screen / expo-status-bar / expo-constants / expo-linking / expo-font | 57.0.9 / 57.0.1 / 57.0.21 / 57.0.12 / 57.0.4 |
| expo-image-picker / expo-image-manipulator / expo-web-browser / expo-crypto / expo-device | 57.0.20 / 57.0.21 / 57.0.3 / 57.0.3 / 57.0.2 |
| expo-dev-client / expo-build-properties | 57.0.19 / 57.0.22 |
| @react-native-async-storage/async-storage / @react-native-community/netinfo / @shopify/flash-list | 2.2.0 / 12.0.1 / 2.0.2 |
| react-native-svg (icons and illustrations; optional) | 15.15.4 |
| react-native-razorpay | 3.0.0 |
| @belzo/shared | workspace:* |
| **dev:** typescript / @types/react | 6.0.3 / 19.2.18 |
| **dev:** jest / jest-expo / @testing-library/react-native / test-renderer | 29.7.0 / 57.0.5 / 14.1.0 / 1.3.0 |
| **tooling:** eas-cli (npx) / Maestro CLI | 24.12.1 / latest stable at setup |

`react-native-reanimated` 4.5.1 and `react-native-worklets` 0.10.1 are not needed for v1. If they are added later, use `expo` ≥57.0.9, which fixes the Hermes v1 memory regression with worklets.

## 7. Phased development & testing plan

The brief's text after §6 was truncated in what I received, so the phase names below are my own mapping to "phases 2–8". The order is chosen so that each phase is shippable to internal testers.

**Before Phase 2 (owner and housekeeping):** commit the 204 untracked paths and add a git remote. Make the decisions in blockers 1–5 and 8, and choose the app id.

| Phase | Scope | Buildable now? | Verification |
|---|---|---|---|
| **2. Backend enablement** (additive, behind headers or env) | Mobile token transport (§5a); `trust proxy`; clear cart on place; separate DPDP queue; revoke tokens on deletion and block-on-refresh; `POST /payments/verify` and `POST /orders/:id/pay`; preview `paymentMethod`; `DeviceToken` model and `/me/devices`; `FcmPushProvider` behind `PUSH_PROVIDER`; enqueue shipped and delivered | **Yes**. FCM sending needs Firebase credentials to test live. | `pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api test` (new specs next to `token.service.spec.ts`, `checkout.service.spec.ts`, `cart.service.spec.ts`); `pnpm --filter @belzo/api build`; a manual curl run against local docker (`infra/docker-compose.yml`) showing the web cookie flow unchanged |
| **3. App foundation** | Scaffold `apps/mobile` (SDK 57, TS strict), `app.config.ts` variants, `eas.json`, dev-cleartext plugin, theme tokens, UI kit, API client with refresh and guest token, session restore on splash, navigation shell, login (email OTP/password, phone OTP when SMS is ready), profile | **Yes**. JS and unit tests run locally. A device build needs EAS login or an Android SDK. | `pnpm --filter @belzo/mobile typecheck`, `pnpm --filter @belzo/mobile test` (RNTL: client refresh single-flight, auth screens); `npx expo-doctor`; `eas build -p android --profile development` and then install the dev client APK |
| **4. Catalogue & discovery** | Home (settings/public defaults, banners, rails), categories tree, PLP with filters, search with autocomplete, PDP (gallery, variants, slabs, PIN check, reviews read, Q&A read), wishlist, recently viewed | **Yes** against the live HTTP API in the dev variant | Unit and component tests per feature; manual run on device; Maestro `browse.yaml` (home → category → PDP → add to cart) |
| **5. Cart, checkout, payments** | Cart (guest + merge), addresses CRUD, preview, COD and online place with `idempotencyKey`, Razorpay SDK, result polling, retry payment | **Partly**. The COD and mock flows work now. Real Razorpay is **blocked** by blockers 1 and 2. | Tests for idempotency and retry logic; Maestro `checkout-cod.yaml`; with test keys on a staging API, Razorpay test-mode payments for success, failure and dismissal |
| **6. Orders & post-purchase** | Orders list and detail, tracking stepper (shared `reconcileTracking`), invoice in a browser tab, cancel (shared reasons), reorder, returns with photo upload and compression, write review with photos, wallet and ledger, in-app notifications | **Yes**. Return-photo URLs must match the storage prefix; use a staging order that is `delivered`. | Component tests for cancel and return rule gating (shared `returnReasonRequiresPhotos`); Maestro `orders.yaml`; manual check of return-photo upload against S3 |
| **7. Push, account, support, polish** | FCM token registration and notification deep links, account deletion (DPDP) with confirmation, CMS pages (terms, privacy, returns, shipping, contact), offline banner, empty, error and loading states, accessibility pass, performance (FlashList, image sizing), Hindi strings (optional) | **Blocked** for push (needs a Firebase project and Phase 2 backend) and for reliable deletion (needs the queue fix). The rest is buildable. | Send a test push via backend to a device; TalkBack manual pass; `npx expo-doctor`; React Native DevTools profiling |
| **8. QA & release** | Maestro suite on EAS or a local device; production variant (no cleartext, HTTPS base URL); keystore via EAS credentials; preview **APK** and production **AAB**; Play listing (privacy URL `/page/privacy`, data-safety form, account-deletion URL) | **Blocked** until HTTPS is live (blocker 2), real payments (1) and an SMS or email OTP decision (4) are in place | `eas build -p android --profile preview` (APK) and `--profile production` (AAB); Play internal testing track; smoke checklist across login, browse, cart, COD order, online order, cancel, return, push and deletion |

---

## Environment check (this machine, read-only)

| Check | Result |
|---|---|
| `node -v` | v24.12.0 |
| `pnpm -v` | 9.12.0 (matches `packageManager`) |
| `java -version` | OpenJDK 17.0.20.1 Temurin. `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\`. This is the JDK version RN 0.86 builds need. |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Both empty |
| `where adb` / `emulator` / `sdkmanager` | Not found |
| Android Studio | Not installed: no `C:\Program Files\Android\Android Studio` and no `%LOCALAPPDATA%\Android\Sdk` |
| Git | Branch `master`, HEAD `5690322`. 152 tracked files, 0 modified, **204 untracked paths** (most of `apps/api/src`, `apps/web/src`, the shared sources, compose, Caddyfile, docs). **No remote.** |
| Free disk C: | 17.2 GB free (≈237.8 GB used) |
| Live API | `http://13.48.85.9/api/v1/*` responds through Caddy. HTTPS times out. |

**Can a local debug APK be built now?** No, because there is no Android SDK, platform tools or build tools. Options:
1. **EAS cloud build (recommended).** It needs a free Expo account and `npx eas-cli@24.12.1 login` by the owner; nothing else needs installing locally. A development or preview APK can be installed by link or QR code.
2. **Local build.** Install Android Studio or command-line tools with SDK Platform 36, Build-Tools and Platform-Tools, and set `ANDROID_HOME`. The SDK plus the Gradle cache takes roughly 8–12 GB without an emulator (estimate). Adding an emulator system image would leave C: nearly full, so test on a physical phone over USB, which needs only `platform-tools`, about 50 MB.

Either way, JDK 17 is already present. CI uses Node 20.14.0, while recent React Native requires Node ≥20.19.4 (per the RN 0.81 release notes; not re-verified here). A future mobile CI job should use Node 22 or 24 LTS.

## Conclusions & recommendations
1. Build on the existing API. No parallel backend is needed. Reuse `@belzo/shared` directly, and move `formatInr` and `breakupView` into it.
2. Do Phase 2 backend enablement first. Every change is small, additive and testable with the existing Jest specs, and the web stays untouched: token-in-body behind a header, `trust proxy`, cart clear, DPDP queue, payment verify and retry, device tokens and FCM.
3. Use the HTTP API only in a clearly separated development variant. Release builds require the domain and HTTPS cutover plus the http image URL migration.
4. Do not ship while `PAYMENT_PROVIDER=mock` or the OTP `devCode` is exposed. Both are production risks today for the web too.
5. Stack: Expo SDK 57 dev build + EAS, React Navigation 7, TanStack Query, Zustand, fetch client, RHF + shared zod, SecureStore, expo-image, expo-notifications (FCM), react-native-razorpay 3.0.0. Exact pins are in §6.
