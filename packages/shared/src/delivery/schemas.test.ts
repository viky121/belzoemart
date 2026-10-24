import {
  adminJobsQuerySchema,
  assignJobSchema,
  createPartnerSchema,
  createZoneSchema,
  deliveryReasonSchema,
  failJobSchema,
  partnerChangePasswordSchema,
  partnerJobsQuerySchema,
  partnerLoginSchema,
  verifyOtpSchema,
  zonePincodesSchema,
} from './schemas';
import {
  DEFAULT_DELIVERY_SETTINGS,
  deliverySettingsPatchSchema,
  resolveDeliverySettings,
} from './settings';
import { containsMobile, deliveryPasswordProblems, isCommonPassword } from './password-denylist';

const UUID = '3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c';

describe('delivery schemas (example tests)', () => {
  const partner = { name: 'Ravi Kumar', mobile: '+91 98765-43210', password: 'Zx9!kLm2pQ' };

  it('accepts a good partner and cleans the mobile', () => {
    const r = createPartnerSchema.safeParse(partner);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mobile).toBe('9876543210');
  });

  it('rejects a weak, common or mobile-containing password', () => {
    expect(createPartnerSchema.safeParse({ ...partner, password: 'abc' }).success).toBe(false);
    expect(createPartnerSchema.safeParse({ ...partner, password: 'Password@123' }).success).toBe(false);
    expect(createPartnerSchema.safeParse({ ...partner, password: 'Ab@9876543210x' }).success).toBe(false);
  });

  it('rejects a bad mobile, a short name and unknown fields', () => {
    expect(createPartnerSchema.safeParse({ ...partner, mobile: '12345' }).success).toBe(false);
    expect(createPartnerSchema.safeParse({ ...partner, name: 'R' }).success).toBe(false);
    expect(createPartnerSchema.safeParse({ ...partner, isAdmin: true }).success).toBe(false);
  });

  it('requires a reason of 3 to 255 characters without control characters', () => {
    expect(deliveryReasonSchema.safeParse('no').success).toBe(false);
    expect(deliveryReasonSchema.safeParse('  ok!  ').success).toBe(true);
    expect(deliveryReasonSchema.safeParse('x'.repeat(256)).success).toBe(false);
    expect(deliveryReasonSchema.safeParse('bad\u0007text').success).toBe(false);
  });

  it('requires a note when the failure reason is other', () => {
    expect(failJobSchema.safeParse({ reasonCode: 'refused' }).success).toBe(true);
    expect(failJobSchema.safeParse({ reasonCode: 'other' }).success).toBe(false);
    expect(failJobSchema.safeParse({ reasonCode: 'other', note: 'gate locked' }).success).toBe(true);
    expect(failJobSchema.safeParse({ reasonCode: 'made_up' }).success).toBe(false);
  });

  it('checks the GPS range', () => {
    expect(failJobSchema.safeParse({ reasonCode: 'refused', location: { lat: 18.5, lng: 73.8 } }).success).toBe(true);
    expect(failJobSchema.safeParse({ reasonCode: 'refused', location: { lat: 95, lng: 73.8 } }).success).toBe(false);
  });

  it('accepts only a 6-digit OTP', () => {
    expect(verifyOtpSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });

  it('validates assign, login and password change', () => {
    expect(assignJobSchema.safeParse({ partnerId: UUID }).success).toBe(true);
    expect(assignJobSchema.safeParse({ partnerId: 'x' }).success).toBe(false);
    expect(partnerLoginSchema.safeParse({ mobile: '9876543210', password: 'x' }).success).toBe(true);
    expect(partnerLoginSchema.safeParse({ mobile: '9876543210', password: '' }).success).toBe(false);
    expect(
      partnerChangePasswordSchema.safeParse({ currentPassword: 'Zx9!kLm2pQ', newPassword: 'Zx9!kLm2pQ' }).success,
    ).toBe(false);
    expect(
      partnerChangePasswordSchema.safeParse({ currentPassword: 'Zx9!kLm2pQ', newPassword: 'Qw8#nPr5tY' }).success,
    ).toBe(true);
  });

  it('validates zones and pincode lists', () => {
    expect(createZoneSchema.safeParse({ name: 'Kothrud' }).success).toBe(true);
    expect(createZoneSchema.safeParse({ name: 'K' }).success).toBe(false);
    expect(zonePincodesSchema.safeParse({ pincodes: ['411038', '411052'] }).success).toBe(true);
    expect(zonePincodesSchema.safeParse({ pincodes: ['41103'] }).success).toBe(false);
  });

  it('applies list defaults and limits', () => {
    const a = adminJobsQuerySchema.parse({});
    expect(a.page).toBe(1);
    expect(a.pageSize).toBe(20);
    expect(adminJobsQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(adminJobsQuerySchema.safeParse({ status: 'delivered', page: '2' }).success).toBe(true);
    expect(partnerJobsQuerySchema.parse({}).scope).toBe('active');
    expect(partnerJobsQuerySchema.safeParse({ scope: 'all' }).success).toBe(false);
  });
});

describe('delivery settings', () => {
  it('uses the defaults of the design', () => {
    expect(DEFAULT_DELIVERY_SETTINGS.acceptTimeoutMinutes).toBe(15);
    expect(DEFAULT_DELIVERY_SETTINGS.maxAttempts).toBe(3);
    expect(DEFAULT_DELIVERY_SETTINGS.otpValidMinutes).toBe(240);
    expect(DEFAULT_DELIVERY_SETTINGS.otpMaxWrongGuesses).toBe(5);
    expect(DEFAULT_DELIVERY_SETTINGS.otpResendSeconds).toBe(60);
  });

  it('falls back to the default for missing, wrong-type or out-of-range values', () => {
    const s = resolveDeliverySettings({ maxAttempts: 5, acceptTimeoutMinutes: 'x', otpMaxSends: 0, trackingDays: 9999 });
    expect(s.maxAttempts).toBe(5);
    expect(s.acceptTimeoutMinutes).toBe(15);
    expect(s.otpMaxSends).toBe(5);
    expect(s.trackingDays).toBe(30);
  });

  it('accepts a valid patch and rejects unknown keys and bad ranges', () => {
    expect(deliverySettingsPatchSchema.safeParse({ maxAttempts: 4 }).success).toBe(true);
    expect(deliverySettingsPatchSchema.safeParse({ maxAttempts: 0 }).success).toBe(false);
    expect(deliverySettingsPatchSchema.safeParse({ somethingElse: 1 }).success).toBe(false);
    expect(deliverySettingsPatchSchema.safeParse({ maxAttempts: 2.5 }).success).toBe(false);
  });
});

describe('partner password rules', () => {
  it('flags common passwords with or without digits', () => {
    expect(isCommonPassword('Password@123')).toBe(true);
    expect(isCommonPassword('Qwerty!!99')).toBe(true);
    expect(isCommonPassword('Zx9!kLm2pQ')).toBe(false);
  });

  it('flags a password that holds 8 digits of the mobile number', () => {
    expect(containsMobile('Ab@87654321x', '9876543210')).toBe(true);
    expect(containsMobile('Ab@8765432x', '9876543210')).toBe(false);
    expect(containsMobile('anything', null)).toBe(false);
  });

  it('lists every problem in plain words', () => {
    expect(deliveryPasswordProblems('Zx9!kLm2pQ', '9876543210')).toEqual([]);
    const p = deliveryPasswordProblems('password', '9876543210');
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p).toContain('Password is too common');
  });
});
