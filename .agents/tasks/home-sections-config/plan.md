# Implementation Plan — Admin-managed Home Sections (shared across both themes)

Source of truth: `.agents/tasks/home-sections-config/design.md` (read it alongside this plan).
Repo: `c:\xampp\htdocs\Belzo` — pnpm monorepo (`@belzo/shared`, `@belzo/api`, `@belzo/web`). Work directly, no worktree.
Change is **additive only**: money/pricing/`toCard`/catalogue sort behavior is untouched; an unconfigured install must look exactly as it does today and never render an empty home.

Order is by dependency: shared schema first (both API and web import it), then API (web calls the new `ids` filter + `sections` read), then web resolver, then the two themes, then the admin editor. Every item leaves the repo buildable.

Verification commands (run from `c:\xampp\htdocs\Belzo`):
- `pnpm --filter @belzo/shared test` and `pnpm --filter @belzo/shared typecheck`
- `pnpm --filter @belzo/api typecheck` && `pnpm --filter @belzo/api lint` && `pnpm --filter @belzo/api test`
- `pnpm --filter @belzo/web typecheck` && `pnpm --filter @belzo/web build`

Note on test scope: `@belzo/web` has **no test runner** (its `package.json` scripts are only `dev/build/start/typecheck/lint`). The design's "Unit (web)" cases therefore cannot run here; web is verified by `typecheck` + `build`. The sanitizer/defaults logic that would be web-unit-tested is covered instead by the shared schema tests (item 1) and the API public-settings sanitize tests (item 3), which exercise the identical `homeSectionSchema.safeParse`-per-element behavior. This is a known gap, flagged rather than papered over.

---

- [x] 1. Add the home-section schemas/types and the catalogue `ids` filter to the shared package, with unit tests.
      In `packages/shared/src/schemas.ts` add, in the Catalogue section: `HOME_SECTION_SORTS = ['discount','newest','popularity','rating'] as const`; `homeSectionSourceSchema` (zod `discriminatedUnion('type', ...)` over `sort` | `category` (`categoryId: uuidSchema`) | `manual` (`productIds: z.array(uuidSchema).min(1).max(50)`)); `homeSectionSchema` (`id` 1–64, `title` trimmed 1–80, `source`, `limit` int 2–24 default 12, `enabled` bool default true); `homeSectionsSchema = z.array(homeSectionSchema).max(24)`; and the inferred types `HomeSectionSource`, `HomeSection`, `HomeSections`. Also extend `productQuerySchema` with `ids: z.string().trim().optional()` (comma-separated id string, kept as a string so it round-trips through `@Query()` / `URLSearchParams`). All exports flow through the existing `packages/shared/src/index.ts` (`export * from './schemas'`), so no index edit is needed. Add tests in `packages/shared/src/schemas.test.ts` (follow the existing `safeParse` example-based style in that file): valid section array parses; defaults applied when `limit`/`enabled` omitted; bad `sort` rejected; non-uuid `categoryId`/`productIds` rejected; empty `manual.productIds` rejected (`.min(1)`); `>24` sections rejected; `productQuerySchema` still parses with and without `ids`.
      Files: `packages/shared/src/schemas.ts`, `packages/shared/src/schemas.test.ts`
      Verify: `pnpm --filter @belzo/shared test` (new cases pass) and `pnpm --filter @belzo/shared typecheck` (clean).

- [x] 2. Honor `ids` in `ProductService.list` with an early, non-paginated branch, with unit tests.
      In `apps/api/src/modules/catalogue/product.service.ts`, at the **top** of `list(query)` before the existing `where`/`orderBy`/`findMany`+`count` path, add: `if (query.ids !== undefined) { ... }`. Inside: `const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;` then de-blank `const ids = query.ids.split(',').map((s) => s.trim()).filter(Boolean);`; if `ids.length === 0` return `{ items: [], total: 0, page: 1, pageSize }`; else `findMany({ where: { status: 'published', id: { in: ids } }, include: { images: { orderBy: { position: 'asc' }, take: 1 }, variants: true } })` with **no `skip`, no `take`, no `count`**; map rows through the existing `this.toCard(p)`, index by id in a `Map`, reorder into the picked `ids` order (`ids.map((id) => byId.get(id)).filter(Boolean)`), then `.slice(0, pageSize)`; return `{ items, total: items.length, page: 1, pageSize }`. The existing paginated path for all non-`ids` queries stays byte-for-byte unchanged. Add tests to `apps/api/src/modules/catalogue/product.service.spec.ts` (reuse the file's minimal fake-Prisma pattern, stubbing `prisma.product.findMany`): returns only published products in the requested id order; unpublished/absent ids are dropped; `ids.length > pageSize` truncates to the first `pageSize` in picked order; a blank `ids` string (`" , "`) yields an empty result with no `findMany` id clause built; omitting `ids` runs the original path.
      Files: `apps/api/src/modules/catalogue/product.service.ts`, `apps/api/src/modules/catalogue/product.service.spec.ts`
      Verify: `pnpm --filter @belzo/api typecheck` and `pnpm --filter @belzo/api test` (new + existing product.service tests pass).

- [x] 3. Read and per-section-sanitize `home.sections` in the public settings endpoint, with unit tests.
      In `apps/api/src/modules/admin/public-settings.controller.ts`: import `homeSectionSchema` and type `HomeSection` from `@belzo/shared`; widen the `publicSettings()` return type to include `sections: HomeSection[] | null`; add `this.settings.get<unknown>('home.sections')` to the existing `Promise.all`; sanitize per element — `const raw = Array.isArray(sections) ? sections : []; const valid = raw.map((s) => homeSectionSchema.safeParse(s)).filter((r) => r.success).map((r) => r.data).slice(0, 24);` and return `sections: valid.length > 0 ? valid : null`. The endpoint stays `@Public()`; `theme`/`home`/`footer` handling is unchanged. No new endpoint and no DB migration — the admin write path reuses the existing `PUT /admin/settings` (`AdminController.setSetting`, `@Roles('super_admin')`) with body `{ key: 'home.sections', value }`. Add `apps/api/src/modules/admin/public-settings.controller.spec.ts` with a fake `SettingsService` whose `get('home.sections')` returns: a mixed array (one valid + one malformed section) → only the valid one returned with zod defaults applied; `null`/missing → `sections: null`; an all-invalid array → `sections: null`; a `>24` valid array → sliced to 24.
      Files: `apps/api/src/modules/admin/public-settings.controller.ts`, `apps/api/src/modules/admin/public-settings.controller.spec.ts`
      Verify: `pnpm --filter @belzo/api typecheck` && `pnpm --filter @belzo/api lint` && `pnpm --filter @belzo/api test` (all pass).

- [x] 4. Expose the stored sections to the web through the existing public-settings read.
      In `apps/web/src/lib/site-content.ts`: add `sections?: unknown` to the `RawPublicSettings` interface; add `sections: unknown` to the `SiteContent` interface and set `sections: s.sections ?? null` in `getSiteContent()`'s success return and `sections: null` in its `catch` fallback. This threads the raw config through the single `/settings/public` call `getSiteContent` already makes (`apiFetch` uses `cache: 'no-store'`, so the emart home — which already calls `getSiteContent` — gets `sections` with no extra round trip; the resolver in item 5 reads it from there). Keep `mergeHome`/`DEFAULT_FOOTER` behavior unchanged.
      Files: `apps/web/src/lib/site-content.ts`
      Verify: `pnpm --filter @belzo/web typecheck` (clean).

- [x] 5. Create the shared web resolver `home-sections.ts` (defaults + sanitize + resolve).
      New file `apps/web/src/lib/home-sections.ts` exporting: `DEFAULT_SECTIONS: HomeSection[]` exactly as design §5 (`default-deals`→discount/limit 12, `default-best-sellers`→popularity/limit 10, `default-new-arrivals`→newest/limit 10, all enabled); `sanitizeHomeSections(value: unknown): HomeSection[] | null` running `homeSectionSchema.safeParse` per array element, keeping `.data` of passers, returning `null` when none; `getHomeSections(rawSections: unknown): HomeSection[]` = `sanitizeHomeSections(rawSections) ?? DEFAULT_SECTIONS`, then filter out `enabled === false`, preserving array order (takes the raw value from `getSiteContent().sections` so no extra fetch); `type ResolvedSection = { id: string; title: string; products: ProductCardDto[]; viewAllHref?: string }`; `resolveHomeSections(sections: HomeSection[]): Promise<ResolvedSection[]>`. The resolver: if any enabled section has a `category` source, call `catalogueApi.categories()` **once** (`.catch(() => [])`), flatten the nested `CategoryNodeDto[]` recursively, and build a `Map<id, slug>` for hrefs; then `Promise.all` over sections, each building `new URLSearchParams` — `sort`→`{ sort, pageSize: String(limit) }`, `category`→`{ categoryId, pageSize: String(limit) }`, `manual`→`{ ids: productIds.join(','), pageSize: String(limit) }` — calling `catalogueApi.products(qs.toString()).catch(() => EMPTY)`; drop sections with zero resolved products. `viewAllHref`: `sort`→`/search?sort=<sort>`, `category`→`/category/<slug>` from the map (fallback `/search?categoryId=<id>`), `manual`→`undefined`. Reuse the `ProductCardDto`/`CategoryNodeDto` types and `catalogueApi`/`formatInr` imports from `@/lib/catalogue-api` and `@belzo/shared`.
      Files: `apps/web/src/lib/home-sections.ts`
      Verify: `pnpm --filter @belzo/web typecheck` (clean).

- [x] 6. Render configured sections in the classic home (`page.tsx`), keeping all other chrome.
      In `apps/web/src/app/(shop)/page.tsx` (classic branch, after the `getTheme()==='emart'` early return): call `getSiteContent()` to obtain `sections`, then `const resolved = await resolveHomeSections(getHomeSections(sections))`. Replace the hardcoded "Deals of the Day" `ProductRail` and the "New Arrivals" grid with a loop rendering each resolved section via the existing `ProductRail` (`title={s.title}`, `products={s.products}`, `viewAllHref={s.viewAllHref}`, `testId={`home-section-${s.id}`}`), placed as one contiguous group after the hero carousel and before the per-category auto-rails. Keep the hero carousel, the per-category `ProductRail` loop, and the promo-grid `<section>` exactly as-is. Keep `data-testid="home-page"` on the root. Remove the now-unused `deals`/`newArrivals` fetches from the `Promise.all` (leave the per-category `byCategory` fetches intact).
      Files: `apps/web/src/app/(shop)/page.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` (clean).

- [x] 7. Render configured sections in the eMart home (`emart-home.tsx`), keeping all other chrome.
      In `apps/web/src/components/emart-home.tsx`: it already calls `getSiteContent()` (destructure `sections` from it alongside `home`); compute `const resolved = await resolveHomeSections(getHomeSections(sections))`. Replace the hardcoded "Best Deals for You" and "Best Seller" `<section>` blocks (and remove the `deals`/`bestSellers` `Promise.all` fetches) with a loop rendering each resolved section in eMart style: an `em-section` with `em-section__head` (`<h2>{s.title}</h2>` + a "View all →" `Link` to `s.viewAllHref` only when present) and a `product-grid` of `ProductCard`, with `data-testid={`home-section-${s.id}`}` on the grid. Keep hero/banner slider, Shop by Category, promo banners, Top Brands, and Why Choose unchanged. Keep `data-testid="home-page"` on the root. (This also fixes the current "Best Seller" mislabel, since the default section uses `popularity`.)
      Files: `apps/web/src/components/emart-home.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` (clean).

- [x] 8. Build the admin "Home Sections" manager and wire it into the settings page.
      New client component `apps/web/src/app/admin/settings/home-sections-editor.tsx` mirroring `content-editor.tsx` conventions (`'use client'`, `ce-card`, `auth-label`, `auth-input`, `prod-grid`, `wiz__addvar`/`wiz__vdel`, `adminFetch`, `<p role="status">` status). On mount: `adminFetch('/admin/settings')` → read `home.sections`, seed state by mapping each entry through `homeSectionSchema.safeParse` and keeping passers (falling back to `DEFAULT_SECTIONS` when empty); also `adminFetch<CategoryNodeDto[]>('/categories')` (flatten the nested tree with indentation for the category `<select>`) and `adminFetch('/admin/products')` (the admin product list, for the manual-pick search). Per-section row: title input (rename), enabled checkbox, source-type select (`By sort`/`By category`/`Manual pick`) with the dependent control (sort enum select labeled "Biggest discount/Newest/Most popular/Top rated"; category select from the flattened tree; manual = title-filter search that appends product ids as removable, up/down-reorderable chips), limit number input (clamp 2–24), up/down reorder buttons (swap array positions), and a `✕` delete. Footer: "+ Add section" appends `{ id: crypto.randomUUID(), title: 'New section', source: { type: 'sort', sort: 'discount' }, limit: 12, enabled: true }`; "Save Home Sections" (`data-testid="save-home-sections"`) runs `homeSectionsSchema.safeParse(sections)` and, on success, `adminFetch('/admin/settings', { method: 'PUT', body: { key: 'home.sections', value: sections } })` showing "Home sections saved. Live on the storefront.", on failure shows the inline validation message and blocks save (notably an empty `manual` section). Then render `<HomeSectionsEditor />` from `apps/web/src/app/admin/settings/page.tsx` under a new card after `<ContentEditor />`. RBAC is already enforced by `PUT /admin/settings` (`@Roles('super_admin')`) and the admin shell handles auth/refresh — no new auth work.
      Files: `apps/web/src/app/admin/settings/home-sections-editor.tsx` (new), `apps/web/src/app/admin/settings/page.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` && `pnpm --filter @belzo/web build` (both succeed).

- [x] 9. Full cross-cutting verification of the whole feature.
      No code changes unless a prior step regressed; this item confirms the complete additive feature builds and tests green end-to-end, and that an unconfigured install still yields the three default rails (`home-section-default-deals`, `-default-best-sellers`, `-default-new-arrivals`) because `home.sections` is unset → `sections: null` → `DEFAULT_SECTIONS`.
      Files: none (verification only)
      Verify (run all, from `c:\xampp\htdocs\Belzo`): `pnpm --filter @belzo/shared test` && `pnpm --filter @belzo/shared typecheck` && `pnpm --filter @belzo/api typecheck` && `pnpm --filter @belzo/api lint` && `pnpm --filter @belzo/api test` && `pnpm --filter @belzo/web typecheck` && `pnpm --filter @belzo/web build` — all pass.

---

## Files created / modified (summary, in order)

Created:
- `packages/shared/src/schemas.test.ts` additions (home-section cases) — item 1
- `apps/api/src/modules/admin/public-settings.controller.spec.ts` — item 3
- `apps/web/src/lib/home-sections.ts` — item 5
- `apps/web/src/app/admin/settings/home-sections-editor.tsx` — item 8

Modified:
- `packages/shared/src/schemas.ts` — item 1 (home-section schemas/types + `productQuerySchema.ids`)
- `apps/api/src/modules/catalogue/product.service.ts` — item 2 (`ids` branch)
- `apps/api/src/modules/catalogue/product.service.spec.ts` — item 2 (tests)
- `apps/api/src/modules/admin/public-settings.controller.ts` — item 3 (read + sanitize + response)
- `apps/web/src/lib/site-content.ts` — item 4 (`sections` on `RawPublicSettings` + `SiteContent`)
- `apps/web/src/app/(shop)/page.tsx` — item 6 (classic render)
- `apps/web/src/components/emart-home.tsx` — item 7 (eMart render)
- `apps/web/src/app/admin/settings/page.tsx` — item 8 (mount the editor)

No DB migration. No change to money/pricing/`toCard` or existing catalogue sort/pagination behavior.

## Assumptions / gaps (made explicit, not blockers)

- `@belzo/web` has no unit-test runner, so the design's "Unit (web)" resolver tests are not added; the equivalent sanitize/defaults logic is covered by the shared (item 1) and API (item 3) tests, and web is verified via typecheck + build. If a web test runner is later added, port the resolver cases from design §Testability.
- "Best seller" uses the existing `popularity` (`ratingCount desc`) sort as a proxy (design §6); no sales-count aggregation is introduced.
- The admin save path remains the generic unvalidated `PUT /admin/settings`; integrity is enforced client-side at write (`homeSectionsSchema`) and defensively per-section at read (API + resolver), per design §2.

---

## Verification

All commands run from `c:\xampp\htdocs\Belzo` (first iteration — no `review.json`). The `@belzo/shared` package was rebuilt (`pnpm --filter @belzo/shared build`) after editing its schemas so the API/web picked up the new exports.

| Command | Result |
|---|---|
| `pnpm --filter @belzo/shared test` | PASS — 7 suites, 51 tests (includes new home-section + `productQuerySchema.ids` cases) |
| `pnpm --filter @belzo/shared typecheck` | PASS — clean |
| `pnpm --filter @belzo/api typecheck` | PASS — clean |
| `pnpm --filter @belzo/api lint` | PASS — no errors |
| `pnpm --filter @belzo/api test` | PASS — 18 suites, 73 tests (includes new `ProductService.list` ids-branch + `PublicSettingsController` sanitize specs) |
| `pnpm --filter @belzo/web typecheck` | PASS — clean |
| `pnpm --filter @belzo/web build` | PASS — Next.js production build succeeded (all routes compiled) |

Note: `@belzo/web` has no test runner, so the resolver's sanitize/defaults logic is covered indirectly by the shared schema tests and the API public-settings sanitize spec (identical per-element `homeSectionSchema.safeParse` behavior), per the plan's documented gap.

Backward-compat confirmed by design: with `home.sections` unset the public endpoint returns `sections: null`, so both themes fall back to `DEFAULT_SECTIONS` (`home-section-default-deals`, `-default-best-sellers`, `-default-new-arrivals`) and the home is never empty.

