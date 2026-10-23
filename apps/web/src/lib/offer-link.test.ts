import { offerLink } from './offer-link';

describe('offerLink', () => {
  it('treats empty and "#" as a plain picture', () => {
    for (const v of ['', '#', '   ', null, undefined]) expect(offerLink(v)).toEqual({ kind: 'none' });
  });

  it('keeps site paths in-site', () => {
    expect(offerLink('/category/grocery')).toEqual({ kind: 'internal', href: '/category/grocery' });
    expect(offerLink(' /search?sort=discount ')).toEqual({ kind: 'internal', href: '/search?sort=discount' });
  });

  it('opens full web addresses as external links', () => {
    expect(offerLink('https://example.com/sale')).toEqual({ kind: 'external', href: 'https://example.com/sale' });
    expect(offerLink('http://example.com')).toEqual({ kind: 'external', href: 'http://example.com' });
  });

  it('ignores anything that could run code or leave the site oddly', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', 'ftp://x', 'category/x', 'https://']) {
      expect(offerLink(bad)).toEqual({ kind: 'none' });
    }
  });
});
