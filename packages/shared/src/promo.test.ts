import { promoImage } from './home';
import { promoContentSchema } from './schemas';

describe('promo tile pictures', () => {
  it('promoImage treats empty and "#" as no picture', () => {
    expect(promoImage({ imageUrl: '' })).toBeNull();
    expect(promoImage({ imageUrl: '#' })).toBeNull();
    expect(promoImage({})).toBeNull();
    expect(promoImage({ imageUrl: ' /api/uploads/banners/a.jpg ' })).toBe('/api/uploads/banners/a.jpg');
  });

  it('a saved tile keeps its picture, and an old tile without one still validates', () => {
    expect(promoContentSchema.parse({ title: 'T', imageUrl: '/api/uploads/banners/a.jpg' }).imageUrl).toBe(
      '/api/uploads/banners/a.jpg',
    );
    const old = promoContentSchema.parse({ title: 'T', icon: '🛒' });
    expect(promoImage(old)).toBeNull();
  });

  it('a hostile picture address is neutralised', () => {
    expect(promoContentSchema.parse({ title: 'T', imageUrl: 'javascript:alert(1)' }).imageUrl).toBe('#');
  });
});
