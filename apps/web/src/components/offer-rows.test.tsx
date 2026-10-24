import { renderToStaticMarkup } from 'react-dom/server';
import type { MobileOfferRow } from '@belzo/shared';
import { offerRowsAt } from '@belzo/shared';
import { OfferRows } from './offer-rows';

const banner = (id: string, linkUrl = '/category/grocery', over: Record<string, unknown> = {}) => ({
  id,
  imageUrl: `/api/uploads/banners/${id}.jpg`,
  linkUrl,
  title: `Offer ${id}`,
  enabled: true,
  ...over,
});

const row = (over: Partial<MobileOfferRow> = {}): MobileOfferRow => ({
  id: 'r1',
  title: 'Festive offers',
  columns: 2,
  position: 'after_hero',
  enabled: true,
  banners: [banner('a'), banner('b')],
  showOn: 'both',
  ...over,
});

describe('OfferRows', () => {
  it('renders nothing when there are no rows', () => {
    expect(renderToStaticMarkup(<OfferRows rows={[]} />)).toBe('');
  });

  it('puts two banners side by side in a 2-column row, with the row title', () => {
    const html = renderToStaticMarkup(<OfferRows rows={[row()]} />);
    expect(html).toContain('offer-row__grid--2');
    expect(html).toContain('Festive offers');
    expect(html.match(/class="offer-banner[ "]/g)).toHaveLength(2);
    expect(html).toContain('/api/uploads/banners/a.jpg');
    expect(html).toContain('/api/uploads/banners/b.jpg');
  });

  it('two rows give two separate grids, each with its own column count', () => {
    const html = renderToStaticMarkup(
      <OfferRows rows={[row({ id: 'r1', columns: 2 }), row({ id: 'r2', columns: 1, banners: [banner('c')] })]} />,
    );
    expect(html).toContain('offer-row__grid--2');
    expect(html).toContain('offer-row__grid--1');
    expect(html).toContain('data-testid="offer-row-r1"');
    expect(html).toContain('data-testid="offer-row-r2"');
  });

  it('uses the same aspect ratio as the app for each column count', () => {
    expect(renderToStaticMarkup(<OfferRows rows={[row({ columns: 1 })]} />)).toContain('--offer-ratio:2.5');
    expect(renderToStaticMarkup(<OfferRows rows={[row({ columns: 2 })]} />)).toContain('--offer-ratio:1.5');
    expect(renderToStaticMarkup(<OfferRows rows={[row({ columns: 3 })]} />)).toContain('--offer-ratio:1');
  });

  it('links in-site banners normally, external ones safely, and leaves link-less ones as pictures', () => {
    const html = renderToStaticMarkup(
      <OfferRows
        rows={[
          row({
            columns: 3,
            banners: [banner('in', '/category/grocery'), banner('out', 'https://example.com/x'), banner('pic', '#')],
          }),
        ]}
      />,
    );
    const tag = (id: string) => html.match(new RegExp(`<(?:a|div)[^>]*data-testid="offer-banner-${id}"[^>]*>`))![0];
    // in-site banner: a normal link, no new tab
    expect(tag('in')).toMatch(/^<a /);
    expect(tag('in')).toContain('href="/category/grocery"');
    expect(tag('in')).not.toContain('target=');
    // external banner: opens in a new tab without leaking the opener
    expect(tag('out')).toContain('href="https://example.com/x"');
    expect(tag('out')).toContain('target="_blank"');
    expect(tag('out')).toContain('rel="noopener noreferrer"');
    // no link: a plain picture, not a link
    expect(tag('pic')).toMatch(/^<div /);
    expect(tag('pic')).toContain('offer-banner--static');
    expect(tag('pic')).not.toContain('href=');
  });

  it('never turns a script link into a link', () => {
    const html = renderToStaticMarkup(
      <OfferRows rows={[row({ banners: [banner('x', 'javascript:alert(1)')] })]} />,
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('offer-banner--static');
  });

  it('omits the title heading when the row has none', () => {
    expect(renderToStaticMarkup(<OfferRows rows={[row({ title: '' })]} />)).not.toContain('<h2');
  });
});

describe('offer rows by position (what each home slot receives)', () => {
  const rows = [
    row({ id: 'hero', position: 'after_hero' }),
    row({ id: 'cats', position: 'after_categories' }),
    row({ id: 'off', position: 'after_deals', enabled: false }),
    row({ id: 'empty', position: 'after_deals', banners: [] }),
    row({ id: 'img', position: 'after_deals', banners: [banner('z', '/x', { imageUrl: '' })] }),
  ];

  it('gives each slot only its own enabled rows that have a usable banner', () => {
    expect(offerRowsAt(rows, 'after_hero').map((r) => r.id)).toEqual(['hero']);
    expect(offerRowsAt(rows, 'after_categories').map((r) => r.id)).toEqual(['cats']);
    expect(offerRowsAt(rows, 'after_deals')).toEqual([]);
  });

  it('drops disabled banners inside a row', () => {
    const r = row({ banners: [banner('a'), banner('b', '/x', { enabled: false })] });
    expect(offerRowsAt([r], 'after_hero')[0]!.banners.map((b) => b.id)).toEqual(['a']);
  });
});
