# Design Review — Admin-managed Home Sections (revision pass 3 review)

Reviewed: `.agents/tasks/home-sections-config/design.md`
Scope of review: ambiguity, gaps, unverified assumptions, feasibility, scope creep,
conflicting sections, error handling, input validation — with every load-bearing
claim re-verified against current source.

## Verdict

**APPROVED** — 0 HIGH, 0 MEDIUM, 4 NIT.

The design is concrete and implementable. The config schema is complete, the
storage/API contract is unambiguous, the admin CRUD+reorder+rename+manual-pick
UX is specified, both themes consume one shared resolver, the backward-compatible
`DEFAULT_SECTIONS` are defined, and the "best seller" ranking is resolved to the
`popularity` (`ratingCount desc`) proxy. The four findings below are polish/clarity
items that do not block implementation.

---

## Findings

### 1. [NIT] "Shared sanitizer exported from the web resolver and reused by the controller logic" is not literally possible across the monorepo boundary
§2, "Read-time (defensive, per-section)" states the sanitizer is *"exported from
the web resolver and reused by the controller logic, both importing the schema
from `@belzo/shared`"*. `apps/api` cannot import from `apps/web/src/lib/home-sections.ts`
— that is a web-only module and the dependency direction would be invalid. The
concrete snippets elsewhere already do the right thing: the public-read snippet
inlines the map/filter in the controller, and "Files touched" describes the
controller as doing "read + per-section sanitize" with no cross-app import. Only
the prose clause is misleading.
Fix: reword to "the same per-section sanitize logic is implemented in both places
(web resolver and the public controller); the *only* shared artifact is
`homeSectionSchema`, imported from `@belzo/shared` in each." The genuinely shared
piece is the schema, not a function.

### 2. [NIT] Saving an empty sections array silently reverts the storefront to DEFAULT_SECTIONS
`homeSectionsSchema = z.array(homeSectionSchema).max(24)` has no `.min(1)`, so an
admin can save `[]`. On read, the per-section sanitizer returns `null` when
`valid.length === 0` (this is true for an empty array too), and `null` triggers
`DEFAULT_SECTIONS`. Net effect: an admin who deletes every section and saves does
**not** get an empty rail group — they get the three default rails back. The
intended way to show zero rails is "keep sections but set them all `enabled:false`"
(sanitize keeps them as valid, then `getHomeSections` filters `enabled===false` →
empty resolved → chrome-only home). This is self-consistent but surprising.
Fix: document this explicitly in §5 / the error table — "an empty saved array is
treated as unconfigured and falls back to defaults; to render no rails, disable
all sections rather than deleting them."

### 3. [NIT] Composition of `getHomeSections` + `resolveHomeSections` in the theme files is implied, not shown
§4 says each theme loops over `resolveHomeSections(...)` and separately describes
`getHomeSections()` (which applies defaults and filters `enabled`). The exact call
site composition is never written out, so an implementer could call
`resolveHomeSections` on an unfiltered/undefaulted list.
Fix: state the concrete call once, e.g. `const sections = await resolveHomeSections(await getHomeSections());`
in both `page.tsx` and `emart-home.tsx`, so defaulting + enabled-filtering always
precede resolution.

### 4. [NIT] "No extra round-trip" for the public-settings read depends on Next.js fetch request memoization
§4 claims reusing the single `/settings/public` call means "no extra round-trip."
`getTheme` (`theme.ts`), `getSiteContent` (`site-content.ts`), and the new
`getHomeSections` each independently call `apiFetch('/settings/public', { revalidate: 30 })`.
This collapses to one network request only because Next dedupes `fetch` calls with
an identical URL **and** identical options within a render. If `getHomeSections`
passes a different `revalidate` or option shape, it becomes a second round-trip.
Fix: note that `getHomeSections` must use the exact same `apiFetch('/settings/public', { revalidate: 30 })`
options as the existing callers for memoization to apply (or, simpler, have
`getSiteContent` return `sections` and have `getHomeSections` consume that result).

---

## Verified Assumptions

1. **Settings store + generic write path.** `SettingsService.get<T>`/`set` cache in
   Redis, invalidate on write, and audit-log via `audit.record(actorId, 'settings.update', key, before, after)`. `getAll()` returns a flat `Record<key, valueJson>`.
   (`apps/api/src/modules/admin/settings.service.ts`) ✔
2. **`PUT /admin/settings` is `@Roles('super_admin')`, body `{ key, value: z.unknown() }`** — structurally unvalidated, exactly as the design relies on. `settingSchema.key` is `min(1).max(80)`; `home.sections` (13 chars) fits. (`admin.controller.ts`) ✔
3. **`super_admin` implicitly satisfies every role requirement** (`roles.guard.ts`), so a super_admin on the settings page can also hit `GET /admin/products` (which is `@Roles('catalogue_manager')`) for the manual-pick list. ✔
4. **`GET /settings/public` currently returns `{ theme, home, footer }`** via `Promise.all` of three `settings.get` calls and is `@Public()` — adding a fourth `sections` entry is a clean extension. (`public-settings.controller.ts`) ✔
5. **`productQuerySchema.sort` enum** = `relevance | price_asc | price_desc | newest | popularity | rating | discount` — accepts all four `HOME_SECTION_SORTS`. No `ids` field today, so adding `ids` is additive. (`packages/shared/src/schemas.ts`) ✔
6. **`product.service.list` current path** issues `findMany({ where, include:{images take:1, variants:true}, orderBy, skip, take })` in parallel with `count`; `orderFor` supports `newest`(createdAt desc), `popularity`(ratingCount desc), `rating`(ratingAvg desc); `discount`/price sorts are derived post-fetch. The described early `ids` branch (filter published, no skip/take, reorder to picked order, slice to pageSize, no count) is feasible and leaves the paginated path untouched. The `include` the branch uses satisfies `toCard`. (`product.service.ts`) ✔
7. **"Best seller" ranking** — there is no sales-count sort; `popularity = ratingCount desc` is the only reasonable existing proxy, confirmed in `orderFor`. Decision to use it (surfaced as "Most popular") is sound and avoids a new aggregation. ✔
8. **`/search` pass-through** — `search/page.tsx` does `qs.set('sort', sort)` with no client-side sort whitelist and forwards to `catalogueApi.products`; the API enum is the sole validator. `popularity` is a sort-bar button; `discount`/`newest`/`rating` are accepted pass-through values (today's home already relies on `?sort=discount`/`?sort=newest`). `viewAllHref` sort links are valid. ✔
9. **Category tree is nested** — `GET /categories` → `CategoryService.tree()` returns `CategoryNodeDto[]` with `children`, `slug`, `imageUrl` (`catalogue.controller.ts`, `packages/shared/src/catalogue.ts`); `catalogueApi.categories()` is `revalidate: 300`. The design's `flatten` recursion and `Map<id, slug>` for `viewAllHref` are correct and necessary. ✔
10. **`/category/[slug]` storefront route exists** (`apps/web/src/app/(shop)/category/[slug]`), so `category` → `/category/<slug>` resolves to a real page, with `/search?categoryId=<id>` as the documented fallback. ✔
11. **Admin UI pattern** — `settings/page.tsx` (`'use client'`) renders `<ContentEditor />` and can host a sibling editor; `content-editor.tsx` loads via `adminFetch('/admin/settings')`, saves via `adminFetch('/admin/settings', { method:'PUT', body:{ key, value } })`, uses `ce-card`/`auth-label`/`auth-input`/`prod-grid`/`wiz__addvar`/`<p role="status">` and `data-testid="save-home-content"` — all exist as the design describes. The "Why Choose" add/remove row pattern the design reuses for section CRUD is present. (`content-editor.tsx`, `settings/page.tsx`) ✔
12. **Classic home** (`(shop)/page.tsx`) uses `getTheme()` + `catalogueApi`, renders rails via `ProductRail` (which returns `null` on empty products and accepts `title`/`products`/`viewAllHref`/`testId`), has root `data-testid="home-page"`, and the replaceable `home-deals` / `home-new-arrivals` blocks. ✔
13. **eMart home** (`emart-home.tsx`) uses `getSiteContent()` + `catalogueApi`, root `data-testid="home-page"`, and its "Best Seller" block indeed uses `sort=newest` (the mislabel the design corrects). Replaceable `emart-deals` / `emart-bestsellers` grids present. ✔
14. **Testid replacement is safe** — repo-wide grep for `emart-deals|emart-bestsellers|home-deals|home-new-arrivals` matches only the two component sources and the design/review docs; **no `.spec`/e2e file references them**, so replacing them with `home-section-<id>` breaks no specs. ✔
15. **`MAX_PAGE_SIZE = 100`, `DEFAULT_PAGE_SIZE = 20`** — a rail `limit` (2–24) passed as `pageSize` is always within schema bounds. (`packages/shared/src/constants.ts`) ✔
16. **Both home components are `async` server components already using `Promise.all` + `.catch`** — the "resolve all sections in parallel, each `.catch(()=>EMPTY)`" approach mirrors existing behavior. ✔

## Unverified / Wrong Assumptions

- None material. The only prose-vs-reality mismatch is Finding 1 (the "sanitizer
  exported from the web resolver and reused by the controller" clause, which is
  not a valid cross-app import); the concrete snippets already implement it
  correctly by inlining, so it is a wording NIT, not a design error.

---

## Summary

Two prior review passes closed the substantive gaps (sanitize semantics, manual
`limit` truncation, the `ids`-branch `take`/`findMany` ambiguity, category→slug
map, `/search` sort pass-through). This pass re-verified every load-bearing claim
against source and found them accurate. Remaining items are clarity NITs. No HIGH
or MEDIUM findings → APPROVED.
