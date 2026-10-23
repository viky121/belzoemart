# Mandatory delivery-PIN serviceability gate for the storefront

A full-screen blocking overlay (`PincodeGate`) is added to the shared `(shop)` layout so every storefront page — including both the classic `page.tsx` home and the `emart` `EmartHome` branch — forces a shopper to enter and confirm a serviceable 6-digit PIN before browsing. The gate reuses the existing `usePincode()` hook as its only state source rather than introducing a parallel serviceability fetch, so the header widget (`delivery-pin.tsx`) and the PDP card (`delivery-check.tsx`) stay in sync through the hook's broadcast. The not-serviceable copy in those two existing widgets was aligned to the exact required phrase. No API and no hook changes.

Watch for: the "Checking availability…" transient is reliable only on the first check — because the hook does not reset `serviceable` to `null` when the PIN changes to a *new* value, switching from one unserviceable PIN to another briefly flashes the stale "not serviceable" message before the re-check resolves (likely, non-blocking, and rooted in the unmodified hook). The overlay blocks pointer interaction but does not trap keyboard focus, so a tabbing user can still reach the content behind it (confirmed, minor a11y gap).

**Verdict**: APPROVED

## High-level view

The gating strategy is a single mounted overlay in the shared shop layout. This is the reason no home-page files were touched: the layout already wraps both theme branches in one shell and already mounts a client child (`<Toaster />`), so one `<PincodeGate />` next to it covers the whole storefront and both homes. The decision is documented in a comment on both the component and the mount site.

The mandatory logic is sound. "Satisfied" (gate hidden) is strictly `ready && pincode != null && serviceable === true`. An empty PIN or a typed-but-unchecked PIN never satisfies it, because the gate only reacts to `pincode` state that `setPincode` writes, and `setPincode` is called only after the 6-digit regex passes on submit. Invalid format produces an inline message and does not advance.

The not-serviceable path renders the exact literal `This PIN code is not serviceable.` and keeps the shopper blocked, since `configured && serviceable === false` is never the satisfied condition.

Fail-open and `configured === false` are honored by delegating entirely to the hook: a network error or an unconfigured server both yield `serviceable: true`, which lets any valid PIN through — the site is never hard-blocked by a down endpoint, yet a valid PIN is still required. The `ready` flag gates the first render so returning guests with a stored serviceable PIN see no flash.

Conventions match: `pingate__*` BEM-ish classes alongside the existing `delpin__`/`delchk__` families, reused `#2874f0` button styling, the shared `/^[1-9]\d{5}$/` regex, and a full `data-testid` set.

<details>
<summary>Issues (2)</summary>

1. **Stale "not serviceable" flash on PIN re-check** — switching from one unserviceable PIN to another shows the old not-serviceable message until the new check resolves, because the hook never resets `serviceable` to `null` on a PIN change. Non-blocking; lives in the unmodified hook. Optionally clear local state on submit or reset `serviceable` in the hook if the flicker is undesirable.
2. **No focus trap on the modal overlay** — `role="dialog" aria-modal="true"` is set but keyboard focus can still tab into the blocked content behind the overlay. Non-blocking a11y gap; consider trapping focus within the card.

</details>

<details>
<summary>Details</summary>

### One overlay in the shared layout covers both homes

The gate is mounted once in `app/(shop)/layout.tsx` inside the `theme-root` div, next to `<Toaster />`:

```
theme-root
 ├─ EmartHeader | (classic header + CategoryStrip)
 ├─ main.container → {children}   ← page.tsx OR EmartHome render here
 ├─ Toaster
 ├─ PincodeGate                   ← fixed inset:0 overlay, z-index 10000
 └─ EmartFooter | (classic footer)
```

Because the layout renders for both `theme === 'emart'` and the classic branch, the overlay sits above whichever home is rendered without any edit to `page.tsx` or `emart-home.tsx`. This directly satisfies the "surface PIN entry on the home page, both theme branches" requirement, and the rationale is captured in a comment at the mount site and atop the component.

### Mandatory gate logic has no empty/unchecked bypass

`satisfied = ready && pincode != null && serviceable === true`, and `if (!ready || satisfied) return null;`. The only route to a non-null `pincode` is `setPincode`, which the component calls solely inside `submit()` after `PIN_RE.test(pin)` passes. A blank field, or a field the user typed into but never submitted, leaves `pincode` null (the typed value lives in local `entry` state only), so the overlay stays up. On an invalid format, `submit()` sets the inline error and returns before touching the hook. This matches the required sequence: enter PIN → Check → proceed enabled.

### Exact not-serviceable copy, three places consistent

The gate renders the literal string verbatim with the trailing period:

```tsx
<p className="pingate__no" data-testid="pincode-gate-unserviceable">
  This PIN code is not serviceable.
</p>
```

guarded by `notServiceable = configured && serviceable === false`. The two existing widgets now embed the same sentence verbatim — `delivery-pin.tsx` as `✗ This PIN code is not serviceable.` and `delivery-check.tsx` as `This PIN code is not serviceable. You won't be able to place this order to <pincode>.` The icon prefix and trailing clause keep each widget's context while the required sentence appears unaltered, and neither widget's serviceability logic, testids, or hook wiring changed.

### Fail-open and configured===false delegated to the hook

The component derives `notServiceable` only from `configured && serviceable === false` and never overrides the hook. `checkPin` resolves its catch to `{ serviceable: true, configured: false }`, so an unreachable endpoint yields a satisfiable state once a valid PIN is entered — the gate does not hard-block the whole site on a network failure. Likewise an unconfigured server (`configured === false`) returns `serviceable: true`, so any valid 6-digit PIN clears the gate while still enforcing the format. The `ready` flag suppresses the first paint until localStorage has been read, preventing a flash for returning guests who already hold a serviceable PIN.

### Checking-state transient is first-check only

The hook's serviceability effect resets `serviceable` to `null` only when `pincode` becomes falsy, not when it changes from one value to another:

```ts
useEffect(() => {
  if (!pincode) { setServiceable(null); setConfigured(false); return; }
  let active = true;
  void checkPin(pincode).then((r) => { if (!active) return; setServiceable(r.serviceable); setConfigured(r.configured); });
  ...
}, [pincode]);
```

On a fresh visit `serviceable` starts `null`, so `checking = pincode != null && serviceable === null` is true during the first fetch and "Checking availability…" shows correctly, then resolves to either dismissal or the exact not-serviceable message — the primary mandatory flow is correct. The gap is only when a shopper replaces an already-unserviceable PIN with another PIN: `serviceable`/`configured` retain the prior `false`/`true` during the new fetch, so the gate shows the stale "This PIN code is not serviceable." for a moment before the re-check completes rather than a "Checking…" state. The behavior lives entirely in `use-pincode.ts`, which this change does not modify, and it self-corrects, so it is non-blocking.

### Overlay blocks pointer but not keyboard

`.pingate` is `position: fixed; inset: 0; z-index: 10000` over a `rgba(15,23,42,0.6)` backdrop above the toast layer (`9999`), and `body.pingate-locked { overflow: hidden }` stops background scroll (toggled in an effect that cleans up on unmount). Pointer interaction with the content behind is therefore blocked. The dialog is marked `role="dialog" aria-modal="true"` but there is no focus trap, so a keyboard user can tab past the card into the still-rendered storefront. Minor a11y gap, not a functional bypass of the mandatory flow for normal usage.

### Conventions and verification

Styling uses a `pingate__*` family consistent with the existing `delpin__`/`delchk__` naming, reuses the `#2874f0` button treatment, and adds no new styling dependency. The validation regex matches the codebase-wide `/^[1-9]\d{5}$/`. Testids `pincode-gate`, `pincode-gate-input`, `pincode-gate-check`, `pincode-gate-error`, `pincode-gate-checking`, and `pincode-gate-unserviceable` follow the existing convention. The plan's Verification section records `typecheck`, `lint`, and `build` for `@belzo/web` plus `@belzo/shared` tests all exiting 0; per the review scope these suites were not re-run. The destructured hook fields all exist on `usePincode()`'s return, so the recorded typecheck pass is consistent with the diff. Step 6 (manual smoke) is intentionally unchecked — it is a human/live-API step and the automated gates cover the render logic; not a blocking gap.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/components/pincode-gate.tsx` (new) — blocking overlay; reuses `usePincode()`, exact not-serviceable copy, inline format error, scroll lock, testids.
- `apps/web/src/app/(shop)/layout.tsx` (edit) — mounts `<PincodeGate />` once next to `<Toaster />` with a rationale comment.
- `apps/web/src/app/globals.css` (edit) — appended `pingate__*` styles and `body.pingate-locked`.
- `apps/web/src/components/delivery-pin.tsx` (edit) — not-serviceable copy aligned to the exact phrase.
- `apps/web/src/components/delivery-check.tsx` (edit) — not-serviceable copy aligned to the exact phrase.

No git history in the workspace (all files untracked); reviewed from current file state against the plan at `.agents/tasks/pincode-gate-plan.md`.

</details>
