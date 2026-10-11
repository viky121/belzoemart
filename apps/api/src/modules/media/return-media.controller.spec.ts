import { BadRequestException } from '@nestjs/common';
import { ReturnMediaController } from './return-media.controller';
import type { StorageProvider } from '../../integrations/storage/storage.provider';
import { isOwnReturnImageUrl } from '../orders/return-images';

/** Customer return-photo upload: same limits as review uploads, stored under returns/. */
describe('ReturnMediaController.upload', () => {
  function build() {
    const keys: string[] = [];
    const getUrl = (k: string) => `https://cdn.belzo.test/${k}`;
    const storage = {
      getUrl,
      put: async ({ key }: { key: string }) => {
        keys.push(key);
        return { url: getUrl(key) };
      },
    } as unknown as StorageProvider;
    return { ctrl: new ReturnMediaController(storage), storage, keys };
  }

  const file = (mimetype: string, originalname = 'photo.JPG') => ({
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

  it('stores under returns/<uuid>.<ext> and returns a URL the return service accepts', async () => {
    const { ctrl, storage } = build();
    const res = await ctrl.upload(file('image/jpeg'));
    expect(res.key).toMatch(/^returns\/[0-9a-f-]{36}\.jpg$/);
    expect(isOwnReturnImageUrl(res.url, storage.getUrl('returns/'))).toBe(true);
  });
});
