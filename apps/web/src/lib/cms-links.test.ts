import { FOOTER_PAGE_LINKS, footerColumn, visibleLinks } from './cms-links';

describe('visibleLinks', () => {
  it('shows only links to enabled pages', () => {
    const out = visibleLinks(FOOTER_PAGE_LINKS, ['terms', 'privacy']);
    expect(out.map((l) => l.slug)).toEqual(['terms', 'privacy']);
  });

  it('hides everything when no page is enabled', () => {
    expect(visibleLinks(FOOTER_PAGE_LINKS, [])).toEqual([]);
  });

  it('keeps every link when the list could not be loaded', () => {
    expect(visibleLinks(FOOTER_PAGE_LINKS, null)).toHaveLength(FOOTER_PAGE_LINKS.length);
    expect(visibleLinks(FOOTER_PAGE_LINKS, undefined)).toHaveLength(FOOTER_PAGE_LINKS.length);
  });

  it('ignores enabled pages the footer does not link to, and keeps the footer order', () => {
    const out = visibleLinks(FOOTER_PAGE_LINKS, ['payment-policy', 'about', 'some-new-page']);
    expect(out.map((l) => l.slug)).toEqual(['about', 'payment-policy']);
  });

  it('splits the footer into a Quick Links column and a Policies column, balanced', () => {
    const company = footerColumn('company', null).map((l) => l.slug);
    const policy = footerColumn('policy', null).map((l) => l.slug);
    expect(company).toEqual(['about', 'contact', 'grievance-support']);
    expect(policy).toEqual([
      'terms',
      'privacy',
      'returns-policy',
      'shipping-policy',
      'cancellation-policy',
      'payment-policy',
    ]);
    // every link appears in exactly one column
    expect([...company, ...policy].sort()).toEqual(FOOTER_PAGE_LINKS.map((l) => l.slug).sort());
  });

  it('a disabled page drops out of its own column only', () => {
    const active = ['about', 'contact', 'grievance-support', 'privacy'];
    expect(footerColumn('company', active)).toHaveLength(3);
    expect(footerColumn('policy', active).map((l) => l.slug)).toEqual(['privacy']);
    expect(footerColumn('policy', [])).toEqual([]);
  });

  it('footer links are unique page slugs', () => {
    const slugs = FOOTER_PAGE_LINKS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
