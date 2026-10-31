# COD invoice: UPI payment QR code (2026-10-31)

Request: on an invoice of a Cash on Delivery order, print the shop's payment QR code (photo "WhatsApp Image 2026-10-31 at 10.03.34 AM.jpeg", SBI Payments stand) in place of the "Scan to view your order" QR code. Online orders keep the order QR code.

## What was done
- Read the QR code from the photo. It holds `upi://pay?pa=SBIBHIM.INSTANT97993723982907045@sbipay&tn=StaticQR&mode=01&orgid=180080&purpose=00`, the same UPI ID as printed on the stand.
- The invoice draws the QR code from this text (same drawing for the HTML invoice and the PDF), so it stays sharp when printed on the 80 mm receipt. Under it: "Scan to pay Rs. <amount to pay> by UPI" and "UPI ID: ...".
- Used only when the order is Cash on Delivery and money is still to pay. A COD order that is already marked paid, and every online order, show the order QR code as before.
- New optional admin setting `store.codPaymentQr` (Settings > Store). Empty = the SBI QR code above. Only a `upi://pay?...` link is accepted; anything else is ignored and the SBI QR code is used.
- Files: `apps/api/src/modules/orders/invoice-document.ts` (default link, link check), `invoice-receipt.ts` (row choice), `invoice.service.ts` (setting), `apps/web/src/app/admin/settings/page.tsx` (field). Tests added in `invoice-receipt.spec.ts` and `invoice.service.spec.ts`.

## Checked
- API: tsc, eslint, jest (1124 passed). Web: tsc, eslint.
- A sample COD invoice rendered to PDF, turned into a picture at 100 and 203 dpi, and the QR code read back as the exact link above.
- The static QR code has no amount in it: the customer types the amount (shown under the QR code). Payment goes straight to the shop's SBI account and is not linked to the order automatically.

NOT deployed (ask first). No migration. Invoices already generated keep their old QR code until regenerated.
