# U8.2 Collection, Cash and Proof: NFR Design Patterns

Answers applied: NQ1 = A (proof files deleted one year after the delivery; records and money books kept), NQ2 = A (money alerts as a dashboard list and counters, no e-mail).
U8.1 patterns SP1 to SP9 and RP1 to RP6 still apply to everything here.

## 1. Security patterns

### SP10 Money cannot be tampered with
- The amount to collect comes from the job (`codAmount`, a snapshot taken at assignment). The request carries an amount only for cash, and it must equal the job's amount (BR-C3). The QR amount is set by the server. A credited amount is compared with the QR's amount and the job's amount on the server.
- A partner can only reach collection routes for their own job (404 otherwise, same as U8.1) and only while the job is `arrived`.
- Cash book and collections are protected twice: by the service and by database triggers (append-only book, gapless `seq`, running-balance check, allowed status changes only, positive amounts, unique indexes). SQL written by hand cannot create a second standing collection or count a Razorpay payment twice.
- UPI money never enters the cash book; cash never goes to Razorpay. `void` works only on cash, `refund` only on UPI (BR-C16).

### SP11 Razorpay webhook and status check
- Webhook route stays public but only a valid HMAC-SHA256 signature of the raw body gets past the check (constant-time compare). Unsigned or wrongly signed calls answer 400 and change nothing. Each Razorpay event id is processed once (`WebhookEvent`).
- A QR id that is not ours is ignored, so the merchant's other QR codes on the same Razorpay account cannot create collections.
- The status check asks Razorpay with the server's own keys, so it does not depend on the webhook at all; the two ways are safe to run in any order (idempotent credit by payment id, BR-C12).
- Razorpay secrets stay where they are (environment or the encrypted admin override); nothing new is stored.

### SP12 Uploads (photos and signature)
- Size is capped in the upload interceptor before the body reaches our code (8 MB photo, about 300 KB signature request). Type is decided from the first bytes, never from the file name or declared type (BR-C51). The stored name is made by the server (`delivery-proof/<jobId>/<random>.<ext>`, extension from the detected type), so a name sent by the client cannot reach the path.
- Only the partner who holds the job (and only while `arrived`) can upload; staff and the partner see the URLs; customers never do (BR-C54). Names are random, so a URL cannot be guessed (decision D8 = A; signed URLs remain a later improvement).
- No file is ever executed or rendered as HTML: only JPEG, PNG and WebP are accepted, and they are stored with their detected content type.

### SP13 Rate limits (SECURITY-11)
Per partner token: cash 5 per minute, QR create 6, QR status 30, photo 10, signature 6. The settings and admin money routes use the global limit and need `super_admin`. The mock "mark paid" route exists only when `PAYMENT_PROVIDER=mock` and answers 404 otherwise (checked per request, not just at start-up).

### SP14 Data minimisation and privacy (DPDP)
- From Razorpay payloads only the payment id, QR id, amount and method are kept. The customer's UPI handle, e-mail and phone in the payload are not copied into our tables or logs.
- Proof files are deleted one year after the job ended; the record keeps kind and date (NQ1 = A, BR-C56). Collections and the cash book are financial records and are kept.
- GPS on `proof_added` events follows the existing 90-day clean-up (U8.1).

### SP15 Audit and alerts (SECURITY-13, SECURITY-14, NQ2 = A)
- Every admin money action (settle, adjust, void, refund) writes `AdminAuditLog` with actor, ids, amounts and reason, before and after.
- New security events with fixed names: `delivery.collection.needs_refund`, `delivery.qr.credit_mismatch`, `delivery.refund.failed`, `delivery.cash.settle`, `delivery.cash.adjust`, `delivery.cash.void`. They are written as structured logs.
- Staff see money problems in three places: the dashboard "needs attention" list (jobs flagged `payment_review`), a "refunds to do" list (collections `needs_refund`) and cash in hand per partner on the cash screen. No e-mail (NQ2 = A).

### SP16 Misuse cases considered (SECURITY-11)
1. Partner types a smaller or larger cash amount: refused (`AMOUNT_MISMATCH`).
2. Partner calls collect twice: replay returns the same collection, no second ledger row.
3. Partner claims cash but the customer paid by QR (or the reverse): the QR payment becomes `needs_refund` and flags the job; staff decide.
4. Someone forges a Razorpay webhook: signature check fails.
5. Someone replays a real webhook: event id table and payment-id unique index make it a no-op.
6. Staff member without `super_admin` tries to settle, void or refund: `403`.
7. A partner uploads a script renamed to `.jpg`: content check refuses it.
8. A partner opens another partner's QR or proof: `404`.
9. Voiding cash after delivery to make money disappear: refused (job delivered).
10. Settling more cash than the partner holds: refused (`SETTLEMENT_TOO_LARGE`).

## 2. Resiliency patterns

### RP7 Separate circuit breakers (RESILIENCY-10)
The shared HTTP client opens a circuit on the first failed call per dependency name. QR calls use `razorpay-qr` and UPI refunds use `razorpay-refund`, so a rejected QR call can never stop online checkout. Timeouts: QR create 10 s, close 8 s, fetch 8 s, refund 15 s. A circuit that is open answers fast; the partner sees "collect cash".

### RP8 Outside calls never sit inside a transaction
QR create, QR close, fetch and refund are made before or after the database transaction, never during it (as for the SMS in U8.1). The two-step QR creation (check, call, save) handles a race by closing the extra QR. A refund call that fails changes nothing and can be repeated.

### RP9 Idempotent and repairable
Credit by payment id, cash by replay, QR close by status, `cod.settle` by stock movement marker and invoice number, proof purge by `purgedAt`. Every queue job is safe to run twice. Repair sweeps: `cod-settle-sweep` (hourly), `qr-expiry` (1 min), `proof-retention` (daily). A crash between "delivered" and "stock and invoice" is repaired by the sweep.

### RP10 Ordered locks
Job row first, then partner row, always. Collection steps lock the job; cash book writes lock the partner row inside that. No path locks them the other way round, so two collections for one partner and two jobs cannot deadlock.

### RP11 Graceful degradation (RESILIENCY-10)
| Failure | What happens |
|---|---|
| Razorpay down, circuit open, or QR Codes not enabled | partner is told to collect cash; admin can switch `upiQrEnabled` off |
| Webhook not subscribed or delayed | status check finds the payment within seconds |
| Storage down | upload fails with a plain message; nothing half saved; partner can retry |
| Redis down | cash, QR status and proof still work (state is in Postgres); only queued work waits |
| Worker down | QR expiry and `cod.settle` wait; health shows `deliveryWorker` degraded |
| Refund call fails | `REFUND_FAILED`, collection unchanged, repeatable |

### RP12 Observability and capacity
Counters from the database (collections by status, `needs_refund` open, jobs in `payment_review`, cash in hand per partner) feed the dashboard and cash screen. Rows are tiny; photos are the only large data (at most 3 per delivery) and are deleted after a year.

## 3. Testing patterns (PBT-01 to PBT-10)

| Rule | How U8.2 meets it |
|---|---|
| PBT-01 | "Testable Properties" Q1 to Q12 in `business-rules.md` section 9 |
| PBT-02 | Q12 (signature data URL round trip) |
| PBT-03 | Q1, Q6, Q9, Q10, Q11 (invariants) |
| PBT-04 | Q4 (crediting twice equals once) and Q5 (order does not matter) |
| PBT-05 | Q2, Q3, Q8 (hand-written oracles) |
| PBT-06 | Q1 and Q7 (random operation sequences against a model of the cash book and of collection states) |
| PBT-07 | Reusable generators `arbPaise`, `arbLedgerOp(s)`, `arbCollectionEvent`, `arbUploadSequence`, `arbMagicBytes` in `modules/delivery/testing/` |
| PBT-08 | fast-check defaults (shrinking on), seed printed on failure |
| PBT-09 | fast-check 3.20.0, already installed |
| PBT-10 | Example tests pin: cash happy path, wrong amount, replay, QR paid, QR paid late, double pay, void, settle too much, refund failure, photo limit, fake image refused, proof rule, `cod.settle`; shrunk counterexamples become permanent examples |

Razorpay is tested with recorded answers (create, fetch payments, close, refund, webhook bodies) so no test needs the network.
