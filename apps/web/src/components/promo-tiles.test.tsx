import { renderToStaticMarkup } from 'react-dom/server';
import type { PromoContent } from '@belzo/shared';
import { PromoTiles } from './promo-tiles';

const tile = (over: Partial<PromoContent> = {}): PromoContent => ({
  title: 'Fresh & Healthy Groceries',
  subtitle: 'From farm to your home',
  cta: 'Shop Now',
  href: '/category/grocery',
  icon: '🥦',
  color: 'green',
  imageUrl: '',
  ...over,
});

describe('PromoTiles', () => {
  it('shows a text tile without any icon, even when an old icon is still saved', () => {
    const html = renderToStaticMarkup(<PromoTiles promos={[tile()]} />);
    expect(html).toContain('Fresh &amp; Healthy Groceries');
    expect(html).toContain('From farm to your home');
    expect(html).toContain('Shop Now');
    expect(html).not.toContain('🥦');
    expect(html).not.toContain('em-promo__icon');
    expect(html).not.toContain('em-promo--image');
  });

  it('a tile with a picture is just the picture, described by its title', () => {
    const html = renderToStaticMarkup(
      <PromoTiles promos={[tile({ imageUrl: '/api/uploads/banners/groceries.jpg' })]} />,
    );
    expect(html).toContain('em-promo--image');
    expect(html).toContain('src="/api/uploads/banners/groceries.jpg"');
    expect(html).toContain('alt="Fresh &amp; Healthy Groceries"');
    // none of the text-tile content is drawn over / beside the picture
    expect(html).not.toContain('From farm to your home');
    expect(html).not.toContain('em-promo__cta');
    expect(html).not.toContain('background:');
  });

  it('treats "#" and empty as no picture', () => {
    for (const imageUrl of ['', '#']) {
      expect(renderToStaticMarkup(<PromoTiles promos={[tile({ imageUrl })]} />)).not.toContain('em-promo--image');
    }
  });

  it('mixes picture and text tiles in the order given', () => {
    const html = renderToStaticMarkup(
      <PromoTiles promos={[tile({ title: 'A', imageUrl: '/a.jpg' }), tile({ title: 'B' }), tile({ title: 'C', imageUrl: '/c.jpg' })]} />,
    );
    const order = [...html.matchAll(/data-testid="promo-tile-(\d)"/g)].map((m) => m[1]);
    expect(order).toEqual(['0', '1', '2']);
    expect(html.match(/em-promo--image/g)).toHaveLength(2);
  });

  it('links in-site, safely outside, and not at all for "#"', () => {
    const html = renderToStaticMarkup(
      <PromoTiles
        promos={[
          tile({ href: '/category/x' }),
          tile({ href: 'https://example.com/y' }),
          tile({ href: '#' }),
          tile({ href: 'javascript:alert(1)' }),
        ]}
      />,
    );
    const el = (i: number) => html.match(new RegExp(`<(?:a|div)[^>]*data-testid="promo-tile-${i}"[^>]*>`))![0];
    expect(el(0)).toMatch(/^<a /);
    expect(el(0)).toContain('href="/category/x"');
    expect(el(1)).toContain('target="_blank"');
    expect(el(1)).toContain('rel="noopener noreferrer"');
    expect(el(2)).toMatch(/^<div /);
    expect(el(3)).toMatch(/^<div /);
    expect(html).not.toContain('javascript:');
  });
});
