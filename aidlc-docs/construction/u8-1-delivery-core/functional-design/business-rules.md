# U8.1 Delivery Core: Business Rules

Answers applied: FD1 = A (OTP valid 4 hours), FD2 = A (undeliverable order is cancelled), FD3 = A (3 attempts), FD4 = A (OTP to the delivery address phone), FD5 = A (partner sees the area first).
Rule ids (BR-D) are used in tests and code comments.

## 1. Partners and login

| Id | Rule |
|---|---|
| BR-D1 | Mobile is 10 digits starting with 6 to 9, unique across partners. Names 2 to 80 characters. |
| BR-D2 | Password at least 8 characters. Stored as argon2id. An admin sets the first password and every reset; both set `mustChangePassword`. |
| BR-D3 | Login: normalise the mobile, check the lockout, check the password, check the partner is active. Unknown mobile, wrong password and inactive partner all answer `401 Invalid mobile or password`. |
| BR-D4 | 5 failed logins for the same mobile in 15 minutes lock login for the rest of the window (`429`). Successful login records a success. |
| BR-D5 | With `mustChangePassword` the access token only works on the change-password route. The new password must differ from the old one. |
| BR-D6 | Access tokens are signed with `JWT_PARTNER_SECRET`. Refresh tokens rotate; reuse revokes the family. Deactivating a partner or resetting the password revokes all their refresh tokens. The guard also checks that the partner is still active on each request. |
| BR-D7 | A partner token is rejected by every customer and admin route (different secret). Admin and customer tokens are rejected by partner routes. |
| BR-D8 | A partner may go online only when active. The stale job sets partners offline after `offlineAfterMinutes` without a call. Being offline does not stop an admin from assigning. |
| BR-D9 | A pincode belongs to at most one zone. Zones and coverage are used only to order suggestions (BR-D13). |

## 2. Assignment

| Id | Rule |
|---|---|
| BR-D10 | An order can be assigned when its status is `confirmed`, `packed`, `shipped` or `out_for_delivery` and it has no active job. Pending, cancelled, delivered and returned orders are refused (`409`). (`shipped` and `out_for_delivery` are allowed only so an order whose earlier job was cancelled is not stuck.) |
| BR-D11 | The target partner must be active and have fewer than `maxActiveJobs` active jobs (statuses `assigned`, `accepted`, `picked_up`, `out_for_delivery`, `arrived`, `failed_attempt`). |
| BR-D12 | The order must have a delivery address with a valid pincode and a valid OTP phone (BR-D30), otherwise `409` with a clear message. |
| BR-D13 | Suggestions: active partners with free capacity, ordered by zone match for the order's pincode, then online first, then fewest active jobs, then name. Any active partner can still be chosen (F7). |
| BR-D14 | Assigning creates the job (or, for an existing job in `new`, a new assignment), sets `responseDeadlineAt = now + acceptTimeoutMinutes`, snapshots the destination, creates the `inhouse` Shipment, cancels any other (mock or courier) shipment of the order, and moves a `confirmed` order to `packed`. All in one transaction. |
| BR-D15 | Assignment is audited (`delivery.assign`) with admin id, order id, partner id. |
| BR-D16 | Reassign is allowed from `assigned`, `accepted`, `picked_up`, `out_for_delivery`, `failed_attempt` while no payment is collected (BR-D45). It closes the old assignment (`reassigned`), resets `attemptsUsed` to 0 and gives the new partner a fresh deadline. The reason is required (3 to 255). |
| BR-D17 | Unassign (admin) is allowed from `accepted` and returns the job to `new`. |
| BR-D18 | Reject (partner, from `assigned`) needs a reason of 3 to 255 characters. Reject and timeout return the job to `new`, clear the partner, set `attention = rejected` or `no_reply`, and add an event. The same partner is not suggested first for that order again. |
| BR-D19 | The timeout job expires every `assigned` job whose deadline passed, once, in its own transaction. |

## 3. Status machine

| Id | Rule |
|---|---|
| BR-D20 | Allowed moves (event: from to): `assigned` (new to assigned; admin, system); `reassigned` (assigned, accepted, picked_up, out_for_delivery, failed_attempt to assigned; admin); `accepted` (assigned to accepted; partner); `rejected` (assigned to new; partner); `expired` (assigned to new; system); `unassigned` (accepted to new; admin); `picked_up` (accepted to picked_up; partner); `out_for_delivery` (picked_up to out_for_delivery; partner); `arrived` (out_for_delivery to arrived; partner); `failed_attempt` (out_for_delivery or arrived to failed_attempt; partner, reason code); `force_failed` (arrived to failed_attempt; admin, reason); `delivered` (arrived to delivered; partner); `retry` (failed_attempt to out_for_delivery; partner, while attempts remain); `returned` (failed_attempt to returned; admin); `cancelled` (new, assigned, accepted, picked_up, out_for_delivery, arrived, failed_attempt to cancelled; admin, system). `delivered`, `returned`, `cancelled` are final. (`arrived` is added to the PHP cancel list so a job at the door can be cancelled.) |
| BR-D21 | Every move runs in one transaction: lock the job row, check the actor is allowed, check the old status, check the extra guards, compare-and-set the status, write the event, update the order side (BR-D50 to BR-D56), then commit. |
| BR-D22 | A partner command on a job that is not theirs answers `404`, never `403`. |
| BR-D23 | A repeat of the same partner command (same event, job already in the target status, same attempt) answers `200` with the current job and writes nothing. |
| BR-D24 | If the order has been cancelled, every partner command answers `409 ORDER_CANCELLED` and the job is cancelled by the next worker run (BR-D58). |
| BR-D25 | Reasons: reject, reassign, unassign, force-fail, cancel, return need 3 to 255 characters. `failed_attempt` needs a code from `customer_unavailable`, `wrong_address`, `refused`, `phone_unreachable`, `reschedule_requested`, `cash_unavailable`, `other`; `other` needs a note of 3 to 255 characters. |
| BR-D26 | Location (lat -90 to 90, lng -180 to 180) is optional on partner moves and stored on the event. No distance check is made (no coordinates on Belzo addresses). |

## 4. Delivery OTP

| Id | Rule |
|---|---|
| BR-D30 | OTP phone: the delivery address phone of the order, normalised to 10 digits; if invalid or missing, the account phone of the customer; if neither is valid, assignment is refused (BR-D12). An admin may correct it for one job (audited event `contact_changed`). |
| BR-D31 | A new 6-digit code (random, cryptographically strong) is made when the partner starts the route (`picked_up` to `out_for_delivery`) and on each retry. It is valid for `otpValidMinutes` (240). The previous code of the job becomes `superseded`. |
| BR-D32 | Only a peppered HMAC hash is stored. The code is never returned by any API, written to a log, or put in an event. In development the mock SMS provider shows it in the server log only. |
| BR-D33 | Sending uses the SMS port with purpose `delivery`. If sending fails, the job still moves; `sendStatus = failed` and the partner sees "Resend OTP". |
| BR-D34 | Resend makes a new code (the old becomes `superseded`). Allowed only in `out_for_delivery` or `arrived`, at most `otpMaxSends` (5) sends per attempt, and not sooner than `otpResendSeconds` (60) after the last send (`429` with the wait time). |
| BR-D35 | Verify (partner, in `arrived`): compare in constant time. A wrong code adds 1 to `wrongGuesses`. At `otpMaxWrongGuesses` (5) the job is locked until now + `otpLockoutMinutes` (15) and the OTP becomes `locked`. While locked, every verify answers `423` without checking the code. An admin can clear the lock (audited) and then the partner resends. |
| BR-D36 | An expired code answers `410`; the partner resends. |
| BR-D37 | A correct code sets the OTP `verified` with the time. |
| BR-D38 | `delivered` needs a `verified` OTP of the current attempt that was verified at most `otpVerifiedFreshMinutes` (30) ago. Otherwise `409 OTP_NOT_VERIFIED` or `OTP_STALE`. Admins have no way around this (no admin delivered action exists). The database trigger repeats the rule. |
| BR-D39 | Expired active OTPs are marked `expired` by the cleanup job; rows older than 30 days are deleted. |

## 5. Attempts

| Id | Rule |
|---|---|
| BR-D40 | `attemptsUsed` goes up by 1 on every `failed_attempt` or `force_failed`. |
| BR-D41 | `retry` is allowed while `attemptsUsed < maxAttempts`. At the limit the partner cannot retry; `attention = max_attempts` and the admin must reassign, return or cancel. |
| BR-D42 | Reassign resets `attemptsUsed` (BR-D16). |

## 6. Payment hooks (filled in U8.2)

| Id | Rule |
|---|---|
| BR-D45 | Extension point `TransitionGuard`: before `reassigned`, `returned` and `cancelled`, every registered guard may refuse (U8.2: a collected payment must be voided first). With no guards registered, nothing is refused. |
| BR-D46 | Extension point `CompletionGate`: before `delivered`, every registered gate must pass (U8.2: payment collected for COD, proof rule). With no gates, only the OTP rule (BR-D38) applies. |

## 7. Order, shipment and customer timeline sync

| Id | Rule |
|---|---|
| BR-D50 | The order never moves backwards. The order status after a job move is the furthest of its current status and the status in the table below. |
| BR-D51 | `assigned`: order `confirmed` becomes `packed`; Shipment `packed`; tracking event "Assigned to a delivery partner" (status `assigned`). |
| BR-D52 | `accepted`: tracking event "Delivery partner accepted" (status `accepted`). |
| BR-D53 | `picked_up`: order `shipped`; Shipment `shipped`; event "Picked up" (status `picked_up`). |
| BR-D54 | `out_for_delivery` (also on retry): order `out_for_delivery`; Shipment `out_for_delivery`; event "Out for delivery". `arrived`: event "Delivery partner has arrived"; order unchanged. |
| BR-D55 | `failed_attempt`: order unchanged; event "Delivery attempt unsuccessful" with a fixed customer-safe text (the partner's note and reason code are never shown to the customer). `new` after reject, timeout or unassign: event "Waiting for a delivery partner". `reassigned`: event "Reassigned to another delivery partner". |
| BR-D56 | `delivered`: order `delivered`; Shipment `delivered`; event "Delivered". `returned` (FD2 = A): the order becomes `cancelled` with reason "Undeliverable, returned to shop"; stock returns to inventory; a captured prepaid payment is refunded through the existing refund flow; Shipment `rto`; event "Returned to seller". This needs the order state machine to allow `shipped` to `cancelled` and `out_for_delivery` to `cancelled` for this system action only (customers still cannot cancel after shipping). |
| BR-D57 | `cancelled` (job): the order status does not change; the Shipment is cancelled; event "Delivery cancelled". The order can then be assigned again (BR-D10) or moved by the admin as today. |
| BR-D58 | When an order is cancelled by the customer or an admin, the order service queues `order.cancelled` on the `delivery` queue; the worker cancels the order's active job as `system` (BR-D57 without a second order change). |
| BR-D59 | The existing fulfilment step skips orders that have an active job, so no mock shipment is created behind a job's back. |
| BR-D60 | Tracking statuses `assigned`, `accepted`, `arrived`, `failed_attempt` get labels in the shared package. For progress ranking `assigned` and `accepted` count as `packed`, `arrived` and `failed_attempt` count as `out_for_delivery`. |

## 8. Visibility (FD5 = A)

| Id | Rule |
|---|---|
| BR-D70 | Partner list and detail while status is `assigned`: code, city, pincode, item count, payment mode, COD amount, assigned time, deadline. No name, street address or phone. |
| BR-D71 | After Accept: also customer name, phone, full address, a Google Maps search link made from the address text, item list (title and quantity), notes. |
| BR-D72 | A partner can open a job only while they are its current partner, or if they delivered it (history, last 30 days). After reject, expiry, reassignment or cancel the job answers `404` to them. |
| BR-D73 | A partner's job list shows active jobs first, then delivered jobs of the last 30 days. |
| BR-D74 | Admin screens see everything. Admin actions need: `order_manager` or `super_admin` for jobs, assign, partners and zones; `super_admin` for delivery settings (D3). |

## 9. Audit

| Id | Rule |
|---|---|
| BR-D80 | Admin commands write `AdminAuditLog`: `delivery.assign`, `.reassign`, `.unassign`, `.cancel`, `.return`, `.force_fail`, `.otp_unlock`, `.contact_change`, `.partner.create`, `.partner.update`, `.partner.deactivate`, `.partner.reset_password`, `.zone.*`, `.settings.update`. Passwords and OTPs never appear in audit data. |
| BR-D81 | Every status change and OTP action writes a `DeliveryEvent`. |

## 10. Validation summary

| Field | Rule |
|---|---|
| mobile | `^[6-9][0-9]{9}$` |
| pincode | `^[1-9][0-9]{5}$` |
| password | 8 to 72 characters |
| reason, note | 3 to 255 characters, trimmed, no control characters |
| lat, lng | numbers within range |
| page size | 1 to 100 |

## 11. Testable Properties (PBT-01)

Framework: fast-check 3.20.0 (already a dependency of `apps/api` and `packages/shared`), run by Jest.

| Id | Component | Property | Category |
|---|---|---|---|
| P1 | Status machine (shared) | From any status, any sequence of allowed moves never leaves a final status | Invariant |
| P2 | Status machine | `delivered` is reachable only from `arrived` | Invariant |
| P3 | Status machine | `canMove(from, to, actor)` agrees with the BR-D20 table for every status pair and actor | Oracle (the table is the reference model) |
| P4 | Status machine, job service | A random sequence of commands run against the real `JobService` (in-memory repository) and against a simple model gives the same status and `attemptsUsed` after every step | Oracle, stateful model (PBT-06) |
| P5 | Order sync table (shared) | `toOrderStatus` never lowers the order's progress rank (BR-D50) | Invariant |
| P6 | Delivery OTP | `verify(code)` succeeds only for the code that was issued; the wrong-guess counter never decreases; after the limit every verify is refused until unlock | Invariant |
| P7 | Delivery OTP | `hashOtp(jobId, attemptNo, code)` is deterministic and differs when any input differs | Invariant |
| P8 | Delivery OTP | Resend never exceeds `otpMaxSends` and never happens sooner than the cooldown | Invariant |
| P9 | Attempts | `attemptsUsed` never exceeds `maxAttempts` through partner commands; reassign resets it | Invariant |
| P10 | Retry or replay | Applying the same partner command twice leaves the same state as applying it once (BR-D23) | Idempotence |
| P11 | Mobile and pincode helpers | `normalizeMobile(format(m)) = m` for valid mobiles; normalising twice equals normalising once | Round-trip, idempotence |
| P12 | Partner job scoping | For any set of jobs and partners, a partner's list and detail contain only their own jobs and never fields hidden by BR-D70 before accept | Invariant |
| P13 | Suggestions | Order is deterministic and zone-matching partners always come first | Invariant |
| P14 | Tracking token | Tokens are unique across a large sample and have at least 32 bytes of entropy | Invariant |

Components with no PBT properties: controllers and DTO wiring (thin glue, covered by example tests); settings reader (simple default lookup, example tests).

Generators (PBT-07) are reusable test utilities: `arbDeliveryStatus`, `arbActor`, `arbCommandSequence`, `arbMobile`, `arbPincode`, `arbJobSnapshot`, `arbOtpCode`, built from the domain constraints above, with boundary values (0 attempts, limit, limit + 1) included.
