import { resolveOrderResultView } from '../order-result';

describe('resolveOrderResultView', () => {
  it('returns notfound for a null order', () => {
    expect(resolveOrderResultView(null, 'cod')).toBe('notfound');
  });
  it('returns failed for a cancelled order', () => {
    expect(resolveOrderResultView({ status: 'cancelled', payments: [] }, 'mock')).toBe('failed');
  });
  it('returns confirmed for any non-pending order', () => {
    expect(resolveOrderResultView({ status: 'confirmed', payments: [] }, 'mock')).toBe('confirmed');
    expect(resolveOrderResultView({ status: 'delivered', payments: [] }, 'mock')).toBe('confirmed');
  });
  it('returns cod for a pending COD order (by provider param or payment)', () => {
    expect(resolveOrderResultView({ status: 'pending', payments: [] }, 'cod')).toBe('cod');
    expect(resolveOrderResultView({ status: 'pending', payments: [{ provider: 'cod' }] }, 'mock')).toBe('cod');
  });
  it('returns awaiting for a pending online order', () => {
    expect(resolveOrderResultView({ status: 'pending', payments: [{ provider: 'razorpay' }] }, 'razorpay')).toBe('awaiting');
  });
});
