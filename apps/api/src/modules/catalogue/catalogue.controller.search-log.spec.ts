import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { CatalogueController } from './catalogue.controller';

describe('CatalogueController POST search/log', () => {
  const record = jest.fn(async () => true);
  const ctrl = new CatalogueController({} as never, {} as never, {} as never, {} as never, { record } as never);
  beforeEach(() => record.mockClear());

  it('is public (guests search too), answers 204 and is rate limited', () => {
    const handler = CatalogueController.prototype.logSearch;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(204);
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', handler);
    expect(limit).toBe(30);
  });

  it('passes the keyword, the source, the login header and the address to the service', async () => {
    const req = { headers: { authorization: 'Bearer abc' }, ip: '8.8.8.8' };
    await ctrl.logSearch(req as never, { q: 'sugar', source: 'app' });
    expect(record).toHaveBeenCalledWith({ q: 'sugar', source: 'app', authorization: 'Bearer abc', ip: '8.8.8.8' });
  });

  it('ignores a body that is not a keyword and a source, without an error', async () => {
    const req = { headers: {}, ip: '8.8.8.8' };
    for (const body of [undefined, null, {}, { q: 'sugar' }, { q: 'sugar', source: 'sms' }, { q: 5, source: 'web' }, 'sugar']) {
      await expect(ctrl.logSearch(req as never, body)).resolves.toBeUndefined();
    }
    expect(record).not.toHaveBeenCalled();
  });
});
