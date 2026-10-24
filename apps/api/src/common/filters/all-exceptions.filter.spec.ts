import { BadRequestException, ForbiddenException, HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { DeliveryError } from '../../modules/delivery/delivery-errors';
import { AllExceptionsFilter, structuredFields } from './all-exceptions.filter';

function run(exception: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status: (s: number) => {
      sent.status = s;
      return { json: (b: Record<string, unknown>) => void (sent.body = b) };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ id: 'req-1', url: '/x' }) }) };
  new AllExceptionsFilter().catch(exception, host as never);
  return sent;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('passes the stable code and the plain details of a delivery error to the client', () => {
    const r = run(new DeliveryError(423, 'OTP_LOCKED', 'Too many wrong codes.', { retryAfterSeconds: 900 }));
    expect(r.status).toBe(423);
    expect(r.body).toEqual({
      statusCode: 423,
      error: 'DeliveryError',
      message: 'Too many wrong codes.',
      code: 'OTP_LOCKED',
      details: { retryAfterSeconds: 900 },
      correlationId: 'req-1',
    });
  });

  it('passes only the code when there are no details, for example a pending password change', () => {
    const r = run(new ForbiddenException({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please set a new password to continue' }));
    expect(r.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please set a new password to continue' });
    expect(r.body).not.toHaveProperty('details');
  });

  it('leaves ordinary errors exactly as they were', () => {
    const r = run(new BadRequestException('Order can no longer be cancelled'));
    expect(r.body).toEqual({ statusCode: 400, error: 'BadRequestException', message: 'Order can no longer be cancelled', correlationId: 'req-1' });
  });

  it('never adds a code or details to a server error, and hides its message', () => {
    const r = run(new HttpException({ code: 'X', message: 'secret internals', extra: 1 }, 500));
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ statusCode: 500, error: 'HttpException', message: 'Internal server error', correlationId: 'req-1' });
    expect(run(new Error('boom')).body).toMatchObject({ message: 'Internal server error' });
    expect(run(new InternalServerErrorException('x')).body).not.toHaveProperty('code');
  });

  it('structuredFields ignores anything that is not an object with a string code', () => {
    expect(structuredFields(new Error('x'))).toEqual({});
    expect(structuredFields(new HttpException('plain', 400))).toEqual({});
    expect(structuredFields(new HttpException({ code: 42, message: 'm' }, 400))).toEqual({});
  });
});
