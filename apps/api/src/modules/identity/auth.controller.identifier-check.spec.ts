import { AuthController } from './auth.controller';
import type { CustomerAuthService } from './customer-auth.service';

describe('AuthController identifier/check', () => {
  function build(registered: boolean) {
    const isRegistered = jest.fn(async () => registered);
    const controller = new AuthController({ isRegistered } as unknown as CustomerAuthService);
    return { controller, isRegistered };
  }

  it('answers { registered } for a mobile number', async () => {
    const { controller, isRegistered } = build(true);
    expect(await controller.checkIdentifier({ phone: '9412807767' } as never)).toEqual({ registered: true });
    expect(isRegistered).toHaveBeenCalledWith({ phone: '9412807767', email: undefined });
  });

  it('answers { registered: false } for a free email', async () => {
    const { controller, isRegistered } = build(false);
    expect(await controller.checkIdentifier({ email: 'new@example.com' } as never)).toEqual({ registered: false });
    expect(isRegistered).toHaveBeenCalledWith({ phone: undefined, email: 'new@example.com' });
  });

  it('is public and rate limited', () => {
    const handler = AuthController.prototype.checkIdentifier;
    expect(Reflect.getMetadata('isPublic', handler)).toBe(true);
    const limits = Object.keys(Reflect.getMetadataKeys(handler).reduce((o: Record<string, unknown>, k: string) => ({ ...o, [k]: 1 }), {}));
    expect(limits.some((k) => k.startsWith('THROTTLER'))).toBe(true);
  });
});
