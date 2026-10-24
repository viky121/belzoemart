import fc from 'fast-check';
import {
  JOB_CODE_LENGTH,
  addressLine,
  formatJobCode,
  formatMobile,
  hasControlChars,
  isJobCode,
  isValidPincode,
  mapsSearchUrl,
  maskMobile,
  normalizeMobile,
} from './format';
import { arbJobChars, arbMessyMobile, arbMobile, arbPincode } from './testing/arbitraries';

describe('delivery format helpers (example tests)', () => {
  it('normalises the usual ways of typing a mobile', () => {
    expect(normalizeMobile('9876543210')).toBe('9876543210');
    expect(normalizeMobile('+91 98765-43210')).toBe('9876543210');
    expect(normalizeMobile('919876543210')).toBe('9876543210');
    expect(normalizeMobile('09876543210')).toBe('9876543210');
    expect(normalizeMobile(' 98765 43210 ')).toBe('9876543210');
  });

  it('rejects numbers that are not Indian mobiles', () => {
    expect(normalizeMobile('5876543210')).toBeNull();
    expect(normalizeMobile('98765')).toBeNull();
    expect(normalizeMobile('98765432101')).toBeNull();
    expect(normalizeMobile('abcdefghij')).toBeNull();
    expect(normalizeMobile('')).toBeNull();
    expect(normalizeMobile(null)).toBeNull();
  });

  it('formats and masks a mobile', () => {
    expect(formatMobile('9876543210')).toBe('+91 98765 43210');
    expect(maskMobile('9876543210')).toBe('XXXXXX3210');
    expect(maskMobile('')).toBe('');
    expect(maskMobile('123')).toBe('XXX');
  });

  it('validates pincodes', () => {
    expect(isValidPincode('110001')).toBe(true);
    expect(isValidPincode('010001')).toBe(false);
    expect(isValidPincode('11000')).toBe(false);
    expect(isValidPincode(undefined)).toBe(false);
  });

  it('builds job codes with the DLV- prefix', () => {
    expect(formatJobCode('ABCD2345')).toBe('DLV-ABCD2345');
    expect(isJobCode('DLV-ABCD2345')).toBe(true);
    expect(isJobCode('DLV-ABCD234')).toBe(false);
    expect(isJobCode('DLV-ABCD234O')).toBe(false); // O is not in the alphabet
    expect(isJobCode('XYZ-ABCD2345')).toBe(false);
  });

  it('builds a map link from the address text only', () => {
    const url = mapsSearchUrl({ line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' });
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(decodeURIComponent(url.split('query=')[1] as string)).toBe('12 MG Road, Pune, MH, 411001');
    expect(addressLine({ line1: ' a ', line2: null, city: '', state: 'b' })).toBe('a, b');
  });

  it('detects control characters', () => {
    expect(hasControlChars('hello')).toBe(false);
    expect(hasControlChars('he\u0000llo')).toBe(true);
    expect(hasControlChars('a\nb')).toBe(true);
  });
});

describe('delivery format helpers (property tests)', () => {
  it('P11: normalising what a person typed gives back the clean mobile', () => {
    fc.assert(
      fc.property(arbMessyMobile, ({ mobile, typed }) => {
        expect(normalizeMobile(typed)).toBe(mobile);
      }),
    );
  });

  it('P11: formatting then normalising is a round trip', () => {
    fc.assert(fc.property(arbMobile, (m) => expect(normalizeMobile(formatMobile(m))).toBe(m)));
  });

  it('P11: normalising twice equals normalising once', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (s) => {
        const once = normalizeMobile(s);
        if (once !== null) expect(normalizeMobile(once)).toBe(once);
      }),
    );
  });

  it('masking keeps the length and the last four digits and hides the rest', () => {
    fc.assert(
      fc.property(arbMobile, (m) => {
        const masked = maskMobile(m);
        expect(masked).toHaveLength(m.length);
        expect(masked.endsWith(m.slice(-4))).toBe(true);
        expect(masked.slice(0, -4)).toMatch(/^X+$/);
      }),
    );
  });

  it('every generated pincode and job code is valid', () => {
    fc.assert(fc.property(arbPincode, (p) => expect(isValidPincode(p)).toBe(true)));
    fc.assert(
      fc.property(arbJobChars, (c) => {
        expect(c).toHaveLength(JOB_CODE_LENGTH);
        expect(isJobCode(formatJobCode(c))).toBe(true);
      }),
    );
  });
});
