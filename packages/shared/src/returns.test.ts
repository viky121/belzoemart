import {
  CANCEL_REASONS,
  RETURN_REASONS,
  composeReason,
  findReturnReason,
  returnReasonRequiresPhotos,
} from './returns';

describe('return reasons', () => {
  it('finds reasons by code or by the composed label prefix', () => {
    expect(findReturnReason('damaged')?.label).toBe('Damaged / broken product');
    expect(findReturnReason('damaged / BROKEN product: lid cracked')?.code).toBe('damaged');
    expect(findReturnReason('Changed my mind')).toBeUndefined();
    expect(findReturnReason(undefined)).toBeUndefined();
  });

  it('requires photos by code', () => {
    expect(returnReasonRequiresPhotos({ reasonCode: 'damaged', reason: 'anything' })).toBe(true);
    expect(returnReasonRequiresPhotos({ reasonCode: 'not_needed', reason: 'No longer needed' })).toBe(false);
  });

  it('requires photos by reason text prefix', () => {
    expect(returnReasonRequiresPhotos({ reason: 'Wrong item received: got the 1L' })).toBe(true);
    expect(returnReasonRequiresPhotos({ reason: 'Quality not as expected' })).toBe(false);
  });

  it('the stricter of code and text wins', () => {
    expect(returnReasonRequiresPhotos({ reasonCode: 'not_needed', reason: 'Defective / not working: dead' })).toBe(true);
    expect(returnReasonRequiresPhotos({ reasonCode: 'expired', reason: 'No longer needed' })).toBe(true);
  });

  it('has Other require a comment in both catalogues', () => {
    expect(RETURN_REASONS.find((r) => r.code === 'other')?.commentRequired).toBe(true);
    expect(CANCEL_REASONS.find((r) => r.code === 'other')?.commentRequired).toBe(true);
  });
});

describe('composeReason', () => {
  it('joins label and trimmed comments', () => {
    expect(composeReason('Damaged / broken product', '  lid cracked ')).toBe('Damaged / broken product: lid cracked');
    expect(composeReason('No longer needed', '   ')).toBe('No longer needed');
  });

  it('truncates to 300 characters', () => {
    const out = composeReason('Other', 'x'.repeat(500));
    expect(out).toHaveLength(300);
    expect(out.startsWith('Other: x')).toBe(true);
  });
});
