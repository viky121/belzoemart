# Implementation Review — Admin-managed Home Sections (shared across both themes)

Admin-managed home-page product rails driven by one shared settings key `home.sections`, consumed by both storefront themes with backward-compatible defaults, a best-seller=popularity proxy, and three source types (`sort` | `category` | `manual`). The manual source resolves through a new additive `ids` filter on the catalogue list path. This review is the skipped post-code gate: a behavioral/security pass over the committed diff (HEAD `0aed692`) against `design.md`, `plan.md`, and `design-review.md`. Suites already pass; this is not a re-run.

**Watch for:** nothing blocking. Three low-severity notes: an empty saved array silently reverts the storefront to defaults (documented design quirk, not a bug); the web resolver's sanitizer omits the array-level `.slice(0, 24)` cap the API controller applies (harmless today because the controller is always upstream); and the generic `PUT /admin/settings` performs no server-side structural validation of `home.sections` (accepted design tradeoff, mitigated by sanitize-on-read in all three read paths).

**Verdict**: APPROVED

## High-level view

Per-section sanitization is implemented identically in the two places that matter: `PublicSettingsController.publicSettings` and the web resolver's `sanitizeHomeSections`. Both run `homeSectionSchema.safeParse` per array element, keep only the passers (with zod defaults applied), and return `null` only when nothing survives so the storefront falls back to `DEFAULT_SECTIONS`. The only divergence is a defensive `.slice(0, 24)` present in the controller but not in the web resolver — a non-issue because the controller is always the upstream producer of the array the web reads.

The manual `ids` branch is a clean early return at the top of `ProductService.list`: it fetches published products with no `skip`/`take`/`count`, reorders them into the admin-picked id order via a `Map`, and `slice(0, pageSize)`s to honor the rail limit. The existing paginated path is untouched, so there is no regression to the other sorts.

View-all hrefs carry no open-redirect risk: they are built only from the validated sort enum, server-sourced category slugs, or a `/search?categoryId=<uuid>` fallback over a schema-validated uuid. Section titles render as React text nodes and never feed an href, so there is no injection surface there either.

Backward compatibility holds: an unconfigured store returns `sections: null` from the public endpoint, threads through `getSiteContent().sections` as `null`, and both themes fall back to the three default rails. Both themes consume the single shared config through `getHomeSections` + `resolveHomeSections` while keeping their own chrome (hero, promos, Shop-by-Category, per-category rails, Top Brands, Why Choose) intact.

The admin write path reuses the generic `PUT /admin/settings` (`@Roles('super_admin')`), which validates only `{ key, value: z.unknown() }`. Server-side structural validation is intentionally absent per the design; integrity is enforced client-side at write (`homeSectionsSchema.safeParse`) and defensively per-section at every read.

<details>
<summary>Issues (3)</summary>

1. **Empty-array save reverts to defaults** (confirmed, low) — `homeSectionsSchema` has no `.min(1)`, so saving `[]` is valid, but on read an empty array sanitizes to `null`, which restores `DEFAULT_SECTIONS`. To render zero rails an admin must instead disable all sections. Surface this in the editor UI (a hint) so deleting every section isn't mistaken for "hide all rails".
2. **Web sanitizer missing the 24-cap** (confirmed, low) — `sanitizeHomeSections` in `home-sections.ts` omits the `.slice(0, 24)` the controller applies. Harmless today since the controller always caps before the web sees the value; add the slice for parity so the resolver stays safe if ever fed raw config directly.
3. **No server-side structural validation on `PUT /admin/settings`** (confirmed, low, accepted) — `home.sections` is stored as arbitrary JSON (`value: z.unknown()`), gated only by `super_admin` RBAC. Storefront safety depends entirely on every read path sanitizing; all three currently do. If stricter write enforcement is later wanted, add a dedicated `PUT /admin/home-sections` using `homeSectionsSchema` without changing the storage shape.

</details>

<details>
<summary>Details</summary>

### Per-section sanitize parity (public read vs web resolver)

`PublicSettingsController.publicSettings` adds `home.sections` to the existing `Promise.all`, then maps each element through `homeSectionSchema.safeParse`, filters to successes, maps to `.data`, `.slice(0, 24)`, and returns `sections: valid.length > 0 ? valid : null`. `sanitizeHomeSections` in `home-sections.ts` does the same map/filter/map and returns `null` when empty, minus the slice. The spec (`public-settings.controller.spec.ts`) covers the four meaningful cases: one-valid-one-malformed keeps only the valid (with `limit: 12`, `enabled: true` defaults applied), missing → `null`, all-invalid → `null`, and a 30-entry array sliced to 24.

The slice asymmetry is the only behavioral difference between the two "identical" sanitizers. Because `getHomeSections` consumes `getSiteContent().sections`, which is the controller's already-capped output, the web never sees a >24 array in practice. Adding `.slice(0, 24)` to `sanitizeHomeSections` would make the two truly interchangeable and guard a future SSR path that might read raw config without going through the controller. Low severity.

### Manual `ids` branch — order, published filter, limit, no pagination regression

```ts
if (query.ids !== undefined) {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const ids = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { items: [], total: 0, page: 1, pageSize };
  const rows = await this.prisma.product.findMany({
    where: { status: 'published', id: { in: ids } },
    include: { images: { orderBy: { position: 'asc' }, take: 1 }, variants: true },
  });
  const byId = new Map(rows.map((p) => [p.id, this.toCard(p)]));
  const items = ids.map((id) => byId.get(id)).filter(...).slice(0, pageSize);
  return { items, total: items.length, page: 1, pageSize };
}
```

The branch is the first statement in `list`, so every non-`ids` query runs the original paginated `findMany`+`count` path byte-for-byte — no pagination regression. It filters `status: 'published'`, reorders into the picked id order (Prisma returns arbitrary order), and `slice(0, pageSize)` honors the rail limit after reordering over the full ≤50-id set. The `include` matches `toCard`'s needs. `prisma.product.count` is never called here (the spec's fake throws if it is). The specs cover picked-order preservation, dropping absent/unpublished ids, truncation to `pageSize` in picked order, and the blank-string short-circuit that builds no id clause.

Prisma parameterizes `id: { in: ids }`, so the un-UUID-validated `ids` query string carries no injection risk; non-matching garbage simply yields no rows.

### View-all hrefs and title rendering — no open-redirect / injection

`resolveHomeSections` builds `viewAllHref` from three sources: `sort` → `/search?sort=<enum>`, `category` → `/category/<slug>` from the server-fetched category tree (fallback `/search?categoryId=<uuid>`), `manual` → `undefined`. Every component is either an enum value, a server-sourced slug, or a schema-validated uuid — none are free-text, so no external-origin or `javascript:`-scheme href can be constructed. Section `title` (admin free text) renders only as a React text node in both `ProductRail` and the eMart `<h2>`, so it is escaped and never flows into an href or `dangerouslySetInnerHTML`.

### Backward-compatible defaults

`DEFAULT_SECTIONS` reproduces today's rails (`default-deals`/discount/12, `default-best-sellers`/popularity/10, `default-new-arrivals`/newest/10). Unconfigured flow: controller `sections: null` → `getSiteContent` `sections: null` (and `null` again in its `catch`) → `getHomeSections(null)` → `sanitizeHomeSections` returns `null` → `DEFAULT_SECTIONS` → enabled-filtered → resolved. The eMart "Best Seller" mislabel (previously `sort=newest`) is corrected because the default uses `popularity`.

The empty-array quirk lives here: a saved `[]` is a valid `homeSectionsSchema` value, but sanitizes to `null` on read and restores defaults. This is self-consistent with the design (to show no rails, disable all sections rather than delete them) but is a UX surprise worth a hint in the editor. Low severity, documented in design-review Finding 2.

### Both themes consume one config without chrome regression

Classic `page.tsx` resolves sections in the same `Promise.all` as the per-category `byCategory` fetches, renders them as a contiguous `ProductRail` group after the hero and before the per-category rails, and keeps the hero carousel, per-category loop, and promo grid. The now-unused `deals`/`newArrivals` fetches were removed. eMart `emart-home.tsx` destructures `sections` from its existing `getSiteContent()` call and renders the resolved sections as `em-section` blocks between promos and Top Brands, keeping hero/banner slider, Shop-by-Category, promos, Top Brands, and Why Choose. Both keep `data-testid="home-page"` and use per-section `home-section-<id>` testids. `ProductRail` returns `null` on empty products, and the resolver already drops zero-product sections, so empty rails never show.

The duplicate `catalogueApi.categories()` call (once in the eMart body, once inside the resolver when a category section exists) and the `/settings/public` reads from `getTheme` + `getSiteContent` collapse via Next's per-render fetch memoization because each caller uses identical URL+options (`revalidate: 300` / `revalidate: 30`). No extra round-trips.

### Admin write path and RBAC

`PUT /admin/settings` is `@Roles('super_admin')` with `settingSchema = { key: 1..80, value: z.unknown() }`; `home.sections` (13 chars) fits the key limit. The editor validates with `homeSectionsSchema.safeParse` before PUT, blocks save on failure with the first zod issue surfaced inline, and sends `parsed.data` (defaults applied, unknown fields stripped). Seeding (`seedSections`) re-parses stored entries per element so partial/older configs normalize. A manual section with zero picks fails `.min(1)` and blocks save with a visible hint. An out-of-band-written >24 array would block re-save (array `.max(24)`), an acceptable edge.

</details>

<details>
<summary>Files changed</summary>

- `packages/shared/src/schemas.ts` — `HOME_SECTION_SORTS`, `homeSectionSourceSchema`/`homeSectionSchema`/`homeSectionsSchema` + types; `productQuerySchema.ids`.
- `packages/shared/src/schemas.test.ts` — home-section + `ids` cases.
- `apps/api/src/modules/catalogue/product.service.ts` — early `ids` branch in `list()`.
- `apps/api/src/modules/catalogue/product.service.spec.ts` — ids-branch specs.
- `apps/api/src/modules/admin/public-settings.controller.ts` — `sections` read + per-section sanitize + response field.
- `apps/api/src/modules/admin/public-settings.controller.spec.ts` — sanitize specs.
- `apps/web/src/lib/site-content.ts` — `sections` on `RawPublicSettings` + `SiteContent`.
- `apps/web/src/lib/home-sections.ts` — `DEFAULT_SECTIONS`, `sanitizeHomeSections`, `getHomeSections`, `resolveHomeSections`.
- `apps/web/src/app/(shop)/page.tsx` — classic renders configured sections.
- `apps/web/src/components/emart-home.tsx` — eMart renders configured sections.
- `apps/web/src/app/admin/settings/home-sections-editor.tsx` (new) + `page.tsx` — admin CRUD/reorder/rename/manual-pick UI.

Full diff: `git diff 0aed692~1 0aed692`.

</details>
