import { resolveImageUrl, resolveImageUrlWith } from '../image-url';

const config = {
  apiBaseUrl: 'https://shop.example.com',
  cleartextHosts: ['13.48.85.9', '10.0.2.2'],
};

describe('resolveImageUrlWith', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    ['/seed/products/a.jpg', null],
    ['//cdn.example.com/a.jpg', null],
    ['/api/uploads/products/a.jpg', 'https://shop.example.com/api/uploads/products/a.jpg'],
    ['http://13.48.85.9/api/uploads/banners/b.jpg', 'http://13.48.85.9/api/uploads/banners/b.jpg'],
    ['http://10.0.2.2:4000/x.png', 'http://10.0.2.2:4000/x.png'],
    ['http://cdn.example.com/a.jpg', 'https://cdn.example.com/a.jpg'],
    ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/a.jpg'],
    ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
    ['ftp://example.com/a.jpg', null],
    ['relative/path.jpg', null],
  ])('%p → %p', (input, expected) => {
    expect(resolveImageUrlWith(input, config)).toBe(expected);
  });

  it('production config (no cleartext hosts) rewrites stored http banner URLs to https', () => {
    expect(
      resolveImageUrlWith('http://13.48.85.9/api/uploads/banners/b.jpg', {
        apiBaseUrl: 'https://shop.example.com',
        cleartextHosts: [],
      }),
    ).toBe('https://13.48.85.9/api/uploads/banners/b.jpg');
  });

  it('resolveImageUrl uses the app env', () => {
    expect(resolveImageUrl('/api/uploads/a.jpg')).toBe('http://api.test/api/uploads/a.jpg');
    expect(resolveImageUrl('http://api.test/a.jpg')).toBe('http://api.test/a.jpg');
  });
});
