import { DEFAULT_MOBILE_HOME, DEFAULT_MOBILE_MENU } from '@belzo/shared';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { AdminMobileHomeController } from './admin-mobile-home.controller';
import { PublicSettingsController } from './public-settings.controller';
import type { SettingsService } from './settings.service';

const ADMIN = { sub: 'admin-1' } as unknown as JwtPrincipal;

function fakeSettings(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const set = jest.fn(async (_actor: string, key: string, value: unknown) => {
    store[key] = value;
  });
  const svc = {
    get: async (key: string) => store[key] ?? null,
    set,
  } as unknown as SettingsService;
  return { svc, store, set };
}

describe('AdminMobileHomeController', () => {
  it('returns complete defaults when nothing is stored', async () => {
    const { svc } = fakeSettings();
    expect(await new AdminMobileHomeController(svc).get()).toEqual(DEFAULT_MOBILE_HOME);
  });

  it('stores the sanitized config under mobile.home with the acting admin id', async () => {
    const { svc, set, store } = fakeSettings();
    const ctrl = new AdminMobileHomeController(svc);
    const saved = await ctrl.put(ADMIN, {
      heroBanners: [{ id: 'h1', imageUrl: '/api/uploads/banners/a.jpg', linkUrl: '/category/grocery', title: '', enabled: true }],
      categories: [],
      offerRows: [
        {
          id: 'r1',
          title: 'Festive',
          columns: 3,
          position: 'after_categories',
          enabled: true,
          showOn: 'app',
          banners: [{ id: 'b1', imageUrl: '/x.png', linkUrl: '#', title: '', enabled: true }],
        },
      ],
      dealsEnabled: false,
      dealsTitle: 'Hot Deals',
      festival: 'none',
      festivalGreeting: '',
      festivalDecor: true,
      festivalStart: '',
      festivalEnd: '',
      menu: DEFAULT_MOBILE_MENU,
    });
    expect(set).toHaveBeenCalledWith('admin-1', 'mobile.home', saved);
    expect(store['mobile.home']).toMatchObject({ dealsEnabled: false, dealsTitle: 'Hot Deals' });
    expect(saved.offerRows[0]?.columns).toBe(3);
    expect(await ctrl.get()).toEqual(saved);
  });
});

describe('festival theme', () => {
  const base = {
    heroBanners: [],
    categories: [],
    offerRows: [],
    dealsEnabled: true,
    dealsTitle: 'Deals of the Day',
    festivalStart: '',
    festivalEnd: '',
    menu: DEFAULT_MOBILE_MENU,
  };

  it('stores the start/end dates, and serves them publicly', async () => {
    const { svc } = fakeSettings();
    const saved = await new AdminMobileHomeController(svc).put(ADMIN, {
      ...base,
      festival: 'diwali',
      festivalGreeting: '',
      festivalDecor: true,
      festivalStart: '2026-11-05',
      festivalEnd: '2026-11-12',
    });
    expect(saved).toMatchObject({ festivalStart: '2026-11-05', festivalEnd: '2026-11-12' });
    const pub = await new PublicSettingsController(svc).publicSettings();
    expect(pub.mobileHome).toMatchObject({ festivalStart: '2026-11-05', festivalEnd: '2026-11-12' });
  });

  it('rejects an end date before the start date and stores nothing', async () => {
    const { svc, set } = fakeSettings();
    await expect(
      new AdminMobileHomeController(svc).put(ADMIN, {
        ...base,
        festival: 'holi',
        festivalGreeting: '',
        festivalDecor: true,
        festivalStart: '2026-03-10',
        festivalEnd: '2026-03-02',
      }),
    ).rejects.toThrow(/on or after/);
    expect(set).not.toHaveBeenCalled();
  });

  it('old stored configs without dates read back as "no limit"', async () => {
    const { svc } = fakeSettings({ 'mobile.home': { festival: 'diwali' } });
    const pub = await new PublicSettingsController(svc).publicSettings();
    expect(pub.mobileHome).toMatchObject({ festival: 'diwali', festivalStart: '', festivalEnd: '' });
  });

  it('persists the chosen festival, greeting and decor flag and serves them publicly', async () => {
    const { svc, set } = fakeSettings();
    const admin = new AdminMobileHomeController(svc);
    const saved = await admin.put(ADMIN, {
      ...base,
      festival: 'diwali',
      festivalGreeting: 'Shubh Deepawali',
      festivalDecor: false,
    });
    expect(saved).toMatchObject({ festival: 'diwali', festivalGreeting: 'Shubh Deepawali', festivalDecor: false });
    expect(set).toHaveBeenCalledWith('admin-1', 'mobile.home', expect.objectContaining({ festival: 'diwali' }));

    const pub = await new PublicSettingsController(svc).publicSettings();
    expect(pub.mobileHome).toMatchObject({ festival: 'diwali', festivalGreeting: 'Shubh Deepawali', festivalDecor: false });
  });

  it('serves "none" when nothing is stored, and degrades a corrupt festival without dropping other settings', async () => {
    const empty = fakeSettings();
    expect((await new PublicSettingsController(empty.svc).publicSettings()).mobileHome.festival).toBe('none');

    const corrupt = fakeSettings({ 'mobile.home': { festival: 'christmas', dealsTitle: 'Hot Deals' } });
    const pub = await new PublicSettingsController(corrupt.svc).publicSettings();
    expect(pub.mobileHome.festival).toBe('none');
    expect(pub.mobileHome.dealsTitle).toBe('Hot Deals');
  });
});

describe('GET /settings/public → mobileHome', () => {
  it('exposes the sanitized config, dropping bad elements', async () => {
    const { svc } = fakeSettings({
      'mobile.home': {
        heroBanners: [{ id: 'ok', imageUrl: '/a.png' }, { id: 'bad', imageUrl: '' }],
        offerRows: [{ id: 'r', columns: 7, banners: [] }],
        dealsEnabled: false,
      },
    });
    const res = await new PublicSettingsController(svc).publicSettings();
    expect(res.mobileHome.heroBanners.map((b) => b.id)).toEqual(['ok']);
    expect(res.mobileHome.offerRows).toEqual([]);
    expect(res.mobileHome.dealsEnabled).toBe(false);
  });

  it('always returns defaults (never null) when unset, so the app needs no null checks', async () => {
    const { svc } = fakeSettings();
    const res = await new PublicSettingsController(svc).publicSettings();
    expect(res.mobileHome).toEqual(DEFAULT_MOBILE_HOME);
  });
});

describe('☰ app menu details', () => {
  const home = {
    heroBanners: [],
    categories: [],
    offerRows: [],
    dealsEnabled: true,
    dealsTitle: 'Deals of the Day',
    festival: 'none' as const,
    festivalGreeting: '',
    festivalDecor: true,
    festivalStart: '',
    festivalEnd: '',
  };

  it('stores the admin-edited contact details and serves them publicly', async () => {
    const { svc } = fakeSettings();
    const menu = { ...DEFAULT_MOBILE_MENU, carePhone: '9000000001', careHours: 'Mon–Sat, 9 AM – 8 PM', storeHelpline: '07683 222222' };
    const saved = await new AdminMobileHomeController(svc).put(ADMIN, { ...home, menu });
    expect(saved.menu).toMatchObject({ carePhone: '9000000001', careHours: 'Mon–Sat, 9 AM – 8 PM' });
    const pub = await new PublicSettingsController(svc).publicSettings();
    expect((pub.mobileHome as { menu: { carePhone: string } }).menu.carePhone).toBe('9000000001');
  });

  it('never stores an unsafe link (the HTTP layer rejects it; the store falls back to the default)', async () => {
    const { svc } = fakeSettings();
    const saved = await new AdminMobileHomeController(svc).put(ADMIN, {
      ...home,
      menu: { ...DEFAULT_MOBILE_MENU, careWhatsappUrl: 'javascript:alert(1)' },
    });
    expect(saved.menu.careWhatsappUrl).toBe(DEFAULT_MOBILE_MENU.careWhatsappUrl);
  });

  it('an older stored config without a menu still serves the supplied defaults', async () => {
    const { svc } = fakeSettings({ 'mobile.home': { dealsEnabled: false } });
    const pub = await new PublicSettingsController(svc).publicSettings();
    expect((pub.mobileHome as { menu: unknown }).menu).toEqual(DEFAULT_MOBILE_MENU);
  });
});
