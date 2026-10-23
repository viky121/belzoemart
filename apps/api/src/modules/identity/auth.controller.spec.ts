import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthController } from './auth.controller';
import type { CustomerAuthService } from './customer-auth.service';
import { REFRESH_COOKIE } from './refresh-cookie';

/**
 * A1: `X-Client-Platform: mobile` moves the refresh token from the httpOnly
 * cookie into the JSON body. Without the header the web flow is unchanged.
 */

const customer = { id: 'c1', name: 'Asha', email: 'a@x.in', phone: null, locale: 'en' };
const tokens = { accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 900 };
const rotated = { accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 900 };

function makeAuth() {
  return {
    verifyOtp: jest.fn().mockResolvedValue({ tokens, customer }),
    registerAccount: jest.fn().mockResolvedValue({ tokens, customer }),
 loginPhone: jest.fn().mockResolvedValue({ tokens, customer }),
    loginIdentifier: jest.fn().mockResolvedValue({ tokens, customer }),
    loginEmail: jest.fn().mockResolvedValue({ tokens, customer }),
    loginGoogle: jest.fn().mockResolvedValue({ tokens, customer }),
    refresh: jest.fn().mockResolvedValue(rotated),
    logout: jest.fn().mockResolvedValue(undefined),
  };
}

function setup() {
  const auth = makeAuth();
  const controller = new AuthController(auth as unknown as CustomerAuthService);
  return { auth, controller };
}

function makeReq(opts: {
  headers?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  body?: unknown;
} = {}): Request {
  return {
    headers: opts.headers ?? {},
    cookies: opts.cookies ?? {},
    body: opts.body,
    ip: '203.0.113.1',
  } as unknown as Request;
}

function makeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

const MOBILE = { 'x-client-platform': 'mobile' };

type LoginCall = (c: AuthController, req: Request, res: Response) => Promise<unknown>;
const logins: [string, LoginCall][] = [
  ['otp/verify', (c, req, res) => c.verifyOtp({ requestId: 'r1', code: '123456' }, req, res)],
  [
    'register',
    (c, req, res) =>
      c.register(
        {
          name: 'Asha Rao',
          email: 'a@x.in',
          phone: '9412807767',
          password: 'Belzo@2026',
          confirmPassword: 'Belzo@2026',
          phoneProof: 'p'.repeat(30),
          emailProof: 'e'.repeat(30),
        },
        req,
        res,
      ),
  ],
  ['login/phone', (c, req, res) => c.loginPhone({ phone: '9412807767', password: 'Belzo@2026' }, req, res)],
  ['login/identifier', (c, req, res) => c.loginIdentifier({ identifier: 'a@x.in', password: 'Belzo@2026' }, req, res)],
  ['login', (c, req, res) => c.login({ email: 'a@x.in', password: 'password1' }, req, res)],
  ['google', (c, req, res) => c.google({ idToken: 'g' }, req, res)],
];

describe('AuthController (A1 client platform)', () => {
  describe.each(logins)('%s', (_name, call) => {
    it('web: sets the refresh cookie and omits refreshToken from the body', async () => {
      const { controller } = setup();
      const res = makeRes();
      const body = await call(controller, makeReq(), res as unknown as Response);
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie.mock.calls[0][0]).toBe(REFRESH_COOKIE);
      expect(res.cookie.mock.calls[0][1]).toBe('rt-1');
      expect(body).toEqual({ accessToken: 'at-1', expiresIn: 900, customer });
      expect(body).not.toHaveProperty('refreshToken');
    });

    it('mobile: no cookie, body carries refreshToken and customer', async () => {
      const { controller } = setup();
      const res = makeRes();
      const body = await call(controller, makeReq({ headers: MOBILE }), res as unknown as Response);
      expect(res.cookie).not.toHaveBeenCalled();
      expect(body).toEqual({ accessToken: 'at-1', expiresIn: 900, refreshToken: 'rt-1', customer });
    });
  });

  it('login still passes req.ip to the service', async () => {
    const { auth, controller } = setup();
    await controller.login({ email: 'a@x.in', password: 'password1' }, makeReq(), makeRes() as unknown as Response);
    expect(auth.loginEmail).toHaveBeenCalledWith('a@x.in', 'password1', '203.0.113.1');
  });

  describe('refresh', () => {
    it('web: reads the cookie, rotates and sets the new cookie', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const body = await controller.refresh(
        makeReq({ cookies: { [REFRESH_COOKIE]: 'rt-1' } }),
        res as unknown as Response,
      );
      expect(auth.refresh).toHaveBeenCalledWith('rt-1');
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie.mock.calls[0][1]).toBe('rt-2');
      expect(body).toEqual({ accessToken: 'at-2', expiresIn: 900 });
    });

    it('web: no cookie → 401 "Missing refresh token" (unchanged)', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const p = controller.refresh(makeReq(), res as unknown as Response);
      await expect(p).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(p).rejects.toThrow('Missing refresh token');
      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('mobile: reads the body and returns all three fields without a cookie', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const body = await controller.refresh(
        makeReq({ headers: MOBILE, body: { refreshToken: 'rt-1' }, cookies: { [REFRESH_COOKIE]: 'cookie-rt' } }),
        res as unknown as Response,
      );
      expect(auth.refresh).toHaveBeenCalledWith('rt-1');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(body).toEqual({ accessToken: 'at-2', expiresIn: 900, refreshToken: 'rt-2' });
    });

    it('mobile: an empty body throws ZodError', async () => {
      const { auth, controller } = setup();
      await expect(
        controller.refresh(makeReq({ headers: MOBILE, body: {} }), makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ZodError);
      await expect(
        controller.refresh(makeReq({ headers: MOBILE }), makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ZodError);
      expect(auth.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('mobile: revokes the body token and does not clear the cookie', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const body = await controller.logout(
        makeReq({ headers: MOBILE, body: { refreshToken: 'rt-1' } }),
        res as unknown as Response,
      );
      expect(auth.logout).toHaveBeenCalledWith('rt-1');
      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(body).toEqual({ success: true });
    });

    it('mobile: no body succeeds without revoking', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const body = await controller.logout(makeReq({ headers: MOBILE }), res as unknown as Response);
      expect(auth.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(body).toEqual({ success: true });
    });

    it('web: revokes the cookie token and clears the cookie', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      const body = await controller.logout(
        makeReq({ cookies: { [REFRESH_COOKIE]: 'rt-1' } }),
        res as unknown as Response,
      );
      expect(auth.logout).toHaveBeenCalledWith('rt-1');
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, { path: '/api/v1' });
      expect(body).toEqual({ success: true });
    });

    it('web: no cookie still clears the cookie without revoking', async () => {
      const { auth, controller } = setup();
      const res = makeRes();
      await controller.logout(makeReq(), res as unknown as Response);
      expect(auth.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
    });
  });

  describe('header matching', () => {
    it('"Mobile " (case and whitespace) counts as mobile', async () => {
      const { controller } = setup();
      const res = makeRes();
      const body = await controller.verifyOtp(
        { requestId: 'r1', code: '123456' },
        makeReq({ headers: { 'x-client-platform': 'Mobile ' } }),
        res as unknown as Response,
      );
      expect(res.cookie).not.toHaveBeenCalled();
      expect(body).toHaveProperty('refreshToken', 'rt-1');
    });

    it("['mobile','mobile'] (repeated header) counts as web", async () => {
      const { controller } = setup();
      const res = makeRes();
      const body = await controller.verifyOtp(
        { requestId: 'r1', code: '123456' },
        makeReq({ headers: { 'x-client-platform': ['mobile', 'mobile'] } }),
        res as unknown as Response,
      );
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(body).not.toHaveProperty('refreshToken');
    });
  });
});
