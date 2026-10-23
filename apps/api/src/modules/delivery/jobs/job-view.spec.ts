import fc from 'fast-check';
import type { DeliveryJob } from '@prisma/client';
import { DELIVERY_STATUSES, type DeliveryStatus } from '@belzo/shared';
import { partnerNextActions, toAdminRow, toPartnerDetail, toPartnerPreview } from './job-view';
import type { OtpStepView } from '../otp/delivery-otp.service';

const T = new Date('2026-10-23T10:00:00Z');
const job = (over: Partial<DeliveryJob> = {}): DeliveryJob =>
  ({
    id: 'j1',
    code: 'DLV-ABCD2345',
    orderId: 'o1',
    status: 'assigned',
    partnerId: 'p1',
    currentAssignmentId: 'a1',
    shipmentId: 's1',
    attemptsUsed: 0,
    maxAttempts: 3,
    paymentMode: 'cod',
    codAmount: 49900,
    itemCount: 3,
    destName: 'Asha Rao',
    destPhone: '9876543210',
    destLine1: '12 MG Road',
    destLine2: 'Flat 4',
    destCity: 'Pune',
    destState: 'Maharashtra',
    destPincode: '411001',
    otpPhone: '9123456780',
    otpLockedUntil: null,
    zoneId: null,
    trackingToken: 'tok-secret-tracking-token-0123456789abcdefghijklm',
    trackingExpiresAt: null,
    attention: null,
    acceptDeadlineAt: new Date(T.getTime() + 900_000),
    deliveredAt: null,
    endedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  }) as DeliveryJob;

const step = (over: Partial<OtpStepView> = {}): OtpStepView => ({ sendStatus: 'sent', sendsLeft: 4, resendAvailableAt: null, lockedUntil: null, verified: false, ...over });

describe('partner preview (BR-D70)', () => {
  it('shows the area, size and money only', () => {
    const p = toPartnerPreview(job());
    expect(p).toEqual({
      kind: 'preview',
      id: 'j1',
      code: 'DLV-ABCD2345',
      status: 'assigned',
      city: 'Pune',
      pincode: '411001',
      itemCount: 3,
      paymentMode: 'cod',
      codAmount: 49900,
      assignedAt: T.toISOString(),
      responseDeadlineAt: new Date(T.getTime() + 900_000).toISOString(),
    });
  });

  it('P12: never contains the customer name, phones, street, tracking token or OTP phone, whatever the job', () => {
    const arbText = fc.string({ minLength: 4, maxLength: 24 }).map((s) => `X${s.replace(/\W/g, 'a')}Z`);
    fc.assert(
      fc.property(arbText, arbText, arbText, arbText, (name, line1, token, otpPhone) => {
        const json = JSON.stringify(toPartnerPreview(job({ destName: name, destLine1: line1, destLine2: `L2${line1}`, trackingToken: token, otpPhone, destPhone: `P${name}` })));
        for (const secret of [name, line1, `L2${line1}`, token, otpPhone, `P${name}`]) expect(json).not.toContain(secret);
      }),
    );
  });
});

describe('partner detail (BR-D71)', () => {
  const items = [{ title: 'Basmati Rice 5kg', quantity: 2 }];

  it('adds the customer, the full address, the items and a map link built from the address text', () => {
    const d = toPartnerDetail(job({ status: 'accepted' }), items, step(), false);
    expect(d).toMatchObject({
      kind: 'detail',
      destName: 'Asha Rao',
      destPhone: '9876543210',
      items,
      address: { line1: '12 MG Road', line2: 'Flat 4', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      canRetry: true,
    });
    expect(decodeURIComponent(d.mapsUrl)).toContain('12 MG Road, Flat 4, Pune, Maharashtra, 411001');
  });

  it('never exposes the tracking token, the OTP phone or any OTP value', () => {
    const json = JSON.stringify(toPartnerDetail(job({ status: 'arrived' }), items, step(), false));
    expect(json).not.toContain('tok-secret');
    expect(json).not.toContain('9123456780');
    expect(json).not.toMatch(/codeHash|wrongGuesses/);
  });
});

describe('partnerNextActions', () => {
  const none = { verified: false, fresh: false };
  const ok = { verified: true, fresh: true };

  it('follows the journey', () => {
    expect(partnerNextActions('assigned', 0, 3, none)).toEqual(['accept', 'reject']);
    expect(partnerNextActions('accepted', 0, 3, none)).toEqual(['pickup']);
    expect(partnerNextActions('picked_up', 0, 3, none)).toEqual(['start']);
    expect(partnerNextActions('out_for_delivery', 0, 3, none)).toEqual(['arrive', 'fail', 'resend_otp']);
  });

  it('at the door: verify first, and complete appears only after a fresh verification', () => {
    expect(partnerNextActions('arrived', 0, 3, none)).toEqual(['verify_otp', 'fail', 'resend_otp']);
    expect(partnerNextActions('arrived', 0, 3, { verified: true, fresh: false })).toEqual(['verify_otp', 'fail', 'resend_otp']);
    expect(partnerNextActions('arrived', 0, 3, ok)).toEqual(['complete', 'fail', 'resend_otp']);
  });

  it('offers retry only while attempts remain', () => {
    expect(partnerNextActions('failed_attempt', 2, 3, none)).toEqual(['retry']);
    expect(partnerNextActions('failed_attempt', 3, 3, none)).toEqual([]);
  });

  it('offers nothing once the job is over or waiting', () => {
    for (const s of ['new', 'delivered', 'returned', 'cancelled'] as DeliveryStatus[]) expect(partnerNextActions(s, 0, 3, ok)).toEqual([]);
  });

  it('never offers an admin-only action to a partner', () => {
    for (const s of DELIVERY_STATUSES) {
      for (const a of partnerNextActions(s, 0, 3, ok)) expect(['accept', 'reject', 'pickup', 'start', 'arrive', 'fail', 'complete', 'retry', 'verify_otp', 'resend_otp']).toContain(a);
    }
  });
});

describe('toAdminRow', () => {
  it('shows the partner name and whether the partner is still active', () => {
    const r = toAdminRow(job(), { id: 'p1', name: 'Ravi', isActive: false });
    expect(r).toMatchObject({ partnerName: 'Ravi', partnerActive: false, destCity: 'Pune', paymentMode: 'cod', attemptsUsed: 0, maxAttempts: 3 });
    expect(JSON.stringify(r)).not.toMatch(/9876543210|Asha Rao|12 MG Road|tok-secret/);
  });

  it('has no partner for a job waiting in new', () => {
    const r = toAdminRow(job({ status: 'new', partnerId: null }), undefined);
    expect(r).toMatchObject({ partnerId: null, partnerName: null, partnerActive: null });
  });
});
