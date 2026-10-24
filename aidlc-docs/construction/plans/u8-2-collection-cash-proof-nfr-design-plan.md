# NFR Design Plan: U8.2 Collection, Cash and Proof

Inputs: requirements NFR-D1 to NFR-D7, U8.2 functional design, U8.1 NFR design (SP1 to SP9, RP1 to RP6, which still apply), the existing payment and storage code, and the three enabled extensions. Earlier resiliency decisions (backup and restore, single region, and so on) are inherited.

## Plan (checklist)

- [x] Read the functional design and the existing building blocks (resilient HTTP client, webhook handling, storage, audit log)
- [x] Answer the two questions below
- [x] Generate `aidlc-docs/construction/u8-2-collection-cash-proof/nfr-design/nfr-design-patterns.md`
- [x] Generate `.../nfr-design/logical-components.md`
- [x] Record compliance for SECURITY, RESILIENCY and PBT rules
- [x] Present for approval

## A finding that shapes the design

The shared HTTP client opens a circuit after the first failed call to a named dependency (any answer other than 2xx counts as a failure, and the breaker has no minimum number of calls). It is keyed by the dependency name. If QR calls shared the name `razorpay` with checkout, **one rejected QR call (for example "QR Codes not enabled") would stop online checkout payments for 15 seconds.** So QR calls use their own name `razorpay-qr`, and refunds of UPI collections use `razorpay-refund`. Checkout is then never affected by delivery.

## Decisions I made (tell me if you disagree)

1. **Separate circuit breakers** for QR create/close/fetch (`razorpay-qr`) and refunds (`razorpay-refund`). Timeouts: create 10 s, close and fetch 8 s, refund 15 s. No automatic retry of QR create (the partner can tap again); close is retried by the `qr-expiry` job.
2. **Webhook**: the existing signature check (HMAC-SHA256 of the raw body, constant-time compare) and the event-id table protect the `qr_code.*` branch too. A bad signature is a 400 and changes nothing. The status check is a second, independent way to learn about a payment, and always asks Razorpay itself.
3. **Never trust amounts from the client.** The amount to collect is read from the job (`codAmount`, a snapshot), never from the request, except that cash must equal it. The QR amount and the credited amount are compared with the job's amount on the server.
4. **Rate limits** per partner token: cash 5 per minute, QR create 6 per minute, QR status 30 per minute (3-second polling is about 20), photo upload 10 per minute, signature 6 per minute. Admin money actions use the global limit.
5. **Uploads**: memory buffer with a hard size cap in the interceptor (8 MB photo, 300 KB signature request body), type from content, random server-made file names, nothing the client sends is used in the path. Stored files get no executable type. A failed save removes the file.
6. **Money integrity in the database**: cash book append-only with `seq` and balance chain; collection status changes only along allowed paths; positive amounts; unique indexes for one standing collection, one active QR, one Razorpay payment counted once (functional design, section 3). The service rules are repeated there so SQL written by hand cannot break them.
7. **Locks**: job row lock (as in U8.1) for every collection step; partner row lock for every cash book write. Lock order is always job first, then partner, so two writers cannot deadlock.
8. **Audit**: every admin money action (settle, adjust, void, refund) writes `AdminAuditLog` with before and after (amounts and ids, never card or UPI handles). Razorpay payment ids are kept; customer VPA, e-mail and phone from the webhook are **not stored**.
9. **Logs**: payment ids and QR ids may be logged; UPI VPA, contact and e-mail from Razorpay payloads are never logged; the stored `WebhookEvent` payload is the existing behaviour for all events (it already contains what Razorpay sends; no change in this unit).
10. **Security events added** (fixed names, counted on the dashboard like U8.1): `delivery.collection.needs_refund`, `delivery.qr.credit_mismatch`, `delivery.refund.failed`, `delivery.cash.void`, `delivery.cash.adjust`, `delivery.cash.settle`.
11. **Degradation**: Razorpay down or QR Codes not enabled gives "collect cash"; webhook missing is covered by the status check; storage down gives a clear upload error and nothing half-saved; Redis down does not stop cash collection (state is in Postgres).
12. **Health and monitoring**: the existing worker heartbeat covers the new jobs; the dashboard shows counts of `needs_refund` collections, open `payment_review` jobs and cash in hand per partner (data for U8.3).
13. **Capacity**: collections, QR codes and proof are small rows. Photos are the only big data: 3 per delivery at up to 8 MB each in the worst case, usually under 1 MB after the phone shrinks them; fine for the current storage.

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question NQ1
How long should delivery proof photos and signatures be kept? They show customers' doorsteps and homes (DPDP).

A) One year after the delivery, then the files are deleted and the proof record keeps only "photo taken on <date>". The cash book and collections are kept (they are financial records) (recommended)

B) 90 days, then deleted

C) Keep until the order itself is deleted

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question NQ2
Money events that need a person (a UPI payment that must be refunded, a failed refund, a cancelled job still holding cash). How should staff be told?

A) A "needs attention" list and counters on the admin delivery dashboard and cash screen, like the other delivery alerts. No e-mail (recommended to start)

B) Same as A, and an e-mail to an ops address (set in delivery settings) each time one of these happens

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")
