import type { MediaItem } from '@/lib/admin-api';
import { formatMediaDate, formatMediaSize, sortMediaItems } from './media-picker-utils';

function item(key: string, lastModified: string | null): MediaItem {
  return { key, url: `/u/${key}`, folder: 'categories', name: key, size: 0, lastModified };
}

describe('formatMediaSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatMediaSize(512)).toBe('512 B');
    expect(formatMediaSize(12_300)).toBe('12.0 KB');
    expect(formatMediaSize(1_572_864)).toBe('1.5 MB');
  });

  it('handles zero / invalid sizes', () => {
    expect(formatMediaSize(0)).toBe('0 B');
    expect(formatMediaSize(Number.NaN)).toBe('0 B');
  });
});

describe('sortMediaItems', () => {
  it('sorts newest-first with nulls last and does not mutate the input', () => {
    const input = [
      item('a.png', '2024-01-01T00:00:00.000Z'),
      item('b.png', null),
      item('c.png', '2024-03-01T00:00:00.000Z'),
    ];
    const sorted = sortMediaItems(input);
    expect(sorted.map((i) => i.key)).toEqual(['c.png', 'a.png', 'b.png']);
    expect(input.map((i) => i.key)).toEqual(['a.png', 'b.png', 'c.png']);
  });
});

describe('formatMediaDate', () => {
  it('returns a dash for missing or invalid dates', () => {
    expect(formatMediaDate(null)).toBe('—');
    expect(formatMediaDate('not-a-date')).toBe('—');
  });

  it('renders a date for a valid ISO timestamp', () => {
    expect(formatMediaDate('2024-01-02T03:04:05.000Z')).not.toBe('—');
  });
});
