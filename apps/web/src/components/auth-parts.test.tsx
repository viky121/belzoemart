import { renderToStaticMarkup } from 'react-dom/server';
import { AlreadyRegistered, isEmail, PasswordRules, toMobile10 } from './auth-parts';

describe('toMobile10 / isEmail', () => {
  it('accepts Indian mobiles with or without +91 and spaces', () => {
    expect(toMobile10('94128 07767')).toBe('9412807767');
    expect(toMobile10('+91 9412807767')).toBe('9412807767');
    expect(toMobile10('1234567890')).toBeNull();
    expect(toMobile10('98765')).toBeNull();
  });
  it('checks the shape of an email', () => {
    expect(isEmail('a@b.in')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('not an email')).toBe(false);
  });
});

/** Which of the four rule items are rendered as met. */
function met(password: string): string[] {
  const html = renderToStaticMarkup(<PasswordRules password={password} />);
  return ['length', 'upper', 'lower', 'symbol'].filter((k) =>
    new RegExp(`class="pw-rules__ok"[^>]*data-testid="pw-rule-${k}"`).test(html),
  );
}

describe('PasswordRules', () => {
  it('ticks each rule as it is met', () => {
    expect(met('')).toEqual([]);
    expect(met('Belzo@2026')).toEqual(['length', 'upper', 'lower', 'symbol']);
    expect(met('belzo2026')).toEqual(['length', 'lower']);
    expect(met('BELZO@2026')).toEqual(['length', 'upper', 'symbol']);
  });
});

describe('AlreadyRegistered', () => {
  it('tells a mobile number owner to sign in, with a sign-in link and a password reset link', () => {
    const html = renderToStaticMarkup(<AlreadyRegistered kind="phone" loginHref="/login?next=%2Fcart" />);
    expect(html).toContain('data-testid="already-registered-phone"');
    expect(html).toContain('This mobile number is already registered');
    expect(html).toContain('href="/login?next=%2Fcart"');
    expect(html).toContain('href="/forgot-password"');
  });

  it('says the same for an email', () => {
    const html = renderToStaticMarkup(<AlreadyRegistered kind="email" loginHref="/login" />);
    expect(html).toContain('data-testid="already-registered-email"');
    expect(html).toContain('This email is already registered');
  });
});
