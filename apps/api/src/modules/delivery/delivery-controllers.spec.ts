import 'reflect-metadata';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminDeliverySettingsController } from './admin/admin-delivery-settings.controller';
import { AdminDeliveryController } from './admin/admin-delivery.controller';
import { AdminPartnersController } from './admin/admin-partners.controller';
import { AdminZonesController } from './admin/admin-zones.controller';
import {
  AssignJobDto,
  CreatePartnerDto,
  DeliverySettingsPatchDto,
  FailJobDto,
  MoveWithLocationDto,
  PartnerChangePasswordDto,
  PartnerJobsQueryDto,
  PartnerLoginDto,
  ReasonDto,
  VerifyOtpDto,
} from './dto';
import { PartnerAuthController } from './partners/partner-auth.controller';
import { PartnerAuthGuard } from './partners/partner-auth.guard';
import { PartnerJobsController } from './partner-api/partner-jobs.controller';
import { PartnerMeController } from './partner-api/partner-me.controller';

type Handler = (...a: never[]) => unknown;
type Ctl = new (...a: never[]) => object;

const meta = <T>(key: string, target: object): T | undefined => Reflect.getMetadata(key, target) as T | undefined;

/** Route handlers of a controller: methods that carry a route path. */
function routes(ctl: Ctl): { name: string; handler: Handler; method: number; path: string }[] {
  return Object.getOwnPropertyNames(ctl.prototype)
    .filter((n) => n !== 'constructor')
    .map((name) => ({ name, handler: (ctl.prototype as Record<string, Handler>)[name] as Handler }))
    .filter(({ handler }) => typeof handler === 'function' && meta<string>('path', handler) !== undefined)
    .map(({ name, handler }) => ({ name, handler, method: meta<number>('method', handler) as number, path: meta<string>('path', handler) as string }));
}

const guardsOf = (ctl: Ctl, handler: Handler): unknown[] => [...(meta<unknown[]>('__guards__', ctl) ?? []), ...(meta<unknown[]>('__guards__', handler) ?? [])];
const rolesOf = (ctl: Ctl, handler: Handler): string[] => meta<string[]>(ROLES_KEY, handler) ?? meta<string[]>(ROLES_KEY, ctl) ?? [];
const isPublic = (ctl: Ctl, handler: Handler): boolean => meta<boolean>(IS_PUBLIC_KEY, handler) ?? meta<boolean>(IS_PUBLIC_KEY, ctl) ?? false;

const ADMIN: Ctl[] = [AdminPartnersController, AdminZonesController, AdminDeliveryController, AdminDeliverySettingsController] as unknown as Ctl[];
const PARTNER: Ctl[] = [PartnerMeController, PartnerJobsController] as unknown as Ctl[];

describe('access control of the delivery controllers (SECURITY-08)', () => {
  it('every admin route needs a staff role and is not public', () => {
    for (const ctl of ADMIN) {
      const list = routes(ctl);
      expect(list.length).toBeGreaterThan(0);
      for (const r of list) {
        expect({ route: `${ctl.name}.${r.name}`, public: isPublic(ctl, r.handler) }).toEqual({ route: `${ctl.name}.${r.name}`, public: false });
        expect({ route: `${ctl.name}.${r.name}`, roles: rolesOf(ctl, r.handler).length > 0 }).toEqual({ route: `${ctl.name}.${r.name}`, roles: true });
      }
    }
  });

  it('operations are open to order_manager (super_admin passes every role check); settings only to super_admin (D3)', () => {
    for (const ctl of [AdminPartnersController, AdminZonesController, AdminDeliveryController] as unknown as Ctl[]) {
      for (const r of routes(ctl)) expect(rolesOf(ctl, r.handler)).toEqual(['order_manager']);
    }
    for (const r of routes(AdminDeliverySettingsController as unknown as Ctl)) {
      expect(rolesOf(AdminDeliverySettingsController as unknown as Ctl, r.handler)).toEqual(['super_admin']);
    }
  });

  it('every partner route is switched off for the customer/admin guard and protected by the partner guard', () => {
    for (const ctl of PARTNER) {
      for (const r of routes(ctl)) {
        const where = `${ctl.name}.${r.name}`;
        expect({ where, public: isPublic(ctl, r.handler) }).toEqual({ where, public: true });
        expect({ where, guarded: guardsOf(ctl, r.handler).includes(PartnerAuthGuard) }).toEqual({ where, guarded: true });
      }
    }
  });

  it('only login, refresh and logout are reachable without a token', () => {
    const ctl = PartnerAuthController as unknown as Ctl;
    const open = routes(ctl)
      .filter((r) => !guardsOf(ctl, r.handler).includes(PartnerAuthGuard))
      .map((r) => r.path)
      .sort();
    expect(open).toEqual(['login', 'logout', 'refresh']);
    for (const r of routes(ctl)) expect(isPublic(ctl, r.handler)).toBe(true);
  });

  it('changing the password is the only partner route that works while a password change is pending', () => {
    const allowing: string[] = [];
    for (const ctl of [...PARTNER, PartnerAuthController as unknown as Ctl]) {
      for (const r of routes(ctl)) if (meta<boolean>('allowPasswordChange', r.handler)) allowing.push(`${ctl.name}.${r.name}`);
    }
    expect(allowing).toEqual(['PartnerAuthController.changePassword']);
  });

  it('there is no admin route that marks a job delivered (BR-D38)', () => {
    const paths = ADMIN.flatMap((ctl) => routes(ctl).map((r) => r.path.toLowerCase()));
    expect(paths.filter((p) => /delivered|complete|mark/.test(p))).toEqual([]);
  });

  it('the partner API has no path with a partner id, so one partner cannot name another (SP2)', () => {
    for (const ctl of [...PARTNER, PartnerAuthController as unknown as Ctl]) {
      for (const r of routes(ctl)) expect(r.path).not.toMatch(/partnerId|partner_id/);
    }
  });
});

describe('request validation of the delivery controllers (SECURITY-05)', () => {
  const pipe = new ZodValidationPipe();
  const run = (metatype: unknown, value: unknown) => pipe.transform(value, { type: 'body', metatype: metatype as never });
  const UUID = '3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c';

  it('cleans a partner login and refuses a bad one', () => {
    expect(run(PartnerLoginDto, { mobile: '+91 98765-43210', password: 'x' })).toEqual({ mobile: '9876543210', password: 'x' });
    expect(() => run(PartnerLoginDto, { mobile: '123', password: 'x' })).toThrow();
    expect(() => run(PartnerLoginDto, { mobile: '9876543210', password: 'x', admin: true })).toThrow();
  });

  it('refuses a weak new password and an unchanged one', () => {
    expect(() => run(PartnerChangePasswordDto, { currentPassword: 'a', newPassword: 'weak' })).toThrow();
    expect(() => run(PartnerChangePasswordDto, { currentPassword: 'Zx9!kLm2pQ', newPassword: 'Zx9!kLm2pQ' })).toThrow();
    expect(run(PartnerChangePasswordDto, { currentPassword: 'old', newPassword: 'Zx9!kLm2pQ' })).toBeDefined();
  });

  it('validates the failure form, the OTP and the reason', () => {
    expect(() => run(FailJobDto, { reasonCode: 'other' })).toThrow();
    expect(run(FailJobDto, { reasonCode: 'refused', location: { lat: 18.5, lng: 73.8 } })).toBeDefined();
    expect(() => run(VerifyOtpDto, { code: '12ab56' })).toThrow();
    expect(run(VerifyOtpDto, { code: '123456' })).toEqual({ code: '123456' });
    expect(() => run(ReasonDto, { reason: 'x' })).toThrow();
  });

  it('accepts an empty body for the simple partner commands but not unknown fields', () => {
    expect(run(MoveWithLocationDto, {})).toEqual({});
    expect(() => run(MoveWithLocationDto, { partnerId: 'someone-else' })).toThrow();
  });

  it('validates assign and partner creation', () => {
    expect(() => run(AssignJobDto, { partnerId: 'not-a-uuid' })).toThrow();
    expect(run(AssignJobDto, { partnerId: UUID })).toEqual({ partnerId: UUID });
    expect(() => run(CreatePartnerDto, { name: 'Ravi', mobile: '9876543210', password: 'weak' })).toThrow();
  });

  it('validates list queries with defaults and limits', () => {
    expect(pipe.transform({}, { type: 'query', metatype: PartnerJobsQueryDto as never })).toMatchObject({ scope: 'active', page: 1, pageSize: 20 });
    expect(() => pipe.transform({ pageSize: '1000' }, { type: 'query', metatype: PartnerJobsQueryDto as never })).toThrow();
  });

  it('settings accept only known keys within range', () => {
    expect(run(DeliverySettingsPatchDto, { maxAttempts: 4 })).toEqual({ maxAttempts: 4 });
    expect(() => run(DeliverySettingsPatchDto, { maxAttempts: 99 })).toThrow();
    expect(() => run(DeliverySettingsPatchDto, { unknown: 1 })).toThrow();
  });
});
