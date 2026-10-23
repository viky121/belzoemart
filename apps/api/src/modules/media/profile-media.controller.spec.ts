import { BadRequestException } from '@nestjs/common';
import { ProfileMediaController } from './profile-media.controller';
import type { StorageProvider } from '../../integrations/storage/storage.provider';

/** Customer profile-photo upload: same limits as review/return uploads, stored under profile/. */
describe('ProfileMediaController.upload', () => {
  function build() {
    const keys: string[] = [];
    const storage = {
      getUrl: (k: string) => `https://cdn.belzo.test/${k}`,
      put: async ({ key }: { key: string }) => {
        keys.push(key);
        return { url: `https://cdn.belzo.test/${key}` };
      },
    } as unknown as StorageProvider;
    return { ctrl: new ProfileMediaController(storage), keys };
  }
  const file = (mimetype: string, originalname = 'me.JPG') => ({
    buffer: Buffer.from('x'),
    mimetype,
    originalname,
    size: 1,
  });

  it('rejects a missing file', async () => {
    const { ctrl } = build();
    await expect(ctrl.upload(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-image file', async () => {
    const { ctrl, keys } = build();
    await expect(ctrl.upload(file('application/pdf', 'doc.pdf'))).rejects.toThrow(/Only image files/);
    expect(keys).toEqual([]);
  });

  it('stores under profile/<uuid>.<ext>', async () => {
    const { ctrl } = build();
    const res = await ctrl.upload(file('image/jpeg'));
    expect(res.key).toMatch(/^profile\/[0-9a-f-]{36}\.jpg$/);
    expect(res.url).toBe(`https://cdn.belzo.test/${res.key}`);
  });
});
