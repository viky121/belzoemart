import { CANCEL_REASONS, RETURN_REASONS, reconcileTracking, type OrderStatus } from '@belzo/shared';
import {
  buildReturnPayload,
  buildStepper,
  cancelReasonError,
  cancelReasonText,
  cancelUnavailableReason,
  isLiveStatus,
  paymentSummary,
  photosRequired,
  refundNote,
  resolutionOptions,
  returnEligibility,
  returnStepError,
  shortOrderId,
  statusBadge,
  variantText,
  type OrderDetail,
  type OrderPayment,
  type OrderReturn,
  type ReturnDraft,
} from '@/lib/order-view';

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';

const prepaid: OrderPayment = { provider: 'razorpay', status: 'captured', method: 'upi', amount: 1006740, createdAt: '2025-06-01T10:00:00.000Z' };
const cod: OrderPayment = { provider: 'cod', status: 'pending', method: null, amount: 1006740, createdAt: '2025-06-01T10:00:00.000Z' };

type Shipment = Parameters<typeof reconcileTracking>[0]['shipments'][number];

function makeOrder(over: Partial<OrderDetail> = {}, shipments: Shipment[] = []): OrderDetail {
  const status: OrderStatus = over.status ?? 'delivered';
  const createdAt = over.createdAt ?? '2025-06-01T10:00:00.000Z';
  const updatedAt = over.updatedAt ?? '2025-06-04T12:00:00.000Z';
  return {
    id: 'abcdef12-3456-4789-8abc-def012345678',
    status,
    createdAt,
    updatedAt,
    couponCode: null,
    cancelledReason: null,
    invoiceUrl: null,
    invoice: null,
    address: null,
    subtotal: 1006740,
    discount: 0,
    shipping: 0,
    codFee: 0,
    tax: 47940,
    cgst: 23970,
    sgst: 23970,
    igst: 0,
    grandTotal: 1006740,
    items: [
      { id: ITEM_A, variantId: 'v1', title: 'Basmati Rice', sku: 'RICE-5', quantity: 2, unitPrice: 479400, taxRatePct: 5, imageUrl: null, slug: 'rice', isReturnable: true, attributes: { Size: '5 kg' } },
      { id: ITEM_B, variantId: 'v2', title: 'Herbal Tea', sku: 'TEA-1', quantity: 1, unitPrice: 47940, taxRatePct: 5, imageUrl: null, slug: null, isReturnable: true, attributes: {} },
    ],
    payments: [prepaid],
    returns: [],
    ...over,
    tracking: over.tracking ?? reconcileTracking({ order: { status, createdAt, updatedAt }, shipments }),
  };
}

const laggingShipment: Shipment = {
  id: 's1',
  awb: 'AWB1',
  courier: 'Mock',
  status: 'packed',
  createdAt: '2025-06-02T09:00:00.000Z',
  events: [
    { status: 'packed', description: 'Shipment packed', occurredAt: '2025-06-02T09:00:00.000Z' },
    { status: 'shipped', description: 'Handed to courier', occurredAt: '2025-06-02T15:00:00.000Z' },
    { status: 'out_for_delivery', description: 'Out for delivery', occurredAt: '2025-06-03T08:00:00.000Z' },
  ],
};

function ret(over: Partial<OrderReturn>): OrderReturn {
  return {
    id: 'r1',
    status: 'requested',
    reason: 'Quality not as expected',
    resolution: 'refund_wallet',
    images: [],
    items: [],
    createdAt: '2025-06-05T10:00:00.000Z',
    updatedAt: '2025-06-05T10:00:00.000Z',
    ...over,
  };
}

const draft = (over: Partial<ReturnDraft> = {}): ReturnDraft => ({
  quantities: { [ITEM_A]: 1 },
  reasonCode: 'quality',
  resolution: 'refund_wallet',
  images: [],
  comments: '',
  ...over,
});

describe('status labels and badges', () => {
  it('uses human labels, never snake_case', () => {
    expect(statusBadge('out_for_delivery')).toEqual({ label: 'Out for delivery', tone: 'info' });
    expect(statusBadge('delivered')).toEqual({ label: 'Delivered', tone: 'ok' });
    expect(statusBadge('cancelled')).toEqual({ label: 'Cancelled', tone: 'bad' });
    expect(statusBadge('returned')).toEqual({ label: 'Returned', tone: 'muted' });
    expect(statusBadge('pending')).toEqual({ label: 'Order placed', tone: 'warn' });
    for (const s of ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) {
      expect(statusBadge(s).label).not.toMatch(/_/);
    }
  });

  it('short id is the first 8 chars upper-cased', () => {
    expect(shortOrderId('abcdef12-3456')).toBe('ABCDEF12');
  });

  it('polls only while the order can still move', () => {
    expect(isLiveStatus('shipped')).toBe(true);
    expect(isLiveStatus('pending')).toBe(true);
    expect(isLiveStatus('delivered')).toBe(false);
    expect(isLiveStatus('cancelled')).toBe(false);
    expect(isLiveStatus('returned')).toBe(false);
  });
});

describe('buildStepper', () => {
  it('delivered order with lagging tracking: Delivered is current and nothing follows', () => {
    const steps = buildStepper(makeOrder({ status: 'delivered' }, [laggingShipment]));
    expect(steps.map((s) => s.key)).toEqual(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered']);
    expect(steps.slice(0, 5).every((s) => s.state === 'done')).toBe(true);
    // Delivered was derived from the order status: no real time is known.
    expect(steps[5]).toMatchObject({ key: 'delivered', state: 'current', at: null });
    expect(steps.find((s) => s.key === 'shipped')?.at).toBe('2025-06-02T15:00:00.000Z');
  });

  it('marks later steps upcoming for an in-flight order', () => {
    // Only order.status drives the stepper (courier events cannot move it ahead).
    const steps = buildStepper(makeOrder({ status: 'shipped' }, [laggingShipment]));
    expect(steps.find((s) => s.key === 'shipped')).toMatchObject({ state: 'current', at: '2025-06-02T15:00:00.000Z' });
    expect(steps.find((s) => s.key === 'out_for_delivery')).toMatchObject({ state: 'upcoming', at: null });
    expect(steps.find((s) => s.key === 'delivered')).toMatchObject({ state: 'upcoming', at: null });
  });

  it('never fabricates dates', () => {
    const steps = buildStepper(makeOrder({ status: 'packed' }));
    expect(steps[0].at).toBe('2025-06-01T10:00:00.000Z');
    expect(steps[1]).toMatchObject({ key: 'confirmed', state: 'done', at: null });
    expect(steps[2]).toMatchObject({ key: 'packed', state: 'current', at: null });
    expect(steps.slice(3).every((s) => s.at === null)).toBe(true);
    const withInvoice = buildStepper(makeOrder({ status: 'packed', invoice: { number: 'INV-1', createdAt: '2025-06-01T11:00:00.000Z' } }));
    expect(withInvoice[1].at).toBe('2025-06-01T11:00:00.000Z');
  });

  it('cancelled order: placed then a terminal Cancelled step', () => {
    const steps = buildStepper(makeOrder({ status: 'cancelled', payments: [cod] }));
    expect(steps).toEqual([
      { key: 'pending', label: 'Order placed', state: 'done', at: '2025-06-01T10:00:00.000Z' },
      { key: 'cancelled', label: 'Cancelled', state: 'terminal', at: null },
    ]);
  });

  it('cancelled prepaid order shows Refunded when the payment was refunded', () => {
    const steps = buildStepper(makeOrder({ status: 'cancelled', payments: [{ ...prepaid, status: 'refunded' }] }));
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ['pending', 'done'],
      ['cancelled', 'terminal'],
      ['refunded', 'terminal'],
    ]);
    expect(steps[2].at).toBeNull();
  });

  it('returned + refunded order: all progress done, then Returned and Refunded', () => {
    const steps = buildStepper(
      makeOrder({ status: 'returned', returns: [ret({ status: 'refunded', updatedAt: '2025-06-09T10:00:00.000Z' })] }, [laggingShipment]),
    );
    expect(steps.map((s) => s.key)).toEqual([
      'pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'refunded',
    ]);
    expect(steps.slice(0, 6).every((s) => s.state === 'done')).toBe(true);
    expect(steps[6]).toMatchObject({ state: 'terminal', at: null });
    expect(steps[7]).toMatchObject({ state: 'terminal', at: '2025-06-09T10:00:00.000Z' });
  });
});

describe('payment summary and refund note', () => {
  it('prepaid UPI order', () => {
    const o = makeOrder({ status: 'confirmed' });
    expect(paymentSummary(o)).toEqual({ methodLabel: 'UPI', statusLabel: 'Paid', isCod: false, isPrepaid: true, amountPaid: 1006740 });
    expect(refundNote(o)).toContain('A refund of ₹10,067.40 will be issued to your original payment method');
  });

  it('COD order before and after delivery', () => {
    expect(paymentSummary(makeOrder({ status: 'confirmed', payments: [cod] }))).toMatchObject({
      methodLabel: 'Cash on Delivery',
      statusLabel: 'Pay on delivery',
      isPrepaid: false,
      amountPaid: 0,
    });
    expect(paymentSummary(makeOrder({ status: 'delivered', payments: [cod] })).statusLabel).toBe('Paid on delivery');
    expect(refundNote(makeOrder({ status: 'pending', payments: [cod] }))).toBe('Nothing to refund - this is a Cash on Delivery order');
  });

  it('unpaid online order', () => {
    const o = makeOrder({ status: 'pending', payments: [{ ...prepaid, status: 'created', method: null }] });
    expect(paymentSummary(o)).toMatchObject({ methodLabel: 'Online payment', statusLabel: 'Awaiting payment', isPrepaid: false });
    expect(refundNote(o)).toBe('No payment was taken for this order');
  });
});

describe('cancelUnavailableReason', () => {
  it('explains a missing Cancel only while the order is on its way', () => {
    for (const s of ['packed', 'shipped', 'out_for_delivery'] as OrderStatus[]) {
      expect(cancelUnavailableReason(makeOrder({ status: s }))).toBe("Orders can't be cancelled once they are packed");
    }
    for (const s of ['pending', 'confirmed', 'delivered', 'cancelled', 'returned'] as OrderStatus[]) {
      expect(cancelUnavailableReason(makeOrder({ status: s }))).toBeNull();
    }
  });
});

describe('cancel reasons', () => {
  it('requires a reason and 10+ chars for Other', () => {
    expect(cancelReasonError(null, '')).toMatch(/choose a reason/i);
    expect(cancelReasonError('ordered_by_mistake', '')).toBeNull();
    expect(cancelReasonError('other', 'too short')).toMatch(/at least 10/);
    expect(cancelReasonError('other', 'Changed my plans')).toBeNull();
  });

  it('composes label + comments, capped at 300 chars', () => {
    expect(cancelReasonText('better_price', '')).toBe('Found a better price elsewhere');
    expect(cancelReasonText('other', '  moving city  ')).toBe('Other: moving city');
    expect(cancelReasonText('other', 'x'.repeat(400))).toHaveLength(300);
    expect(CANCEL_REASONS.length).toBeGreaterThan(0);
  });
});

describe('returnEligibility', () => {
  it('not delivered / cancelled / returned', () => {
    expect(returnEligibility(makeOrder({ status: 'shipped' }))).toMatchObject({
      eligible: false,
      reason: 'Returns can be requested once your order is delivered',
    });
    expect(returnEligibility(makeOrder({ status: 'cancelled' })).reason).toBe('This order was cancelled');
    expect(returnEligibility(makeOrder({ status: 'returned' })).reason).toBe('This order has already been returned');
  });

  it('non-returnable items are blocked', () => {
    const base = makeOrder();
    const o = makeOrder({ items: [{ ...base.items[0], isReturnable: false }, base.items[1]] });
    const e = returnEligibility(o);
    expect(e.eligible).toBe(true);
    expect(e.items[0]).toEqual({ id: ITEM_A, maxQty: 0, returnable: false, blockedReason: 'Non-returnable item' });
    const none = makeOrder({ items: base.items.map((i) => ({ ...i, isReturnable: false })) });
    expect(returnEligibility(none)).toMatchObject({ eligible: false, reason: 'All items in this order are non-returnable' });
  });

  it('subtracts quantities already requested; rejected returns are ignored', () => {
    const o = makeOrder({
      returns: [
        ret({ id: 'r1', status: 'approved', items: [{ orderItemId: ITEM_A, quantity: 1 }] }),
        ret({ id: 'r2', status: 'rejected', items: [{ orderItemId: ITEM_B, quantity: 1 }] }),
      ],
    });
    const e = returnEligibility(o);
    expect(e.items.find((i) => i.id === ITEM_A)?.maxQty).toBe(1);
    expect(e.items.find((i) => i.id === ITEM_B)?.maxQty).toBe(1);
    const all = makeOrder({
      returns: [ret({ items: [{ orderItemId: ITEM_A, quantity: 2 }, { orderItemId: ITEM_B, quantity: 1 }] })],
    });
    expect(returnEligibility(all)).toMatchObject({ eligible: false, reason: 'A return has already been requested for all items' });
  });
});

describe('return reasons, resolutions and steps', () => {
  it('photos are required only for defect reasons', () => {
    const required = ['damaged', 'defective', 'wrong_item', 'missing_item', 'expired'];
    for (const r of RETURN_REASONS) expect(photosRequired(r.code)).toBe(required.includes(r.code));
    expect(photosRequired(null)).toBe(false);
  });

  it('refund to source only for prepaid; no Replace for "No longer needed"', () => {
    const values = (o: OrderDetail, code: string) => resolutionOptions(o, code).map((x) => x.value);
    expect(values(makeOrder(), 'damaged')).toEqual(['refund_source', 'refund_wallet', 'replace']);
    expect(values(makeOrder({ payments: [cod] }), 'damaged')).toEqual(['refund_wallet', 'replace']);
    expect(values(makeOrder(), 'not_needed')).toEqual(['refund_source', 'refund_wallet']);
    expect(values(makeOrder({ payments: [cod] }), 'other')).toEqual(['refund_wallet']);
  });

  it('step 1: at least one item within the remaining quantity', () => {
    const o = makeOrder();
    expect(returnStepError(o, draft({ quantities: {} }), 1)).toMatch(/at least one item/);
    expect(returnStepError(o, draft({ quantities: { [ITEM_A]: 3 } }), 1)).toMatch(/between 1 and 2/);
    expect(returnStepError(o, draft({ quantities: { [ITEM_A]: 2, [ITEM_B]: 0 } }), 1)).toBeNull();
  });

  it('step 2 and 3: reason and a valid resolution', () => {
    const o = makeOrder({ payments: [cod] });
    expect(returnStepError(o, draft({ reasonCode: null }), 2)).toMatch(/reason/);
    expect(returnStepError(o, draft(), 2)).toBeNull();
    expect(returnStepError(o, draft({ resolution: null }), 3)).toMatch(/resolved/);
    expect(returnStepError(o, draft({ resolution: 'refund_source' }), 3)).toMatch(/resolved/);
    expect(returnStepError(o, draft({ reasonCode: 'not_needed', resolution: 'replace' }), 3)).toMatch(/resolved/);
    expect(returnStepError(o, draft({ resolution: 'replace' }), 3)).toBeNull();
  });

  it('step 4: photos for defect reasons, comments for Other', () => {
    const o = makeOrder();
    expect(returnStepError(o, draft({ reasonCode: 'damaged' }), 4)).toMatch(/at least one photo/);
    expect(returnStepError(o, draft({ reasonCode: 'damaged', images: ['https://cdn/returns/a.jpg'] }), 4)).toBeNull();
    expect(returnStepError(o, draft({ reasonCode: 'quality' }), 4)).toBeNull();
    expect(returnStepError(o, draft({ images: Array.from({ length: 7 }, (_, i) => `u${i}`) }), 4)).toMatch(/up to 6/);
    expect(returnStepError(o, draft({ reasonCode: 'other', comments: 'short' }), 4)).toMatch(/at least 10/);
    expect(returnStepError(o, draft({ reasonCode: 'other', comments: 'Stopped working after a day' }), 4)).toBeNull();
  });

  it('step 5 re-checks every step', () => {
    const o = makeOrder();
    expect(returnStepError(o, draft({ quantities: {} }), 5)).toMatch(/at least one item/);
    expect(returnStepError(o, draft({ reasonCode: 'damaged' }), 5)).toMatch(/photo/);
    expect(returnStepError(o, draft(), 5)).toBeNull();
  });

  it('builds the POST /orders/returns payload', () => {
    const o = makeOrder();
    const payload = buildReturnPayload(
      o,
      draft({
        quantities: { [ITEM_A]: 2, [ITEM_B]: 0 },
        reasonCode: 'damaged',
        resolution: 'replace',
        images: ['https://cdn/returns/a.jpg'],
        comments: ' box crushed ',
      }),
    );
    expect(payload).toEqual({
      orderId: o.id,
      reasonCode: 'damaged',
      reason: 'Damaged / broken product: box crushed',
      images: ['https://cdn/returns/a.jpg'],
      resolution: 'replace',
      items: [{ orderItemId: ITEM_A, quantity: 2 }],
    });
  });
});

describe('variantText', () => {
  it('formats size and colour', () => {
    expect(variantText({ Size: 'M', Color: 'Blue' })).toBe('Size: M · Colour: Blue');
    expect(variantText({ colour: 'Red' })).toBe('Colour: Red');
    expect(variantText({ 'Pack Of': '2' })).toBe('');
    expect(variantText(null)).toBe('');
  });
});
