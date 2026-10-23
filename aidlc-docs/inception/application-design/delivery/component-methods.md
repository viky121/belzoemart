# Delivery Module: Component Methods

Signatures only. Business rules (exact validations, rounding, lockout numbers) are written in Functional Design per unit. All money is integer paise. `Actor` is `{ kind: 'admin' | 'partner' | 'system'; id: string }`.

## Shared (`packages/shared/src/delivery`)

```ts
type DeliveryStatus = 'new' | 'assigned' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'arrived'
  | 'delivered' | 'failed_attempt' | 'returned' | 'cancelled';

canMove(from: DeliveryStatus, to: DeliveryStatus, actor: Actor['kind']): boolean
nextMoves(from: DeliveryStatus, actor: Actor['kind']): DeliveryStatus[]
requirementsFor(to: DeliveryStatus): { reason?: boolean; otp?: boolean; payment?: boolean; proof?: boolean }
toTrackingStatus(s: DeliveryStatus): { status: string; label: string }
toOrderStatus(s: DeliveryStatus): OrderStatus | null      // null = leave order unchanged
codDue(order: { grandTotal: number }, collectedPaise: number): number
earningFor(mode: 'flat' | 'percent', value: number, orderTotal: number): number
```

## C1 PartnerRegistry

```ts
PartnerService
  create(actorId: string, dto: CreatePartnerDto): Promise<PartnerView>
  update(actorId: string, id: string, dto: UpdatePartnerDto): Promise<PartnerView>
  setActive(actorId: string, id: string, active: boolean): Promise<void>      // deactivate revokes sessions
  resetPassword(actorId: string, id: string, newPassword: string): Promise<void>
  list(filter: { q?: string; active?: boolean; zoneId?: string; online?: boolean }, page): Promise<Page<PartnerView>>
  suggestFor(pincode: string): Promise<PartnerSuggestion[]>                   // zone match first, then fewest active jobs
  setOnline(partnerId: string, online: boolean): Promise<void>
  heartbeat(partnerId: string, loc?: { lat: number; lng: number }): Promise<void>
ZoneService
  create / update / delete(zone), setPincodes(zoneId, pincodes: string[]), setPartnerZones(partnerId, zoneIds)
```

## C2 PartnerAuth

```ts
PartnerAuthService
  login(mobile: string, password: string, ip: string): Promise<{ accessToken: string; refreshToken: string; partner: PartnerView }>
  refresh(refreshToken: string): Promise<IssuedTokens>
  logout(refreshToken: string): Promise<void>
  changePassword(partnerId: string, current: string, next: string): Promise<void>
PartnerAuthGuard  canActivate(ctx)  // verifies with JWT_PARTNER_SECRET, sets request.partner
```

## C4 DeliveryJobs

```ts
JobService
  assign(actor: Actor, orderId: string, partnerId: string, note?: string): Promise<JobView>
  reassign(actor: Actor, jobId: string, partnerId: string, reason: string): Promise<JobView>   // before picked_up
  accept(partner: PartnerRef, jobId: string): Promise<JobView>
  reject(partner: PartnerRef, jobId: string, reason: string): Promise<JobView>                 // back to 'new'
  pickUp(partner, jobId, loc?): Promise<JobView>
  startRoute(partner, jobId, loc?): Promise<JobView>                                           // out_for_delivery
  arrive(partner, jobId, loc?): Promise<JobView>
  complete(partner, jobId, input: { otp: string; loc?: Geo }): Promise<JobView>               // delivered
  fail(partner, jobId, input: { reason: FailReason; note?: string; loc?: Geo }): Promise<JobView>
  markReturned(actor: Actor, jobId: string, note?: string): Promise<JobView>
  cancel(actor: Actor, jobId: string, reason: string): Promise<JobView>
  expireUnanswered(now: Date): Promise<number>                                                // worker
JobQueryService
  forPartner(partnerId: string, filter: { active?: boolean }, page): Promise<Page<PartnerJobView>>
  getForPartner(partnerId: string, jobId: string): Promise<PartnerJobDetail>                  // 404 if not theirs
  adminList(filter, page): Promise<Page<AdminJobRow>>
  adminGet(jobId: string): Promise<AdminJobDetail>
  dashboard(): Promise<{ counts: Record<DeliveryStatus, number>; attention: AttentionRow[] }>
OrderSyncService
  apply(tx: Tx, job: JobRow, to: DeliveryStatus, actor: Actor): Promise<void>   // Shipment, TrackingEvent, Order status walk
  detachMockShipment(tx: Tx, orderId: string): Promise<void>                      // cancel mock shipment on assign
```

All commands call one private `transition(tx, jobId, to, ctx)` that locks the row, checks `canMove` and the requirements, writes the event and calls `OrderSyncService.apply`.

## C5 DeliveryOtp

```ts
DeliveryOtpService
  issue(jobId: string): Promise<{ sentTo: string }>              // generates, hashes, SMS purpose 'delivery'
  resend(actor: Actor, jobId: string): Promise<{ nextAllowedAt: Date }>
  verify(tx: Tx, jobId: string, code: string): Promise<void>      // throws on wrong, locked, expired
  invalidate(tx: Tx, jobId: string): Promise<void>
  purgeExpired(now: Date): Promise<number>
```

## C6 Collection

```ts
CollectionService
  amountDue(jobId: string): Promise<{ due: number; collected: number; mode: 'cod' | 'prepaid' }>
  collectCash(partner: PartnerRef, jobId: string, amountPaise: number): Promise<CollectionView>
  createQr(partner: PartnerRef, jobId: string): Promise<{ qrId: string; imageUrl: string; amount: number; expiresAt: Date }>
  qrStatus(partner: PartnerRef, jobId: string): Promise<{ status: 'waiting' | 'paid' | 'expired' }>
  markPaidFromQr(event: QrCreditedEvent): Promise<void>            // idempotent
  expireQrs(now: Date): Promise<number>
QrPaymentHandler  handle(verification: WebhookVerification, raw: Buffer): Promise<{ status: string }>
```

## C7 CashLedger

```ts
LedgerService
  record(tx, entry: { partnerId; jobId?; kind: 'collected' | 'settled' | 'adjustment' | 'void'; amountPaise; note? }): Promise<void>
  balance(partnerId: string): Promise<{ cashInHand: number; lastSettledAt?: Date }>
  statement(partnerId, range, page): Promise<Page<CashEntryView>>
SettlementService
  settle(actorId: string, partnerId: string, amountPaise: number, note?: string): Promise<SettlementView>
  adjust(actorId, partnerId, amountPaise, reason): Promise<void>
  void(actorId, entryId, reason): Promise<void>
EarningsService
  accrue(tx, job: JobRow): Promise<void>
  summary(partnerId, range): Promise<EarningsSummary>
```

## C8 Proof

```ts
ProofService
  add(partner: PartnerRef, jobId: string, files: UploadedFile[], signature?: Buffer, loc?: Geo): Promise<ProofView>
  satisfies(jobId: string, rule: ProofRule): Promise<boolean>
  list(jobId: string): Promise<ProofView[]>                       // admin and the job's partner only
```

## C9 Tracking

```ts
TrackingService
  byToken(token: string): Promise<PublicTrackingView>
  rate(token: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string): Promise<void>
```

## C10 DeliveryNotifier and C11 Settings and C12 Worker

```ts
DeliveryNotifier
  notify(jobId: string, event: 'assigned' | 'cancelled' | 'delivered' | 'failed'): Promise<void>
DeliverySettingsService
  get(): Promise<DeliverySettings>
  update(actorId: string, patch: Partial<DeliverySettings>): Promise<DeliverySettings>
DeliveryWorker
  onModuleInit(): void                 // starts Worker on QUEUES.DELIVERY and upserts the 4 job schedulers
  onModuleDestroy(): Promise<void>
```

## C15 and C16 Integration

```ts
// PaymentProvider (extended; mock implements a fake)
createUpiQr(input: { amountPaise: number; reference: string; closeBy: Date; notes: Record<string, string> }):
  Promise<{ providerQrId: string; imageUrl: string }>
closeQr(providerQrId: string): Promise<void>
// WebhookVerification gains: qrCodeId?: string; notes?: Record<string, string>

WebhookEventRouter
  register(prefix: string, handler: (v: WebhookVerification, raw: Buffer) => Promise<{ status: string }>): void
  route(v: WebhookVerification, raw: Buffer): Promise<{ status: string } | null>
```

## HTTP surface (summary)

| Area | Routes |
|---|---|
| Partner auth | `POST /partner/auth/login`, `/refresh`, `/logout`, `POST /partner/auth/password` |
| Partner app | `GET /partner/me`, `POST /partner/me/online`, `POST /partner/me/heartbeat`, `GET /partner/jobs`, `GET /partner/jobs/:id`, `POST /partner/jobs/:id/{accept,reject,pickup,start,arrive,fail,complete,otp/resend}`, `POST /partner/jobs/:id/proof`, `POST /partner/jobs/:id/cash`, `POST /partner/jobs/:id/qr`, `GET /partner/jobs/:id/qr/status`, `GET /partner/cash` |
| Admin | `GET /admin/delivery/dashboard`, `GET/GET :id /admin/delivery/jobs`, `POST /admin/orders/:orderId/assign`, `POST /admin/delivery/jobs/:id/{reassign,cancel,return}`, `/admin/delivery/partners` CRUD, `/admin/delivery/zones` CRUD, `GET /admin/delivery/cash`, `POST /admin/delivery/cash/{settle,adjust,void}`, `GET/PUT /admin/delivery/settings` |
| Public | `GET /t/:token` (API: `GET /tracking/:token`), `POST /tracking/:token/rating` |
| Webhook | existing `POST /payments/webhook`, new branch for `qr_code.credited` |
