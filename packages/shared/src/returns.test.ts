import {
  CANCEL_REASONS,
  RETURN_REASONS,
  composeReason,
  findReturnReason,
  reasonComments,
  returnReasonRequiresPhotos,
} from './returns';

describe('return reasons', () => {
  it('finds reasons by code or by the composed label prefix', () => {
    expect(findReturnReason('damaged')?.label).toBe('Damaged / broken product');
    expect(findReturnReason('damaged / BROKEN product: lid cracked')?.code).toBe('damaged');
    expect(findReturnReason('Changed my mind')).toBeUndefined();
    expect(findReturnReason(undefined)).toBeUndefined();
  });

  it('matches free text case-insensitively, by code words and with loose "/" spacing', () => {
    expect(findReturnReason('Damaged')?.code).toBe('damaged');
    expect(findReturnReason('DAMAGED')?.code).toBe('damaged');
    expect(findReturnReason('Damaged/broken product')?.code).toBe('damaged');
    expect(findReturnReason('Wrong item')?.code).toBe('wrong_item');
    expect(findReturnReason('wrong_item: got 1L')?.code).toBe('wrong_item');
    expect(returnReasonRequiresPhotos({ reason: 'Damaged' })).toBe(true);
    expect(returnReasonRequiresPhotos({ reason: 'Wrong item' })).toBe(true);
    expect(returnReasonRequiresPhotos({ reasonCode: 'DEFECTIVE' })).toBe(true);
  });

  it('extracts the comments from a composed reason', () => {
    const other = RETURN_REASONS.find((r) => r.code === 'other')!;
    expect(reasonComments(other, 'Other: smells odd today')).toBe('smells odd today');
    expect(reasonComments(other, 'Other')).toBe('');
    expect(reasonComments(other, 'The seal was open')).toBe('The seal was open');
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
