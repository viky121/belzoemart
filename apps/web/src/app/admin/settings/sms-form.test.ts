import { buildSmsPayload, formFromStatus } from './sms-form';

const KEY = 'a'.repeat(48);
const current = { route: 'otp' as const, senderId: '', dltMessageId: '', otpId: '' };

describe('buildSmsPayload', () => {
  it('sends only the key when only the key is typed', () => {
    expect(buildSmsPayload({ ...formFromStatus(current), apiKey: KEY }, current)).toEqual({ payload: { apiKey: KEY } });
  });
  it('rejects a key that is obviously wrong', () => {
    expect(buildSmsPayload({ ...formFromStatus(current), apiKey: 'short' }, current)).toHaveProperty('error');
  });
  it('reports when nothing changed', () => {
    expect(buildSmsPayload(formFromStatus(current), current)).toHaveProperty('error');
  });
  it('needs the OTP id for the Smart OTP route', () => {
    const base = { ...formFromStatus(current), route: 'smart' as const };
    expect(buildSmsPayload(base, current)).toHaveProperty('error');
    expect(buildSmsPayload({ ...base, otpId: 'bad id!' }, current)).toHaveProperty('error');
    expect(buildSmsPayload({ ...base, otpId: '11111111' }, current)).toEqual({
      payload: { route: 'smart', otpId: '11111111' },
    });
  });
  it('needs sender id and message id for the DLT route', () => {
    const base = { ...formFromStatus(current), route: 'dlt' as const };
    expect(buildSmsPayload(base, current)).toHaveProperty('error');
    expect(buildSmsPayload({ ...base, senderId: 'BELZOE', dltMessageId: '178001' }, current)).toEqual({
      payload: { route: 'dlt', senderId: 'BELZOE', dltMessageId: '178001' },
    });
    expect(buildSmsPayload({ ...base, senderId: 'BELZ1', dltMessageId: '178001' }, current)).toHaveProperty('error');
  });
});

describe('buildSmsPayload — one Smart OTP template per purpose', () => {
  const smart = { ...formFromStatus(current), route: 'smart' as const };

  it('accepts a registration and a password reset template without a general one', () => {
    expect(buildSmsPayload({ ...smart, otpIdRegister: 'd4f921736d', otpIdReset: '51e7e0f659' }, current)).toEqual({
      payload: { route: 'smart', otpIdRegister: 'd4f921736d', otpIdReset: '51e7e0f659' },
    });
  });

  it('also sends the optional delivery template', () => {
    const r = buildSmsPayload(
      { ...smart, otpIdRegister: 'd4f921736d', otpIdReset: '51e7e0f659', otpIdDelivery: '5e3e80760d' },
      current,
    );
    expect(r).toEqual({
      payload: { route: 'smart', otpIdRegister: 'd4f921736d', otpIdReset: '51e7e0f659', otpIdDelivery: '5e3e80760d' },
    });
  });

  it('refuses a registration template without a reset one (and no general fallback)', () => {
    expect(buildSmsPayload({ ...smart, otpIdRegister: 'd4f921736d' }, current)).toHaveProperty('error');
  });

  it('only sends the template that changed', () => {
    const saved = { ...current, route: 'smart' as const, otpIdRegister: 'aaa', otpIdReset: 'bbb' };
    expect(buildSmsPayload({ ...formFromStatus(saved), otpIdReset: 'ccc' }, saved)).toEqual({
      payload: { otpIdReset: 'ccc' },
    });
  });

  it('rejects an OTP id with odd characters', () => {
    expect(buildSmsPayload({ ...smart, otpIdRegister: 'bad id!', otpIdReset: 'ok1' }, current)).toHaveProperty('error');
  });
});
