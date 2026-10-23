# Component Methods — Belzo eMart (Phase 1)

Method signatures with high-level purpose and I/O types. TypeScript-style signatures. Detailed business
rules are defined per-unit in Functional Design. Types like `UUID`, `Money` (integer paise), and DTOs are
defined in `packages/shared`.

## Identity (C-11)

```ts
interface IdentityService {
  requestOtp(input: { phone: string }): Promise<{ requestId: string; expiresAt: string }>;
  verifyOtp(input: { requestId: string; code: string }): Promise<AuthTokens & { user: CustomerDto }>;
  registerEmail(input: { email: string; password: string; name: string }): Promise<CustomerDto>;
  loginEmail(input: { email: string; password: string }): Promise<AuthTokens & { user: CustomerDto }>;
  loginSocial(input: { provider: 'google'; idToken: string }): Promise<AuthTokens & { user: CustomerDto }>;
  refresh(input: { refreshToken: string }): Promise<AuthTokens>;         // rotates refresh token
  logout(input: { refreshToken: string }): Promise<void>;               // invalidates session
  getProfile(userId: UUID): Promise<CustomerDto>;
  updateProfile(userId: UUID, patch: ProfilePatchDto): Promise<CustomerDto>;
  requestDataExport(userId: UUID): Promise<{ jobId: string }>;          // DPDP
  requestAccountDeletion(userId: UUID): Promise<{ jobId: string }>;     // DPDP
}

interface AddressService {
  list(userId: UUID): Promise<AddressDto[]>;
  add(userId: UUID, input: AddressInputDto): Promise<AddressDto>;
  update(userId: UUID, addressId: UUID, patch: AddressInputDto): Promise<AddressDto>;
  remove(userId: UUID, addressId: UUID): Promise<void>;
  resolvePincode(pincode: string): Promise<{ city: string; state: string } | null>;
}

interface AdminUserService {
  login(input: { email: string; password: string; mfaCode?: string }): Promise<AuthTokens & { admin: AdminDto }>;
  create(actor: UUID, input: AdminInputDto): Promise<AdminDto>;
  assignRole(actor: UUID, adminId: UUID, roleId: UUID): Promise<void>;
  enableMfa(adminId: UUID): Promise<{ otpauthUrl: string }>;
}

interface RbacService {
  hasPermission(principalId: UUID, permission: string): Promise<boolean>;
  listRoles(): Promise<RoleDto[]>;
  upsertRole(input: RoleInputDto): Promise<RoleDto>;
}
```

## Catalogue (C-12) & Inventory (C-12b)

```ts
interface ProductService {
  get(idOrSlug: string): Promise<ProductDetailDto>;
  list(query: ProductQueryDto): Promise<Paginated<ProductCardDto>>;
  create(actor: UUID, input: ProductInputDto): Promise<ProductDto>;
  update(actor: UUID, id: UUID, patch: ProductInputDto): Promise<ProductDto>;
  setStatus(actor: UUID, id: UUID, status: 'draft'|'published'|'archived'): Promise<void>;
  bulkUpsert(actor: UUID, rows: ProductCsvRow[]): Promise<BulkResult>;   // CSV import
}

interface VariantService {
  listByProduct(productId: UUID): Promise<VariantDto[]>;
  upsert(actor: UUID, productId: UUID, input: VariantInputDto): Promise<VariantDto>;
}

interface CategoryService {
  tree(): Promise<CategoryNodeDto[]>;                                   // unlimited depth
  upsert(actor: UUID, input: CategoryInputDto): Promise<CategoryDto>;
}

interface InventoryService {
  getStock(variantId: UUID): Promise<number>;
  reserve(variantId: UUID, qty: number, ref: string): Promise<void>;    // throws if insufficient
  release(variantId: UUID, qty: number, ref: string): Promise<void>;
  adjust(actor: UUID, variantId: UUID, delta: number, reason: string): Promise<void>;
}
```

## Cart (C-13), Pricing (C-14), Coupon (C-15)

```ts
interface CartService {
  getCart(cartRef: CartRef): Promise<CartDto>;                          // cartRef = userId or guest token
  addItem(cartRef: CartRef, variantId: UUID, qty: number): Promise<CartDto>;
  updateItem(cartRef: CartRef, variantId: UUID, qty: number): Promise<CartDto>;
  removeItem(cartRef: CartRef, variantId: UUID): Promise<CartDto>;
  saveForLater(cartRef: CartRef, variantId: UUID): Promise<CartDto>;
  merge(guestToken: string, userId: UUID): Promise<CartDto>;            // on login
}

interface PricingService {
  // Pure function: deterministic given inputs. PBT core target.
  computeTotals(input: PriceComputationInput): PriceBreakup;            // subtotal, discount, ship, tax, total
}

interface TaxService {
  // Pure: GST split by place of supply. PBT target.
  computeGst(taxableAmount: Money, hsnRate: number, sameState: boolean): GstSplit; // {cgst,sgst,igst}
}

interface CouponService {
  validate(code: string, ctx: CouponContext): Promise<CouponEvaluation>; // valid?, discount, reason
  bestAutoOffer(ctx: CouponContext): Promise<CouponEvaluation | null>;
  redeem(code: string, orderId: UUID): Promise<void>;                    // usage-limit safe
}
```

## Checkout (C-16), Payment (C-17)

```ts
interface CheckoutService {
  preview(cartRef: CartRef, addressId: UUID, couponCode?: string): Promise<CheckoutPreviewDto>;
  place(cartRef: CartRef, input: PlaceOrderInput, idempotencyKey: string): Promise<PlaceOrderResult>;
  // idempotencyKey ensures repeated submits create one order (PBT-04)
}

interface PaymentService {
  initiate(orderId: UUID, method: PaymentMethod): Promise<PaymentInitDto>; // gateway order + client token
  handleWebhook(rawBody: Buffer, signature: string): Promise<void>;        // verify sig, reconcile
  refund(orderId: UUID, amount: Money, reason: string): Promise<RefundDto>;
}

// Port implemented by Razorpay adapter and Mock adapter
interface PaymentProvider {
  createOrder(amount: Money, currency: 'INR', receipt: string): Promise<ProviderOrder>;
  verifySignature(payload: WebhookPayload, signature: string): boolean;
  createRefund(providerPaymentId: string, amount: Money): Promise<ProviderRefund>;
}
```

## Order (C-18), Fulfilment (C-19), Returns (C-20)

```ts
interface OrderService {
  get(userId: UUID, orderId: UUID): Promise<OrderDto>;                   // ownership enforced (IDOR)
  listForUser(userId: UUID, query: OrderQueryDto): Promise<Paginated<OrderSummaryDto>>;
  adminList(query: AdminOrderQueryDto): Promise<Paginated<OrderSummaryDto>>;
  transition(actor: UUID, orderId: UUID, to: OrderStatus): Promise<OrderDto>; // validated state machine
  cancel(userId: UUID, orderId: UUID, itemIds?: UUID[]): Promise<OrderDto>;
  reorder(userId: UUID, orderId: UUID): Promise<CartDto>;
}

interface InvoiceService {
  generate(orderId: UUID): Promise<{ url: string }>;                     // GST PDF, async via queue
}

interface FulfilmentService {
  serviceability(pincode: string, weightGrams: number): Promise<ServiceabilityDto>;
  createShipment(orderId: UUID): Promise<ShipmentDto>;                   // AWB via ShippingProvider
  track(orderId: UUID): Promise<TrackingTimelineDto>;
  syncTracking(awb: string): Promise<void>;                              // worker job
}

interface ShippingProvider {  // port; ShipRocket + Mock adapters
  checkServiceability(pincode: string, weightGrams: number): Promise<ProviderServiceability>;
  createAwb(order: ShipmentRequest): Promise<ProviderAwb>;
  getTracking(awb: string): Promise<ProviderTracking>;
}

interface ReturnService {
  request(userId: UUID, input: ReturnRequestInput): Promise<ReturnDto>;
  schedulePickup(returnId: UUID): Promise<void>;
  adminUpdate(actor: UUID, returnId: UUID, status: ReturnStatus): Promise<ReturnDto>;
}

interface RefundService {
  initiate(orderId: UUID, amount: Money, target: 'source'|'wallet'): Promise<RefundDto>;
  getStatus(refundId: UUID): Promise<RefundStatus>;
}
```

## Engagement — Review (C-21), Wallet (C-22), Notification (C-23)

```ts
interface ReviewService {
  add(userId: UUID, input: ReviewInput): Promise<ReviewDto>;             // verified-purchase check
  listForProduct(productId: UUID, query: PageQuery): Promise<Paginated<ReviewDto>>;
  voteHelpful(userId: UUID, reviewId: UUID): Promise<void>;
  moderate(actor: UUID, reviewId: UUID, action: 'approve'|'reject'): Promise<void>;
}

interface WalletService {
  getBalance(userId: UUID): Promise<Money>;
  earn(userId: UUID, amount: Money, reason: string, ref: string): Promise<void>;   // idempotent by ref
  redeem(userId: UUID, amount: Money, ref: string): Promise<void>;                 // balance>=0 invariant
  ledger(userId: UUID, query: PageQuery): Promise<Paginated<WalletEntryDto>>;
}

interface NotificationService {
  send(event: NotificationEvent): Promise<void>;                         // routes to channels via ports
  listInApp(userId: UUID, query: PageQuery): Promise<Paginated<InAppNotificationDto>>;
  markRead(userId: UUID, ids: UUID[]): Promise<void>;
}
```

## Search (C-26), Reporting (C-27), Settings (C-28)

```ts
interface SearchService {
  search(query: SearchQueryDto): Promise<Paginated<ProductCardDto>>;     // FTS + filters + sort
  autocomplete(term: string): Promise<string[]>;
  index(productId: UUID): Promise<void>;                                 // no-op-able for FTS
}

interface ReportingService {
  sales(query: ReportQueryDto): Promise<ReportResult>;
  gst(query: ReportQueryDto): Promise<ReportResult>;                     // HSN summary, invoice register
  inventory(query: ReportQueryDto): Promise<ReportResult>;
  export(report: ReportResult, format: 'csv'|'xlsx'|'pdf'): Promise<{ url: string }>;
}

interface SettingsService {
  get(key: string): Promise<SettingValue>;
  set(actor: UUID, key: string, value: SettingValue): Promise<void>;     // audit-logged
  listServiceablePincodes(): Promise<string[]>;
  codRuleFor(pincode: string, amount: Money): Promise<{ allowed: boolean; fee: Money }>;
}

interface AuditLogService {
  record(actor: UUID, action: string, target: string, before?: unknown, after?: unknown): Promise<void>;
}
```
