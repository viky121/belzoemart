# Design — Admin-managed Home Sections (shared across both themes)

## Overview

Today the storefront home page renders a fixed set of product rails that are
hardcoded in two React server components:

- Classic: `apps/web/src/app/(shop)/page.tsx` — "Deals of the Day" (`sort=discount`),
  one "Best of {category}" rail per category, a static promo grid, and
  "New Arrivals" (`sort=newest`).
- eMart: `apps/web/src/components/emart-home.tsx` — hero, Shop by Category,
  promo banners, "Best Deals for You" (`sort=discount`), "Best Seller"
  (currently `sort=newest` — a mislabel), Top Brands, Why Choose.

This design makes the **named product-rail sections** admin-managed through a
single shared config so an admin can **add / edit / delete / rename / reorder /
enable** them, and **both themes render the same ordered sections** in their own
visual style. The config is persisted through the existing `SettingsService`
(key/value settings store) under a new key `home.sections`, exactly matching how
`home_content` and `footer_content` are already stored and surfaced
(`apps/api/src/modules/admin/public-settings.controller.ts`,
`apps/web/src/lib/site-content.ts`). No new table is introduced — the settings
approach keeps this feature consistent with the existing content system and
requires no migration.

Scope is deliberately limited to the **product-rail sections** (the "Best deal
for you" / "Best seller" style named rails the user asked for). The surrounding
theme chrome that is already editable or theme-specific — hero/banner slider,
promo banners, Shop-by-Category, Top Brands, Why Choose, footer, and the
classic per-category auto-rails — is **left untouched** and continues to render
around the configured sections. This keeps money/catalogue behavior unchanged
and is purely additive.

## 1. Section config schema

A home section is a product rail bound to one product source. The config is an
**ordered array** of sections; array order *is* the render order (reordering =
reordering the array, so no separate `order` integer is stored or needs to be
kept consistent).

A new zod schema and types are added to `packages/shared/src/schemas.ts`
(exported via `packages/shared/src/index.ts`) so the admin UI, the web resolver,
and the API read path all share one definition:

```ts
// packages/shared/src/schemas.ts
export const HOME_SECTION_SORTS = ['discount', 'newest', 'popularity', 'rating'] as const;

export const homeSectionSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sort'), sort: z.enum(HOME_SECTION_SORTS) }),
  z.object({ type: z.literal('category'), categoryId: z.string().uuid() }),
  z.object({ type: z.literal('manual'), productIds: z.array(z.string().uuid()).min(1).max(50) }),
]);

export const homeSectionSchema = z.object({
  id: z.string().min(1).max(64),          // stable id (crypto.randomUUID() in the browser)
  title: z.string().trim().min(1).max(80), // free-text; admin rename; both themes use this
  source: homeSectionSourceSchema,
  limit: z.number().int().min(2).max(24).default(12), // visible items in the rail
  enabled: z.boolean().default(true),
});

export const homeSectionsSchema = z.array(homeSectionSchema).max(24);

export type HomeSectionSource = z.infer<typeof homeSectionSourceSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeSections = z.infer<typeof homeSectionsSchema>;
```

Fields:

- `id` — stable identifier generated client-side with `crypto.randomUUID()` when
  a section is created. Used as the React key and to target edit/delete/reorder.
  Never reused.
- `title` — free-text name. Satisfies the rename requirement; both themes render
  this string as the section heading. Max 80 chars (same ceiling as the settings
  `key` limit; comfortable for a heading).
- `source` — a discriminated union; the design finalizes the source set to three
  types (justified in §6):
  - `sort` — one of `discount | newest | popularity | rating`. Maps directly to
    the supported catalogue sorts in
    `apps/api/src/modules/catalogue/product.service.ts#orderFor`.
  - `category` — a single `categoryId`; resolves to products in that category
    subtree (reuses the existing `categoryId` filter + `descendantIds`).
  - `manual` — an explicit, ordered list of `productIds` the admin picks; min 1,
    max 50. The `.min(1)` means an empty manual section fails `homeSectionSchema`
    and is blocked on save (and dropped on read), so a `manual` source always has
    at least one id (Finding 5). The visible count is still capped by `limit`
    (Finding 2).
- `limit` — number of cards to request/show (clamped 2–24; default 12).
- `enabled` — when false the section is stored but not rendered on either theme.

## 2. Storage + API shape

### Storage — settings key `home.sections`

The whole ordered array is stored as JSON under the single settings key
`home.sections` via `SettingsService.set` / `get<T>` exactly like
`home_content`. `settings.service.ts` already serializes arbitrary JSON
(`valueJson`), caches reads in Redis, invalidates on write, and audit-logs every
change (`audit.record(actorId, 'settings.update', key, before, after)`) — so
add/edit/delete/reorder all persist and are audited for free, with no schema
migration.

Key name `home.sections` fits the existing `<=80` char `settingSchema.key`
constraint and the dotted-namespace convention already used
(`shipping.*`, `payment.*`, `store.*`).

### Admin write path (reuse the generic settings endpoint)

The admin UI saves with the **existing** `PUT /admin/settings` endpoint
(`apps/api/src/modules/admin/admin.controller.ts`, `@Roles('super_admin')`),
body `{ key: 'home.sections', value: HomeSections }`. This mirrors how
`content-editor.tsx` already saves `home_content` / `footer_content` and needs
**no new backend endpoint**.

The generic endpoint's `settingSchema` validates only `{ key, value: z.unknown }`
— it does not structurally validate the value. Rather than add a bespoke
endpoint (which would deviate from the established content-system pattern), the
design enforces integrity at two layers:

1. **Write-time (client):** the admin editor validates the array with
   `homeSectionsSchema.safeParse` before calling `PUT`; a failed parse blocks the
   save and shows the error. This matches the existing content editor's
   client-driven save model.
2. **Read-time (defensive, per-section):** both the public API read and the web
   resolver sanitize the stored value by running **`homeSectionSchema.safeParse`
   over each array element individually** and keeping only the ones that pass.
   Invalid sections are dropped while valid ones survive; only when *nothing*
   valid remains do we signal "use defaults" (return `null`). This guarantees the
   storefront can never render a broken or empty home regardless of what is
   stored (hard requirement: "never renders an empty home"), and a single bad
   section can never wipe out the other valid ones.

   The one shared sanitizer (exported from the web resolver and reused by the
   controller logic, both importing the schema from `@belzo/shared`) is:

   ```ts
   // sanitizeHomeSections(value: unknown): HomeSection[] | null
   const raw = Array.isArray(value) ? value : [];
   const valid = raw
     .map((s) => homeSectionSchema.safeParse(s))
     .filter((r): r is { success: true; data: HomeSection } => r.success)
     .map((r) => r.data);
   return valid.length > 0 ? valid : null; // null => caller applies DEFAULT_SECTIONS
   ```

   Because each element goes through `homeSectionSchema.parse`, the zod defaults
   for `limit` (12) and `enabled` (true) are applied here, so older/partial
   stored sections are normalized on read (see also Finding 8 / §3 load state).

Rationale for not adding a dedicated validated endpoint: the existing
`home_content`/`footer_content` content is already saved through this same
generic unvalidated path, and read-time sanitization makes the storefront robust
to any malformed value (including values written out-of-band). Keeping one save
path matches the current system and minimizes surface area. The tradeoff —
weaker server-side write validation — is accepted and documented; if stricter
server enforcement is later wanted, a dedicated `PUT /admin/home-sections` using
`homeSectionsSchema` can be added without changing the storage shape.

### Public read contract — extend `GET /settings/public`

`apps/api/src/modules/admin/public-settings.controller.ts#publicSettings`
currently returns `{ theme, home, footer }`. Add `sections`:

```ts
const [theme, home, footer, sections] = await Promise.all([
  this.settings.get<string>('theme'),
  this.settings.get<object>('home_content'),
  this.settings.get<object>('footer_content'),
  this.settings.get<unknown>('home.sections'),
]);
// Per-section sanitize (drop invalid, keep valid; null only when none valid).
const raw = Array.isArray(sections) ? sections : [];
const valid = raw
  .map((s) => homeSectionSchema.safeParse(s))
  .filter((r): r is { success: true; data: HomeSection } => r.success)
  .map((r) => r.data);
return {
  theme: theme && THEMES.includes(theme) ? theme : 'classic',
  home: home ?? null,
  footer: footer ?? null,
  sections: valid.length > 0 ? valid : null, // null => web falls back to DEFAULT_SECTIONS
};
```

Note this parses with the **element** schema (`homeSectionSchema`) per entry,
not the whole-array `homeSectionsSchema`, so one malformed section is dropped
rather than discarding the entire array. The `>24` array ceiling from
`homeSectionsSchema` is enforced at write time by the admin editor; on read we
additionally `slice(0, 24)` the sanitized list as a defensive cap.

This stays `@Public()` and is already revalidated by the web at 30s
(`site-content.ts`/`theme.ts`). Returning `null` when unset/invalid lets the web
layer apply defaults, so an unconfigured install behaves exactly as today.

### Resolving `manual` sources — additive catalogue filter

Manual sections need the storefront to fetch product **cards** for a specific set
of product ids. There is currently no public "by ids" fetch
(`product.service.ts#list` supports `categoryId` / `brandId` only). Rather than
issue N `/products/:idOrSlug` detail calls (which return the heavier
`ProductDetailDto` and cost one request each), add an **additive, optional** `ids`
filter to the catalogue list path:

- `packages/shared/src/schemas.ts` — extend `productQuerySchema` with
  `ids: z.string().trim().optional()` (a comma-separated id list; kept as a string
  so it round-trips through `@Query()` and the `URLSearchParams` the web already
  builds).
- `apps/api/src/modules/catalogue/product.service.ts#list` — add an **early
  `ids` branch** at the top of `list`, before the normal `where`/`orderBy`/
  paginated-`findMany`/`count` path runs. The current path issues
  `findMany({ where, include, orderBy, skip: (page-1)*pageSize, take: pageSize })`
  in parallel with a `count` (verified in source). The `ids` branch does **not**
  reuse that paginated query — it is a distinct, non-paginated fetch:

  1. De-blank the id string: `query.ids.split(',').map((s) => s.trim()).filter(Boolean)`
     (Finding 5). If the result is **empty**, short-circuit immediately and return
     `{ items: [], total: 0, page: 1, pageSize }` — do not build a `where.id`
     clause from an empty array.
  2. Issue a single `findMany` with **no `skip` and no `take`** (the schema's
     `≤50` id cap already bounds the row count, so unbounded fetch here is safe),
     filtering only by published status and the id set.
  3. Map rows through `toCard`, index by id, then **reorder into the admin's
     picked id order** (Prisma returns arbitrary order; manual rails must preserve
     the chosen order).
  4. **`slice(0, pageSize)`** to honor the rail `limit`.

  Explicitly, the whole branch:

  ```ts
  // product.service.list(), FIRST thing when query.ids is present:
  if (query.ids !== undefined) {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const ids = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return { items: [], total: 0, page: 1, pageSize };
    const rows = await this.prisma.product.findMany({
      where: { status: 'published', id: { in: ids } }, // NO skip, NO take
      include: { images: { orderBy: { position: 'asc' }, take: 1 }, variants: true },
    });
    const byId = new Map(rows.map((p) => [p.id, this.toCard(p)]));
    const items = (ids.map((id) => byId.get(id)).filter(Boolean) as ProductCardDto[])
      .slice(0, pageSize); // picked order, then honor the rail limit (Finding 2)
    return { items, total: items.length, page: 1, pageSize };
  }
  ```

  There is **no `count`** in this branch (`total` is just the resolved
  `items.length`); `orderBy` is irrelevant because order comes from the picked-id
  reorder. This leaves the existing paginated path for all non-`ids` queries
  completely untouched.

  Behavior when `productIds.length > limit`: the rail shows the **first `limit`
  products in the admin's picked order** (the overflow is truncated, not
  dropped silently from the config). Because the fetch is unbounded over the
  ≤50-id set, reorder sees **all** picked products before truncation — so the
  `slice` surfaces the correct first-`limit`, not an arbitrary `createdAt`-sorted
  subset. Only `status: 'published'` products are returned (unchanged), so an
  unpublished or deleted manually-picked product simply drops out of the rail
  before truncation — no error.

This is purely additive: existing queries without `ids` are unaffected, and
money/pricing/`toCard` logic is untouched.

## 3. Admin UI plan

The manager lives **alongside the existing content editor** in Admin → Settings
(`apps/web/src/app/admin/settings/page.tsx`), which already renders
`<ContentEditor />`. Add a sibling client component
`apps/web/src/app/admin/settings/home-sections-editor.tsx` and render it from the
settings page under a new "🧩 Home sections" card, following the exact form
styling and save pattern of `content-editor.tsx` (`ce-card`, `auth-label`,
`auth-input`, `prod-grid`, `wiz__addvar`, `adminFetch('/admin/settings', PUT)`,
status `<p role="status">` message).

Load/initial state:

- On mount, `adminFetch('/admin/settings')`; read `home.sections`. **Seed state
  through the schema, not by raw assignment** (Finding 8): map each stored entry
  through `homeSectionSchema.safeParse` and keep the `.data` of the ones that
  pass; if the resulting list is non-empty use it, otherwise seed with
  `DEFAULT_SECTIONS`. Parsing per element is what applies the zod defaults
  (`limit` 12, `enabled` true), so partial or older stored sections normalize to
  complete objects the editor can bind to. This is the same per-section
  sanitizer described in §2, reused in the editor.
- Also fetch categories (`adminFetch('/categories')`) and products
  (`adminFetch<ProdRow[]>('/admin/products')`, the existing `adminList`) for the
  manual-pick search.
- `/categories` returns a **nested** `CategoryNodeDto[]` tree
  (`CatalogueController` → `CategoryService.tree()`, each node has `children`),
  **not** a flat list, so the editor flattens it (indenting by depth) before
  populating the `<select>` (Finding 3):

  ```ts
  const flatten = (nodes: CategoryNodeDto[], depth = 0): { id: string; label: string }[] =>
    nodes.flatMap((n) => [
      { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
      ...flatten(n.children ?? [], depth + 1),
    ]);
  ```

Per-section row controls:

- **Title** — text input (rename).
- **Enabled** — checkbox.
- **Source type** — select: `By sort` / `By category` / `Manual pick`.
  - `By sort` → a second select (Biggest discount / Newest / Most popular /
    Top rated). "Most popular" is the Best-Seller proxy (§6).
  - `By category` → a category `<select>` populated from the **flattened**
    `/categories` tree (see Load/initial state above).
  - `Manual pick` → a search-and-pick control: a text box filters the loaded
    `/admin/products` list by title (client-side `includes`, case-insensitive);
    clicking a result appends its id to `source.productIds` (shown as removable
    chips with thumbnail + title). Selected order = render order; chips are
    reorderable with up/down buttons (or drag per the existing drag pattern). A
    manual section with zero picked products is **invalid** (schema `.min(1)`),
    so Save is blocked with an inline message until at least one product is
    picked (Finding 5).
- **Limit** — number input (clamped 2–24 on change).
- **Reorder** — up/down buttons that swap array positions (keyboard-accessible;
  simplest robust approach and consistent with the "Why Choose" list editing
  already in `content-editor.tsx`). Drag-and-drop is noted as a future
  enhancement but out of scope here to avoid a new dependency.
- **Delete** — removes the section from the array (same `✕` affordance as the
  "Why Choose" rows).

Footer actions:

- **+ Add section** — appends a new section with `crypto.randomUUID()`, default
  title "New section", `source: { type: 'sort', sort: 'discount' }`, `limit: 12`,
  `enabled: true`.
- **Save Home Sections** — runs `homeSectionsSchema.safeParse(sections)`; on
  success `adminFetch('/admin/settings', { method:'PUT', body:{ key:'home.sections',
  value: sections } })` and shows "Home sections saved. Live on the storefront.";
  on failure shows the validation message and does not save.
  (`data-testid="save-home-sections"` for parity with `save-home-content`.)

The `super_admin` RBAC on `PUT /admin/settings` already gates this; the settings
page is inside the admin shell which handles admin auth/refresh
(`admin-api.ts`). No new auth work.

## 4. How both themes consume the config

### Shared resolver (web)

Add `apps/web/src/lib/home-sections.ts` with:

- `DEFAULT_SECTIONS: HomeSection[]` (the backward-compatible seed, §5).
- `getHomeSections(): Promise<HomeSection[]>` — reads `sections` from
  `/settings/public`. **Decision (Finding 7):** extend the existing
  `RawPublicSettings` interface in `site-content.ts` with `sections?: unknown` and
  expose it, reusing the single `/settings/public` call that `getTheme` and
  `getSiteContent` already make at `revalidate: 30` — no extra round-trip and no
  dedicated fetch. The function then runs the same per-section sanitizer from §2
  (`homeSectionSchema.safeParse` per element) and returns the valid list, or
  `DEFAULT_SECTIONS` when the list is empty/absent. (The public controller
  already sanitizes, so by the time it reaches the web the value is either a
  valid array or `null`; `getHomeSections` sanitizes again defensively and
  substitutes defaults on `null`.) It then filters out `enabled === false`
  sections and preserves array order.
- `resolveHomeSections(sections): Promise<ResolvedSection[]>` where
  `ResolvedSection = { id: string; title: string; products: ProductCardDto[]; viewAllHref?: string }`.
  Before resolving rails, if any enabled section has a `category` source the
  resolver fetches the category tree **once** via `catalogueApi.categories()`
  (which returns a nested `CategoryNodeDto[]` — verified in
  `apps/web/src/lib/catalogue-api.ts`), flattens it with the same recursion the
  editor uses, and builds a `Map<id, slug>` for `viewAllHref` resolution
  (Finding 2). This `categories()` call is cached (`revalidate: 300`) and only
  issued when a `category` section exists; if it fails it is caught and the
  category hrefs fall back (below). For each enabled
  section it builds the right `catalogueApi.products(qs)` query and resolves **all
  sections in parallel** with `Promise.all` (mirroring today's `Promise.all` in
  both home components), each wrapped in `.catch(() => EMPTY)` so one failing rail
  never breaks the page:
  - `sort` → `new URLSearchParams({ sort, pageSize: String(limit) })`.
  - `category` → `new URLSearchParams({ categoryId, pageSize: String(limit) })`.
  - `manual` → `new URLSearchParams({ ids: productIds.join(','), pageSize: String(limit) })`.
    `pageSize` here is `limit`, and the `ids` branch of `product.service.list`
    now slices to `pageSize` after reordering (Finding 2), so the manual rail is
    correctly capped at `limit`.
  Sections that resolve to zero products are dropped from the result (today's
  components already guard `items.length > 0`), so empty rails never show.
- `ResolvedSection` also carries a `viewAllHref` derived from the source so each
  rail keeps today's "View all" link (Finding 4): `sort` →
  `/search?sort=<sort>`; `category` → `/category/<slug>` using the `Map<id, slug>`
  built above; if the id is absent from the map (stale config, or the
  `categories()` fetch failed) it falls back to `/search?categoryId=<id>`;
  `manual` → **omitted** (`undefined`), since a
  hand-picked set has no canonical listing page. `ProductRail`'s `viewAllHref` is
  optional and renders nothing when absent.

  On the `sort` href (Finding 3): the storefront `/search` route
  (`apps/web/src/app/(shop)/search/page.tsx`) reads `searchParams.sort` and
  passes it straight through to `catalogueApi.products(qs)` with **no client-side
  sort whitelist** — the API's `productQuerySchema.sort` enum is the only
  validator, and it accepts all four `HOME_SECTION_SORTS` values. `popularity`
  is already an explicit option in the `/search` sort bar; `discount`/`newest`/
  `rating` are not listed as buttons but are still accepted and applied because
  the page forwards whatever `sort` it is given (today's `?sort=discount` and
  `?sort=newest` home links already rely on exactly this pass-through, and the
  page even special-cases their headings). So `/search?sort=popularity` and
  `/search?sort=rating` are intentionally **API-valid queries the search page
  passes through**; they sort correctly even though `rating` has no dedicated
  sort-bar button. No change to `/search` is required.

This resolver is the single source of truth; both themes call it and only differ
in presentation.

### Per-theme rendering

- **Classic** (`apps/web/src/app/(shop)/page.tsx`): replace the hardcoded
  "Deals of the Day" rail and the "New Arrivals" grid with a loop over
  `resolveHomeSections(...)`, rendering each via the existing
  `ProductRail` component (`apps/web/src/components/product-rail.tsx`) using
  `title={section.title}`, `products={section.products}`,
  `viewAllHref={section.viewAllHref}`, and `testId={`home-section-${section.id}`}`
  (Finding 6). The hero carousel,
  the per-category auto-rails, and the promo grid remain as theme chrome. The
  configured sections render as a contiguous group after the hero and before the
  per-category rails. (Net effect with defaults: Deals / Best Sellers / New
  Arrivals appear as today; "Best Sellers" is now a real rail rather than absent;
  New Arrivals moves up into the group — acceptable and now admin-reorderable.)
- **eMart** (`apps/web/src/components/emart-home.tsx`): replace the hardcoded
  "Best Deals for You" and "Best Seller" blocks with the same
  `resolveHomeSections(...)` loop, rendered in eMart's grid style (`em-section`
  head with the section title + optional "View all" using `section.viewAllHref`,
  then a `product-grid` of `ProductCard`, exactly as the current blocks). Each
  section's `product-grid` carries `data-testid={`home-section-${section.id}`}`
  (Finding 6). Hero/banner slider, Shop by Category, promo banners, Top Brands
  and Why Choose stay as-is. This also fixes the current "Best Seller" mislabel
  because the default Best Sellers section uses `popularity`, not `newest`.

**Testid decision (Finding 6).** The old `emart-deals` / `emart-bestsellers` /
`home-deals` / `home-new-arrivals` grid testids are **replaced** by per-section
testids `home-section-<id>` (the default sections keep stable ids like
`default-deals`, so a default install still has deterministic, targetable
testids). The root `data-testid="home-page"` on both themes is **kept** so
page-level e2e is unaffected. A repository search found **no `.spec`/e2e file
references** to any of the old grid testids (only the component source itself),
so this replacement does not break existing specs; any future spec should target
`home-page` and `home-section-<id>`.

`ProductRail` already returns `null` for empty product lists and `ProductCard`
is reused unchanged, so no component rewrites are needed — the themes just feed
them resolved sections.

Hero/promos/why/Shop-by-Category/Top Brands/footer are explicitly **not** folded
into this config; they keep their existing editing paths (`home_content`,
`footer_content`, banners) and must not regress.

## 5. Backward-compatible default section set

`DEFAULT_SECTIONS` (in `apps/web/src/lib/home-sections.ts`), used whenever
`home.sections` is unset or invalid, mirrors today's named rails so an
unconfigured install looks essentially unchanged and never renders empty:

```ts
export const DEFAULT_SECTIONS: HomeSection[] = [
  { id: 'default-deals',        title: 'Deals of the Day', source: { type: 'sort', sort: 'discount' },   limit: 12, enabled: true },
  { id: 'default-best-sellers', title: 'Best Sellers',     source: { type: 'sort', sort: 'popularity' }, limit: 10, enabled: true },
  { id: 'default-new-arrivals', title: 'New Arrivals',     source: { type: 'sort', sort: 'newest' },     limit: 10, enabled: true },
];
```

Notes:
- These three reproduce the cross-theme named rails. "Deals of the Day"
  (discount) and "New Arrivals" (newest) match both themes today; "Best Sellers"
  (popularity) replaces eMart's mislabeled `newest` block and adds the
  Best-Seller rail the user asked for.
- Per-category rails are intentionally **not** seeded as individual sections (an
  install can have many categories; seeding one section each would be unbounded).
  The classic per-category auto-rails remain as theme chrome, and an admin who
  wants a specific category rail on both themes can add a `category`-source
  section. This matches the task's "optionally per-category".
- Stable string ids (`default-*`) make the seed deterministic across installs.

## 6. Resolved open questions

- **"Best seller" ranking.** There is no real sales-count sort in the catalogue
  (`product.service.ts#orderFor` supports only `newest`, `popularity`
  = `ratingCount desc`, `rating` = `ratingAvg desc`; `discount`/price sorts are
  derived in `list`). **Decision:** use `popularity` (`ratingCount desc`) as the
  Best-Seller proxy and surface it in the admin UI as "Most popular". Do **not**
  build sales-count aggregation now — it would require joining order/order-item
  data and a new sort, which is out of scope and not cheap. The free-text title
  ("Best Sellers" / "Best Seller") is admin-controlled, so the label is correct
  regardless of the underlying proxy. Future: a true `bestseller` sort backed by
  an order-item aggregate can be added as a new `sort` enum value without
  changing this config shape.
- **Source-type set.** Finalized to `sort`, `category`, `manual`. Brand-based
  rails were considered but omitted to keep scope tight (no current home rail is
  brand-based; Top Brands is separate chrome); a `brand` source can be added
  later as another union member without a storage change.
- **Server-side vs client-side resolution.** Resolve **server-side in the home
  components** via the shared resolver (both are already `async` server
  components using `catalogueApi`). The public settings read returns only the
  section *config*; product data is fetched through the existing cached
  `catalogueApi` on the server. This keeps caching/revalidation behavior
  identical to today and avoids shipping resolution logic or extra round-trips to
  the browser.

## Error handling & validation summary

| Operation | Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| Admin save (`PUT /admin/settings`) | `homeSectionsSchema` parse fails (client) | Yes | Save blocked, inline validation message | n/a (client) |
| Admin save (server) | DB/Redis error in `SettingsService.set` | Yes | 500 from endpoint; editor shows "Could not save." | Nest default + audit skipped |
| Public read (`GET /settings/public`) | one or more stored sections invalid | Yes | invalid sections dropped, valid ones returned (per-section sanitize) | no (silent, by design) |
| Public read (`GET /settings/public`) | stored value missing / nothing valid | Yes | `sections: null` → web uses `DEFAULT_SECTIONS` | no (silent, by design) |
| Admin save | empty `manual` section (`productIds` < 1) | Yes | Save blocked, inline validation message (schema `.min(1)`) | n/a (client) |
| Web resolve `manual` | `productIds.length > limit` | Yes | rail truncated to first `limit` in picked order | no |
| Web resolve a section | `catalogueApi.products` throws | Yes | that rail yields `EMPTY` and is dropped | no (matches current `.catch`) |
| Manual source | a product id unpublished/deleted | Yes | product silently absent from the rail | no |
| Whole resolver | all sections empty | Yes | home renders chrome only (hero/promos); never crashes | no |

Validation rules per external input:
- `title` — required, trimmed, 1–80 chars; empty blocked on save.
- `limit` — required int, clamped 2–24 in the UI and enforced by schema.
- `source.sort` — must be one of the four enum values.
- `source.categoryId` / `manual.productIds` — must be uuids; `productIds` min 1,
  max 50 (empty manual blocked on save, Finding 5). A category/product that no
  longer exists simply yields an empty/short rail at read time (no hard failure);
  manual rails are additionally truncated to `limit` (Finding 2).
- `sections` array — max 24 entries.

Invariant ownership: the **web resolver + public controller** own storefront
robustness (sanitize-on-read, never-empty-home); the **admin editor** owns
input validity before write; the **shared schema** (`packages/shared`) is the
single definition all three depend on.

## Testability

- **Unit (shared):** `homeSectionsSchema` accept/reject cases (valid array, bad
  sort, over-limit, non-uuid ids, >24 sections).
- **Unit (api):** `product.service.list` with `ids` returns only those published
  products in the requested order; absent/unpublished ids are omitted; the result
  is sliced to `pageSize` so `ids.length > pageSize` truncates to the first
  `pageSize` in picked order (Finding 2); a blank/empty `ids` string yields an
  empty result after de-blanking (Finding 5); no `ids` behaves exactly as before.
- **Unit (web):** the per-section sanitizer drops a single invalid section while
  keeping valid ones, and returns `null`/defaults only when none are valid
  (Finding 1); `getHomeSections` falls back to `DEFAULT_SECTIONS` on null/empty
  and normalizes partial sections (missing `limit`/`enabled`) via parse
  (Finding 8); `resolveHomeSections` builds correct query strings and
  `viewAllHref` per source type (Finding 4), runs in parallel, and drops empty
  rails.
- **Integration/e2e:** admin saves a renamed+reordered section set; both themes
  (`data-testid="home-page"` root + per-section `data-testid="home-section-<id>"`)
  render the configured titles in order; deleting a section removes it from both;
  an unconfigured install shows the three default rails
  (`home-section-default-deals`, `-default-best-sellers`, `-default-new-arrivals`).
  Saving an empty `manual` section is blocked in the editor (Finding 5).

## Files touched (for the implementer)

- `packages/shared/src/schemas.ts` — add `homeSection*` schemas/types; add `ids`
  to `productQuerySchema`. (Exported already via `index.ts`.)
- `apps/api/src/modules/catalogue/product.service.ts` — honor `ids` in `list`
  (de-blank, filter, preserve order, slice to `pageSize`).
- `apps/api/src/modules/admin/public-settings.controller.ts` — read + per-section
  sanitize `home.sections`, add to response.
- `apps/web/src/lib/site-content.ts` — add `sections?: unknown` to
  `RawPublicSettings` and expose it (reuse the single `/settings/public` call).
- `apps/web/src/lib/home-sections.ts` — **new**: `DEFAULT_SECTIONS`,
  `getHomeSections`, `resolveHomeSections`.
- `apps/web/src/app/(shop)/page.tsx` — render configured sections via
  `ProductRail`; keep hero/per-category/promo chrome.
- `apps/web/src/components/emart-home.tsx` — render configured sections in eMart
  style; keep hero/categories/promos/brands/why chrome.
- `apps/web/src/app/admin/settings/home-sections-editor.tsx` — **new** admin
  manager; rendered from `apps/web/src/app/admin/settings/page.tsx`.

No DB migration. No changes to money/pricing/`toCard`. Additive only.

---

## Responses to design review (revision pass)

All eight findings from `design-review.json` / `design-review.md` are resolved
in this revision:

1. **[MEDIUM] Sanitize semantics contradiction** — RESOLVED. Chose **per-section
   sanitization** everywhere. §2 prose, the public-read snippet, and §4
   `getHomeSections` now all describe/implement the same `homeSectionSchema`
   (element) `.safeParse`-per-entry filter that keeps valid sections and drops
   only invalid ones, returning `null` (→ defaults) only when none are valid. The
   whole-array `homeSectionsSchema` is now used only for the client write-time
   validation and the `>24` ceiling (also enforced on read via `slice(0,24)`).
2. **[MEDIUM] `limit` ignored for manual** — RESOLVED. `product.service.list`'s
   `ids` branch now reorders then `slice(0, pageSize)`, and the resolver sends
   `pageSize=limit`. Documented truncation behavior: first `limit` products in
   picked order when `productIds.length > limit`.
3. **[NIT] Category tree not flat** — RESOLVED. §3 now specifies a recursive
   `flatten` (indent by depth) step before populating the category `<select>`.
4. **[NIT] `viewAllHref` unspecified** — RESOLVED. `ResolvedSection` carries
   `viewAllHref`: `sort` → `/search?sort=<sort>`, `category` → `/category/<slug>`
   (fallback `/search?categoryId=<id>`), `manual` → omitted. Both themes pass it
   through.
5. **[NIT] empty `manual.productIds`** — RESOLVED. Added `.min(1)` to the manual
   branch; editor blocks saving an empty manual section; `list` de-blanks the
   `ids` string and short-circuits on empty.
6. **[NIT] testids left as "or"** — RESOLVED. Decided: **replace** old grid
   testids with per-section `home-section-<id>`, keep `home-page` root. Verified
   via repo search that no `.spec`/e2e file references the old testids, so no
   specs break.
7. **[NIT] resolver read "extend or add fetch"** — RESOLVED. Chose to **extend
   `RawPublicSettings`** with `sections?: unknown` and reuse the single
   `/settings/public` call.
8. **[NIT] defaults via parse** — RESOLVED. §2 and §3 now state explicitly that
   both the resolver and the editor seed state through `homeSectionSchema.parse`
   per element, so missing `limit`/`enabled` normalize to their zod defaults.

---

## Responses to design review (revision pass 2)

Second review (`design-review.json` / `design-review.md`, verdict
CHANGES_REQUESTED: 1 MEDIUM + 2 NIT) findings are all resolved below. Each was
re-verified against current source before editing.

1. **[MEDIUM] `ids` branch of `product.service.list` — ambiguous `take`,
   `findMany` not shown** — RESOLVED. §2 "Resolving `manual` sources" now shows
   the **complete `ids` branch** as an early return at the top of `list`: a
   distinct `findMany({ where: { status: 'published', id: { in: ids } }, include })`
   with **no `skip` and no `take`** (bounded by the ≤50-id cap), **no `count`**,
   then reorder into picked id order, then `slice(0, pageSize)`. It states
   explicitly that the paginated `skip`/`take`/`count` path is left untouched for
   non-`ids` queries, and that the unbounded fetch is what makes the reorder see
   all picked products so the `slice` yields the correct first-`limit` (not an
   arbitrary `createdAt`-sorted subset — the exact bug Reading B would cause). The
   empty-`ids` short-circuit returns `{ items: [], total: 0, page: 1, pageSize }`
   before any `where.id` clause is built.
2. **[NIT] `categoryId → slug` map only implied** — RESOLVED. §4 "Shared
   resolver" now states `resolveHomeSections` calls `catalogueApi.categories()`
   **once** (only when a `category` section exists), flattens the nested
   `CategoryNodeDto[]` with the editor's recursion, and builds a `Map<id, slug>`;
   ids absent from the map (or a failed fetch) fall back to
   `/search?categoryId=<id>`.
3. **[NIT] `sort` `viewAllHref` assumes `/search` forwards `popularity`/`rating`**
   — RESOLVED. Verified in `apps/web/src/app/(shop)/search/page.tsx`: the page
   does `qs.set('sort', sort)` and passes it straight to `catalogueApi.products`
   with no client-side whitelist; the API `productQuerySchema.sort` enum is the
   sole validator and accepts all four sorts. `popularity` is already a sort-bar
   option; `rating`/`discount`/`newest` are accepted pass-through values. §4 now
   documents this explicitly and notes no `/search` change is needed.

**The revised design is ready for review.**
