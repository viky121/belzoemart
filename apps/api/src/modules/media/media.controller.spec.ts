import { MediaController } from './media.controller';
import type { MediaItem, StorageProvider } from '../../integrations/storage/storage.provider';

/**
 * Media list endpoint: passes a known folder through as the storage prefix,
 * ignores unknown folders, clamps the limit, and returns items newest-first.
 */
function makeItem(key: string, lastModified: string | null): MediaItem {
  return {
    key,
    url: `https://cdn/${key}`,
    folder: key.split('/')[0] ?? '',
    name: key.split('/').pop() ?? key,
    size: 100,
    lastModified,
  };
}

describe('MediaController.list', () => {
  function setup(items: MediaItem[]) {
    const list = jest.fn().mockResolvedValue({ items });
    const storage = { list } as unknown as StorageProvider;
    // Same instance for storage + local so the controller lists exactly once
    // (storage === local short-circuits the S3 merge branch).
    const local = storage as unknown as import('../../integrations/storage/local-storage.provider').LocalStorageProvider;
    return { controller: new MediaController(storage, local), list };
  }

  it('passes a known folder through as the prefix', async () => {
    const { controller, list } = setup([]);
    await controller.list('categories');
    expect(list).toHaveBeenCalledWith('categories', 500);
  });

  it('ignores an unknown folder (lists everything)', async () => {
    const { controller, list } = setup([]);
    await controller.list('bogus');
    expect(list).toHaveBeenCalledWith(undefined, 500);
  });

  it('clamps the limit to [1, 500]', async () => {
    const { controller, list } = setup([]);
    await controller.list(undefined, '9999');
    expect(list).toHaveBeenCalledWith(undefined, 500);
  });

  it('returns items sorted newest-first (nulls last)', async () => {
    const { controller } = setup([
      makeItem('a.png', '2024-01-01T00:00:00.000Z'),
      makeItem('b.png', null),
      makeItem('c.png', '2024-03-01T00:00:00.000Z'),
    ]);
    const { items } = await controller.list();
    expect(items.map((i) => i.key)).toEqual(['c.png', 'a.png', 'b.png']);
  });

  it('merges local + active-provider items and de-dupes by key', async () => {
    const localList = jest
      .fn()
      .mockResolvedValue({ items: [makeItem('categories/x.png', '2024-01-01T00:00:00.000Z')] });
    const s3List = jest.fn().mockResolvedValue({
      items: [
        makeItem('categories/x.png', '2024-01-01T00:00:00.000Z'), // duplicate key
        makeItem('products/y.png', '2024-05-01T00:00:00.000Z'),
      ],
    });
    const local = { list: localList } as unknown as import('../../integrations/storage/local-storage.provider').LocalStorageProvider;
    const storage = { list: s3List } as unknown as StorageProvider;
    const controller = new MediaController(storage, local);
    const { items } = await controller.list();
    // both sources queried, duplicate collapsed, newest-first
    expect(localList).toHaveBeenCalled();
    expect(s3List).toHaveBeenCalled();
    expect(items.map((i) => i.key)).toEqual(['products/y.png', 'categories/x.png']);
  });
});
