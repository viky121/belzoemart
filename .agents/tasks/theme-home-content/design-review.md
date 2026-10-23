# Design Review — Theme-wise admin-managed home-page content

Reviewed: `.agents/tasks/theme-home-content/design.md`
Reviewer: fresh-eyes design review subagent (no prior authoring context)

## Scope of verification

I read the design against the actual source it depends on, rather than trusting its
claims:

- `packages/shared/src/schemas.ts` + `packages/shared/src/index.ts`
- `apps/api/src/modules/admin/public-settings.controller.ts`
- `apps/web/src/lib/site-content.ts`
- `apps/web/src/components/emart-home.tsx`
- `apps/web/src/app/(shop)/page.tsx`
- `apps/web/src/app/admin/settings/content-editor.tsx`
- `apps/web/src/app/admin/settings/home-sections-editor.tsx`
- `apps/web/src/lib/home-sections.ts`
- `apps/web/src/lib/category-theme.ts`
- `apps/web/src/lib/theme.ts`
- `apps/web/src/app/globals.css` (promo accent CSS)
- all `getSiteContent()` call sites

The design is strong and has already absorbed two prior review passes. The findings
below are the ones that survive a fresh read against the code.

---

## Findings

### 1. MEDIUM — Editor behavior for the "Why Choose" section on the Classic theme is unspecified (silent no-op), inconsistent with the Hero fix

**Where:** "Admin editor UX" section, and "Rendering → Classic → Why".

The design went out of its way (its own resolved Finding 5) to **hide the Hero
sub-form when `selectedTheme === 'classic'`**, with the rationale that "editing hero
while the selector is on Classic would silently do nothing" because the classic home
never reads `home.hero`. I verified this: `apps/web/src/app/(shop)/page.tsx` renders a
`HeroCarousel` and never reads `home.hero`, and it has **no "why" section at all** —
`home.why` is likewise never rendered on classic (only `emart-home.tsx` renders the
`em-why` block).

So `why` on classic has the **identical** silent-no-op property as `hero` on classic.
Yet the design hides only the Hero editor for classic and is **completely silent on
whether the "Why Choose" editor is shown or hidden for classic**. The rendering note
("classic has no 'why' section ... use a `cards` block") only addresses the storefront
render, not the editor. An implementer cannot derive the intended editor behavior and
will likely leave the Why editor visible, reproducing exactly the misleading UI the
design claims to have eliminated: an operator edits Why items for Classic, saves, and
nothing appears on the storefront.

**Fix (pick one, state it in the design):**
- Preferred, for parity with hero: when `selectedTheme === 'classic'`, hide the "Why
  Choose" sub-form and show a hint "Why items are used by the eMart theme only." Why
  data still round-trips through state/save, just not editable there — identical
  treatment to hero.
- Or explicitly document that the Why editor stays visible for classic and justify why
  that differs from the hero decision.

### 2. NIT — Nested-card sanitize is all-or-nothing within a block, contradicting the stated "per-element leniency" contract

**Where:** "Public read / sanitize contract" — `sanitizeHomeContent` uses
`keepValid(v.blocks, homeBlockSchema)`.

`homeBlockSchema` is a discriminated union whose `cards` variant embeds
`z.array(homeBlockCardSchema)`, and `homeBlockCardSchema.title` is `.min(1)`. Because
`keepValid` runs `homeBlockSchema.safeParse` over the **whole block**, a single invalid
nested card (e.g. a tampered empty `title`) fails the block parse and **drops the
entire `cards` block, including every valid card in it**. This is the same
all-or-nothing behavior the design explicitly rejected for hero (its resolved Finding
4 replaced hero's all-or-nothing parse with per-field `sanitizeHero`). The design's own
sanitize contract states it "sanitizes leniently and per-element," which nested cards
violate.

Blast radius is one block, and the editor's pre-save `safeParse` prevents operators
from creating this state through the UI, so this only affects hand-tampered payloads —
hence NIT, not MEDIUM.

**Fix:** either (a) sanitize `cards` per-element inside the block (map
`homeBlockCardSchema.safeParse` over the array, keep the valid ones) so one bad card
drops only that card, or (b) explicitly document that a `cards` block is dropped
wholesale if any nested card is invalid, acknowledging the intentional deviation from
per-element leniency for nested arrays.

### 3. NIT — Two-theme in-memory editor state shape and save/unsaved-edit semantics under-specified

**Where:** "Admin editor UX" — "Both keys are loaded up front ... switching the
selector swaps the in-memory `home` state to that theme's copy without a refetch."

Today `content-editor.tsx` holds a single `home` state and all setters
(`setHero`/`setPromo`/`setWhy`) mutate it. The design's behavior (edit both themes,
swap without refetch, save one key per theme) requires holding **both** themes'
content simultaneously, but the design does not name the state shape or how the setters
target the selected theme, nor does it state that switching themes keeps the other
theme's edits in memory but unsaved (each `save()` persists only the selected theme's
key).

**Fix:** specify a concrete shape, e.g.
`const [homes, setHomes] = useState<Record<ThemeName, HomeContent>>({ emart: ..., classic: ... })`,
have setters write `homes[selectedTheme]`, and note that `save(key, homes[selectedTheme], ...)`
persists only the active theme — the operator must save each theme separately; switching
without saving preserves edits in memory only.

### 4. NIT — Ambiguous which `PROMO_COLORS` gains `pink`

**Where:** "Admin editor UX → Promos" — "extend `PROMO_COLORS` to include `pink`."

There are two `PROMO_COLORS`: the new shared one in `schemas.ts` (already
`['green','blue','amber','pink']`) and a **local const in `content-editor.tsx`**,
which I verified is `['green', 'blue', 'amber']` — no `pink`. Since
`DEFAULT_HOME_CLASSIC` uses `color: 'pink'` for the "Fashion Fiesta" tile, the editor's
colour `<select>` must offer `pink`, or a pink promo renders with no matching
`<option>` (the control shows blank while state silently stays `pink`). The instruction
is ambiguous about which const.

**Fix:** state that `content-editor.tsx` should import `PROMO_COLORS` from
`@belzo/shared` (dropping its local 3-value array) so the dropdown and schema stay in
sync, including `pink`.

---

## Verified Assumptions (checked against source, correct)

1. **`home_content` drives eMart only today; classic hardcodes its promo grid.**
   Confirmed — `emart-home.tsx` maps `home.promos`/`home.why`/`home.hero`; classic
   `page.tsx` hardcodes four `.promo-tile` links and only destructures `sections` from
   `getSiteContent()`.
2. **No migration needed by reusing `home_content` as the eMart key.** Confirmed — the
   existing key already holds the eMart object; the new `home_content.classic` key is
   additive.
3. **`DEFAULT_HOME` is hero + 3 promos + 5 why.** Confirmed in `site-content.ts`.
4. **`site-content.ts` hand-declares `HeroContent`/`PromoContent`/`WhyItem`/`HomeContent`
   and `mergeHome(stored)` takes one arg; `getSiteContent` calls `mergeHome(s.home)`.**
   Confirmed — the design's Finding 2 (pass `theme` to `mergeHome`) is a real, needed
   change.
5. **Promo list is keyed `key={p.title}` in `emart-home.tsx`.** Confirmed — the re-key
   to `key={i}` is a real, needed change once promos are CRUD-managed.
6. **Sections are sanitized inline in the controller** over `homeSectionSchema.safeParse`,
   and a separate `sanitizeHomeSections` lives in `apps/web/src/lib/home-sections.ts`;
   there is no shared sanitize helper today. Confirmed — the design's "first shared
   sanitize helper" framing is accurate.
7. **`THEMES = ['classic', 'emart']` exists in the controller.** Confirmed.
8. **eMart CSS defines `.em-promo[data-accent='pink']` (and green/blue/amber).**
   Confirmed in `globals.css` lines ~3381–3388, so no new CSS is needed for the pink
   accent.
9. **`isUsableImageUrl` returns `!!url && !url.startsWith('/seed/')`.** Confirmed — it
   returns **true** for `'#'`, which is exactly why the design's extra
   `&& block.imageUrl !== '#'` guard is required; the guard is correct. `''` is already
   rejected by `!!url`.
10. **eMart hero renders its `<img>` unconditionally.** Confirmed — the design's warning
    not to copy that pattern for blocks is justified.
11. **`home-sections-editor.tsx` has a `swap(i, j)` helper and an `add()` that mints
    `id: crypto.randomUUID()`, with a pre-save `homeSectionsSchema.safeParse`.**
    Confirmed — the design's reuse references and the mandated `crypto.randomUUID()` for
    `+ Add block` are grounded in real precedent.
12. **`content-editor.tsx` loads everything via `adminFetch('/admin/settings')` (getAll),
    uses the `wiz__addvar`/`wiz__vdel` Why-CRUD pattern, and `adminUpload(file, 'banners')`
    returns `{ url }`.** Confirmed.
13. **eMart section order is hero → categories → promos → sections → brands → why; classic
    order is hero carousel → sections → per-category rails → promo grid.** Confirmed —
    the design's named insertion points are consistent with the current order.
14. **`getSiteContent` callers:** `(shop)/layout.tsx` (theme + footer only), classic
    `page.tsx` (sections, will add home), `emart-home.tsx` (home + sections). Confirmed —
    making `home` theme-aware does not break the footer/layout consumer.
15. **`getTheme()` and the public controller both derive the active theme from the same
    `/settings/public` `theme` field.** Confirmed — the rendered theme and the controller's
    returned `home` theme are always consistent, so there is no theme/content mismatch.
16. **`index.ts` re-exports `./schemas`.** Confirmed — new shared exports will be reachable
    as `@belzo/shared`.
17. **Does not regress the just-shipped home-sections feature.** Confirmed — the design
    keeps the inline sections sanitize in the controller, leaves `home-sections.ts`
    untouched, and both renderers still render `resolvedSections`; blocks are inserted
    adjacent to, not in place of, the product rails.

## Unverified / Wrong Assumptions

None of the design's factual claims about the codebase were found to be wrong. The
blocking item (Finding 1) is a **gap/omission** (editor behavior for Why+classic left
unspecified), not a wrong assumption. One minor imprecision: the "Technology stack"
line describing the current public read as having "sanitize-on-read" is only true for
`sections` today — `home_content` is currently returned raw (`home ?? null`), and this
design is what first adds `home` sanitize-on-read. This does not change any finding and
the design's data-flow sections describe it correctly.

---

## Verdict

1 MEDIUM finding (Finding 1) → **CHANGES_REQUESTED**.

Resolve Finding 1 (specify the Classic Why-editor behavior for parity with the Hero
decision). Findings 2–4 are NITs that are worth folding in while revising but do not by
themselves block.
