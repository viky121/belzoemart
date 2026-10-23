# Functional Design Plan: U8.2 Collection, Cash and Proof

Inputs: requirements DL-4.3, DL-4.4, DL-5.1 to DL-5.7, DL-8.1 (`qr-expiry`); the approved application design; U8.1 as built (`JobService`, `DeliveryGateRegistry`, `PartnerService`, `JobRepository`); the PHP module's cash, ledger and proof rules; and the existing Belzo payment, inventory and invoice code.

## Plan (checklist)

- [x] Read the PHP rules (cash ledger, settlement, void, proof) and the Razorpay QR Codes API
- [x] Read how COD payments, stock and invoices work in Belzo today
- [x] Answer the three questions below (all A)
- [x] Generate `aidlc-docs/construction/u8-2-collection-cash-proof/functional-design/domain-entities.md`
- [x] Generate `.../business-rules.md` (with the PBT "Testable Properties" table)
- [x] Generate `.../business-logic-model.md`
- [x] Check against DL-4.3, DL-4.4, DL-5.1 to DL-5.7 and the three extensions
- [x] Present for approval

## What I found

### Razorpay QR Codes (checked in Razorpay's documentation)
- Create: `POST /v1/payments/qr_codes` with `type: upi_qr`, `usage: single_use`, `fixed_amount: true`, `payment_amount` (paise), `name`, `description`, `close_by`, `notes` (up to 15 pairs). The answer has `id` and `image_url` (a hosted image link we can show in the partner app).
- **`close_by` must be at least 15 minutes ahead.** So Razorpay's own expiry can never be shorter than 15 minutes. Our shorter window (10 minutes by default) is enforced by closing the QR ourselves (`POST /v1/payments/qr_codes/:id/close`) when it runs out.
- Payment confirmation: webhook `qr_code.credited` (carries the payment and the QR; the payment has no `order_id`). We can also ask Razorpay directly: `GET /v1/payments/qr_codes/:id/payments`.
- If QR Codes is not enabled on the account, the create call fails. The partner app then says "UPI QR is not available, collect cash".

### Belzo today (gaps that matter for COD)
1. A COD order has a `Payment` row (`provider cod`, `pending`) and **nothing ever marks it captured**.
2. For a COD order the reserved stock is **never converted to a sale** (only online payments do that), and **no GST invoice is generated** (invoices are queued only after an online payment).
3. Refund code skips COD payments; a COD return goes to the customer's wallet.

## Decisions I made (tell me if you disagree)

1. **One collection per job.** The partner collects the full COD amount in one go, cash or UPI. No part-cash part-UPI. The amount must equal the order total exactly (paise).
2. **When**: only while the job is `arrived` (the customer is at the door), and only for COD jobs. Prepaid jobs have no collection.
3. **Cash**: the partner taps "Cash received" and confirms the amount shown. Repeating the tap returns the same collection.
4. **UPI QR**: one active QR per job. "Show QR" creates a single-use, fixed-amount Razorpay QR for the exact amount (notes carry the job id). Our window is **10 minutes** (setting, 5 to 30); at the end we close it at Razorpay. "New QR" closes the old one first.
5. **Confirmation never comes from the partner.** The webhook `qr_code.credited` confirms it, and the partner screen's status check also asks Razorpay directly (at most every 5 seconds per QR). So it still works if the `qr_code.credited` event has not been switched on in the Razorpay dashboard, just a few seconds slower.
6. **Late or double payments**: if a QR is paid after cash was taken, after the job ended, or twice, the money is real. The collection is stored as `needs_refund`, the job is flagged `payment_review`, and an admin refunds it through Razorpay from the cash screen. The refund marks the collection `refunded`.
7. **UPI money is not partner cash.** UPI collections never enter the cash ledger; the money is already in the Razorpay account.
8. **Cash ledger**: append-only rows per partner with a running balance (collected +, settled -, void -, adjustment +/-). Settlement: `super_admin`, amount between 1 paise and the cash in hand, partial allowed, method (cash deposit, bank transfer, UPI) and a reference. Adjustment: `super_admin`, signed, reason required. Void of a **cash** collection: `super_admin`, reason required, only before the job is delivered; the COD `Payment` goes back to `pending`.
9. **Guard**: reassign, return and cancel by staff are refused while a collection stands ("void the cash" or "refund the UPI payment" first). When the system cancels a job because the order was cancelled, it is allowed and the job is flagged `payment_review` so staff deal with the money.
10. **Delivered gates**: for COD a collection must exist and not be `needs_refund`; then the proof rule must pass. The OTP rule from U8.1 still applies.
11. **Proof**: up to 3 photos and one signature per attempt, only while `arrived`. Photos: JPEG, PNG or WebP checked by file content, 8 MB each, stored with unguessable names; the app shrinks them before upload. Signature: PNG as a data URL, up to 200 KB; a new one replaces the old. Proof rule setting `delivery.proofRule`: `none`, `photo`, `signature`, `any` (default), `both`. Proof is shown to staff and to the partner who took it, not to the customer.
12. **Mock mode** (`PAYMENT_PROVIDER=mock`): QR creation returns a placeholder picture, and a development-only button/endpoint "mark paid" confirms it, so the flow can be tried without Razorpay. That endpoint does not exist when `PAYMENT_PROVIDER=live`.
13. **New settings**: `delivery.upiQrEnabled` (true), `delivery.qrValidityMinutes` (10), `delivery.proofRule` (any), `delivery.cashLimitPaise` (0 = no limit; see FQ3), `delivery.earningsFlatPaise` (0), plus the per-partner override in FQ2.
14. **Tracking-safe**: nothing about money or proof goes into the customer timeline text.

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question FQ1
When a COD order is paid (cash or UPI) at the door, what should Belzo do with the order's stock and invoice? Today a COD order never gets its stock converted to a sale and never gets a GST invoice.

A) At the moment the payment is collected: mark the payment captured, convert the reserved stock to a sale, and generate the GST invoice (the customer's invoice is then available in My Orders right after delivery) (recommended)

B) Only mark the payment captured. Stock and invoice stay as they are today (you handle them by hand)

C) Mark the payment captured and convert the stock, but do not generate the invoice automatically

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FQ2
Do you want to track what each delivery partner earns per delivery? (The PHP module did.)

A) No. The partners are salaried staff; skip earnings for now (recommended: nothing is lost, it can be added later without changing deliveries)

B) Yes, a flat fee per delivery: one default fee in settings, and an optional different fee per partner

C) Yes, a flat fee plus a percentage of the order total

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FQ3
Should there be a limit on the cash a partner can hold before they must settle with the office?

A) No limit now. Staff watch the cash screen (recommended to start)

B) A limit in settings (default: off). When a partner's cash in hand is over the limit, they cannot be given new jobs until the office settles with them

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")
