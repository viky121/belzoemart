import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Media listing (admin library). Covers LocalStorageProvider.list over a temp
 * uploads dir (mapping / image-only filter / invoices exclusion / missing dir)
 * and S3StorageProvider.list (success mapping + AccessDenied → empty fallback).
 */
describe('LocalStorageProvider.list', () => {
  let dir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'belzo-media-'));
    // The provider reads from `<cwd>/uploads`; point cwd at our temp dir.
    jest.spyOn(process, 'cwd').mockReturnValue(dir);
    provider = new LocalStorageProvider();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('maps image files, filters non-images, excludes invoices, and recurses', async () => {
    const uploads = join(dir, 'uploads');
    await mkdir(join(uploads, 'categories'), { recursive: true });
    await mkdir(join(uploads, 'invoices'), { recursive: true });
    await writeFile(join(uploads, 'categories', 'tea.png'), 'x');
    await writeFile(join(uploads, 'categories', 'notes.txt'), 'x'); // non-image
    await writeFile(join(uploads, 'invoices', 'inv-1.png'), 'x'); // excluded folder

    const { items } = await provider.list();

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.key).toBe('categories/tea.png');
    expect(item.folder).toBe('categories');
    expect(item.name).toBe('tea.png');
    expect(item.size).toBeGreaterThan(0);
    expect(item.lastModified).not.toBeNull();
    expect(item.url).toContain('/api/uploads/categories/tea.png');
  });

  it('scopes results to the given prefix/folder', async () => {
    const uploads = join(dir, 'uploads');
    await mkdir(join(uploads, 'categories'), { recursive: true });
    await mkdir(join(uploads, 'products'), { recursive: true });
    await writeFile(join(uploads, 'categories', 'a.png'), 'x');
    await writeFile(join(uploads, 'products', 'b.png'), 'x');

    const { items } = await provider.list('categories');

    expect(items.map((i) => i.key)).toEqual(['categories/a.png']);
  });

  it('returns an empty list when the uploads dir is missing', async () => {
    const { items } = await provider.list();
    expect(items).toEqual([]);
  });
});

describe('S3StorageProvider.list', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, S3_BUCKET: 'belzo-media', CDN_BASE_URL: 'https://cdn.example.com' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('maps ListObjectsV2 contents to MediaItems and filters/excludes', async () => {
    const provider = new S3StorageProvider();
    const send = jest.fn().mockResolvedValue({
      Contents: [
        { Key: 'categories/tea.png', Size: 1234, LastModified: new Date('2024-01-02T03:04:05Z') },
        { Key: 'categories/readme.txt', Size: 10, LastModified: new Date('2024-01-01T00:00:00Z') },
        { Key: 'invoices/inv.png', Size: 99, LastModified: new Date('2024-01-03T00:00:00Z') },
      ],
    });
    (provider as unknown as { client: { send: typeof send } }).client = { send };

    const { items } = await provider.list('categories');

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      key: 'categories/tea.png',
      url: 'https://cdn.example.com/categories/tea.png',
      folder: 'categories',
      name: 'tea.png',
      size: 1234,
      lastModified: '2024-01-02T03:04:05.000Z',
    });
  });

  it('returns an empty list when ListBucket is denied', async () => {
    const provider = new S3StorageProvider();
    const send = jest.fn().mockRejectedValue(
      Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }),
    );
    (provider as unknown as { client: { send: typeof send } }).client = { send };

    const { items } = await provider.list();

    expect(items).toEqual([]);
  });

  it('returns an empty list when the bucket is not configured', async () => {
    process.env.S3_BUCKET = '';
    const provider = new S3StorageProvider();

    const { items } = await provider.list();

    expect(items).toEqual([]);
  });
});

describe('S3StorageProvider.put Cache-Control', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, S3_BUCKET: 'belzo-media', CDN_BASE_URL: 'https://cdn.example.com' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  function withSend() {
    const provider = new S3StorageProvider();
    const send = jest.fn().mockResolvedValue({});
    (provider as unknown as { client: { send: typeof send } }).client = { send };
    return { provider, send };
  }

  it('defaults to the long-lived immutable policy when cacheControl is omitted', async () => {
    const { provider, send } = withSend();
    const { url } = await provider.put({ key: 'products/a.png', body: Buffer.from('x'), contentType: 'image/png' });
    expect(send.mock.calls[0][0].input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(url).toBe('https://cdn.example.com/products/a.png');
  });

  it('uses the given cacheControl when provided', async () => {
    const { provider, send } = withSend();
    await provider.put({
      key: 'invoices/o-1.html',
      body: Buffer.from('<html></html>'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'no-cache, max-age=0, must-revalidate',
    });
    expect(send.mock.calls[0][0].input.CacheControl).toBe('no-cache, max-age=0, must-revalidate');
  });
});
