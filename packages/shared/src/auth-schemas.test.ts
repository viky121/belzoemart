import {
  identifierLoginSchema,
  passwordProblems,
  passwordResetSchema,
  phoneLoginSchema,
  registerAccountSchema,
  strongPasswordSchema,
} from './schemas';

const proof = 'p'.repeat(40);
const base = {
  name: 'Ravi Kumar',
  email: 'Ravi@Example.com',
  phone: '9412807767',
  password: 'Belzo@2026',
  confirmPassword: 'Belzo@2026',
  phoneProof: proof,
  emailProof: proof,
};

describe('password policy', () => {
  it('needs 8+ chars, a capital, a small letter and a symbol', () => {
    expect(passwordProblems('Belzo@2026')).toEqual([]);
    expect(passwordProblems('belzo@2026')).toHaveLength(1); // no capital
    expect(passwordProblems('BELZO@2026')).toHaveLength(1); // no small letter
    expect(passwordProblems('Belzo2026')).toHaveLength(1); // no symbol
    expect(passwordProblems('Be@1')).toHaveLength(1); // too short
    expect(passwordProblems('')).toHaveLength(4);
  });
  it('spaces and letters are not symbols', () => {
    expect(passwordProblems('Belzo 2026')).toContain('One symbol (for example @ # $ % !)');
  });
  it('schema reports what is missing', () => {
    const r = strongPasswordSchema.safeParse('abcdefgh');
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toMatch(/capital letter/i);
  });
});

describe('registerAccountSchema', () => {
  it('accepts a complete, matching registration and lowercases the email', () => {
    const r = registerAccountSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ravi@example.com');
  });
  it('rejects mismatched passwords, weak passwords and a one-word name', () => {
    expect(registerAccountSchema.safeParse({ ...base, confirmPassword: 'Belzo@2027' }).success).toBe(false);
    expect(registerAccountSchema.safeParse({ ...base, password: 'password1', confirmPassword: 'password1' }).success).toBe(false);
    expect(registerAccountSchema.safeParse({ ...base, name: 'R' }).success).toBe(false);
  });
  it('needs the mobile proof and a valid Indian mobile', () => {
    expect(registerAccountSchema.safeParse({ ...base, phoneProof: '' }).success).toBe(false);
    expect(registerAccountSchema.safeParse({ ...base, phone: '1234567890' }).success).toBe(false);
  });
  describe('the email is optional', () => {
    const { email: _e, emailProof: _p, ...noEmail } = base;
    it('accepts an account with no email and no email proof', () => {
      const r = registerAccountSchema.safeParse(noEmail);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.email).toBeUndefined();
        expect(r.data.emailProof).toBeUndefined();
      }
    });
    it('treats blank form fields as "not given"', () => {
      const r = registerAccountSchema.safeParse({ ...noEmail, email: '   ', emailProof: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.email).toBeUndefined();
    });
    it('a given email must come with its verification proof', () => {
      const r = registerAccountSchema.safeParse({ ...noEmail, email: 'ravi@example.com' });
      expect(r.success).toBe(false);
      expect(JSON.stringify(r)).toMatch(/Verify your email/);
      expect(registerAccountSchema.safeParse({ ...base, emailProof: '' }).success).toBe(false);
    });
    it('a given email must still be a real address', () => {
      expect(registerAccountSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    });
  });
});

describe('identifierLoginSchema', () => {
  it('accepts a mobile number (with +91 / spaces) or an email', () => {
    expect(identifierLoginSchema.safeParse({ identifier: '94128 07767', password: 'x' }).success).toBe(true);
    expect(identifierLoginSchema.safeParse({ identifier: '+91 9412807767', password: 'x' }).success).toBe(true);
    const e = identifierLoginSchema.safeParse({ identifier: ' Ravi@Example.com ', password: 'x' });
    expect(e.success).toBe(true);
  });
  it('rejects junk and an empty password', () => {
    expect(identifierLoginSchema.safeParse({ identifier: '12345', password: 'x' }).success).toBe(false);
    expect(identifierLoginSchema.safeParse({ identifier: 'ravi@', password: 'x' }).success).toBe(false);
    expect(identifierLoginSchema.safeParse({ identifier: '9412807767', password: '' }).success).toBe(false);
  });
});

describe('phoneLoginSchema / passwordResetSchema', () => {
  it('phone login takes any non-empty password (old passwords must still work)', () => {
    expect(phoneLoginSchema.safeParse({ phone: '+919412807767', password: 'x' }).success).toBe(true);
    expect(phoneLoginSchema.safeParse({ phone: '9412807767', password: '' }).success).toBe(false);
  });
  it('reset enforces the strong policy and a matching confirmation', () => {
    expect(passwordResetSchema.safeParse({ proof, password: 'Belzo@2026', confirmPassword: 'Belzo@2026' }).success).toBe(true);
    expect(passwordResetSchema.safeParse({ proof, password: 'weak', confirmPassword: 'weak' }).success).toBe(false);
    expect(passwordResetSchema.safeParse({ proof, password: 'Belzo@2026', confirmPassword: 'Belzo@2027' }).success).toBe(false);
  });
});
