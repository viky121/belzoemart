# Design — Theme-wise admin-managed home-page content

## Overview

Today the storefront home content model (`HomeContent = { hero, promos[], why[] }`)
lives in one shared settings key, `home_content`, and is wired to the eMart theme
only. The eMart home renders `home.promos`/`home.why`/`home.hero`; the classic home
ignores `home.promos` and hardcodes its own promo-tile grid. Promos are a fixed set
of 3 (edit-only), there is no way to add free-form detail blocks, and nothing is
theme-scoped.

This change makes home content **theme-scoped** (classic vs eMart edited and stored
independently), turns **promos into full add/edit/delete/reorder**, adds a generic
**custom-blocks** model (titled text/CTA/image banners and repeatable info-card
grids) that **both themes render in their own style**, and makes the **classic promo
grid consume the managed promos** so "theme-wise" is real for both themes. It is
strictly additive and backward compatible: with no new config, each theme renders
exactly as it does today, driven by the existing `home_content` for eMart.

The already-shipped product rails (`home.sections`) stay **shared across themes and
unchanged** (rationale in the last section). Hero, footer, categories, brands,
pincode/profile prompts are untouched.

## Technology stack (locked)

Same stack as the existing feature, no new dependencies:

- Shared validation: **Zod** schemas in `packages/shared/src/schemas.ts`, exported
  via `packages/shared/src/index.ts` (mirrors `homeSectionSchema`). Note the sections
  sanitizer is **not** a shared helper today — the controller sanitizes sections
  **inline** over `homeSectionSchema.safeParse`, and a separate `sanitizeHomeSections`
  lives in `apps/web/src/lib/home-sections.ts`. This design adds a **new reusable**
  `sanitizeHomeContent` to `packages/shared/src/schemas.ts` and imports it into the
  controller (the first shared sanitize helper of its kind).
- API: **NestJS** `SettingsService.get<T>/set` (Prisma `Setting` key/value + Redis
  cache), generic `PUT /admin/settings` (`super_admin`, `value: z.unknown()`),
  public read `GET /settings/public` with sanitize-on-read in
  `apps/api/src/modules/admin/public-settings.controller.ts`.
- Web: **Next.js (App Router) server components** for the two home pages, **React
  client component** for the admin editor; `adminFetch`/`adminUpload` helpers; CSS
  in `apps/web/src/app/globals.css`.

## Data model

### Theme-scoped storage keys

Two settings keys, one per theme. The legacy key is reused as the eMart content so
there is **zero migration** and existing stores keep working:

| Key                      | Theme   | Notes                                                        |
| ------------------------ | ------- | ------------------------------------------------------------ |
| `home_content`           | eMart   | **Existing key, unchanged.** Still drives the eMart home.    |
| `home_content.classic`   | classic | **New key.** Unset on existing stores → classic defaults.    |

Rationale for two keys over a single `{ byTheme: { emart, classic } }` object: the
legacy `home_content` already *is* the eMart object, so keeping it as-is means no
data migration, no read-time reshaping, and the existing editor save path keeps
working. A single combined object would force a migration of every live store's
`home_content`. Footer (`footer_content`) and theme (`theme`) stay single shared
keys — the user asked for *home-page* content to be theme-wise, not footer.

### HomeContent schema (extended)

`HomeContent` gains a `blocks[]` array; `promos[]` becomes CRUD-managed (still an
array, no shape change). Canonical Zod schemas move to `packages/shared` so the API
can sanitize on read (mirroring home sections); `apps/web/src/lib/site-content.ts`
imports the inferred types instead of hand-declaring them.

```ts
// packages/shared/src/schemas.ts  (new block, after home sections)

/** App path ("/x", not "//") or absolute http(s) URL → anything else becomes "#".
 *  Never throws, so a bad link degrades one field instead of dropping the block. */
export const safeHrefSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((s) => (/^https?:\/\//i.test(s) || (s.startsWith('/') && !s.startsWith('//')) ? s : '#'))
  .catch('#');

export const PROMO_COLORS = ['green', 'blue', 'amber', 'pink'] as const;

export const heroContentSchema = z.object({
  eyebrow: z.string().trim().max(120).default(''),
  line1: z.string().trim().max(120).default(''),
  line2: z.string().trim().max(120).default(''),
  accent: z.string().trim().max(120).default(''),
  subtitle: z.string().trim().max(400).default(''),
  ctaText: z.string().trim().max(60).default('Shop Now'),
  ctaHref: safeHrefSchema.default('/search'),
  imageUrl: safeHrefSchema.default(''),
});

export const promoContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(160).default(''),
  cta: z.string().trim().max(60).default('Shop Now'),
  href: safeHrefSchema.default('/search'),
  icon: z.string().trim().max(8).default('🛒'),   // single emoji/char
  color: z.enum(PROMO_COLORS).default('green'),
});

export const whyItemSchema = z.object({
  icon: z.string().trim().max(8).default('⭐'),
  title: z.string().trim().min(1).max(80),
  sub: z.string().trim().max(120).default(''),
});

/** Repeatable info card inside a 'cards' block. */
export const homeBlockCardSchema = z.object({
  icon: z.string().trim().max(8).default(''),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).default(''),
  href: safeHrefSchema.default('#'),
});

/** Generic admin-added detail block. Discriminated on `type`.
 *  'banner' = titled text + optional image + optional CTA.
 *  'cards'  = titled grid of up to 12 info cards. */
export const homeBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('banner'),
    id: z.string().min(1).max(64),
    title: z.string().trim().max(120).default(''),
    text: z.string().trim().max(600).default(''),
    imageUrl: safeHrefSchema.default(''),
    ctaText: z.string().trim().max(60).default(''),
    ctaHref: safeHrefSchema.default('#'),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('cards'),
    id: z.string().min(1).max(64),
    title: z.string().trim().max(120).default(''),
    cards: z.array(homeBlockCardSchema).max(12).default([]),
    enabled: z.boolean().default(true),
  }),
]);
export type HomeBlock = z.infer<typeof homeBlockSchema>;

export const homeContentSchema = z.object({
  hero: heroContentSchema.default(heroContentSchema.parse({})),
  promos: z.array(promoContentSchema).max(12).default([]),
  why: z.array(whyItemSchema).max(12).default([]),
  blocks: z.array(homeBlockSchema).max(10).default([]),
});
export type HomeContent = z.infer<typeof homeContentSchema>;
export type HeroContent = z.infer<typeof heroContentSchema>;
export type PromoContent = z.infer<typeof promoContentSchema>;
export type WhyItem = z.infer<typeof whyItemSchema>;
```

Caps (`promos ≤ 12`, `why ≤ 12`, `blocks ≤ 10`, `cards ≤ 12`) bound payload size and
match the home-sections precedent (`≤ 24`). No raw HTML anywhere — all fields are
plain text and rendered as text; all links go through `safeHrefSchema`.

`apps/web/src/lib/site-content.ts` replaces its hand-written `HeroContent`,
`PromoContent`, `WhyItem`, `HomeContent` interfaces with
`import type { ... } from '@belzo/shared'` and adds `HomeBlock`. The existing
`ThemeName`, `FooterContent`, `SiteContent` stay in web.

### Defaults (backward compatibility, no empty home)

`site-content.ts` keeps one default per theme:

- `DEFAULT_HOME_EMART` = the current `DEFAULT_HOME` (hero + 3 promos + 5 why), plus
  `blocks: []`. Drives the eMart home when `home_content` is unset.
- `DEFAULT_HOME_CLASSIC` = classic hero defaults (can reuse eMart hero copy; classic
  home does not render the hero fields today, so hero is informational there) + the
  **4 promos that reproduce today's hardcoded classic tiles** + `why: []` +
  `blocks: []`:

```ts
promos: [
  { title: 'Top Electronics',       subtitle: 'Earbuds, chargers & more', cta: 'Grab now',  href: '/category/electronics', icon: '📱', color: 'blue'  },
  { title: 'Fashion Fiesta',        subtitle: 'Trending apparel picks',   cta: 'Explore',   href: '/category/apparel',     icon: '👗', color: 'pink'  },
  { title: 'Daily Grocery',         subtitle: 'Stock up & save',          cta: 'Shop',      href: '/category/grocery',     icon: '🛒', color: 'green' },
  { title: 'Artisan Handicrafts',   subtitle: 'Handmade, Made in India',  cta: 'Discover',  href: '/category/handicraft',  icon: '🎨', color: 'amber' },
]
```

So an unconfigured classic store renders the identical 4 tiles it shows today.

## Public read / sanitize contract

`GET /settings/public` becomes **theme-aware for home content**: it returns the home
object for the *active* theme only (the web only ever needs one), already sanitized.

```ts
// public-settings.controller.ts
const [theme, emartHome, classicHome, footer, sections] = await Promise.all([
  this.settings.get<string>('theme'),
  this.settings.get<unknown>('home_content'),
  this.settings.get<unknown>('home_content.classic'),
  this.settings.get<object>('footer_content'),
  this.settings.get<unknown>('home.sections'),
]);
const active = theme && THEMES.includes(theme) ? theme : 'classic';
const rawHome = active === 'emart' ? emartHome : classicHome;
return {
  theme: active,
  home: sanitizeHomeContent(rawHome),   // null when nothing stored for this theme
  footer: footer ?? null,
  sections: /* unchanged home-sections sanitize */,
};
```

`sanitizeHomeContent` is a **new reusable helper added to
`packages/shared/src/schemas.ts`** (the first shared sanitize helper — sections are
sanitized inline in the controller today) and imported by the public controller. It
sanitizes **leniently and per-element**, returning a partial so the web can still
merge over defaults:

```ts
export function sanitizeHomeContent(value: unknown): Partial<HomeContent> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: Partial<HomeContent> = {};
  out.hero   = sanitizeHero(v.hero);                                   // per-field, see below
  out.promos = keepValid(v.promos, promoContentSchema).slice(0, 12);   // drop bad entries
  out.why    = keepValid(v.why,    whyItemSchema).slice(0, 12);
  out.blocks = keepValid(v.blocks, homeBlockSchema).slice(0, 10);
  return out;
}
// keepValid: Array.isArray? map safeParse → keep successes with zod defaults applied.
```

**Hero is sanitized field-by-field** (not all-or-nothing) so a single bad hero field
degrades only that field, matching the per-element leniency applied to
promos/why/blocks (addresses review Finding 4):

```ts
function sanitizeHero(value: unknown): Partial<HeroContent> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const out: Partial<HeroContent> = {};
  for (const [k, field] of Object.entries(heroFieldSchemas)) {        // one schema per hero key
    if (!(k in v)) continue;                                           // absent → let default apply
    const r = field.safeParse(v[k]);
    if (r.success) out[k as keyof HeroContent] = r.data as never;      // keep only valid present fields
  }
  return Object.keys(out).length ? out : undefined;
}
```

`heroFieldSchemas` is the per-key map derived from `heroContentSchema.shape`; each
present field is parsed in isolation, kept if valid, and dropped (falling back to the
default via `mergeHome`) if not. `safeHrefSchema` never throws, so link fields always
survive as `#` at worst rather than dropping the hero.

Design choices for sanitize behavior, each with a reason:

- **Unsafe `href` → `"#"`, block kept** (via `safeHrefSchema.catch('#')`). We degrade
  the one link rather than drop a whole promo/card, because dropping would silently
  change counts the operator configured. `javascript:`, `data:`, protocol-relative
  `//evil` and anything that is neither an app path nor http(s) all collapse to `#`.
- **Malformed array element → dropped** (e.g. a promo with no title). Matches the
  home-sections precedent and keeps the rest renderable.
- **Field over length cap → the element fails its schema and is dropped**; operators
  can't exceed caps through the UI, so this only guards hand-tampered payloads.
- **No raw HTML / scripts** — every field is a plain string rendered as text content
  (React escapes by default); images are URLs put through `safeHrefSchema`.

The web `getSiteContent()` then merges the sanitized partial over the theme default.
`mergeHome` gains a `theme` parameter, and `getSiteContent` passes the theme it has
already derived for `SiteContent.theme` (addresses review Finding 2 — the current
code calls `mergeHome(s.home)` with one argument, so the call site must be updated):

```ts
const DEFAULTS = { emart: DEFAULT_HOME_EMART, classic: DEFAULT_HOME_CLASSIC };
function mergeHome(theme: ThemeName, stored?: Partial<HomeContent> | null): HomeContent {
  const d = DEFAULTS[theme];
  if (!stored) return d;
  return {
    hero:   { ...d.hero, ...(stored.hero ?? {}) },
    promos: stored.promos && stored.promos.length > 0 ? stored.promos : d.promos,
    why:    stored.why    && stored.why.length    > 0 ? stored.why    : d.why,
    blocks: stored.blocks ?? d.blocks,   // blocks default to [], so [] is respected
  };
}

// updated getSiteContent() body — theme is derived once and reused for both
// SiteContent.theme and the mergeHome default selection:
export async function getSiteContent(): Promise<SiteContent> {
  try {
    const s = await apiFetch<RawPublicSettings>('/settings/public', { revalidate: 30 });
    const theme: ThemeName = s.theme === 'emart' ? 'emart' : 'classic';
    return {
      theme,
      home: mergeHome(theme, s.home),            // ← theme passed explicitly
      footer: { ...DEFAULT_FOOTER, ...(s.footer ?? {}) },
      sections: s.sections ?? null,
    };
  } catch {
    return { theme: 'classic', home: DEFAULT_HOME_CLASSIC, footer: DEFAULT_FOOTER, sections: null };
  }
}
```

**Empty-vs-default rule** (deliberate, documented): empty `promos`/`why` fall back to
the theme defaults — this satisfies the hard "no empty home" requirement and matches
today's behavior, with the trade-off that an operator cannot reduce promos/why to
zero (minimum one; delete controls disable below count 1). `blocks` default to `[]`,
so an empty blocks array is honored (operators are not forced to have custom blocks).

## Rendering

### eMart (`apps/web/src/components/emart-home.tsx`)

- **Promos**: already maps `home.promos` → `.em-promo` cards; the model now allows
  1–12 entries and the `pink` accent (CSS already defines `data-accent='pink'`). Grid
  is already `auto-fit`, so any count flows. **One required change (addresses review
  Finding 1): re-key the list by array index.** Today the renderer uses
  `key={p.title}`, which was safe only for the fixed 3 distinct-title promos; once
  promos are CRUD-managed (freshly added promos seed `title: ''`, and operators may
  create blank/duplicate titles) title keys collide and break React reconciliation.
  Change `promos.map((p) => <Link key={p.title} ...>)` to
  `promos.map((p, i) => <Link key={i} ...>)`. Index keys are correct here because the
  storefront render never reorders client-side (reorder happens only in the admin
  editor, which persists a new array order), and this matches how the editor already
  keys promos (`key={i}`). We deliberately do **not** add an `id` to
  `promoContentSchema` — the index key is the smaller, sufficient change and keeps the
  promo payload identical to today.
- **Custom blocks**: render `home.blocks.filter(b => b.enabled !== false)` **keyed by
  array index** (`blocks.map((b, i) => ... key={i})`; same index-key rationale as
  promos — `homeBlockSchema` has an `id`, but index keys keep the renderer uniform
  with promos/why and the storefront never reorders). **Exact insertion point
  (addresses review Finding 3): render the blocks section immediately after the
  `.em-promos` section and before the admin-managed product rails
  (`resolvedSections`)** — i.e. order becomes hero → categories → promos → custom
  blocks → product rails → brands → why. A `banner` block →
  `.em-block.em-block--banner` (optional `<img>`, title, text, optional CTA pill
  reusing `.em-promo__cta` styling). A `cards` block → `.em-block__head` title + an
  `.em-block__cards` grid of `.em-cardlet` (icon, title, subtitle, link). **Nested
  cards are keyed by array index** (`block.cards.map((c, i) => ... key={i})`) in both
  the renderer and the editor, the same convention as `why` items —
  `homeBlockCardSchema` deliberately has **no `id`** and none is minted, so the
  sanitize/round-trip contract is exactly the stored shape (addresses review Finding
  4). New CSS in `globals.css` next to the `.em-*` rules.

  **Optional-element render guards (explicit — addresses review Finding 1).** Because
  `safeHrefSchema` collapses an empty `imageUrl`/`ctaHref` to the truthy string `"#"`
  (not `""`), a naive `imageUrl && <img>` would render a broken `<img src="#">`. Treat
  both `""` and `"#"` as "absent". The banner image renders **only** when the URL is
  usable (reusing the existing `isUsableImageUrl` helper from
  `@/lib/category-theme`, which already backs category/hero images) **and** is not
  `"#"`; the CTA pill renders **only** when `ctaText.trim() !== ''`:

  ```tsx
  {isUsableImageUrl(block.imageUrl) && block.imageUrl !== '#' && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={block.imageUrl} alt="" className="em-block__img" />
  )}
  {block.ctaText.trim() !== '' && (
    <Link href={block.ctaHref} className="em-promo__cta">{block.ctaText} →</Link>
  )}
  ```

  Note: the existing eMart **hero** renders its `<img>` unconditionally — do **not**
  copy that pattern for blocks; the guard above is required so an image-less banner
  shows no broken image.
- **Why**: unchanged (eMart-only section).

### Classic (`apps/web/src/app/(shop)/page.tsx`)

- **Promos** — replace the hardcoded 4-tile `<section class="promo-grid">` with
  `home.promos.map(...)` into the existing `.promo-tile` markup, preserving the
  classic visual style by mapping `color → gradient`:

```ts
const CLASSIC_PROMO_GRADIENT: Record<PromoContent['color'], string> = {
  blue:  'linear-gradient(135deg, #396afc, #2948ff)',
  pink:  'linear-gradient(135deg, #f857a6, #ff5858)',
  green: 'linear-gradient(135deg, #11998e, #38ef7d)',
  amber: 'linear-gradient(135deg, #f7971e, #ffd200)',
};
// <Link class="promo-tile" style={{ background: CLASSIC_PROMO_GRADIENT[p.color] }}>
//   <div><h3>{p.title}</h3><p>{p.subtitle}</p></div><span>{p.cta} →</span>
```

  Keep the `data-testid="home-promos"` wrapper and `.promo-grid` class so existing
  tests/layout hold. **Key the mapped tiles by array index** (`home.promos.map((p, i)
  => <Link key={i} ...>)`) for the same reason as the eMart list — the new classic
  renderer must specify a key, and CRUD promos can have blank/duplicate titles
  (addresses review Finding 1). With no classic config, `DEFAULT_HOME_CLASSIC.promos`
  reproduce today's exact four tiles.
- **Custom blocks** — render `home.blocks.filter(b => b.enabled !== false)` **keyed by
  array index** in classic style (`.home__section` + `.home-block` / tiles reusing
  `.promo-tile` for `cards`), so blocks are real in both themes. **Exact insertion
  point (addresses review Finding 3): render the blocks section immediately after the
  `.promo-grid` section** (i.e. classic order becomes hero carousel → product rails →
  per-category rails → promo grid → custom blocks). Nested `cards` entries are keyed
  by array index, matching the eMart renderer (no card `id` minted — Finding 4). The
  **same optional-element guards apply**: the
  banner image renders only when `isUsableImageUrl(block.imageUrl) && block.imageUrl
  !== '#'`, and the CTA renders only when `block.ctaText.trim() !== ''` (identical rule
  to eMart — no broken `<img src="#">`, no empty-label CTA). `cards` entries render
  their own optional `icon`/`href` the same way.
- **Why** — classic has no "why" section today and we do not invent one. An operator
  who wants a why-style strip on classic uses a `cards` block (rendered by both
  themes). Documented so the asymmetry is intentional, not a gap.
- `page.tsx` must now read `home` (not just `sections`) from `getSiteContent()`.

## Admin editor UX (`content-editor.tsx`)

A **theme selector** (segmented control: `Classic | eMart`) is added at the top of
the home card. It selects *which theme's content you are editing* — independent of
which theme is live (a hint clarifies this). Both keys are loaded up front from
`/admin/settings` (`getAll` returns everything), seeded over the matching theme
default; switching the selector swaps the in-memory `home` state to that theme's copy
without a refetch. Save writes to the key for the selected theme:

```ts
const key = selectedTheme === 'emart' ? 'home_content' : 'home_content.classic';
save(key, home, 'Home content');
```

**Hero sub-section is eMart-only (addresses review Finding 5).** The classic home
renders a `HeroCarousel` from banners/fallback slides and never reads `home.hero`, so
editing hero while the selector is on Classic would silently do nothing. When
`selectedTheme === 'classic'` the editor **hides the Hero sub-form** and shows a small
hint in its place: *"The hero is used by the eMart theme only."* Hero fields reappear
when the selector is set to eMart. (Hero data for classic still round-trips through
state/save unchanged — it is simply not editable there.)

Per-theme CRUD, mirroring the existing "Why Choose" `wiz__addvar`/`wiz__vdel` pattern
already in this file. **Up/down reorder is an intentional extension** beyond the
literal request (message #12 asks add/edit/delete/rename): it is low-risk, reuses the
`home-sections-editor` `swap(i, j)` helper, and gives the operator control over block
order. It is a net-positive addition, not a hard requirement — it may be dropped
without affecting the core ask.

- **Promos** — change the fixed 3-row block to full CRUD: per-row delete (`✕`),
  up/down reorder (`↑`/`↓`, swap like `home-sections-editor`), and a `+ Add promo`
  button (seeds `{ title:'', subtitle:'', cta:'Shop Now', href:'/search', icon:'🛒',
  color:'green' }`). Keep the existing title/subtitle/cta/href/icon/color fields;
  extend `PROMO_COLORS` to include `pink` (eMart CSS already supports it).
- **Why** — already full CRUD; add up/down reorder for parity.
- **Custom blocks** — a new "Extra blocks" subsection. `+ Add block` offers a type
  (`banner` / `cards`). Each block row: enabled toggle, up/down/delete, title field;
  `banner` adds text, CTA text/href, and an **image drag-and-drop dropzone**;
  `cards` adds a nested card list with its own add/delete/reorder, **keyed by array
  index** (icon/title/subtitle/href per card; no card `id` — same index-key convention
  as `why` items in both the editor and the renderer, Finding 4). Client-side
  `homeContentSchema.safeParse` before save
  (same guard as `home-sections-editor`), surfacing the first issue.

  **Add-block / add-card seed objects (explicit — addresses review Finding 2).**
  `homeBlockSchema.id` is required with no `.default()`, and `type` is a required
  discriminator, so a block added without a minted `id` fails the pre-save
  `homeContentSchema.safeParse` and silently blocks every save. The `+ Add block`
  handler **must mint an `id` with `crypto.randomUUID()`** exactly as
  `home-sections-editor`'s `add()` does. Full seeds:

  ```ts
  // + Add block → banner
  { type: 'banner', id: crypto.randomUUID(), title: '', text: '',
    imageUrl: '', ctaText: '', ctaHref: '#', enabled: true }

  // + Add block → cards
  { type: 'cards', id: crypto.randomUUID(), title: '', cards: [], enabled: true }

  // + Add card (nested, inside a 'cards' block)
  { icon: '', title: '', subtitle: '', href: '#' }
  ```

  Note: `ctaHref`/`href`/`imageUrl` seed to `'#'`/`''`, which the render guards above
  treat as absent, so a freshly-added block renders with no broken image and no empty
  CTA until the operator fills it in. A `banner` with an empty `title` is still valid
  (its `title` is `.max(120).default('')`, not `.min(1)`), so an image-only banner is
  allowed; a `cards` card requires a non-empty `title` (`homeBlockCardSchema.title` is
  `.min(1)`), so the save guard flags a blank card title.

### Drag-and-drop image upload (user ask: "images drag and drop kar sakte hai")

A small reusable `ImageDrop` client component wraps the existing `adminUpload(file,
'banners')` helper (already used by the hero field and already compresses in-browser).
It accepts drag-drop **and** click-to-browse (fallback/accessibility), shows an
uploading state, and on success sets the field's `imageUrl` to the returned URL.
Used for `banner` block images; the hero image field can adopt it too (optional, no
behavior change). Only image MIME types accepted; non-images ignored.

## Error handling

| Operation | Failure | Handling |
| --- | --- | --- |
| `GET /settings/public` (web `getSiteContent`) | API down / throws | existing `try/catch` returns `{ theme:'classic', home: DEFAULT_HOME_CLASSIC, footer: DEFAULT_FOOTER, sections:null }` — home never empty. Recoverable, not logged (SSR). |
| Public read of a theme's home | key unset / not an object | `sanitizeHomeContent` returns `null` → web merges nothing → theme default renders. |
| Public read | stored has bad hrefs / junk entries | `safeHrefSchema` → `#`; invalid array entries dropped; counts capped. Silent sanitize, no throw. |
| Admin load `/admin/settings` | fetch throws | editor seeds both themes from defaults (existing `.catch(() => undefined)` pattern). |
| Admin save `PUT /admin/settings` | network / 4xx / 5xx | existing `save()` try/catch sets a user-visible "Could not save…" message; no partial state. |
| Admin save | client `safeParse` fails | block the request, show first zod issue (same as home-sections editor). Fatal for that save only. |
| `adminUpload` (drag-drop) | too large / network | helper already throws a readable message; dropzone shows it and clears uploading state. Recoverable. |
| Image URL 404 at render | broken `<img>` | browser shows nothing; non-fatal, not logged. |

The API `PUT` stays `value: z.unknown()` (generic settings endpoint) — validation of
home content is intentionally at **read time** (sanitize) plus **client-side**
pre-save, consistent with how `home.sections` works. No server schema change needed.

## Input validation summary

- `key` (PUT): existing `z.string().trim().min(1).max(80)` — unchanged; our two keys
  fit.
- `theme` selector value: constrained to `'classic' | 'emart'` in the UI; public read
  already whitelists via `THEMES`.
- Every home text field: trimmed, length-capped per schema above; required fields
  (`promo.title`, `whyItem.title`, `card.title`) `.min(1)` or the element is dropped.
- Every link field (`href`, `ctaHref`, `imageUrl`): `safeHrefSchema` — app path or
  http(s) only, else `#`.
- `color`: enum `green|blue|amber|pink`, default `green`.
- Array counts: promos/why ≤ 12, blocks ≤ 10, cards ≤ 12.

## Invariant ownership

- **"Home never renders empty"** — owned by the **web layer** (`mergeHome` + theme
  defaults + the `getSiteContent` catch). The API may legitimately return `null`/
  partial; the web guarantees a full renderable `HomeContent`.
- **Link/field safety (no XSS, no open redirect to junk schemes)** — owned by the
  **shared schema** (`safeHrefSchema`) enforced at **API read time** so even directly
  tampered settings rows are safe when served; the client editor uses the same schema
  as a first line.
- **Theme ↔ content binding** — owned by the **public controller** (serves the active
  theme's key) and the **editor** (writes the selected theme's key).

## Testability

- **Unit (shared, `schemas.test.ts` style)**: `safeHrefSchema` (app path kept,
  `//x`/`javascript:`/`data:` → `#`); `promoContentSchema`/`homeBlockSchema` defaults
  and drops; `sanitizeHomeContent` (null for junk, partial with bad entries dropped,
  hrefs degraded, caps enforced); `sanitizeHero` keeps valid present fields and drops
  only an individually-invalid field (per-field, not all-or-nothing).
- **Unit (web)**: `mergeHome` per theme (empty promos → defaults; `blocks: []`
  honored; partial hero merged); `getSiteContent` catch path returns classic default.
- **Integration (API)**: `GET /settings/public` returns the eMart home when
  `theme='emart'`, the classic home when `theme='classic'`, defaults (null) when the
  key is unset, and sanitizes a planted bad href.
- **E2E/component (admin)**: switch theme selector → fields reflect that theme; add/
  delete/reorder a promo and a block; save PUTs the right key; invalid state blocks
  save. Reuses existing `data-testid` conventions (`save-home-content`).

Everything here is pure functions (schemas, merge, sanitize) plus thin server/CSR
rendering, so the logic is unit-testable without a browser; only the drag-drop and
editor wiring need component/E2E coverage.

## Decision: should `home.sections` become theme-scoped?

**No — leave it shared**, documented here as required. Reasons: (1) it just shipped
and works identically for both themes with a single config, so splitting it risks
regressing a new feature; (2) the user's request is specifically about *home-page
detail content* (promos, hero/why, extra blocks), not the product rails; (3) making
it theme-scoped would need a second migration, a second editor instance, and a
theme-aware public read for sections too — not "cheap and non-regressing". If a real
need arises later, the same two-key pattern used here (`home.sections` +
`home.sections.classic`) applies cleanly.

## Files touched

- `packages/shared/src/schemas.ts` — add `safeHrefSchema`, `PROMO_COLORS`,
  `heroContentSchema`, `promoContentSchema`, `whyItemSchema`, `homeBlockCardSchema`,
  `homeBlockSchema`, `homeContentSchema`, `sanitizeHomeContent`, inferred types.
  (`index.ts` already re-exports `./schemas`.)
- `apps/api/src/modules/admin/public-settings.controller.ts` — read both home keys,
  serve the active theme's home via `sanitizeHomeContent`.
- `apps/web/src/lib/site-content.ts` — import shared types; add `HomeBlock`,
  `DEFAULT_HOME_EMART`/`DEFAULT_HOME_CLASSIC`, theme-aware `mergeHome`.
- `apps/web/src/components/emart-home.tsx` — render custom blocks; promos unchanged.
- `apps/web/src/app/(shop)/page.tsx` — consume managed promos + render blocks.
- `apps/web/src/app/admin/settings/content-editor.tsx` — theme selector; promos CRUD;
  blocks CRUD; dynamic save key.
- `apps/web/src/app/admin/settings/image-drop.tsx` — new reusable drag-drop uploader.
- `apps/web/src/app/globals.css` — `.em-block*` and classic `.home-block*` styles.
- Tests as listed under Testability.

## Assumptions

- The user's "theme-wise" means independent content per theme; both are editable from
  the one Settings screen via a selector (not two separate screens).
- Classic intentionally has no "why" section; parity is achieved via `cards` blocks.
- Footer and the live-theme choice remain global (not theme-scoped) — only home
  content is split, per the request wording.
- The category table in message #9 is seed/catalog data for the Categories admin, not
  home-content; it is out of scope for this home-content design.

## Responses to design review (revision pass)

Review verdict was CHANGES_REQUESTED (2 MEDIUM, several NIT). Every finding is
addressed below.

1. **MEDIUM — broken `<img src="#">` / undefined optional-element render.** *Addressed.*
   The Rendering sections now define explicit guards for both themes: the banner image
   renders only when `isUsableImageUrl(block.imageUrl) && block.imageUrl !== '#'`, and
   the CTA pill only when `block.ctaText.trim() !== ''`. Added an explicit warning not
   to copy the eMart hero's unconditional `<img>`. The same rule is stated for the
   classic renderer and for `cards` entries.

2. **MEDIUM — unspecified "+ Add block" seed; required `id` fails pre-save parse.**
   *Addressed.* The Admin editor UX section now enumerates the full `banner`, `cards`,
   and nested `card` seed objects and mandates minting `id` with `crypto.randomUUID()`
   (matching `home-sections-editor`), so a newly-added block passes
   `homeContentSchema.safeParse`.

3. **NIT — misstated `sanitizeHomeSections` location.** *Addressed.* The Technology
   stack and Public read sections now state that sections are sanitized **inline** in
   the controller today (with a separate `sanitizeHomeSections` in
   `apps/web/src/lib/home-sections.ts`), and that `sanitizeHomeContent` is the first
   reusable shared sanitize helper, added to `packages/shared/src/schemas.ts`.

4. **NIT — hero sanitize all-or-nothing vs. per-element claim.** *Addressed.* Replaced
   the single `heroContentSchema.partial().safeParse` with a `sanitizeHero` helper that
   parses each present hero field in isolation (`heroFieldSchemas` from
   `heroContentSchema.shape`), keeping valid fields and dropping only the invalid ones
   — consistent with the per-element handling of promos/why/blocks.

5. **NIT — classic exposes non-rendered Hero fields.** *Addressed.* The editor now
   hides the Hero sub-form when `selectedTheme === 'classic'` and shows a hint that the
   hero applies to the eMart theme only. Classic hero data still round-trips through
   state/save; it is simply not editable.

6. **NIT — reorder beyond the literal request.** *Addressed (kept, labelled).* Up/down
   reorder is now explicitly documented as an intentional, low-risk extension (not a
   hard requirement) that reuses the `home-sections-editor` `swap` helper.

## Responses to design review (second revision pass)

Second review verdict was CHANGES_REQUESTED (1 MEDIUM, 3 NIT). All four findings are
addressed above and summarized here.

1. **MEDIUM — promo list React keys collide once promos are CRUD-managed.**
   *Addressed.* The Rendering → eMart section now mandates re-keying the promo list
   from `key={p.title}` to `key={i}` (index), with the rationale that CRUD promos seed
   `title: ''` and may be blank/duplicate, and that the storefront never reorders
   client-side so index keys are stable. The Rendering → Classic section specifies the
   new mapped tiles use `key={i}` too. No `id` is added to `promoContentSchema`; index
   keys match the editor's existing `key={i}` convention. The prior "no change" claim
   is removed.

2. **NIT — `getSiteContent()` not shown passing theme to the new `mergeHome`.**
   *Addressed.* The Public read / sanitize contract section now includes the full
   updated `getSiteContent()` body: it derives `const theme = s.theme === 'emart' ?
   'emart' : 'classic'` once, reuses it for `SiteContent.theme`, and calls
   `mergeHome(theme, s.home)`. The catch path returns `DEFAULT_HOME_CLASSIC`.

3. **NIT — custom-block placement under-specified in both themes.** *Addressed.* The
   eMart renderer places the blocks section immediately after `.em-promos` and before
   `resolvedSections` (hero → categories → promos → blocks → product rails → brands →
   why). The classic renderer places blocks immediately after the `.promo-grid`
   section (hero → product rails → per-category rails → promo grid → blocks). Both
   insertion points are now named per file.

4. **NIT — nested cards lack a stable id; confirm index keys are intended.**
   *Addressed.* The design now states explicitly, in both renderers and the editor,
   that `cards` are keyed by array index (same convention as `why` items) and that
   `homeBlockCardSchema` has no `id` and none is minted — so the sanitize/round-trip
   contract is exactly the stored shape.
