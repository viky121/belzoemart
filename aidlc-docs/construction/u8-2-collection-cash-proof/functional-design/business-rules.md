# U8.2 Collection, Cash and Proof: Business Rules

Answers applied: FQ1 = A, FQ2 = A, FQ3 = A. Rule ids (BR-C) are used in tests and code. U8.1 rules (BR-D) still apply.

## 1. Collecting the money

| Id | Rule |
|---|---|
| BR-C1 | Only COD jobs have a collection. A prepaid job answers `409 NO_COLLECTION_NEEDED`. |
| BR-C2 | A collection can be started only by the partner who holds the job, only while the job is `arrived` (BR-D22 applies: another partner gets 404). |
| BR-C3 | The amount due is the job's `codAmount`. Cash must equal it exactly, otherwise `422 AMOUNT_MISMATCH` (the message shows the amount due). No part payments, no tips, no rounding. |
| BR-C4 | At most one standing collection per job. Repeating the same cash request returns the existing collection (replay). A different request while one stands answers `409 ALREADY_COLLECTED`. |
| BR-C5 | Cash: in one transaction create the collection (`cash`, `collected`), set the COD `Payment` to `captured` with method `cash`, add a `collected` ledger row, write the event `cash_collected`. |
| BR-C6 | UPI QR: needs setting `upiQrEnabled` (else `409 QR_DISABLED`). "Show QR" closes the job's previous active QR (marks it `closed`; Razorpay is told after commit), asks Razorpay for a single-use, fixed-amount UPI QR for the due amount, then stores it as `active`. |
| BR-C7 | QR details sent to Razorpay: `type upi_qr`, `usage single_use`, `fixed_amount true`, `payment_amount` = due, `name` "Belzo COD <job code>", `description` "Order <job code>", `notes` {jobId, orderId, jobCode, attemptNo}, `close_by` = now + 16 minutes (Razorpay needs at least 15). Our own `expiresAt` = now + `qrValidityMinutes`. |
| BR-C8 | If Razorpay cannot make the QR (QR Codes not enabled, network, timeout), nothing is stored and the partner gets `503 QR_UNAVAILABLE` with the text "UPI QR is not available right now. Please collect cash." |
| BR-C9 | The Razorpay call is made outside the database transaction. If two taps race and a second active QR cannot be saved, the extra QR is closed at Razorpay and the existing one is returned. |
| BR-C10 | QR status (what the partner screen polls every 3 seconds): `none`, `waiting`, `paid`, `expired`. A `waiting` QR past `expiresAt` becomes `expired` and is closed at Razorpay (best effort). While `waiting`, at most once every 5 seconds the service asks Razorpay for the QR's payments and applies a captured payment of the right amount (BR-C11). |

## 2. Crediting a UPI payment (webhook or status check)

| Id | Rule |
|---|---|
| BR-C11 | The event gives a QR id, a payment id, an amount and a method. The webhook is accepted only with a valid Razorpay signature and each event id only once (existing `WebhookEvent`). A QR id that is not ours answers `ignored`. |
| BR-C12 | Crediting is idempotent: if a collection with that `providerPaymentId` exists, nothing changes. The webhook and the status check can arrive in any order. |
| BR-C13 | If the job is active (not delivered, returned or cancelled) and has no standing collection, the payment becomes the standing collection (`upi`, `collected`, amount as received), the QR becomes `paid`, the COD `Payment` becomes `captured` with method `upi` and the Razorpay payment id, event `upi_collected`. This holds even if the QR had expired or been closed, because the customer really paid. No ledger row. |
| BR-C14 | Otherwise (a standing collection already exists, or the job has ended, or the amount differs from the QR) the payment is stored as `needs_refund` and the job is flagged `payment_review`. |
| BR-C15 | Refund of a UPI payment (`needs_refund` or a standing UPI collection of a job that is not delivered): `super_admin`, reason required. Razorpay's refund API is called (outside the transaction); on success the collection becomes `refunded`, and if it was the standing one the COD `Payment` goes back to `pending`. A failed refund call leaves everything as it was (`502 REFUND_FAILED`) and can be repeated. |
| BR-C16 | UPI collections cannot be voided (their money is not with the partner). Cash collections cannot be refunded through Razorpay. |

## 3. Cash book, settlement, void

| Id | Rule |
|---|---|
| BR-C20 | A partner's cash in hand is the last `balanceAfterPaise` in their cash book. Every insert first locks the partner's row, so two writes at once get consecutive `seq` numbers and a correct balance. |
| BR-C21 | Settlement: `super_admin`; amount a whole number of paise, at least 1 and at most the cash in hand (partial allowed); method `cash_deposit`, `bank_transfer` or `upi`; optional reference up to 60 characters. It creates a `DeliverySettlement` and a `settled` ledger row of minus the amount. |
| BR-C22 | Adjustment: `super_admin`; a signed amount that is not zero; reason of 3 to 255 characters. The balance may become negative (the office owes the partner). |
| BR-C23 | Void of a cash collection: `super_admin`; reason of 3 to 255 characters; the collection must be `collected` and `cash`; the job must not be `delivered`. The collection becomes `voided`, the COD `Payment` goes back to `pending`, a `void` ledger row of minus the amount is added, event `cash_voided`. The partner can then collect again. If the cash was already settled the balance goes negative; staff fix it with an adjustment. |
| BR-C24 | Partners see only their own cash in hand and their last 30 days of cash book rows. The cash screens (overview, statements, settle, adjust, void, refund) are `super_admin` only (D3). `order_manager` sees on a job only whether a collection exists, its method and status, and the proof. |
| BR-C25 | No cash limit (FQ3 = A) and no earnings (FQ2 = A). |

## 4. Transition guards and delivery gates (U8.1 extension points)

| Id | Rule |
|---|---|
| BR-C30 | Guard for `reassigned`, `returned`, `cancelled` run by an **admin**: refused while a standing collection exists ("Void the cash first" or "Refund the UPI payment first"). Also refused for `returned` while any `needs_refund` collection of the job is open. |
| BR-C31 | The same cancel run by the **system** because the order was cancelled is allowed. If a standing collection exists, the job is flagged `payment_review` after commit so staff deal with the money. |
| BR-C32 | Gate before `delivered`, payment: a COD job needs a standing collection (`collected`), else `409 PAYMENT_PENDING` ("Collect the payment first"). A job with a `needs_refund` collection and no standing one is also refused. |
| BR-C33 | Gate before `delivered`, proof: the proof rule (setting `proofRule`) must be met by the live proof of the current attempt, else `409 PROOF_REQUIRED` (the message says what is missing). |
| BR-C34 | The gate and guard interfaces now receive the actor (admin, partner or system) and a gate refusal carries a stable error code. |

## 5. COD stock and invoice (FQ1 = A, refined)

| Id | Rule |
|---|---|
| BR-C40 | When a COD job is **delivered**, after commit a queue job `cod.settle` (job id `cod-settle:<jobId>`) runs. It (1) converts the order's reserved stock to a sale and (2) generates the GST invoice. |
| BR-C41 | Why at delivery and not at the moment of collection: a cash collection can still be voided until the delivery completes, and a voided collection must not leave a sale and an invoice behind. The delivery completes seconds after the collection, so the customer's invoice appears right after delivery, which is what option A asked for. |
| BR-C42 | Stock step is idempotent: an item is converted only if no stock movement with reason `sale` and the order id as reference exists for that variant. The invoice step is already idempotent (`InvoiceService.generate` returns the existing invoice). The COD `Payment` is already `captured` from the collection. |
| BR-C43 | A failure retries with the queue's backoff (5 attempts). A delivered job whose `cod.settle` did not finish is repaired by the hourly sweep (finds delivered COD jobs whose order has no invoice, limit 50). A failure never undoes the delivery. |
| BR-C44 | Prepaid jobs are not touched: their stock and invoice were handled when the online payment was captured. |

## 6. Proof of delivery

| Id | Rule |
|---|---|
| BR-C50 | Photos and signature can be added only by the job's partner while the job is `arrived`, to the current attempt. |
| BR-C51 | Photos: at most 3 live photos per attempt (`409 PROOF_LIMIT`). The file type is decided from the file content (JPEG, PNG or WebP magic bytes), never from the name or the declared type; anything else is `422 PROOF_INVALID`. Size at most 8 MB. The stored name is `delivery-proof/<jobId>/<random>.<ext>` with the extension taken from the detected type. |
| BR-C52 | Signature: a PNG sent as a `data:image/png;base64,...` text of at most 200 KB after decoding, checked by content like a photo. A new signature replaces the live one (the old gets `supersededAt`). |
| BR-C53 | Proof rule truth table: `none` always met; `photo` needs 1 or more live photos; `signature` needs a live signature; `any` needs a photo or a signature; `both` needs both. Only the current attempt counts. |
| BR-C54 | Each proof upload writes an event `proof_added` (kind, GPS if given). File URLs are shown only to staff and to the partner who owns the job. They never appear in the customer's tracking or in lists. |
| BR-C55 | An upload that fails after the file was stored removes the stored file (no orphans). This needs a `delete(key)` method on the storage port. |
| BR-C56 | Retention (NQ1 = A): one year after a job's `endedAt`, a daily job deletes its proof files (at most 100 jobs per run) and sets `purgedAt`; the proof row, kind and date stay. Cash book rows and collections are never deleted (financial records). |

## 7. Error codes added

`NO_COLLECTION_NEEDED` 409, `AMOUNT_MISMATCH` 422, `ALREADY_COLLECTED` 409, `QR_DISABLED` 409, `QR_UNAVAILABLE` 503, `PAYMENT_PENDING` 409, `PROOF_REQUIRED` 409, `PROOF_LIMIT` 409, `PROOF_INVALID` 422, `REFUND_FAILED` 502, `SETTLEMENT_TOO_LARGE` 422.

## 8. Validation summary

| Field | Rule |
|---|---|
| amount (settle) | integer, 1 to cash in hand |
| amount (adjust) | non-zero integer, absolute value up to 100 000 000 paise |
| reason | 3 to 255 characters, trimmed, no control characters |
| reference | up to 60 characters, letters, digits, space, `-`, `/`, `_` |
| photo | one file, field `file`, up to 8 MB |
| signature | JSON `{ "image": "data:image/png;base64,..." }`, up to 200 KB decoded |

## 9. Testable Properties (PBT-01)

Framework: fast-check (already installed).

| Id | Component | Property | Category |
|---|---|---|---|
| Q1 | Cash book | After any sequence of valid collect, settle, adjust and void operations, each row's `balanceAfterPaise` equals the previous balance plus its amount, `seq` has no gaps, and the final balance equals the sum of the amounts | Invariant, stateful model (PBT-06) |
| Q2 | Settlement | A settlement is accepted exactly when 1 <= amount <= cash in hand, and it never leaves the balance below the balance before minus the amount | Oracle |
| Q3 | Cash amount rule | A cash collection is accepted if and only if the amount equals `codAmount` | Oracle |
| Q4 | UPI credit | Crediting the same Razorpay payment twice gives the same state as once | Idempotence (PBT-04) |
| Q5 | UPI credit | Webhook then status check, or status check then webhook, end in the same state | Commutativity |
| Q6 | UPI credit | For any sequence of credits, cash collections and voids, the job never has more than one standing collection, and UPI money never appears in the cash book | Invariant |
| Q7 | Collection states | Random sequences of void and refund follow only the allowed changes (`collected` to `voided` or `refunded`, `needs_refund` to `refunded`) | Stateful model |
| Q8 | Proof rule | `proofSatisfied(rule, photos, hasSignature)` equals a hand-written truth table for every rule and for 0 to 3 photos | Oracle |
| Q9 | Proof limits | After any sequence of uploads, a job-attempt never has more than 3 live photos or more than 1 live signature | Invariant |
| Q10 | File type detection | A file made from a valid magic-byte header is detected as its type whatever its name; a file with any other header is rejected; the extension always comes from the detected type | Invariant |
| Q11 | QR validity | `closeBy` is always at least 15 minutes after the creation time, and our `expiresAt` is within 5 to 30 minutes | Invariant |
| Q12 | Signature data URL | Encoding a PNG to a data URL and decoding it returns the same bytes; oversized input is rejected | Round-trip (PBT-02) |

Components with no properties: controllers and the Razorpay HTTP adapter (thin glue, example tests with recorded Razorpay answers).

Generators: `arbPaise`, `arbLedgerOp`, `arbLedgerOps`, `arbCollectionEvent`, `arbProofKind`, `arbUploadSequence`, `arbMagicBytes`, reusable in `modules/delivery/testing/`.
