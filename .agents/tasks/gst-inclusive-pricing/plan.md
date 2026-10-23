# Implementation Plan: GST-inclusive checkout pricing (Option A)

Work directly on `master` in `c:\xampp\htdocs\Belzo` (no worktree). Use absolute paths. Do NOT deploy.
Do not revert cea080d / fddeefc (invoice rebuild) or 20017e1 (address prefill). Existing order rows are never modified; no migration.

## What exploration found (ground truth)

- The engine function is `computeTotals` (not `computeBreakup`) in `packages/shared/src/pricing.ts`.
  Today: `taxable = subtotal − discount`; `blendedRate = weightedTaxRate(lines)` (rounded integer);
  `gst = computeGst(taxable, blendedRate, sameState)`; `grandTotal = taxable + tax + shipping + codFee`.
- Only production caller: `apps/api/src/modules/checkout/pricing.service.ts` `compute()`, used by
  `checkout.service.ts` `preview()`/`place()`. `place()` snapshots subtotal/discount/shipping/codFee/tax/cgst/sgst/igst/grandTotal
  onto `Order` and creates the payment with `amount: breakup.grandTotal`; return value `payment.amount = order.grandTotal`.
  Refund (`order.service.ts` cancel), COD amount (`fulfilment.service.ts`), revenue/GST reports (`reporting.service.ts`)
  all read stored `grandTotal`/`tax`/`cgst/sgst/igst` — no change needed, semantics stay "amount charged" / "GST in the order".
- Free-shipping threshold compares the pre-discount SUBTOTAL (`pricing.service.ts` line ~57). Keep that (unchanged behaviour).
  Coupon `minOrder` also compares subtotal (unchanged).
- `computeTotals` is also used by `apps/api/src/modules/orders/invoice-document.spec.ts` to build "exclusive" fixtures —
  those tests WILL break when the engine becomes inclusive and must be re-pointed (item 2).
- `invoice-document.ts` already handles both modes: `orderTaxable = grandTotal − shipping − codFee − tax`;
  `pricesIncludeGst = tax > 0 && Σnet == orderTaxable + tax`. Its discount allocation is
  `allocateProportional(order.discount, gross, gross)` (from `packages/shared/src/gst.ts`). Do NOT rewrite it.
- `taxRatePct` is `Int` in Prisma (Product and OrderItem). `Product.isTaxInclusive` exists (default true) but is unused — out of scope.
- Web breakup renderers: only `apps/web/src/app/(shop)/checkout/page.tsx` (order summary, line ~386-406) and
  `apps/web/src/app/(shop)/orders/[id]/page.tsx` (`.price-breakup`, line ~81-86). `admin/orders/page.tsx`,
  `order-result/page.tsx`, `orders/page.tsx`, `account/page.tsx` show only `grandTotal` (correct as-is, no change).
  Cart page (`cart/page.tsx`) shows subtotal only, no GST line; product card shows price/MRP only; PDP already says
  "Inclusive of all taxes (GST x%)". No "+ GST" text exists anywhere (grep confirmed) — no change there.
- Customer order detail API (`order.service.ts getForCustomer`) spreads the whole Order row, so `codFee, cgst, sgst, igst`
  are already in the JSON; the web `OrderDetail` interface just doesn't declare them.
- Module resolution: API `tsc` resolves `@belzo/shared` through `packages/shared/package.json` → `dist/` (gitignored),
  so `pnpm --filter @belzo/shared build` MUST run before API typecheck/lint. API/web Jest map `@belzo/shared` to `src`.
  Web `tsc` maps it to `src` via tsconfig paths; `next build` transpiles it.
- Git: the repo tracks only some files. `packages/shared/src/pricing.ts`, `pricing.test.ts`, `pricing.service.ts`'s spec
  neighbours etc. may be UNTRACKED (`git status` shows `??`). Stage every file you change explicitly by path
  (`git add <path>`), including untracked ones; never `git add .`/`-A`.
- Baseline (before changes): `pnpm --filter @belzo/shared test` 103/103 pass; API checkout+orders specs 63/63 pass.

## Design decisions

- D1 Keep `PriceBreakup` shape exactly (no new fields). Reason: `checkout.service.ts toBreakup()` and spec mocks build
  `PriceBreakup` literals, and the PBT-02 round-trip test uses the zod schema (which would strip/require any new key).
  "Taxable value" is derivable everywhere as `subtotal − discount − tax` (inclusive) — the invoice already does this.
- D2 Discount allocation = `allocateProportional(discount, lineGross, lineGross)` from `./gst` (floor shares, remainder to the
  last positive-weight line, capped at line gross). Same function and weights the invoice uses, so engine and invoice agree
  on per-line discount. `couponDiscount` guarantees `discount ≤ subtotal`, so the caps never throw.
- D3 Per-line extraction: `lineTax = Math.round(lineNet * rate / (100 + rate))`, `rate ≤ 0 → 0`. Exact in floating point for
  integer paise and integer rates (correctly-rounded division; a true x.5 quotient is representable, and no other quotient is
  within an ulp of x.5 for denominators ≤ 128) — leave a one-line comment saying so. Order `tax = Σ lineTax`.
- D4 GST split factored into `splitGst(tax, sameState)`: same-state → `cgst = floor(tax/2)`, `sgst = tax − cgst`, `igst = 0`;
  else `igst = tax`. `computeGst` is re-implemented as `splitGst(percentOf(amount, rate), sameState)` (behaviour unchanged).
- D5 Keep `computeGst` and `weightedTaxRate` exported (JSDoc: "legacy GST-exclusive maths; not used by computeTotals").
  Tests use them to build legacy exclusive fixtures.
- D6 Legacy-vs-inclusive detection lives in `packages/shared/src/pricing.ts`:
  `isGstInclusiveSnapshot(s)` returns `false` (legacy exclusive) iff `s.tax > 0 && s.grandTotal === s.subtotal − s.discount + s.tax + s.shipping + s.codFee`;
  otherwise `true`. With `tax = 0` both formulas coincide, so it is treated as inclusive (no GST row is added; the
  "Includes GST" note is hidden because tax is 0). Plus `gstSplitLabel(g) → g.igst > 0 ? 'IGST' : 'CGST+SGST'`.
- D7 Web rows come from ONE pure helper `apps/web/src/lib/price-breakup.ts` used by both checkout and order detail, unit-tested
  with the web Jest (`*.test.ts` only — no TSX tests exist in this repo).
- D8 Checkout "You save" becomes `productDiscount + b.discount` (MRP savings + coupon). Today's `totalMrp − grandTotal` would
  subtract delivery/COD fee from "savings" once GST is no longer added. Display-only.

## Worked examples (assert these exact paise values)

E1 — ₹9,588 @5%, intra-state (Karnataka/Karnataka), no coupon, shipping 0, codFee 0:
`lines=[{unitPrice:958800, quantity:1, taxRatePct:5}]` → subtotal 958800, discount 0, tax 45657 (958800×5/105 = 45657.14),
gst {cgst 22828, sgst 22829, igst 0}, grandTotal 958800, taxable (subtotal−discount−tax) 913143.
Via `PricingService.compute` (default threshold ₹500) shipping is 0 → grandTotal 958800; with `isCod:true` grandTotal 962700 (958800+3900).

E2 — same lines, inter-state (buyer Maharashtra): tax 45657, gst {cgst 0, sgst 0, igst 45657}, grandTotal 958800.

E3 — legacy exclusive snapshot of E1 (what was charged before): tax 47940, grandTotal 1006740 → `isGstInclusiveSnapshot` false.

E4 — mixed 5%/18% cart, flat coupon 3333, intra-state, shipping 4900, codFee 3900 (engine-level test passes these explicitly):
lines `[{49900×2 @5}, {29900×1 @18}, {15050×3 @5}]` → gross [99800, 29900, 45150], subtotal 174850, discount 3333;
discount shares [1902, 569, 862] (floors 1902+569+860, remainder 2 → last line); nets [97898, 29331, 44288];
line taxes [4662, 4474, 2109] (97898×5/105=4661.8, 29331×18/118=4474.25, 44288×5/105=2108.95); tax 11245;
gst {cgst 5622, sgst 5623, igst 0}; taxable 160272; grandTotal 174850−3333+4900+3900 = 180317.
Inter-state: igst 11245, same grandTotal. (A rounded blended rate of 7% would give 11221 — the drift this removes.)

E5 — updated pin of the existing "same-state 18%" example (`2 × 100000 @18`, 10% coupon, shipping 5000):
subtotal 200000, discount 20000, tax 27458 (180000×18/118 = 27457.63), gst {13729, 13729, 0}, grandTotal 185000.

E6 — `pricing-settings.service.spec.ts` default case (`10000 × 1 @18`, Karnataka, COD): shipping 4900, codFee 3900,
tax 1525 (10000×18/118 = 1525.42), cgst 762, sgst 763, grandTotal 18800.

## Plan

- [x] 1. Make the shared engine GST-inclusive and add the legacy-detection helper, with tests.
      In `packages/shared/src/pricing.ts`:
      - `import { allocateProportional } from './gst';`
      - Add `export function splitGst(tax: Money, sameState: boolean): GstSplit` (D4); make `computeGst` call it.
      - Add `export interface InclusiveLineTax { gross: Money; discount: Money; net: Money; tax: Money }` and
        `export function inclusiveLineTaxes(lines: PriceLine[], discount: Money): InclusiveLineTax[]`:
        gross = unitPrice×quantity (validate quantity like `subtotalOf`); shares = `lines.length === 0 || discount === 0 ? zeros : allocateProportional(discount, gross, gross)`;
        net = gross − share; tax = rate > 0 ? Math.round(net × rate / (100 + rate)) : 0 (D3).
      - Rewrite `computeTotals`: subtotal, discount (unchanged `couponDiscount`), `perLine = inclusiveLineTaxes(lines, discount)`,
        `tax = Σ perLine.tax`, `gst = splitGst(tax, sameState)`, shipping logic unchanged (free_shipping coupon),
        `grandTotal = clampNonNegative(subtotal − discount) + shipping + codFee` (tax NOT added). Return the same 7 fields.
        Update the JSDoc: "Prices are GST-inclusive: GST is extracted per line from (line value − pro-rata discount)".
      - Mark `weightedTaxRate`/`computeGst` JSDoc as legacy exclusive maths kept for compatibility/tests (D5).
      - Add `export interface TaxSnapshot { subtotal: number; discount: number; shipping: number; codFee: number; tax: number; grandTotal: number }`,
        `export function isGstInclusiveSnapshot(s: TaxSnapshot): boolean` (D6) and `export function gstSplitLabel(g: { igst: number }): 'IGST' | 'CGST+SGST'`.
        (index.ts already re-exports `./pricing`.)
      In `packages/shared/src/pricing.test.ts`:
      - Keep `computeGst` tests (behaviour unchanged), coupon tests, free_shipping, determinism, PBT-02 round-trip.
      - Extend the main `computeTotals` property (existing generators `lines`, coupons incl. flat/percent/free_shipping):
        `grandTotal === subtotal − discount + shipping + codFee`; `cgst+sgst+igst === tax`; `0 ≤ tax ≤ subtotal − discount`;
        same-state ⇒ igst 0 and |cgst−sgst| ≤ 1; inter-state ⇒ cgst = sgst = 0.
      - New property "no blended-rate drift": `tax` equals an independent oracle written in the test (floor shares
        `floor(D×g/S)` + remainder added to the last line with g > 0, then Σ `Math.round(net×r/(100+r))`).
      - New property: `inclusiveLineTaxes` shares sum to discount, each share ≤ gross, each line tax ≤ net; all-0% cart ⇒ tax 0;
        a 0% line in a mixed cart has line tax 0.
      - New property: for any `computeTotals` output with tax > 0, `isGstInclusiveSnapshot` is true; for a legacy exclusive
        snapshot built in the test from `weightedTaxRate` + `computeGst` (grandTotal = net + tax + shipping + codFee) with tax > 0 it is false.
      - Examples: replace the old 18% pin with E5; add E1, E2, E4 (intra + inter, per-line shares/taxes via `inclusiveLineTaxes`),
        E3 (`isGstInclusiveSnapshot` false), a tax-0 snapshot (true), `gstSplitLabel` both branches.
      Files: packages/shared/src/pricing.ts, packages/shared/src/pricing.test.ts
      Verify: `pnpm --filter @belzo/shared test` — all suites pass; `pnpm --filter @belzo/shared typecheck` and
      `pnpm --filter @belzo/shared lint` clean; then `pnpm --filter @belzo/shared build` (refreshes dist for API tsc).

- [x] 2. Update API specs to the inclusive totals (depends on 1; `invoice-document.spec.ts` fails until this is done).
      No production code change in `pricing.service.ts` / `checkout.service.ts` beyond optionally updating the class JSDoc
      in pricing.service.ts to say prices are GST-inclusive and the free-shipping threshold compares the pre-discount subtotal.
      - `apps/api/src/modules/checkout/pricing-settings.service.spec.ts`: in "(d) defaults" also assert E6
        (tax 1525, gst {762, 763, 0}, grandTotal 18800 = subtotal + shipping + codFee). In the IGST case assert igst 1525.
        Add a test: E1 through `svc.compute({lines:[958800×1 @5], buyerState:'Karnataka', isCod:false})` → shipping 0, tax 45657,
        cgst 22828, sgst 22829, grandTotal 958800; `buyerState:'Maharashtra'` → igst 45657, grandTotal 958800;
        `isCod:true` → grandTotal 962700. Add: grandTotal === subtotal − discount + shipping + codFee for a coupon case
        (`coupon: {kind:'percent', value:10}`). Existing assertions stay valid — keep them.
      - `apps/api/src/modules/checkout/checkout.service.spec.ts`: add a `place()` test using the REAL `new PricingService()`
        (cart line `{unitPrice:958800, quantity:1, taxRatePct:5}`, address state Karnataka, `paymentMethod:'upi'`), capturing the
        `data` passed to `tx.order.create` in the existing mock: assert `data.grandTotal === 958800`, `data.tax === 45657`,
        `data.cgst === 22828`, `data.sgst === 22829`, `data.igst === 0`, `data.payments.create.amount === 958800`, and
        `result.payment.amount === 958800`, `result.breakup.grandTotal === 958800`. Reuse the existing `build()` scaffold
        (extend it with an optional pricing/cart override); keep existing idempotency/guest/removed-variant tests unchanged.
      - `apps/api/src/modules/orders/invoice-document.spec.ts`:
        - Replace the body of `exclusiveOrder()` so it no longer calls `computeTotals`: build a LEGACY exclusive snapshot locally
          from shared `subtotalOf`, `couponDiscount`, `weightedTaxRate`, `computeGst` (taxable = subtotal − discount;
          grandTotal = taxable + tax + shipping + codFee). Rename to `legacyExclusiveOrder` (update all call sites) and fix
          the doc comment ("GST-exclusive snapshot as checkout stored it BEFORE the inclusive switch"). Do the same in the
          "zero-discount order" test (it currently calls `computeTotals` and asserts `l.taxable === l.gross`, which only holds
          for exclusive snapshots).
        - Add `engineOrder(sameState, items = ITEMS, opts?)` that builds the snapshot from the NEW `computeTotals`
          (shipping 4900, codFee 3900, flat coupon 3333 by default). New tests:
          (a) intra-state engine order (= E4 numbers: tax 11245, cgst 5622, sgst 5623, grandTotal 180317): `expectReconciles`,
              `doc.totals.pricesIncludeGst === true`, `doc.totals.grandTotal === order.grandTotal`, Σ line cgst/sgst/igst equal
              stored cgst/sgst/igst, `doc.totals.taxableTotal === 160272`, every line `total === gross − discount`, no Round-off row;
          (b) inter-state engine order: `showInter`, Σ line igst === 11245, reconciles;
          (c) E1 single line through the engine (shipping 0, codFee 0, no coupon): taxableTotal 913143, grandTotal 958800,
              cgst 22828 + sgst 22829 on the line; inter-state variant igst 45657;
          (d) engine order with a 0% line (milk @0 + tea @18): milk line tax 0, reconciles.
        - Keep the hand-built `inclusiveOrder()` fixture and all other tests as-is.
      - `apps/api/src/modules/orders/invoice.service.spec.ts`: fixture is a legacy exclusive order (grand 122900 = 100000 + 18000 + 4900);
        leave it unchanged (it still represents a valid historical order).
      Files: apps/api/src/modules/checkout/pricing-settings.service.spec.ts, apps/api/src/modules/checkout/checkout.service.spec.ts,
      apps/api/src/modules/orders/invoice-document.spec.ts, (doc comment only) apps/api/src/modules/checkout/pricing.service.ts
      Verify: `pnpm --filter @belzo/shared build`, then `pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api test` — all pass.
      Commit: `git add` exactly the files from items 1–2 (packages/shared/src/pricing.ts, packages/shared/src/pricing.test.ts and the API files above),
      `git commit -m "feat(pricing): GST-inclusive checkout totals with per-line GST extraction"`.

- [x] 3. Add the web breakup-rows helper with tests (depends on 1).
      Create `apps/web/src/lib/price-breakup.ts`:
      ```ts
      export interface OrderMoneySnapshot { subtotal: number; discount: number; shipping: number; codFee: number;
        tax: number; cgst: number; sgst: number; igst: number; grandTotal: number }
      export function snapshotFromBreakup(b: PriceBreakup): OrderMoneySnapshot   // flattens b.gst
      export interface BreakupRow { key: 'subtotal' | 'discount' | 'gst' | 'shipping' | 'codFee'; label: string; amount: number /* signed paise contribution to the total */ }
      export interface BreakupView { inclusive: boolean; rows: BreakupRow[]; gstNote: { label: string; amount: number } | null; grandTotal: number }
      export function breakupView(s: OrderMoneySnapshot): BreakupView
      ```
      Rules: `inclusive = isGstInclusiveSnapshot(s)`; rows = Subtotal (+subtotal); "Coupon discount" (−discount) only if > 0;
      for legacy exclusive only: `GST (CGST+SGST)` / `GST (IGST)` (+tax, label via `gstSplitLabel`); "Delivery Charges" (+shipping, always);
      "COD fee" (+codFee) only if > 0. `gstNote` = inclusive && tax > 0 ? `{ label: 'Includes GST (CGST+SGST)' | 'Includes GST (IGST)', amount: tax }` : null.
      `grandTotal = s.grandTotal` (stored value is authoritative).
      Create `apps/web/src/lib/price-breakup.test.ts` (pattern: `variant-edit.test.ts`, imports via `@/lib/...` and `@belzo/shared`):
      - E1 via `computeTotals` → `inclusive` true, no `gst` row, gstNote `{label:'Includes GST (CGST+SGST)', amount:45657}`, Σ row amounts === 958800.
      - E2 → gstNote label `Includes GST (IGST)`.
      - E4 (with coupon, shipping, COD) → rows subtotal/discount/shipping/codFee, Σ amounts === 180317.
      - E3 legacy snapshot (tax 47940, grand 1006740) → `inclusive` false, has `gst` row 47940, gstNote null, Σ === 1006740.
      - Legacy exclusive IGST snapshot → row label `GST (IGST)`; tax-0 snapshot → no gst row, gstNote null, Σ === grandTotal.
      - Loop over a handful of engine outputs (various carts/coupons/sameState) asserting Σ rows === grandTotal.
      Files: apps/web/src/lib/price-breakup.ts, apps/web/src/lib/price-breakup.test.ts
      Verify: `pnpm --filter @belzo/web test` — new and existing suites pass.

- [x] 4. Render the inclusive breakup on checkout and customer order detail (depends on 3).
      - `apps/web/src/app/(shop)/checkout/page.tsx` order summary (`data-testid="checkout-breakup"`): keep informational
        "Total MRP" and product "Discount" rows (MRP − subtotal) at the top; then render `breakupView(snapshotFromBreakup(b)).rows`
        in order (Subtotal, Coupon discount (co-row--save, "−₹"), Delivery Charges ("FREE" when 0), COD fee); remove the
        hard-coded `GST (...)` row; keep "You save" banner but compute `totalSaved = productDiscount + b.discount` (D8);
        Total Amount row unchanged (`b.grandTotal`, keep `data-testid="checkout-grand-total"`); immediately after it render
        the note row when `gstNote` is non-null: `<div className="co-row co-row--note" data-testid="checkout-gst-included"><span>{label}</span><span>{formatInr(amount)}</span></div>`.
        Move the existing "Coupon discount" row from above Subtotal to below it (so visible rows read Subtotal − Coupon + Delivery + COD = Total).
      - `apps/web/src/app/(shop)/orders/[id]/page.tsx`: add `codFee, cgst, sgst, igst` to `OrderDetail`; replace the
        `.price-breakup` body with rows from `breakupView(order)` (`Subtotal`, `Discount: −₹`, `Shipping`/"FREE", legacy-only `GST (...)`, `COD fee`),
        then `Total`, then `<p className="price-breakup__note" data-testid="order-gst-included">` for `gstNote`. Old exclusive orders keep an
        added GST line and still sum to their stored total; new orders show "Includes GST".
      - `apps/web/src/app/globals.css`: add `.co-row--note` and `.price-breakup__note` (`color: var(--muted); font-size: 0.85em;`) next to the existing `.co-row--save` / `.price-breakup p` rules.
      - No change to `cart/page.tsx`, `product-card.tsx`, `product/[slug]/page.tsx` (verified: no "+ GST", PDP already "Inclusive of all taxes"),
        `admin/orders/page.tsx`, `order-result/page.tsx` (they show only stored `grandTotal`).
      Files: apps/web/src/app/(shop)/checkout/page.tsx, apps/web/src/app/(shop)/orders/[id]/page.tsx, apps/web/src/app/globals.css
      Verify: `pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web build` — all pass.
      Commit: `git add` the files from items 3–4 by path; `git commit -m "feat(web): show GST as included in checkout and order totals; legacy orders keep added GST"`.

- [x] 5. Full verification from `c:\xampp\htdocs\Belzo` (run in this order; all must pass):
      1. `pnpm --filter @belzo/shared test`
      2. `pnpm --filter @belzo/shared build` (API tsc reads `packages/shared/dist`)
      3. `pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api test`
      4. `pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web build`
      Then `git status --short` — confirm only intended files are committed, no stray temp files, `packages/shared/dist` and
      `.next` stay ignored, and no Prisma migration was added. Record the pass counts in the step output. Do not deploy, do not push.

## Notes for the reviewer

- Customer-visible effect: totals drop by the GST amount (E1: ₹10,067.40 → ₹9,588.00); stored `tax/cgst/sgst/igst` now mean
  "GST included in the price". Payment amount, refunds and COD collection all read `grandTotal`, so they follow automatically.
- Legacy orders: detected purely from their snapshot (`isGstInclusiveSnapshot`), never rewritten; invoice already reconciles both modes.
- Gap/assumption: the GST report (`reporting.service.ts gst()`) sums stored tax — correct for both modes, untouched.

## Verification evidence (iteration 1)

Commits on master: `d0fcdc7` feat(pricing): GST-inclusive checkout totals with per-line GST extraction;
`a6c0072` feat(web): show GST as included in checkout and order totals; legacy orders keep added GST.
(Built on top of 6dede33 PDP change � untouched. cea080d / fddeefc / 20017e1 not reverted.)

Final run from `c:\xampp\htdocs\Belzo`, in plan order, after both commits � all exit 0:
- `pnpm --filter @belzo/shared test` � 8 suites, 115/115 tests pass (baseline 103). Also `typecheck` and `lint` clean.
- `pnpm --filter @belzo/shared build` � pass.
- `pnpm --filter @belzo/api typecheck` pass; `pnpm --filter @belzo/api lint` pass; `pnpm --filter @belzo/api test` � 24 suites, 176/176 pass
  (checkout + orders subset 70/70, baseline 63).
- `pnpm --filter @belzo/web typecheck` pass; `pnpm --filter @belzo/web test` � 5 suites, 49/49 pass; `pnpm --filter @belzo/web build` pass.
- `git status`: no tracked file left modified; no Prisma migration added; `packages/shared/dist` and `.next` not staged.

Worked examples asserted in tests (paise):
- E1 ?9,588 @5% intra-state: tax 45657, cgst 22828, sgst 22829, igst 0, grandTotal 958800 (taxable 913143). COD: 962700.
- E2 inter-state: tax 45657, igst 45657, grandTotal 958800.
- E4 mixed 5%/18% + flat coupon 3333 + shipping 4900 + COD 3900: tax 11245, cgst 5622, sgst 5623 (inter: igst 11245), taxable 160272, grandTotal 180317.
- E3 legacy exclusive snapshot (tax 47940, grand 1006740) ? isGstInclusiveSnapshot false; web keeps a "GST (CGST+SGST)" added row.

Deviations from plan: `.co-row--note` / `.price-breakup__note` use `var(--muted-2)` (#6b7280) instead of `--muted` (#878787) � the latter
fails WCAG AA contrast for small text on white. Order-detail rows keep the page's existing labels ("Discount", "Shipping") via a label map.

## Verification evidence (iteration 2 — review fixes)
Findings addressed (review.json):
- invoice-inclusive-line-tax-weights (blocking): `invoice-document.ts` now decides `pricesIncludeGst` BEFORE sharing out tax. Inclusive
  orders use each line's extracted GST `round(net × r / (100 + r))` (same as `inclusiveLineTaxes`); `splitLineTaxes` gives every line
  exactly that tax, CGST/SGST per line within 1 paisa, columns summing exactly to the stored heads (odd snapshots fall back to pro-rata
  by the extracted taxes). Legacy exclusive orders keep the `net × rate` split (unchanged).
  E4 invoice lines now print GST 4662 / 4474 / 2109 on taxable 93236 / 24857 / 42179 (was 4442 / 4791 / 2012; 18% line was 19.52%).
- duplicate-inclusive-detection (non-blocking): invoice now requires the shared `isGstInclusiveSnapshot` AND the positive inclusive
  reconciliation (Σ net = grandTotal − shipping − codFee). The invoice can never call an order inclusive that the web shows as legacy;
  odd rows that are neither keep the mode-agnostic split and still reconcile exactly (spec h). Pure single-helper use was rejected
  because it broke exact reconciliation on the existing odd-snapshot spec.
- you-save-excludes-free-shipping (non-blocking, display-only): raised to the user, who answered "add it — include the waived
  delivery charge in the 'You save ₹X' figure when a free_shipping coupon is applied … keep it display-only". Done in a separate
  commit: `CheckoutService.preview()` returns additive `shippingWaived` (paise; delivery the coupon waived, computed by re-running
  `pricing.compute` without the coupon, 0 unless coupon kind is free_shipping); checkout page adds it to `totalSaved`. No stored
  total, engine, place() or payment amount changed. Specs: ₹200 cart + FREESHIP → shipping 0, shippingWaived 4900, grandTotal 20000;
  above threshold / flat coupon / no coupon → 0. Re-run after that commit, all exit 0: shared 115/115; api typecheck, lint pass,
  api test 24 suites 182/182; web typecheck pass, web test 49/49, web build pass.
New specs (`invoice-document.spec.ts`): (e) E4 intra + inter per-line GST == engine extraction + pins + HSN groups; (f) 300 seeded random
mixed-rate engine orders (0/5/12/18/28%, coupon, shipping, COD) per-line == engine and invoice/web mode agree; (g) legacy split unchanged;
(h) odd snapshot stays pro-rata and reconciles.
Run from `c:\xampp\htdocs\Belzo`, all exit 0:
- `pnpm --filter @belzo/shared test` — 8 suites, 115/115 pass (shared unchanged).
- `pnpm --filter @belzo/api typecheck` pass; `pnpm --filter @belzo/api lint` pass; `pnpm --filter @belzo/api test` — 24 suites, 180/180 pass
  (invoice subset 42/42).
- `pnpm --filter @belzo/web typecheck` pass; `pnpm --filter @belzo/web test` — 5 suites, 49/49 pass; `pnpm --filter @belzo/web build` pass.
Worked examples (paise, unchanged engine): E1 ₹9,588 @5% intra: tax 45657, cgst 22828, sgst 22829, igst 0, grandTotal 958800;
E2 inter: tax 45657, igst 45657, grandTotal 958800; E4 mixed 5%/18% + coupon 3333 + shipping 4900 + COD 3900: tax 11245,
cgst 5622, sgst 5623 (inter: igst 11245), grandTotal 180317.
