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
    return { controller: new MediaController(storage), list };
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
});
