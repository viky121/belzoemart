# Theme-wise admin-managed home content

The change makes storefront home content theme-scoped (eMart under the legacy `home_content`, classic under the new `home_content.classic`), turns promos into full CRUD/reorder, and adds a generic custom-blocks model (`banner` + `cards`) that both themes render in their own style. Canonical Zod schemas plus a reusable `sanitizeHomeContent` move into `@belzo/shared`; the public settings read becomes theme-aware and sanitizes on read; the admin editor gains a theme selector, per-theme promo/block CRUD, and a drag-and-drop uploader. It is strictly additive — with no new config each theme renders exactly as today.

Watch for: nothing blocking. One cosmetic nit — `cards` entries always render as a `<Link>` even when `href` is the default `"#"` (icon is guarded, href is not); this is inert, not broken (possible).

**Verdict**: APPROVED

## High-level view

Backward compatibility holds. `DEFAULT_HOME_EMART` is the old `DEFAULT_HOME` plus `blocks: []`, and `DEFAULT_HOME_CLASSIC` carries the exact four hardcoded classic tiles, empty `why`, empty `blocks`. `mergeHome(theme, stored)` falls back to theme defaults when promos/why are empty and honors an explicit empty `blocks`, so no theme ever renders empty; the `getSiteContent` catch path returns the classic default. The legacy `home_content` key is reused unchanged for eMart, so existing stores need no migration.

Storage is two keys with per-theme defaults merged in the web layer. The API serves only the active theme's home, already sanitized, and may legitimately return `null`; the web owns the "never empty" invariant.

Sanitize-on-read is per-element and lenient. `safeHrefSchema` degrades unsafe/empty links to `"#"` without throwing, malformed array entries are dropped (per-card for `cards` blocks, so one bad card doesn't sink the block), hero is validated field-by-field, and caps (promos/why ≤ 12, blocks ≤ 10, cards ≤ 12) are enforced.

Both renderers place custom blocks exactly where the design specifies — eMart after `.em-promos` and before the resolved product rails, classic after `.promo-grid` — and both key promos, blocks, and nested cards by array index. No `id` was added to the promo or card schemas. Optional banner image renders only when `isUsableImageUrl(url) && url !== '#'`; the CTA renders only when `ctaText.trim() !== ''`. Classic promos map `color → gradient` and reuse the existing `.promo-tile` style.

The editor loads both theme keys up front, swaps in-memory on selector change, saves to the correct key, mints `crypto.randomUUID()` ids for new blocks, runs `homeContentSchema.safeParse` before save, and hides both the Hero and the Why-Choose sub-forms on classic (data still round-trips). Required specs were added in all three suites, and the commit records passing verification.

<details>
<summary>Issues (1)</summary>

1. **Unguarded card href** — `cards` entries always render as a `<Link href={c.href}>`; when the operator leaves the link empty it defaults to `"#"`, producing an inert link rather than a non-link. Cosmetic only; optional to guard. (possible)

</details>

<details>
<summary>Details</summary>

### Two-key storage, per-theme defaults, theme-aware read

`site-content.ts` renames `DEFAULT_HOME` → `DEFAULT_HOME_EMART` (adding `blocks: []`) and keeps a `DEFAULT_HOME = DEFAULT_HOME_EMART` alias for any stale importer; a grep confirms no caller still uses the old single-arg `mergeHome` or relies on the old name's shape. `DEFAULT_HOME_CLASSIC` reproduces the four hardcoded classic tiles verbatim (Top Electronics/blue, Fashion Fiesta/pink, Daily Grocery/green, Artisan Handicrafts/amber), and a spec asserts that exact array. `mergeHome(theme, stored)` selects `DEFAULTS[theme]`, falls back to default promos/why when the stored arrays are empty, and uses `stored.blocks ?? d.blocks` so an explicit `[]` is honored.

The public controller reads both home keys plus `theme` in the existing `Promise.all`, whitelists the active theme through `THEMES` (default `classic`), picks `rawHome = active === 'emart' ? emartHome : classicHome`, and returns `sanitizeHomeContent(rawHome)` (nullable). The `home.sections` inline sanitize and the footer/theme handling are untouched.

### Sanitize-on-read

`sanitizeHomeContent` returns `null` for a non-object, otherwise a partial with per-field hero (`sanitizeHero` keeps only valid present fields, dropping an individually over-length field while `safeHrefSchema` keeps link fields as `"#"` at worst), promos/why run through `keepValid` + `.slice(0, 12)`, and blocks through `sanitizeBlock` + `.slice(0, 10)`.

`sanitizeBlock` is a small, deliberate improvement over the design sketch: for a `cards` block it cleans the nested cards per-card first (`keepValid(...).slice(0, 12)`) and only then parses the block, so one malformed card is dropped while the block and its good cards survive — matching the task's "per-card sanitize keeps the rest" requirement. The shared spec exercises exactly this (`['Keep me', 'Keep me too']`), plus junk → `null`, bad promo drop, href degrade, and cap enforcement (15 → 12 promos, 11 → 10 blocks).

### Both renderers

eMart (`emart-home.tsx`): promo list re-keyed from `key={p.title}` to `key={i}`; `PROMO_BG` already covers `pink`. The custom-blocks section renders `home.blocks.filter(b => b.enabled !== false)` keyed by index, inserted immediately after `.em-promos` and before the resolved product rails. Banner image is guarded by `isUsableImageUrl(b.imageUrl) && b.imageUrl !== '#'`; the CTA pill reuses `.em-promo__cta` and renders only when `b.ctaText.trim() !== ''`. `isUsableImageUrl` was already imported. Cards map to `.em-cardlet` keyed by index with a guarded icon.

Classic (`(shop)/page.tsx`): the hardcoded four-tile block is replaced by `home.promos.map((p, i) => ...)` into the existing `.promo-tile` markup, preserving the `.promo-grid` wrapper and `data-testid="home-promos"`, with `CLASSIC_PROMO_GRADIENT[p.color]` supplying the gradient. The custom-blocks section renders immediately after `.promo-grid`, reusing `.promo-tile` for `cards`, with the same image/CTA guards. No `why` section is invented on classic.

In both renderers a `cards` entry is always a `<Link href={c.href}>`; since `homeBlockCardSchema.href` defaults to `"#"`, an operator who leaves the link blank gets an inert link rather than a plain tile. The icon is guarded in both; the href is not. This is cosmetic and non-blocking.

### Editor

`content-editor.tsx` adds a `selectedTheme` segmented control (`data-testid` on both tabs) with a hint that the selection is independent of the live theme. Both keys load up front, each seeded through `mergeHome` over its theme default, held in a `Record<ThemeName, HomeContent>` and swapped in memory on selector change (no refetch). Save picks `home_content` vs `home_content.classic` and runs `homeContentSchema.safeParse` first, surfacing the first issue. Promos get delete/up/down/add (seed matches the design); why gains reorder; the "Extra blocks" subsection adds banner/cards with `crypto.randomUUID()` ids and the exact design seeds, per-block enabled toggle + reorder + delete, nested card CRUD + reorder keyed by index, and `ImageDrop` for banner (and hero) images. Both the Hero and the Why-Choose sub-forms are hidden on classic with hints; their data still round-trips through state/save. `data-testid="save-home-content"` is preserved.

The `ImageDrop` component wraps `adminUpload(file, 'banners')`, supports drag-drop and click-to-browse via a hidden `accept="image/*"` input, ignores non-image MIME types, shows uploading/error state, and previews a usable `value`.

### Regression surface and specs

The diff touches only the listed files; `home.sections` resolution, the hero carousel/banners path, footer, categories/brands, the pincode gate, and the profile prompt are not edited. Required specs were added: shared `schemas.test.ts` (safeHref, promo/block defaults and rejections, `sanitizeHomeContent`, per-field hero), API `public-settings.controller.spec.ts` (theme-aware eMart/classic selection, null when unset, href degrade + malformed promo drop), and web `site-content.test.ts` (per-theme `mergeHome`, exact classic tiles, `getSiteContent` catch path) behind a new minimal jest config. The commit message records: shared 66/66, api typecheck+lint ok and 77/77, web typecheck+lint ok, 8/8, build ok. CSS for `.em-block*`, `.home-block*`, `.em-cardlet*`, and `.image-drop*` is present.

</details>

<details>
<summary>File map</summary>

- `packages/shared/src/schemas.ts` — new home-content schemas, `safeHrefSchema`, `PROMO_COLORS`, `sanitizeHomeContent` (+ `keepValid`/`sanitizeHero`/`sanitizeBlock`), inferred types.
- `packages/shared/src/schemas.test.ts` — specs for safeHref, promo/block schemas, `sanitizeHomeContent`, per-field hero.
- `apps/api/src/modules/admin/public-settings.controller.ts` — theme-aware home read + sanitize-on-read.
- `apps/api/src/modules/admin/public-settings.controller.spec.ts` — theme-aware home specs.
- `apps/web/src/lib/site-content.ts` — shared types, per-theme defaults, theme-aware `mergeHome`, catch returns classic default.
- `apps/web/src/lib/site-content.test.ts` — mergeHome / classic-tiles / catch-path specs.
- `apps/web/src/components/emart-home.tsx` — index-keyed promos, custom blocks after `.em-promos`.
- `apps/web/src/app/(shop)/page.tsx` — managed promos via gradient map, custom blocks after `.promo-grid`.
- `apps/web/src/app/admin/settings/content-editor.tsx` — theme selector, promo/block CRUD, hidden hero+why on classic.
- `apps/web/src/app/admin/settings/image-drop.tsx` — new drag-drop uploader.
- `apps/web/src/app/globals.css` — `.em-block*`, `.home-block*`, `.em-cardlet*`, `.image-drop*` styles.
- `apps/web/jest.config.js`, `apps/web/package.json`, `pnpm-lock.yaml` — minimal web jest runner.

Full diff: `git show 0168179`.

</details>
