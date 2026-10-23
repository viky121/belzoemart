# Implementation Plan — Theme-wise admin-managed home-page content

Source of truth: `.agents/tasks/theme-home-content/design.md` (COMPLETE, authoritative — do
not redesign). This plan sequences that design against the real codebase. Repo is a pnpm
monorepo; work directly in `c:\xampp\htdocs\Belzo` (NO worktree).

## Decisions made while planning (do not re-litigate)

- **No worktree / single cohesive change.** The work is one tightly-coupled feature (shared
  Zod schema is the foundation the API, web types, both renderers, and the editor all depend
  on), so it is implemented as one ordered sequence, not split into separable features.
- **Test runners discovered:** `packages/shared` and `apps/api` both use **jest + ts-jest**
  (`testEnvironment: node`, `testMatch: **/*.test.ts` for shared, `*.spec.ts` for api).
  **`apps/web` has NO test runner today** (no `test` script, no jest/vitest config). The
  design's "Unit (web)" tests for `mergeHome`/`getSiteContent` therefore require adding a
  minimal jest config to `apps/web`. This is done as a late, isolated step (item 11) so the
  core feature is already complete and buildable before test tooling is introduced. This is
  the only way to satisfy the brief's hard requirement to "add specs for … per-theme defaults
  logic", which lives in `apps/web/src/lib/site-content.ts`.
- **Shared tests go in the existing `packages/shared/src/schemas.test.ts`** (append; do not
  create a parallel file) to match the existing one-file-per-module convention.
- **API tests extend the existing `apps/api/src/modules/admin/public-settings.controller.spec.ts`**
  using its fake-`SettingsService` pattern.

---

- [ ] 1. Add the shared schemas + sanitize helpers to `packages/shared/src/schemas.ts`.
      In a new block after the existing "Home sections" block, add exactly what the design's
      "Data model" and "Public read / sanitize contract" sections specify: `safeHrefSchema`
      (trim/max(2048)/transform app-path-or-http(s)-else-`#`/`.catch('#')`), `PROMO_COLORS`
      (`['green','blue','amber','pink']`), `heroContentSchema`, `promoContentSchema`,
      `whyItemSchema`, `homeBlockCardSchema` (no `id`), `homeBlockSchema` (discriminatedUnion
      on `type` of `banner`|`cards`, each with required `id: z.string().min(1).max(64)`),
      `homeContentSchema` (hero default, promos ≤12, why ≤12, blocks ≤10), and the inferred
      type exports (`HomeContent`, `HeroContent`, `PromoContent`, `WhyItem`, `HomeBlock`).
      Then add the reusable `sanitizeHomeContent(value): Partial<HomeContent> | null` and its
      helpers: a `keepValid(arr, schema)` that maps `safeParse` and keeps successes (with zod
      defaults applied), and `sanitizeHero(value)` built from a `heroFieldSchemas` map derived
      from `heroContentSchema.shape` that parses each PRESENT hero field in isolation (keep
      valid, drop invalid, absent → let default apply). Apply caps via `.slice(0, 12/12/10)`.
      `index.ts` already re-exports `./schemas`, so no change there.
      Files: `packages/shared/src/schemas.ts`
      Verify: `pnpm --filter @belzo/shared typecheck` passes (no new errors).

- [ ] 2. Add unit tests for the new shared schemas + sanitize to `packages/shared/src/schemas.test.ts`.
      Append `describe` blocks mirroring the existing "home sections" example-based style.
      Cover (per design "Testability"): `safeHrefSchema` keeps `/x` and `https://x`, collapses
      `//evil`, `javascript:…`, `data:…`, and junk to `#`; `promoContentSchema`/`homeBlockSchema`
      defaults applied and bad entries rejected (missing `title`, missing block `id`, unknown
      `type`); `sanitizeHomeContent` returns `null` for junk/non-object, returns a partial that
      drops malformed promos/why/blocks, degrades bad hrefs to `#`, enforces the caps (feed 15
      promos → ≤12; 11 blocks → ≤10); `sanitizeHero` keeps valid present fields and drops only
      an individually-invalid field while keeping the rest.
      Files: `packages/shared/src/schemas.test.ts`
      Verify: `pnpm --filter @belzo/shared test` — all tests (existing + new) pass.

- [ ] 3. Make the public settings read theme-aware in `apps/api/src/modules/admin/public-settings.controller.ts`.
      Import `sanitizeHomeContent` from `@belzo/shared`. In `publicSettings()`, read both home
      keys plus theme in the existing `Promise.all` (`home_content`, `home_content.classic`,
      `theme`, `footer_content`, `home.sections`). Compute `active` from `theme` whitelisted by
      `THEMES` (default `classic`), pick `rawHome = active === 'emart' ? emartHome : classicHome`,
      and return `home: sanitizeHomeContent(rawHome)` (may be `null`). Keep the existing
      `home.sections` inline sanitize and `footer`/`theme` handling exactly as-is. Update the
      method's return type `home: unknown` stays `unknown` (sanitized partial or null).
      Files: `apps/api/src/modules/admin/public-settings.controller.ts`
      Verify: `pnpm --filter @belzo/api typecheck` passes.

- [ ] 4. Extend the API controller spec in `apps/api/src/modules/admin/public-settings.controller.spec.ts`.
      Using the existing fake-`SettingsService` `build()` helper (generalize it to answer
      multiple keys: `theme`, `home_content`, `home_content.classic`), add a `describe` block
      for the theme-aware home: returns the eMart home (sanitized) when `theme='emart'`, the
      classic home when `theme='classic'`, `null` when the active theme's key is unset, and a
      planted bad `href` is degraded to `#` while a malformed promo entry is dropped. Keep the
      existing `home.sections` tests untouched.
      Files: `apps/api/src/modules/admin/public-settings.controller.spec.ts`
      Verify: `pnpm --filter @belzo/api test` — the public-settings spec passes.

- [ ] 5. Rework `apps/web/src/lib/site-content.ts` to shared types + per-theme defaults + theme-aware merge.
      Replace the hand-written `HeroContent`/`PromoContent`/`WhyItem`/`HomeContent` interfaces
      with `import type { HomeContent, HeroContent, PromoContent, WhyItem, HomeBlock } from '@belzo/shared'`
      (keep `ThemeName`, `FooterContent`, `SiteContent` local). Rename the current `DEFAULT_HOME`
      to `DEFAULT_HOME_EMART` and add `blocks: []`. Add `DEFAULT_HOME_CLASSIC` with classic hero
      copy, `why: []`, `blocks: []`, and the exact 4 promo tiles from the design (Top Electronics
      /blue, Fashion Fiesta/pink, Daily Grocery/green, Artisan Handicrafts/amber — matching
      today's hardcoded classic grid in `page.tsx`). Change `mergeHome` to
      `mergeHome(theme: ThemeName, stored?: Partial<HomeContent> | null)` selecting
      `DEFAULTS[theme]`, merging hero spread, promos/why fall back to defaults when empty,
      `blocks: stored.blocks ?? d.blocks`. Update `getSiteContent()` to derive `theme` once and
      call `mergeHome(theme, s.home)`; the catch path returns `DEFAULT_HOME_CLASSIC`. Add
      `HomeBlock` to the `RawPublicSettings.home` type usage as needed. **Export `mergeHome`,
      `DEFAULT_HOME_EMART`, and `DEFAULT_HOME_CLASSIC`** so item 11 can unit-test them. Keep a
      `DEFAULT_HOME` alias export (`= DEFAULT_HOME_EMART`) if any importer still references it,
      then update importers (next item handles the editor).
      Files: `apps/web/src/lib/site-content.ts`
      Verify: `pnpm --filter @belzo/web typecheck` (expect transient errors only in files
      updated by items 6/7/10 that this item’s type changes touch; those are fixed there).

- [ ] 6. Render custom blocks in the eMart home `apps/web/src/components/emart-home.tsx`.
      Re-key the existing promos map from `key={p.title}` to `key={i}` (array index). Add a
      custom-blocks section rendered **immediately after `.em-promos` and before the
      `resolvedSections` product rails**: `home.blocks.filter(b => b.enabled !== false).map((b, i) => …)`
      keyed by index. A `banner` → `.em-block.em-block--banner` with the image rendered ONLY
      when `isUsableImageUrl(b.imageUrl) && b.imageUrl !== '#'` (import `isUsableImageUrl` from
      `@/lib/category-theme`), title, text, and a CTA pill (reusing `.em-promo__cta`) ONLY when
      `b.ctaText.trim() !== ''` (link to `b.ctaHref`). A `cards` → `.em-block__head` title +
      `.em-block__cards` grid of `.em-cardlet` (icon/title/subtitle/link) keyed by card array
      index, each card’s optional `href`/`icon` guarded the same way. Do NOT copy the hero’s
      unconditional `<img>`. Leave hero/promos/why otherwise unchanged.
      Files: `apps/web/src/components/emart-home.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` passes for this file.

- [ ] 7. Consume managed promos + render blocks in classic home `apps/web/src/app/(shop)/page.tsx`.
      Read `home` (not just `sections`) from `getSiteContent()`. Replace the hardcoded 4-tile
      `<section className="promo-grid" data-testid="home-promos">` with
      `home.promos.map((p, i) => <Link key={i} className="promo-tile" style={{ background: CLASSIC_PROMO_GRADIENT[p.color] }} href={p.href}>…</Link>)`,
      keeping the `.promo-grid` wrapper + `data-testid="home-promos"` and the existing tile markup
      (`<div><h3>{p.title}</h3><p>{p.subtitle}</p></div><span>{p.cta} →</span>`). Add the
      `CLASSIC_PROMO_GRADIENT: Record<PromoContent['color'], string>` map from the design
      (blue/pink/green/amber gradients). Add a custom-blocks section **immediately after the
      `.promo-grid` section**, rendering `home.blocks.filter(b => b.enabled !== false)` in classic
      style (`.home__section` + `.home-block` / reuse `.promo-tile` for `cards`), keyed by array
      index, with the SAME optional-element guards as item 6 (image only when
      `isUsableImageUrl && !== '#'`, CTA only when `ctaText.trim() !== ''`). Import
      `PromoContent` type and `isUsableImageUrl` as needed. Classic has no `why` section — do not
      add one.
      Files: `apps/web/src/app/(shop)/page.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` passes for this file.

- [ ] 8. Add CSS for custom blocks in `apps/web/src/app/globals.css`.
      Next to the existing `.em-*` rules (~line 3330) add `.em-block`, `.em-block--banner`,
      `.em-block__img`, `.em-block__head`, `.em-block__cards`, `.em-cardlet` styles consistent
      with the eMart look. Next to the classic `.promo-grid`/`.home__section` rules (~line 680)
      add `.home-block` styles for the classic custom-blocks section. Plain CSS only; no new
      design tokens required.
      Files: `apps/web/src/app/globals.css`
      Verify: `pnpm --filter @belzo/web build` compiles CSS without error (run after item 10 to
      avoid building against incomplete TSX).

- [ ] 9. Create the reusable drag-and-drop image uploader `apps/web/src/app/admin/settings/image-drop.tsx`.
      New `'use client'` component `ImageDrop` wrapping `adminUpload(file, 'banners')` from
      `@/lib/admin-api`. Props: `value: string`, `onChange: (url: string) => void`, optional
      `label`. Supports drag-drop AND click-to-browse (hidden `<input type="file" accept="image/*">`
      fallback for accessibility), shows an uploading state, accepts image MIME types only
      (ignore non-images on drop), and on success calls `onChange(url)`. Surface
      `adminUpload`’s thrown error message and clear the uploading state in `finally`. Render a
      small preview `<img>` when `value` is a usable URL.
      Files: `apps/web/src/app/admin/settings/image-drop.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` passes for this file.

- [ ] 10. Rebuild the admin content editor `apps/web/src/app/admin/settings/content-editor.tsx` for both themes.
      Add a `selectedTheme` state (`'classic' | 'emart'`, segmented control at the top of the
      home card) with a hint that it selects which theme’s content is edited, independent of the
      live theme. Load BOTH keys up front from `/admin/settings` (seed each over its theme
      default: `home_content` → eMart, `home_content.classic` → classic), hold both in state, and
      swap the in-memory `home` when the selector changes (no refetch). Save with
      `const key = selectedTheme === 'emart' ? 'home_content' : 'home_content.classic'`.
      Import schemas/types from `@belzo/shared` (`PROMO_COLORS`, `homeContentSchema`, `HomeBlock`,
      `PromoContent`, `WhyItem`) and `DEFAULT_HOME_EMART`/`DEFAULT_HOME_CLASSIC` from
      `@/lib/site-content`. Extend promo colours to include `pink` (use `PROMO_COLORS`).
      Convert promos from fixed-3 to full CRUD: per-row delete (`✕`), up/down reorder (`↑`/`↓`
      via a `swap(i,j)` helper mirroring `home-sections-editor.tsx`), and `+ Add promo`
      (seed `{ title:'', subtitle:'', cta:'Shop Now', href:'/search', icon:'🛒', color:'green' }`).
      Add up/down reorder to the existing `why` CRUD. Add an "Extra blocks" subsection: `+ Add
      block` offering `banner`/`cards`, minting `id` via `crypto.randomUUID()` with the exact
      seeds from the design (banner: `{type:'banner',id,title:'',text:'',imageUrl:'',ctaText:'',ctaHref:'#',enabled:true}`;
      cards: `{type:'cards',id,title:'',cards:[],enabled:true}`; nested add-card:
      `{icon:'',title:'',subtitle:'',href:'#'}`), per-block enabled toggle + up/down/delete,
      `banner` using `<ImageDrop>` for its image, `cards` with a nested card list
      (add/delete/reorder, keyed by array index). Run `homeContentSchema.safeParse(home)` before
      save and surface the first issue (same guard as `home-sections-editor`). **Hide the Hero
      sub-form AND the "Why Choose" sub-form when `selectedTheme === 'classic'`**, each replaced
      by a short hint (e.g. "The hero/Why section is used by the eMart theme only."); hero/why
      data still round-trips through state/save. Keep `data-testid="save-home-content"`.
      Files: `apps/web/src/app/admin/settings/content-editor.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web build` both pass.

- [ ] 11. Add a minimal jest runner to `apps/web` and the per-theme defaults/merge unit tests.
      Add `apps/web/jest.config.js` mirroring `packages/shared/jest.config.js` (`preset: 'ts-jest'`,
      `testEnvironment: 'node'`, `roots: ['<rootDir>/src']`, `testMatch: ['**/*.test.ts']`) with a
      `moduleNameMapper` for `^@/(.*)$ → <rootDir>/src/$1` and `^@belzo/shared$ →
      <rootDir>/../../packages/shared/src/index.ts`. Add `"test": "jest"` and the devDeps
      (`jest@29.7.0`, `ts-jest@29.2.3`, `@types/jest@29.5.12`) to `apps/web/package.json`
      (versions pinned to match the other workspaces), then `pnpm install`. Add
      `apps/web/src/lib/site-content.test.ts`: unit-test `mergeHome` per theme (empty promos →
      theme defaults; `blocks: []` honored; partial hero merged over the theme default) and
      `DEFAULT_HOME_CLASSIC.promos` reproduces the exact 4 classic tiles; test `getSiteContent`’s
      catch path returns `DEFAULT_HOME_CLASSIC` by mocking `@/lib/api-client` (`jest.mock`) to
      throw. Keep the test node-only (no JSX/DOM) so ts-jest needs no browser env.
      Files: `apps/web/jest.config.js`, `apps/web/package.json`, `apps/web/src/lib/site-content.test.ts`
      Verify: `pnpm --filter @belzo/web test` — new tests pass.

- [ ] 12. Full backward-compatibility + regression verification (final gate).
      Sanity-check the hard requirements by inspection + build: with no `home_content.classic`
      stored, classic renders the exact 4 default tiles (item 5/7); with no `home_content`,
      eMart renders today’s hero/promos/why (item 5/6); `home.sections`, hero, footer,
      categories/brands, pincode gate, and profile prompt are untouched (no edits to those
      files). Then run the full workspace verification suite below.

---

## Verification commands (run from repo root `c:\xampp\htdocs\Belzo`)

```
pnpm --filter @belzo/shared test
pnpm --filter @belzo/api test
pnpm --filter @belzo/web test
pnpm typecheck
pnpm lint
pnpm build
```

All must pass with no new failures. `pnpm typecheck`, `pnpm lint`, and `pnpm build` run across
every workspace (`pnpm -r`); the three targeted `test` filters cover the shared schema +
sanitize specs, the API theme-aware public-read spec, and the web per-theme defaults/merge
specs respectively.
