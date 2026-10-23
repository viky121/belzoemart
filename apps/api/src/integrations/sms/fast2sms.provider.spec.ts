import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Fast2SmsProvider, SmsGatewayError, toIndianMobile } from './fast2sms.provider';

const otpConfig = {
  apiKey: 'KEY123',
  route: 'otp' as 'otp' | 'dlt' | 'smart',
  senderId: '',
  dltMessageId: '',
  otpId: '',
  otpIdRegister: '',
  otpIdReset: '',
  otpIdDelivery: '',
};

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('toIndianMobile', () => {
  it('accepts 10 digits, +91 and spaces; rejects others', () => {
    expect(toIndianMobile('98765 43210')).toBe('9876543210');
    expect(toIndianMobile('+91 9876543210')).toBe('9876543210');
    expect(toIndianMobile('1234567890')).toBeNull();
    expect(toIndianMobile('98765')).toBeNull();
  });
});

describe('Fast2SmsProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the OTP route request with the key in the authorization header', async () => {
    const fetchMock = mockFetch(200, { return: true, request_id: 'req1', message: ['Message sent successfully'] });
    const res = await new Fast2SmsProvider(otpConfig).send({ to: '9876543210', body: 'x', otp: '123456' });
    expect(res.messageId).toBe('req1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('KEY123');
    expect(JSON.parse(init.body)).toEqual({ route: 'otp', variables_values: '123456', numbers: '9876543210' });
  });

  it('uses the DLT route with sender id and approved message id', async () => {
    const fetchMock = mockFetch(200, { return: true, request_id: 'r2' });
    await new Fast2SmsProvider({ ...otpConfig, route: 'dlt', senderId: 'BELZOE', dltMessageId: '178001' }).send({
      to: '+919876543210',
      body: 'x',
      otp: '654321',
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1];
    expect(JSON.parse(init.body)).toEqual({
      route: 'dlt',
      sender_id: 'BELZOE',
      message: '178001',
      variables_values: '654321',
      numbers: '9876543210',
    });
  });

  it('Smart OTP route posts our own code to /dev/otp/send with the linked template id', async () => {
    const fetchMock = mockFetch(200, { return: true, status_code: 200, request_id: 'sm1', message: 'OTP sent successfully' });
    const res = await new Fast2SmsProvider({ ...otpConfig, route: 'smart', otpId: '11111111' }).send({
      to: '+919876543210',
      body: 'x',
      otp: '246810',
    });
    expect(res.messageId).toBe('sm1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://www.fast2sms.com/dev/otp/send');
    expect(init.headers.authorization).toBe('KEY123');
    expect(JSON.parse(init.body)).toEqual({
      otp_id: '11111111',
      mobile: '9876543210',
      otp: '246810',
      otp_length: 6,
      otp_expiry: 5,
    });
  });

  it('Smart OTP picks the template that matches the purpose of the code', async () => {
    const cfg = {
      ...otpConfig,
      route: 'smart' as const,
      otpId: 'general',
      otpIdRegister: 'reg-1',
      otpIdReset: 'reset-1',
      otpIdDelivery: 'deliv-1',
    };
    const fetchMock = mockFetch(200, { return: true, status_code: 200, request_id: 'sm2' });
    const idFor = async (purpose?: 'register' | 'reset' | 'login' | 'delivery') => {
      fetchMock.mockClear();
      await new Fast2SmsProvider(cfg).send({ to: '9876543210', body: 'x', otp: '246810', purpose });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
      return (JSON.parse(init.body) as { otp_id: string }).otp_id;
    };
    expect(await idFor('register')).toBe('reg-1');
    expect(await idFor('reset')).toBe('reset-1');
    expect(await idFor('delivery')).toBe('deliv-1');
    expect(await idFor('login')).toBe('reg-1');
    expect(await idFor(undefined)).toBe('reg-1');
  });

  it('Smart OTP falls back to the general OTP id when a purpose has no template of its own', async () => {
    const fetchMock = mockFetch(200, { return: true, status_code: 200, request_id: 'sm3' });
    await new Fast2SmsProvider({ ...otpConfig, route: 'smart', otpId: 'general' }).send({
      to: '9876543210',
      body: 'x',
      otp: '1',
      purpose: 'reset',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect((JSON.parse(init.body) as { otp_id: string }).otp_id).toBe('general');
  });

  it('Smart OTP route without an OTP id fails closed (no request sent)', async () => {
    const fetchMock = mockFetch(200, { return: true });
    await expect(
      new Fast2SmsProvider({ ...otpConfig, route: 'smart' }).send({ to: '9876543210', body: 'x', otp: '1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a gateway rejection as 503 without leaking the OTP or key', async () => {
    mockFetch(200, { return: false, status_code: 412, message: 'Invalid Authentication, Check Authorization Key' });
    const err = await new Fast2SmsProvider(otpConfig).send({ to: '9876543210', body: 'x', otp: '123456' }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err).toBeInstanceOf(SmsGatewayError);
    expect(err.reason).toContain('Invalid Authentication');
    expect(JSON.stringify(err.getResponse())).not.toMatch(/123456|KEY123|Invalid Authentication/);
  });

  it('maps network failures to 503 and bad numbers to 400 (no request sent)', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    await expect(new Fast2SmsProvider(otpConfig).send({ to: '9876543210', body: 'x', otp: '1' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const fetchMock = mockFetch(200, { return: true });
    await expect(new Fast2SmsProvider(otpConfig).send({ to: '12345', body: 'x', otp: '1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips messages that are not one-time codes', async () => {
    const fetchMock = mockFetch(200, { return: true });
    const res = await new Fast2SmsProvider(otpConfig).send({ to: '9876543210', body: 'Order shipped' });
    expect(res.messageId).toBe('skipped-non-otp');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
