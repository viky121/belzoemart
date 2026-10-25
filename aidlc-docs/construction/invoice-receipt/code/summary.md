# Invoice as an 80 mm shop receipt: summary

Request: make the customer invoice look like the attached Reliance Smart Point receipt, using the Belzo details from `App_Bill_Invoice_Developer_Format.docx`. Status: built and verified, **not deployed**.

## What the sheet gave and what was decided

Only section 1 (store details) of the sheet was filled in. For every blank, the screenshot was followed.

| Item | Decision |
| --- | --- |
| Store, GSTIN, FSSAI, phone, e-mail | From the sheet / store settings. Address and phone use the store settings (the sheet has typos: "Brammad colony", phone with 9 digits). |
| FSSAI | New store setting `store.fssai` (Admin > Settings). Must be set in production: 21426510000951. |
| CIN | Left out (sheet says not needed). |
| Title / copy label | "TAX INVOICE", "Original for Recipient" |
| Invoice number | Unchanged: `BELZO/YYYY/NNNNN` |
| Date format | `DD/MM/YYYY HH:MM AM/PM` (India time) |
| Order number | Shown (`#ABCD1234`) plus full order id at the bottom |
| Customer | Name, masked mobile (`98XXXXXX34`), delivery address, place of supply |
| Items | HSN, description, rate, qty, value; CGST/SGST (or IGST) rates printed above each item; MRP and "You save" under the item |
| Totals | Gross sales value (MRP), product discount, coupon discount, net sales value (incl. GST), delivery (FREE when 0), COD fee, round off, TOTAL AMOUNT and amount in words |
| Savings message | "You have saved Rs. X" box = MRP saving + coupon |
| Payment | Mode, status, amount paid, "To Pay on Delivery" for COD, payment reference for online payments |
| GST breakup | By GST rate: taxable, CGST, SGST (or IGST), total. No CESS column (no CESS in the store). |
| QR code | Opens the order page (`<website>/orders/<order id>`) |
| Terms / thanks / support | Store terms (or the default), thank-you line, care number and e-mail, returns policy link `<website>/page/returns-policy` |
| Food declaration | Standard FSSAI wording, printed only when `store.fssai` is set. Please have the accountant confirm the wording. |
| Paper | 80 mm, automatic height, black and white, logo top centre, English |
| Download / share | Same as before: HTML on the order page, PDF attached to the e-mail |

## Changes

- `invoice-receipt.ts` (new): `buildReceipt()` makes a list of rows; the HTML page and the PDF are both drawn from it, so they match. Also the QR code (using the `qrcode` library, pinned `1.5.4`).
- `invoice-pdf.ts`: rewritten, one 80 mm wide page as tall as the bill (Courier).
- `invoice-document.ts`: old A4 template removed; invoice data now also carries date and time, MRP total, savings, payment reference, amount paid and balance due, QR link.
- `OrderItem.mrp` (new, nullable, migration `20261025130000_order_item_mrp`): checkout saves the MRP of each unit when the order is placed. Older orders use today's variant MRP, never below the selling price.
- `invoice.service.ts`: reads `store.fssai`, variant MRP, public website address.
- Admin Settings: new field "FSSAI licence no.".

## Verification

- API: `tsc`, `eslint`, full `jest` (1077 passed). New `invoice-receipt.spec.ts`; old HTML assertions in the other invoice specs updated.
- Migration applied on a scratch database; `prisma migrate diff` against the schema is empty.
- Web: `tsc`, `eslint` on the settings page.
- Looked at the PDF (cash on delivery, same state) and the PDF (online paid, other state) and the HTML page as images.

## To do at deploy

1. `prisma migrate deploy` (adds `order_items.mrp`).
2. Insert setting `store.fssai` = `"21426510000951"` and clear the Redis cache key `setting:store.fssai`.
3. Optional: "Regenerate invoice" in admin re-renders old invoices in the new format (same number and date).
