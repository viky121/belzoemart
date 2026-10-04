# Implementation Plan — Mandatory Delivery PIN-code Serviceability Gate

## Verification (iteration 1 — results)
Ran from repo root `c:\xampp\htdocs\Belzo` (pnpm). All passed:
- `pnpm --filter @belzo/web typecheck` → exit 0 (tsc --noEmit, no errors).
- `pnpm --filter @belzo/web lint` → exit 0 (only pre-existing `@next/next/no-img-element` warnings in reviews-panel.tsx, admin/reviews, header-search.tsx; none in the new/edited files).
- `pnpm --filter @belzo/web build` → exit 0 (next build, compiled successfully, 31/31 static pages generated).
- `pnpm --filter @belzo/shared test` → exit 0 (7 suites, 42 tests passed; includes `schemas.test.ts` exercising `pincodeSchema`).

No Playwright/e2e suite exists in `apps/web` (confirmed); none added. Manual smoke (step 6) not run in this headless environment — behavior is covered by the gate's render logic described below.

## What changed
- NEW `apps/web/src/components/pincode-gate.tsx`: blocking full-screen overlay (design shape A). Reuses `usePincode()` only. Hidden when `ready && pincode && serviceable === true`; renders nothing until `ready` (no flash). Shows "Checking availability…" transient state, the exact `This PIN code is not serviceable.` on `configured && serviceable === false`, and inline `Enter a valid 6-digit PIN code.` on bad format. Locks body scroll via `pingate-locked`. testids: `pincode-gate`, `pincode-gate-input`, `pincode-gate-check`, `pincode-gate-error`, `pincode-gate-checking`, `pincode-gate-unserviceable`.
- EDIT `apps/web/src/app/(shop)/layout.tsx`: mount `<PincodeGate />` once next to `<Toaster />` (covers both classic + emart home, no home-page edits).
- EDIT `apps/web/src/app/globals.css`: appended `pingate__*` styles + `body.pingate-locked`.
- EDIT `apps/web/src/components/delivery-pin.tsx` & `delivery-check.tsx`: not-serviceable copy now contains the exact phrase `This PIN code is not serviceable.`

---

# Implementation Plan — Mandatory Delivery PIN-code Serviceability Gate (original)

## Goal (from the user, Hinglish → English)
Make the delivery-PIN serviceability check **mandatory** and also surface it on the home page. Flow: shopper enters a 6-digit PIN → presses Check → availability is verified → only then may they proceed. When the checked PIN is not deliverable, show the exact message **"This PIN code is not serviceable."** and keep them blocked until they enter a serviceable PIN.

## Architecture decision (chosen — do NOT re-decide)
**Shape (A): a blocking first-visit gate (full-screen overlay) mounted in the shared shop layout.**

Why (A) over (B):
- The shop layout `apps/web/src/app/(shop)/layout.tsx` already wraps **every** storefront page in one shared `<main className="container">{children}</main>` and already mounts a client component (`<Toaster />`) there. Mounting the gate in the same place covers the entire storefront (both the `classic` home and the `emart` home) with **one** component and **no per-page duplication**.
- Because the layout renders for both the `classic` and `emart` theme branches, the gate automatically appears over `page.tsx` AND `EmartHome` (`emart-home.tsx`). This is why **no edits to `page.tsx` or `emart-home.tsx` are required** — the "surface on the home page, account for the EmartHome branch" requirement is satisfied by mounting in the shared layout. This decision must be recorded in a code comment on the gate component and on its mount site.
- (B) would require touching many CTAs across home/PDP/category and still miss full coverage; (A) integrates cleanly, so (A) wins.

Behavioral rules the gate must honor (grounded in `apps/web/src/lib/use-pincode.ts` and `apps/api/src/modules/admin/public-settings.controller.ts`):
- **Single source of truth**: reuse `usePincode()`. Do NOT add a parallel serviceability fetch or a second localStorage key. The hook already persists the PIN, auto-adopts a logged-in customer's default-address PIN, re-checks serviceability on PIN change, and broadcasts changes (`belzo:pincode` custom event + storage event) so the header widget (`delivery-pin.tsx`) and PDP card (`delivery-check.tsx`) stay in sync. The gate plugs into that same stream.
- **"Satisfied" definition** (gate hidden): `ready === true && pincode != null && serviceable === true`. Anything else keeps the gate shown. An empty or unchecked PIN is NOT satisfied.
- **No flash before hydration**: render nothing until the hook's `ready` flag is `true` (localStorage has been read). This prevents the gate from flashing for returning guests who already have a serviceable PIN.
- **`configured === false` semantics** (no serviceable list on server = delivery open everywhere): the hook already returns `serviceable: true` in this case, so ANY valid 6-digit PIN immediately satisfies the gate. The user must still enter + Check a valid PIN to satisfy "mandatory".
- **Fail-open on network error**: the hook's `checkPin` catch returns `{ serviceable: true, configured: false }`, so a down serviceability endpoint does NOT hard-block the site — but a valid PIN format is still required. Do not add logic that overrides this fail-open.
- **Checking state**: immediately after a submit, the hook sets `serviceable` to `null` while the async check runs. The gate must show a transient "Checking…" state (`pincode != null && serviceable === null`) and must NOT dismiss or show the not-serviceable message during that window. Only dismiss on `serviceable === true`; only show "This PIN code is not serviceable." on `configured === true && serviceable === false`.
- **Returning-guest-now-unserviceable edge**: if a stored PIN later becomes non-serviceable (`pincode` set, `configured`, `serviceable === false`), the gate re-appears with the not-serviceable message and the input prefilled/empty so they can enter a new PIN. This falls out of the "satisfied" definition automatically.

Validation: use the same regex already used across the codebase: `/^[1-9]\d{5}$/` (also `pincodeSchema` in `packages/shared/src/schemas.ts`). Invalid format → short inline validation message (e.g. "Enter a valid 6-digit PIN code."), matching the wording the existing widgets use.

## Scope summary
- NEW: `apps/web/src/components/pincode-gate.tsx` (client overlay component).
- EDIT: `apps/web/src/app/(shop)/layout.tsx` (mount the gate once, like `<Toaster />`).
- EDIT: `apps/web/src/app/globals.css` (append `pingate__*` styles).
- EDIT (consistency): `apps/web/src/components/delivery-check.tsx` and `apps/web/src/components/delivery-pin.tsx` — align their not-serviceable copy to the exact required phrase.
- NO API changes. NO changes to `use-pincode.ts`, `page.tsx`, or `emart-home.tsx`.

---

# Implementation Plan

- [x] 1. Create the `PincodeGate` client component.
      Build a full-screen blocking overlay that forces a serviceable PIN before the storefront is usable. Use `usePincode()` as the only state source. Render logic: if `!ready` return `null`; if `ready && pincode && serviceable === true` return `null` (satisfied); otherwise render the overlay. Inside: a card with a heading, a numeric input (`maxLength={6}`, `inputMode="numeric"`, strip non-digits via `value.replace(/\D/g,'')`, submit on Enter) and a "Check" button. On submit: trim entry, test `/^[1-9]\d{5}$/`; if invalid set an inline error and return; if valid clear the error and call `setPincode(pin)` (the hook does the serviceability call + broadcast). Derived display states: `checking = pincode != null && serviceable === null` → show "Checking availability…"; `notServiceable = configured && serviceable === false` → show the EXACT text `This PIN code is not serviceable.`; invalid-format → inline validation message. Add a top-of-component code comment stating this is design shape (A), mounted once in the shop layout to cover both themes/home page. Add `data-testid`s: `pincode-gate` (overlay root), `pincode-gate-input`, `pincode-gate-check`, `pincode-gate-error` (format error), `pincode-gate-unserviceable` (the exact not-serviceable message). Lock background scroll while the overlay is shown via a `useEffect` that toggles a class (e.g. `document.body.classList.add/remove('pingate-locked')`) and cleans up on unmount. Mark the file `'use client'`.
      Files: `apps/web/src/components/pincode-gate.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` passes (component typechecks against the hook's return type).

- [x] 2. Mount the gate once in the shop layout.
      Import `PincodeGate` in `apps/web/src/app/(shop)/layout.tsx` and render `<PincodeGate />` alongside the existing `<Toaster />` (just before or after it, inside the `theme-root` div so it covers both the `emart` and `classic` branches). Add a one-line comment noting the gate deliberately lives here (shared layout) to cover the whole storefront + home page for both themes without per-page duplication. Do NOT edit `page.tsx` or `emart-home.tsx`.
      Files: `apps/web/src/app/(shop)/layout.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` passes; `pnpm --filter @belzo/web build` compiles the layout with the new client child.

- [x] 3. Add gate styles to the global stylesheet.
      Append a new `/* ===== Mandatory delivery PIN gate ===== */` section at the END of `apps/web/src/app/globals.css` (after the `.delchk__bad` rule, currently the last line). Add classes under a `pingate__` prefix consistent with the existing `delpin__`/`delchk__` BEM-ish naming: `.pingate` (fixed full-viewport flex-centered overlay, semi-opaque dark backdrop, `z-index` above the toast which is `9999` — use e.g. `10000`), `.pingate__card` (white rounded card, padding, max-width ~420px, shadow like `.belzo-toast`), `.pingate__title`, `.pingate__sub`, `.pingate__row` (input+button flex row, mirror `.delchk__row`), `.pingate__row input`, `.pingate__row button` (reuse the `#2874f0` button style used by `.delpin__row button`/`.delchk__row button`), `.pingate__err` (red, like `.delchk__err`), `.pingate__no` (red not-serviceable message, like `.delpin__no`), `.pingate__checking` (muted, like `.delchk__hint`). Add `body.pingate-locked { overflow: hidden; }`. Do not introduce any new styling system or dependency.
      Files: `apps/web/src/app/globals.css`
      Verify: `pnpm --filter @belzo/web build` succeeds (CSS is bundled with no parse errors) and `pnpm --filter @belzo/web lint` passes.

- [x] 4. Align the not-serviceable copy in the existing header widget and PDP card for consistency.
      So the mandatory flow reads consistently everywhere, update the not-serviceable message strings to the exact phrase `This PIN code is not serviceable.` In `apps/web/src/components/delivery-pin.tsx` replace the `.delpin__no` text (`✗ Sorry, we don't deliver to {pincode} yet.`) and in `apps/web/src/components/delivery-check.tsx` replace the `.delchk__bad` sentence (`Sorry, we don't deliver to {pincode} yet...`) so each surfaces the exact required phrase (an icon prefix and the "{pincode}" reference may be kept, but the literal sentence `This PIN code is not serviceable.` must appear verbatim). Do NOT change their serviceability logic, their `data-testid`s, or the `usePincode()` wiring — these components already sync via the hook's broadcast. Keep the valid "we deliver" branches unchanged.
      Files: `apps/web/src/components/delivery-pin.tsx`, `apps/web/src/components/delivery-check.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web lint` pass.

- [x] 5. Full web-app verification pass.
      From the repo root `c:\xampp\htdocs\Belzo`, run the three gating checks in order and confirm all pass with no new errors/warnings introduced:
      - `pnpm --filter @belzo/web typecheck`
      - `pnpm --filter @belzo/web lint`
      - `pnpm --filter @belzo/web build`
      Also run the only existing test that touches PIN logic to confirm no regression (it exercises `pincodeSchema`): `pnpm --filter @belzo/shared test`. There is NO Playwright/e2e suite in `apps/web` (confirmed during exploration) — do NOT add one unless a check above fails and a test is the clearest way to prove the fix.
      Files: none (verification only)
      Verify: all four commands succeed; the three web commands exit 0 and the shared tests pass.

- [ ] 6. Manual smoke of the mandatory flow (document outcome in the review/PR notes).
      With the web app running (`pnpm --filter @belzo/web dev`), confirm the behavior matches the spec: (a) a fresh visitor (clear localStorage key `belzo:pincode`) sees the gate on the home page for both `classic` and `emart` themes and cannot interact with the storefront behind it; (b) entering an invalid PIN (e.g. `12`) shows the inline format error and does NOT dismiss; (c) entering a valid, serviceable PIN dismisses the gate and the header `📍` widget reflects the same PIN (broadcast sync); (d) when the server has a serviceable list configured and a non-listed valid PIN is entered, the gate shows exactly `This PIN code is not serviceable.` and stays blocked; (e) with no serviceable list configured (`configured === false`), any valid PIN passes; (f) a returning guest with a stored serviceable PIN does NOT see the gate (no flash). If a live API is unavailable, verify (a)–(c) and (f) and note that (d)/(e) depend on `shipping.serviceablePincodes` settings.
      Files: none (manual verification)
      Verify: observed behavior matches (a)–(f); record any deviation as a finding for the review step.

## Notes / assumptions
- The gate blocks only the `(shop)` route group (where the layout applies). Auth pages (e.g. `/login`) outside this group are intentionally not blocked, and the gate lets guests enter a PIN without logging in — so login remains reachable. This is acceptable and intended.
- No API change is needed: `GET /settings/serviceability` already returns `{ serviceable, configured }` with the required semantics.
- The loop's stop contract is unchanged: a reviewer writes `c:\xampp\htdocs\Belzo/.agents/tasks/pincode-gate-review.json` with `verdict === "APPROVED"` as the loop's last child. This plan does not restructure the workflow.

