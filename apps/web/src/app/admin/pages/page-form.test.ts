import { EMPTY_PAGE, suggestSlug, toPayload, validatePage } from './page-form';

const ok = { ...EMPTY_PAGE, slug: 'refund-rules', title: 'Refund Rules', body: 'Some text.' };

describe('validatePage', () => {
  it('accepts a complete new page', () => {
    expect(validatePage(ok, { isNew: true, takenSlugs: ['terms'] })).toBeNull();
  });

  it('needs a title and some text', () => {
    expect(validatePage({ ...ok, title: '  ' }, { isNew: true, takenSlugs: [] })).toMatch(/title/);
    expect(validatePage({ ...ok, body: '  \n ' }, { isNew: true, takenSlugs: [] })).toMatch(/no text/);
  });

  it('checks the web address of a new page only', () => {
    expect(validatePage({ ...ok, slug: '' }, { isNew: true, takenSlugs: [] })).toMatch(/web address/);
    expect(validatePage({ ...ok, slug: 'Refund Rules' }, { isNew: true, takenSlugs: [] })).toMatch(/lowercase/);
    expect(validatePage({ ...ok, slug: 'terms' }, { isNew: true, takenSlugs: ['terms'] })).toMatch(/already exists/);
    // an existing page keeps its address, which is not re-validated
    expect(validatePage({ ...ok, slug: 'terms' }, { isNew: false, takenSlugs: ['terms'] })).toBeNull();
  });

  it('caps the text length', () => {
    expect(validatePage({ ...ok, body: 'x'.repeat(60_001) }, { isNew: false, takenSlugs: [] })).toMatch(/too long/);
  });
});

describe('suggestSlug / toPayload', () => {
  it('suggests a url-safe address from the title', () => {
    expect(suggestSlug('Refund & Return Rules!')).toBe('refund-return-rules');
    expect(suggestSlug('   ')).toBe('');
  });

  it('trims what it sends and keeps the enabled flag', () => {
    expect(toPayload({ slug: ' a-b ', title: ' T ', body: ' B \n', isActive: false })).toEqual({
      slug: 'a-b',
      title: 'T',
      body: 'B',
      isActive: false,
    });
  });
});
