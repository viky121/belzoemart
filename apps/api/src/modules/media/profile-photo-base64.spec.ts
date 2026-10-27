import { BadRequestException } from '@nestjs/common';
import type { StorageProvider } from '../../integrations/storage/storage.provider';
import { BASE64_IMAGE_MAX_BYTES, decodeBase64Image, storeCustomerImage } from './customer-image-upload';
import { ProfileMediaController } from './profile-media.controller';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF'), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(200, 3)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(200, 5)]);
const b64 = (b: Buffer) => b.toString('base64');

describe('decodeBase64Image', () => {
  it('turns a real JPEG, PNG or WebP into a file-like object with the right name', () => {
    expect(decodeBase64Image(b64(JPEG), 'image/jpeg')).toMatchObject({ mimetype: 'image/jpeg', originalname: 'photo.jpg', size: JPEG.length });
    expect(decodeBase64Image(b64(PNG), 'image/png')).toMatchObject({ originalname: 'photo.png' });
    expect(decodeBase64Image(b64(WEBP), 'image/webp')).toMatchObject({ originalname: 'photo.webp' });
    expect(decodeBase64Image(b64(JPEG), 'image/jpeg').buffer.equals(JPEG)).toBe(true);
  });

  it('accepts a data URL prefix and line breaks', () => {
    const wrapped = `data:image/jpeg;base64,${b64(JPEG).replace(/(.{60})/g, '$1\n')}`;
    expect(decodeBase64Image(wrapped, 'image/jpeg').buffer.equals(JPEG)).toBe(true);
  });

  it('refuses text that is not base64, and empty pictures', () => {
    expect(() => decodeBase64Image('not base64 !!', 'image/jpeg')).toThrow(BadRequestException);
    expect(() => decodeBase64Image('', 'image/jpeg')).toThrow(BadRequestException);
  });

  it('refuses a file that says it is a picture but is not (wrong first bytes)', () => {
    expect(() => decodeBase64Image(b64(Buffer.from('<?php echo 1; ?>'.padEnd(200, ' '))), 'image/jpeg')).toThrow(/not a valid picture/);
    expect(() => decodeBase64Image(b64(PNG), 'image/jpeg')).toThrow(/not a valid picture/);
    expect(() => decodeBase64Image(b64(JPEG), 'image/webp')).toThrow(/not a valid picture/);
  });

  it('refuses a picture over the size limit', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(BASE64_IMAGE_MAX_BYTES)]);
    expect(() => decodeBase64Image(b64(big), 'image/jpeg')).toThrow(/too large/);
  });
});

describe('ProfileMediaController.uploadBase64', () => {
  function build() {
    const put = jest.fn(async (i: { key: string }) => ({ url: `/api/uploads/${i.key}` }));
    const storage = { put } as unknown as StorageProvider;
    return { ctrl: new ProfileMediaController(storage), put };
  }

  it('stores the picture under profile/ and returns the address the app saves on the profile', async () => {
    const { ctrl, put } = build();
    const out = await ctrl.uploadBase64({ image: b64(JPEG), mimeType: 'image/jpeg' });
    expect(out.key).toMatch(/^profile\/[0-9a-f-]{36}\.jpg$/);
    expect(out.url).toBe(`/api/uploads/${out.key}`);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/jpeg', body: expect.any(Buffer) }));
  });

  it('stores nothing for a bad picture', async () => {
    const { ctrl, put } = build();
    await expect(ctrl.uploadBase64({ image: b64(Buffer.alloc(300, 1)), mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(BadRequestException);
    expect(put).not.toHaveBeenCalled();
  });

  it('the multipart route still works for the website', async () => {
    const { ctrl, put } = build();
    await ctrl.upload({ buffer: JPEG, mimetype: 'image/jpeg', originalname: 'a.jpg', size: JPEG.length });
    expect(put).toHaveBeenCalled();
    await expect(storeCustomerImage({ put } as unknown as StorageProvider, undefined, 'profile')).rejects.toBeInstanceOf(BadRequestException);
  });
});
