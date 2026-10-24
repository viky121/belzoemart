import { outcomeFromReturn, parseReturnResult } from '../payment-return';

describe('parseReturnResult', () => {
  it('reads the result the server put on the deep link', () => {
    expect(parseReturnResult('belzoemart://payment-result?orderId=o1&result=success')).toBe('success');
    expect(parseReturnResult('belzoemart-dev://payment-result?result=cancelled&orderId=o1')).toBe('cancelled');
    expect(parseReturnResult('belzoemart://payment-result?orderId=o1&result=processing')).toBe('processing');
    expect(parseReturnResult('belzoemart://payment-result?orderId=o1&result=failed')).toBe('failed');
  });

  it('ignores missing, unknown or malformed results', () => {
    expect(parseReturnResult(null)).toBeNull();
    expect(parseReturnResult(undefined)).toBeNull();
    expect(parseReturnResult('belzoemart://payment-result?orderId=o1')).toBeNull();
    expect(parseReturnResult('belzoemart://payment-result?result=hacked')).toBeNull();
  });
});

describe('outcomeFromReturn', () => {
  const link = (r: string) => `belzoemart://payment-result?orderId=o1&result=${r}`;

  it("trusts the server's own check with the gateway above everything else", () => {
    expect(outcomeFromReturn(null, 'paid')).toEqual({ kind: 'submitted' });
    expect(outcomeFromReturn(link('failed'), 'paid')).toEqual({ kind: 'submitted' });
    expect(outcomeFromReturn(link('success'), 'cancelled')).toMatchObject({ kind: 'failed' });
  });

  it('when the server could not be asked, falls back to the deep-link hint', () => {
    expect(outcomeFromReturn(link('success'), null)).toEqual({ kind: 'submitted' });
    expect(outcomeFromReturn(link('processing'), 'processing')).toEqual({ kind: 'submitted' });
    expect(outcomeFromReturn(link('failed'), 'processing')).toMatchObject({ kind: 'failed' });
    expect(outcomeFromReturn(link('cancelled'), 'processing')).toEqual({ kind: 'dismissed' });
  });

  it('treats closing the browser without a result as dismissed', () => {
    expect(outcomeFromReturn(null, 'processing')).toEqual({ kind: 'dismissed' });
    expect(outcomeFromReturn(null, null)).toEqual({ kind: 'dismissed' });
  });
});
