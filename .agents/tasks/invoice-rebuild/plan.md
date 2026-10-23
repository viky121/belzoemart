# Implementation Plan: standard GST tax invoice for Belzo eMart

Work directly on `master` in `c:\xampp\htdocs\Belzo`. Leave commit 20017e1 alone. Much of the repo is
untracked in git (see `git status`), so when committing stage ONLY the files named in this plan, by path.

Hard constraint: do NOT change pricing/tax math (`packages/shared/src/pricing.ts`, `checkout.service.ts`,
`pricing.service.ts`). The invoice presents the stored order snapshot (`subtotal, discount, shipping, codFee,
tax, cgst, sgst, igst, grandTotal`, integer paise) and never recomputes a different total.

## Facts found during exploration (the plan relies on these)

- `apps/api/src/modules/orders/invoice.service.ts`: `generate()` is idempotent, allocates the number via
  `invoiceCounter.upsert` + `formatInvoiceNumber`, stores `invoices/<orderId>.html` via `STORAGE_PROVIDER`,
  writes `Invoice{orderId,number,url}` + `order.invoiceUrl` in one `$transaction`. Deps: `PrismaService`,
  `STORAGE_PROVIDER`, `SettingsService` — keep exactly these deps (also provided in
  `orders-worker.module.ts`, which only imports `StorageModule, ShippingModule, AdminModule`).
- Prisma `Order` has NO `address`/`customer` relation fields and `OrderItem` has no `variant` relation. The
  invoice must load them separately: `prisma.address.findUnique({where:{id: order.addressId}})`,
  `prisma.customer.findUnique({where:{id: order.customerId}})`,
  `prisma.variant.findMany({where:{id:{in: variantIds}}, select:{id:true, product:{select:{hsnCode:true}}}})`.
  Address/customer can be missing (deleted / DPDP-anonymised) -> render '-' rather than throw.
- `Invoice` model: `id, orderId @unique, number @unique, url, createdAt` (no `updatedAt`; no migration needed).
- `Payment`: `provider` (razorpay | cod | mock), `status` (created | pending | captured | failed | refunded |
  partially_refunded), `method` (string?), `createdAt`.
- Intra/inter-state at checkout: `pricing.service.ts` compares `buyerState.trim().toLowerCase()` with seller
  state (`store.state` setting, else env `STORE_STATE`, else `'Karnataka'`). Shipping and COD fee are NOT
  taxed by the engine; tax = blended rate on (subtotal - discount).
- Storage: `PutObjectInput {key, body, contentType}`; S3 `put()` hard-codes
  `CacheControl: 'public, max-age=31536000, immutable'`. Production currently runs `STORAGE_PROVIDER=local`
  (`.env.prod.example`, `.env`): files are served by `app.useStaticAssets(join(cwd,'uploads'), {prefix:'/api/uploads'})`
  in `apps/api/src/main.ts`, under the global helmet CSP (`script-src 'self'`, helmet default
  `script-src-attr 'none'`) — so an inline `onclick="window.print()"` would be blocked today.
- `@belzo/shared` is consumed via `dist/` by tsc (api/web typecheck) but via `src/index.ts` by api jest
  (`moduleNameMapper`). After changing shared, run `pnpm --filter @belzo/shared build` before api/web typecheck.
- `formatMoney(paise)` in `packages/shared/src/money.ts` already produces `₹10,067.40` (Intl en-IN).
- Admin settings page (`apps/web/src/app/admin/settings/page.tsx`) renders uncontrolled inputs with
  `defaultValue` before `load()` resolves and saves on every blur, so a field rendered before load can blur
  and overwrite a stored value with ''. Fixed for the settings form in item 7.
- Admin "views an order" in the list table of `apps/web/src/app/admin/orders/page.tsx` (no detail page);
  `OrderService.adminList` returns full `Order` rows, which already include `invoiceUrl`.
- Admin RBAC: `@Roles('order_manager')` on `AdminOrdersController`; `AuditLogService` is exported by
  `AdminModule` (already imported by `OrdersModule`) with `record(actorId, action, target, before?, after?)`.

## Design decisions

- D1. Pure helpers in `@belzo/shared` (new `packages/shared/src/gst.ts`): state codes, GSTIN/PAN,
  amount in words, proportional allocation. Keeps them unit-testable and reusable by web.
- D2. Invoice rendering split into a pure module `apps/api/src/modules/orders/invoice-document.ts`
  (`buildInvoiceDocument()` -> plain data, `renderInvoiceHtml()` -> string, `escapeHtml()`). The service only
  loads data, calls these, and stores. Tests target the pure functions plus the service.
- D3. Per-line tax allocation weights = `lineTaxable * taxRatePct` (falls back to `lineTaxable` if every
  weight is 0 but tax > 0). For single-rate carts this IS proportional-by-taxable-value as requested; for
  mixed-rate carts it keeps 0% lines at 0 tax and puts tax where it was actually charged. Each of the stored
  `cgst`, `sgst`, `igst` is allocated independently, so per-line columns sum EXACTLY to the stored values.
- D4. Rounding: floor each share, then put the remainder paise on the last line that has a positive weight
  (spilling backwards only if a `cap` would be exceeded — used for discount so a line's discount never
  exceeds its gross amount).
- D5. Regime: inter-state (IGST columns) iff `order.igst > 0`, or when the order has zero tax and the
  normalised buyer state != seller state; otherwise intra-state (CGST+SGST). This mirrors what was charged.
  Rates shown: intra -> CGST = SGST = `taxRatePct/2` (e.g. 2.5%), inter -> IGST = `taxRatePct`.
- D6. Regenerate keeps the invoice number and `Invoice.createdAt` (invoice date) and overwrites the same key
  `invoices/<orderId>.html`. The stored URL gets a cache-buster `?v=<Date.now()>` (both `Invoice.url` and
  `order.invoiceUrl`) so links always open the current file even through a CDN; plus a no-cache
  `Cache-Control` on the object.
- D7. Print button: `<button class="no-print" onclick="window.print()">Print / Save as PDF</button>` — the
  only script on the page, a constant. For local storage, `main.ts` overrides headers for `/invoices/` files
  only: a stricter-than-global CSP that additionally allows `script-src-attr 'unsafe-inline'` (safe because
  every interpolated value is HTML-escaped and no other handlers exist) and `Cache-Control: no-cache`.
  S3 objects carry no CSP, so the button works there unchanged.
- D8. GSTIN unset -> header prints `GSTIN: Not registered`; PAN line printed only when GSTIN matches
  `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` (after trim + uppercase), PAN = `gstin.slice(2, 12)`.
  Env fallback `STORE_GSTIN` is kept (existing behaviour); the `'GSTIN-UNSET'` literal is removed.
- D9. The invoice uses the order's delivery address for both Bill To and Ship To; Bill-To name/email/phone
  come from the customer, falling back to the address name/phone (and '-' for email). Known limitation (no
  address snapshot on Order): if the customer later edits that address, a regenerated invoice shows the
  edited address. Not fixed here (would need a schema change); mention in the final summary.

## Items

- [ ] 1. Add GST helpers to `@belzo/shared` with unit tests.
      Create `packages/shared/src/gst.ts` and export it from `packages/shared/src/index.ts`
      (`export * from './gst';`). Contents:
      - `GST_STATES: readonly { code: string; name: string }[]` — all states/UTs: 01 Jammu and Kashmir,
        02 Himachal Pradesh, 03 Punjab, 04 Chandigarh, 05 Uttarakhand, 06 Haryana, 07 Delhi, 08 Rajasthan,
        09 Uttar Pradesh, 10 Bihar, 11 Sikkim, 12 Arunachal Pradesh, 13 Nagaland, 14 Manipur, 15 Mizoram,
        16 Tripura, 17 Meghalaya, 18 Assam, 19 West Bengal, 20 Jharkhand, 21 Odisha, 22 Chhattisgarh,
        23 Madhya Pradesh, 24 Gujarat, 26 Dadra and Nagar Haveli and Daman and Diu, 27 Maharashtra,
        29 Karnataka, 30 Goa, 31 Lakshadweep, 32 Kerala, 33 Tamil Nadu, 34 Puducherry,
        35 Andaman and Nicobar Islands, 36 Telangana, 37 Andhra Pradesh, 38 Ladakh, 97 Other Territory.
      - `gstStateCode(name: string | null | undefined): string | null` — normalise: lowercase, `&` -> `and`,
        strip everything except a-z. Aliases (normalised): `newdelhi`/`nctofdelhi` -> 07, `orissa` -> 21,
        `pondicherry` -> 34, `uttaranchal` -> 05, `chattisgarh` -> 22, `jk` -> 01, `damananddiu` and
        `dadraandnagarhaveli` -> 26, `andamanandnicobar` -> 35. Returns null when unknown/blank.
      - `isValidGstin(g)`, `panFromGstin(g): string | null` (D8).
      - `amountInWordsInr(paise: number): string` — Indian system (crore, lakh, thousand, hundred), title
        case, no "and" inside the rupee part. Format: `Rupees <words> Only`, or
        `Rupees <words> and <words> Paise Only` when paise > 0. 0 -> `Rupees Zero Only`; 50 -> `Rupees Zero
        and Fifty Paise Only`. Amounts >= 100 crore recurse on the crore part (`One Hundred Crore`). Throw
        `RangeError` for non-integer or negative input.
      - `allocateProportional(total: number, weights: number[], caps?: number[]): number[]` (D4). Integers
        only; returns all zeros when total is 0; result always sums to `total` (if every weight is 0, the
        whole total goes to the last index). Use integer math (`Math.floor(total * w / W)`); values are paise
        so products stay well under 2^53.
      Tests: `packages/shared/src/gst.test.ts` (jest + ts-jest, `*.test.ts` pattern; fast-check is available
      and used in `orders.test.ts` / `pricing.test.ts`):
      - words: 0, 50, 100 (`Rupees One Only`), 1006740 (`Rupees Ten Thousand Sixty Seven and Forty Paise Only`),
        1_00_000_00 (`Rupees One Lakh Only`), 12_34_567_89 paise (`Rupees Twelve Lakh Thirty Four Thousand Five
        Hundred Sixty Seven and Eighty Nine Paise Only`), 1 crore, 99,99,99,999.99, 100 crore, 11/19/20/21
        boundaries, negative/non-integer throws.
      - state codes: Karnataka 29, `madhya pradesh` 23, `  DELHI ` 07, `New Delhi` 07, `Jammu & Kashmir` 01,
        `Orissa` 21, unknown -> null, blank/undefined -> null; every entry in GST_STATES round-trips.
      - GSTIN/PAN: valid `29ABCDE1234F1Z5` -> PAN `ABCDE1234F`; invalid/blank -> null.
      - allocation: property test (fast-check) that results sum exactly to total, are non-negative and respect
        caps; remainder lands on the last positive-weight index; zero-weight entries get 0 when another weight
        is positive.
      Files: packages/shared/src/gst.ts, packages/shared/src/gst.test.ts, packages/shared/src/index.ts
      Verify: `pnpm --filter @belzo/shared test` — all suites pass; `pnpm --filter @belzo/shared typecheck`
      and `pnpm --filter @belzo/shared build` succeed (build is required before api/web typecheck).

- [ ] 2. Add optional `cacheControl` to the storage port.
      Add `cacheControl?: string` to `PutObjectInput` in `storage.provider.ts` (doc: defaults to the
      adapter's long-lived immutable policy). In `s3-storage.provider.ts` use
      `CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable'`. `local-storage.provider.ts`
      ignores it (local headers are set by the static server, item 5). Add a test to
      `apps/api/src/integrations/storage/storage-list.spec.ts` (or a new `s3-put.spec.ts` beside it) that
      stubs `client.send` like the existing S3 tests and asserts the `PutObjectCommand` input has the default
      CacheControl when omitted and the given value when provided (`send.mock.calls[0][0].input.CacheControl`).
      Files: apps/api/src/integrations/storage/storage.provider.ts,
      apps/api/src/integrations/storage/s3-storage.provider.ts, apps/api/src/integrations/storage/storage-list.spec.ts
      Verify: `pnpm --filter @belzo/api exec jest src/integrations/storage` passes.

- [ ] 3. Create the pure invoice document builder + HTML template (depends on 1).
      Create `apps/api/src/modules/orders/invoice-document.ts` exporting:
      - `escapeHtml(s: unknown): string` — `& < > " '` -> entities; null/undefined/'' -> '-' via a separate
        `text(v)` helper (escape then default to '-').
      - Types `InvoiceSeller` (name, legalName, address, city, state, stateCode, pincode, gstin|null,
        pan|null, phone, email, website, logoUrl|null, terms), `InvoiceParty` (name, phone, email, line1,
        line2, city, state, stateCode, pincode), `InvoiceLine`, `InvoiceHsnRow`, `InvoiceDocument`.
      - `buildInvoiceDocument(input)` where input = `{ number, invoiceDate: Date, order (snapshot fields +
        items + payments + couponCode + createdAt + id), hsnByVariant: Map<string,string>, address|null,
        customer|null, seller: InvoiceSeller }`. It computes:
        - lines: gross = unitPrice*quantity; discount via `allocateProportional(order.discount, gross[],
          gross[])` (weights = caps = gross); taxable = gross - discount; regime per D5; per-line
          cgst/sgst/igst via `allocateProportional(order.cgst|sgst|igst, weights)` with weights per D3;
          lineTotal = taxable + line taxes; hsn = trimmed `product.hsnCode` or '-'; rate display per D5
          (format halves like `2.5`, no trailing `.0`).
        - totals: taxableTotal = Σ taxable (equals subtotal - discount), cgst/sgst/igst = stored values,
          shipping, codFee, couponCode, discount, computed = taxableTotal + cgst + sgst + igst + shipping +
          codFee, roundOff = order.grandTotal - computed (shown only if != 0), grandTotal = stored value,
          amountInWords = `amountInWordsInr(order.grandTotal)`.
        - HSN summary grouped by `hsn + '|' + taxRatePct`, in first-seen order: taxable, cgst, sgst, igst,
          totalTax; plus a totals row.
        - meta: order short id `order.id.slice(0, 8).toUpperCase()` + full id; dates formatted with
          `Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata' })`;
          payment = latest payment by createdAt, preferring a `captured` one: provider cod -> `Cash on
          Delivery`, razorpay -> `Online (Razorpay` + ` · <method>` if set + `)`, mock -> `Online (test)`;
          status map captured -> `Paid`, created/pending -> `Pending` (COD: `Pending – pay on delivery`),
          failed -> `Failed`, refunded -> `Refunded`, partially_refunded -> `Partially refunded`; none -> '-'.
          Place of supply = buyer state + ` (<code>)` when code known. Reverse charge: `No`.
        - bill-to / ship-to per D9.
      - `renderInvoiceHtml(doc: InvoiceDocument): string` — full A4 document, inline `<style>` only, no
        external assets other than an optional `<img>` for `seller.logoUrl` (only when it matches
        `^https?://`, escaped). Layout: `@page { size: A4; margin: 12mm }`, `@media print { .no-print {display:none} }`,
        system font stack, bordered tables, right-aligned numbers, `thead { display: table-header-group }`,
        `tr { page-break-inside: avoid }`. Sections in order:
        1. Header: "TAX INVOICE" + "ORIGINAL FOR RECIPIENT"; seller block (legal name, trade name if
           different, address lines, city - pincode, `State: <state> (Code <code>)`, `GSTIN: <gstin>` or
           `GSTIN: Not registered`, `PAN: ...` only when derivable, phone, email, website), logo.
        2. Meta grid: Invoice No, Invoice Date, Order No (short id bold + full UUID in small text), Order
           Date, Payment method, Payment status, Place of Supply, Reverse charge: No.
        3. Bill To / Ship To side-by-side (name, phone, email (bill only), address, `State: X (Code NN)`, PIN).
        4. Items table: Sr, Description (title + `SKU: ...` small), HSN, Qty, Unit price, Gross, Discount,
           Taxable value, GST %, then CGST % / CGST ₹ / SGST % / SGST ₹ (intra) or IGST % / IGST ₹ (inter),
           Total; footer row with column sums.
        5. Totals block: Item total (gross), Less: discount (with `Coupon: CODE` when couponCode), Total
           taxable value, CGST + SGST (intra) or IGST (inter), Shipping charges, COD fee (only if > 0),
           Round-off (only if != 0), **GRAND TOTAL**, `Amount in words: ...`.
        6. HSN/SAC summary table: HSN, Rate, Taxable value, CGST/SGST or IGST, Total tax, totals row.
        7. Footer: the declaration sentence verbatim ("We declare that this invoice shows the actual price of
           the goods described and that all particulars are true and correct."), "This is a
           computer-generated invoice and does not require a physical signature.", "For <seller legal name>"
           + "Authorised Signatory", terms (`store.invoiceTerms`, default: "Goods once sold are subject to
           the store's return policy. Returns are accepted only for eligible items within the return window
           shown on the product page."), support line `For support contact <email> | <phone>` (omit missing
           parts), and the Print / Save as PDF button per D7.
        All money via `formatMoney(paise(x))` from `@belzo/shared`; every interpolated string through
        `escapeHtml`/`text`.
      Files: apps/api/src/modules/orders/invoice-document.ts
      Verify: `pnpm --filter @belzo/api typecheck` (after `pnpm --filter @belzo/shared build`) passes.

- [ ] 4. Rewrite `InvoiceService` on top of the builder and add `regenerate()` (depends on 2, 3).
      In `apps/api/src/modules/orders/invoice.service.ts`:
      - Constants `INVOICE_KEY = (id) => \`invoices/${id}.html\``,
        `INVOICE_CACHE_CONTROL = 'no-cache, max-age=0, must-revalidate'`.
      - `private async loadSeller(): Promise<InvoiceSeller>` reads via existing `resolveString`:
        `store.name` (default 'Belzo eMart'), `store.legalName` (default store name), `store.gstin` (else env
        `STORE_GSTIN`, else null), `store.address`, `store.city`, `store.pincode`, `store.state` (else env
        `STORE_STATE`, else 'Karnataka' — same fallback as pricing), `store.phone`, `store.email`,
        `store.website`, `store.logoUrl`, `store.invoiceTerms`; stateCode via `gstStateCode`, pan via
        `panFromGstin`. Missing values stay undefined/null and render '-'.
      - `private async render(orderId, number, invoiceDate): Promise<string>` loads order
        (`include: { items: true, payments: true }`, NotFound if missing), address, customer, variant HSNs
        (queries listed in Facts), calls `buildInvoiceDocument` + `renderInvoiceHtml`, then
        `storage.put({ key, body, contentType: 'text/html; charset=utf-8', cacheControl: INVOICE_CACHE_CONTROL })`
        and returns the url.
      - `generate()`: unchanged contract — existing invoice -> return it; else check order exists BEFORE
        allocating a number, `nextNumber()`, `render(orderId, number, new Date())`, same `$transaction`
        (invoice.create + order.update invoiceUrl).
      - `regenerate(orderId)`: `existing = invoice.findUnique({where:{orderId}})`; if none -> `return
        this.generate(orderId)`. Else `url = await render(orderId, existing.number, existing.createdAt)`;
        `versioned = \`${url.split('?')[0]}?v=${Date.now()}\``; `$transaction([invoice.update({where:{orderId},
        data:{url: versioned}}), order.update({where:{id: orderId}, data:{invoiceUrl: versioned}})])`; return
        `{ url: versioned, number: existing.number }`. Never calls `nextNumber()`.
      - Update the class doc comment (layout, regenerate semantics).
      Files: apps/api/src/modules/orders/invoice.service.ts
      Verify: `pnpm --filter @belzo/api typecheck` passes (the spec is updated in item 6).

- [ ] 5. Admin regenerate endpoint + invoice headers for local static serving (depends on 4).
      - `admin-orders.controller.ts`: inject `InvoiceService` and `AuditLogService`
        (`import { AuditLogService } from '../admin/audit-log.service'`); add
        `@Post(':id/invoice/regenerate') async regenerateInvoice(@CurrentUser() user: JwtPrincipal,
        @Param('id') id: string)` -> `const res = await this.invoices.regenerate(id); await
        this.audit.record(user.sub, 'invoice.regenerate', id, undefined, res); return res;`. Class-level
        `@Roles('order_manager')` already applies. Imports for `CurrentUser`/`JwtPrincipal` as in
        `orders.controller.ts`.
      - `apps/api/src/main.ts`: pass `setHeaders` to `useStaticAssets` — when the served path (normalise `\`
        to `/`) contains `/invoices/`: `res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate')`
        and `res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src-attr 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")`
        (D7). No other paths change.
      - Admin list: no service change needed (rows already include `invoiceUrl`).
      Files: apps/api/src/modules/orders/admin-orders.controller.ts, apps/api/src/main.ts
      Verify: `pnpm --filter @belzo/api typecheck` and `pnpm --filter @belzo/api lint` pass.

- [ ] 6. Tests for the builder, template and service (depends on 3, 4).
      - New `apps/api/src/modules/orders/invoice-document.spec.ts` (pure, no Nest):
        - intra-state 2-line cart with mixed rates (5% and 18%), a discount that does not divide evenly and
          stored cgst/sgst taken from `computeTotals(...)` in `@belzo/shared`: Σ line discount ==
          order.discount, Σ line cgst == order.cgst, Σ line sgst == order.sgst, all igst 0, Σ taxable ==
          subtotal - discount; HTML contains `CGST` and `SGST` headers and not `IGST` column headers.
        - inter-state order (igst > 0): Σ line igst == order.igst, HTML shows IGST columns, no CGST/SGST.
        - a 0% line receives 0 tax when another line is taxed.
        - HSN summary groups two lines with the same HSN+rate into one row; totals equal stored taxes.
        - escaping: title `<script>alert(1)</script>` and address `A & B "x"` appear only escaped
          (`&lt;script&gt;`, `&amp;`, `&quot;`); the only `onclick` in the output is `window.print()`.
        - GSTIN null -> `GSTIN: Not registered` and no `PAN:`; valid GSTIN -> `PAN: ABCDE1234F`.
        - grand total and amount-in-words match `order.grandTotal`; round-off row absent when consistent and
          present when `grandTotal` differs from the computed sum.
        - required fixed texts present: `TAX INVOICE`, `ORIGINAL FOR RECIPIENT`, `Reverse charge`, the
          declaration sentence, `Authorised Signatory`, `Place of Supply` with `(29)` for Karnataka.
        - missing address/customer renders '-' without throwing.
      - Update `apps/api/src/modules/orders/invoice.service.spec.ts`: extend the prisma mock with
        `address.findUnique`, `customer.findUnique`, `variant.findMany` (returns `{id, product:{hsnCode}}`),
        `order.findUnique` including `payments`, `customerId`, `addressId`, `createdAt`, `couponCode`,
        `codFee`, `items[].variantId`, and `invoice.update`; capture `storage.put` input (key, cacheControl).
        Keep the two settings/env tests; replace the `GSTIN-UNSET` test with "prints 'GSTIN: Not registered'
        when neither settings nor env provide a GSTIN" (and asserts `GSTIN-UNSET` absent). Add:
        - `generate()` passes `cacheControl` `no-cache...` and key `invoices/order-1.html`.
        - `regenerate()` with an existing invoice (`number: 'BELZO/2025/00003'`) re-renders the SAME key,
          the HTML contains the same number, `invoiceCounter.upsert` is NOT called (jest.fn), and
          `invoice.update`/`order.update` receive a url starting with the stored url and containing `?v=`.
        - `regenerate()` with no invoice falls back to `generate()` (counter called once).
        - HSN from `variant.findMany` appears in the HTML; new store settings (legalName, address, phone,
          email) appear in the HTML.
      Files: apps/api/src/modules/orders/invoice-document.spec.ts, apps/api/src/modules/orders/invoice.service.spec.ts
      Verify: `pnpm --filter @belzo/api exec jest src/modules/orders src/integrations/storage` passes.

- [ ] 7. Admin settings: "Store & invoice details" section.
      In `apps/web/src/app/admin/settings/page.tsx`:
      - Add `INVOICE_FIELDS: { key; label; type: 'text' | 'textarea'; placeholder? }[]` with: `store.name`
        (Store / trade name), `store.legalName` (Legal business name), `store.gstin` (GSTIN — placeholder
        `29ABCDE1234F1Z5`, hint "leave blank if not registered"), `store.address` (Registered address,
        textarea), `store.city`, `store.state` (State, used for GST: e.g. Karnataka), `store.pincode`,
        `store.phone`, `store.email`, `store.website`, `store.logoUrl` (Logo URL, https), `store.invoiceTerms`
        (Invoice terms / return note, textarea). Remove `store.name`, `store.gstin`, `store.state` from
        `EDITABLE` so each key is edited in one place.
      - Render a new `<div className="admin-form">` with `<h2>Store &amp; invoice details</h2>` above the
        existing "Store settings" form, same label/input markup and `data-testid={\`setting-${key}\`}`,
        `<textarea rows={3}>` for textarea fields, save on blur with `save(key, e.target.value.trim())`, and a
        hint: "Shown on GST tax invoices. Use 'Regenerate invoice' on an order to update an existing invoice."
      - Add `const [loaded, setLoaded] = useState(false)` set true after `load()` resolves (success or catch),
        and render both settings forms only when `loaded`, so `defaultValue` reflects stored values; in text
        onBlur handlers skip `save` when the value is unchanged from `String(current ?? '')`.
      Files: apps/web/src/app/admin/settings/page.tsx
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web lint` pass.

- [ ] 8. Admin orders: open + regenerate invoice (depends on 5).
      In `apps/web/src/app/admin/orders/page.tsx`: add `invoiceUrl: string | null` to `AdminOrder`. In the
      Actions cell add: when `o.invoiceUrl` -> `<a href={o.invoiceUrl} target="_blank" rel="noreferrer"
      data-testid={\`invoice-${o.id}\`}>Invoice</a>`; when status is not `pending` -> a button
      (`data-testid={\`regen-invoice-${o.id}\`}`, label `Regenerate invoice` if `o.invoiceUrl` else
      `Generate invoice`, disabled while busy) calling
      `adminFetch<{ url: string; number: string }>(\`/admin/orders/${o.id}/invoice/regenerate\`, { method: 'POST' })`,
      then `setMsg(\`Invoice ${res.number} updated for #${o.id.slice(0, 8).toUpperCase()}\`)` and `load()`;
      on error `setMsg` with the error message. Keep the existing '—' placeholder logic. Customer page
      `apps/web/src/app/(shop)/orders/[id]/page.tsx` needs no change (it opens `order.invoiceUrl`, which now
      carries the `?v=` cache-buster after regeneration).
      Files: apps/web/src/app/admin/orders/page.tsx
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web lint` pass.

- [ ] 9. Full verification.
      Run in order: `pnpm --filter @belzo/shared test`, `pnpm --filter @belzo/shared build`,
      `pnpm --filter @belzo/api typecheck`, `pnpm --filter @belzo/api test`, `pnpm --filter @belzo/api lint`,
      `pnpm --filter @belzo/web typecheck`, `pnpm --filter @belzo/web lint`. All must pass (pre-existing
      failures unrelated to these files must be reported, not fixed). Optionally render a sample invoice by
      calling `renderInvoiceHtml(buildInvoiceDocument(fixture))` in a throwaway jest test or ts-node script,
      write it to a temp file, and inspect it in a browser for A4 layout; delete the temp file afterwards.
      Then commit on master staging only the files listed above by path.
      Verify: every command above exits 0; `git show --stat HEAD` lists only plan files.

## Gaps / assumptions

- Shipping and COD fee are shown as untaxed charges because the pricing engine does not tax them; this is
  presentation only (no math change). If the business needs GST on shipping, that is a pricing change.
- Address is not snapshotted on Order (D9); regenerated invoices reflect the current address row.
- Seller state code is looked up from `store.state`; GSTIN's first two digits are not cross-checked.
- The relaxed `script-src-attr` CSP applies only to `/api/uploads/invoices/*` (D7); call this out in the
  final summary as a security-relevant change.
