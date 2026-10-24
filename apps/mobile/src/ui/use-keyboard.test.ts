import { keyboardOverlap } from './use-keyboard';

describe('keyboardOverlap', () => {
  it('is 0 when the keyboard is hidden', () => {
    expect(keyboardOverlap(900, 0)).toBe(0);
  });
  it('is 0 when the field is above the keyboard', () => {
    expect(keyboardOverlap(500, 700)).toBe(0);
  });
  it('returns how far the field is covered', () => {
    expect(keyboardOverlap(800, 700)).toBe(100);
  });
  it('keeps a margin above the keyboard', () => {
    expect(keyboardOverlap(690, 700, 24)).toBe(14);
  });
});
