import { renderToStaticMarkup } from 'react-dom/server';
import type { HomeBlockCard, WhyItem } from '@belzo/shared';
import { InfoCards } from './info-cards';
import { WhyGrid } from './why-grid';

const why = (over: Partial<WhyItem> = {}): WhyItem => ({
  icon: '🚚',
  title: 'Fast Delivery',
  sub: 'On time, every time',
  imageUrl: '',
  ...over,
});

const card = (over: Partial<HomeBlockCard> = {}): HomeBlockCard => ({
  icon: '⭐',
  title: 'Free shipping',
  subtitle: 'Above ₹300',
  href: '/category/grocery',
  imageUrl: '',
  ...over,
});

describe('WhyGrid', () => {
  it('a text point shows its title and text and no icon, even if an old icon is saved', () => {
    const html = renderToStaticMarkup(<WhyGrid items={[why()]} />);
    expect(html).toContain('Fast Delivery');
    expect(html).toContain('On time, every time');
    expect(html).not.toContain('🚚');
    expect(html).not.toContain('em-why__icon');
    expect(html).not.toContain('em-why__item--image');
  });

  it('a point with a picture is just the picture, described by its title', () => {
    const html = renderToStaticMarkup(<WhyGrid items={[why({ imageUrl: '/api/uploads/banners/fast.jpg' })]} />);
    expect(html).toContain('em-why__item--image');
    expect(html).toContain('src="/api/uploads/banners/fast.jpg"');
    expect(html).toContain('alt="Fast Delivery"');
    expect(html).not.toContain('On time, every time');
    expect(html).not.toContain('<strong>');
  });

  it('keeps the order and treats "#" as no picture', () => {
    const html = renderToStaticMarkup(
      <WhyGrid items={[why({ title: 'A', imageUrl: '/a.jpg' }), why({ title: 'B', imageUrl: '#' }), why({ title: 'C' })]} />,
    );
    expect([...html.matchAll(/data-testid="why-item-(\d)"/g)].map((m) => m[1])).toEqual(['0', '1', '2']);
    expect(html.match(/em-why__item--image/g)).toHaveLength(1);
  });
});

describe('InfoCards', () => {
  it('a text card shows title and text, no icon', () => {
    const html = renderToStaticMarkup(<InfoCards cards={[card()]} />);
    expect(html).toContain('Free shipping');
    expect(html).toContain('Above ₹300');
    expect(html).not.toContain('⭐');
    expect(html).not.toContain('em-cardlet__icon');
    expect(html).not.toContain('em-cardlet--image');
  });

  it('a card with a picture is just the picture and still links', () => {
    const html = renderToStaticMarkup(<InfoCards cards={[card({ imageUrl: '/api/uploads/banners/c.jpg' })]} />);
    expect(html).toContain('em-cardlet--image');
    expect(html).toContain('src="/api/uploads/banners/c.jpg"');
    expect(html).toContain('alt="Free shipping"');
    expect(html).toContain('href="/category/grocery"');
    expect(html).not.toContain('Above ₹300');
  });

  it('links in-site, safely outside, and not at all for "#" or script links', () => {
    const html = renderToStaticMarkup(
      <InfoCards
        cards={[card({ href: '/x' }), card({ href: 'https://example.com' }), card({ href: '#' }), card({ href: 'javascript:alert(1)' })]}
      />,
    );
    const el = (i: number) => html.match(new RegExp(`<(?:a|div)[^>]*data-testid="info-card-${i}"[^>]*>`))![0];
    expect(el(0)).toMatch(/^<a /);
    expect(el(1)).toContain('rel="noopener noreferrer"');
    expect(el(2)).toMatch(/^<div /);
    expect(el(3)).toMatch(/^<div /);
    expect(html).not.toContain('javascript:');
  });
});
