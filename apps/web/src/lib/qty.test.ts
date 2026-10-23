import { cleanQtyDraft, parseQty } from './qty';

describe('cleanQtyDraft', () => {
  it('keeps digits only and at most 3 of them', () => {
    expect(cleanQtyDraft('12')).toBe('12');
    expect(cleanQtyDraft('-5')).toBe('5');
    expect(cleanQtyDraft('1.5e3')).toBe('153');
    expect(cleanQtyDraft('abc')).toBe('');
    expect(cleanQtyDraft('12345')).toBe('123');
  });
});

describe('parseQty', () => {
  it('accepts a number in range', () => {
    expect(parseQty('12', 1, 99, 3)).toBe(12);
    expect(parseQty('007', 1, 99, 3)).toBe(7);
  });
  it('clamps to the limits', () => {
    expect(parseQty('0', 1, 99, 3)).toBe(1);
    expect(parseQty('250', 1, 99, 3)).toBe(99);
  });
  it('falls back to the previous quantity when the box is empty or not a number', () => {
    expect(parseQty('', 1, 99, 4)).toBe(4);
    expect(parseQty('  ', 1, 99, 4)).toBe(4);
    expect(parseQty('x', 1, 99, 4)).toBe(4);
  });
});
