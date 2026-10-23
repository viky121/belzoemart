import { CMS_SLUG_RE, parseCmsBody } from './cms-body';

describe('parseCmsBody', () => {
  it('turns markers into headings, bullets and paragraphs', () => {
    const blocks = parseCmsBody('## Delivery\nWe deliver in Tikamgarh.\n- Free above ₹300\n• Else ₹30\n* Star item');
    expect(blocks).toEqual([
      { type: 'heading', text: 'Delivery' },
      { type: 'paragraph', text: 'We deliver in Tikamgarh.' },
      { type: 'bullet', text: 'Free above ₹300' },
      { type: 'bullet', text: 'Else ₹30' },
      { type: 'bullet', text: 'Star item' },
    ]);
  });

  it('treats an old plain-text body as paragraphs, ignoring blank lines and Windows line ends', () => {
    expect(parseCmsBody('First.\r\n\r\n  Second.  \n')).toEqual([
      { type: 'paragraph', text: 'First.' },
      { type: 'paragraph', text: 'Second.' },
    ]);
  });

  it('only treats a marker at the start of a line as one', () => {
    expect(parseCmsBody('Rate is 5 - 10% # not a heading')).toEqual([
      { type: 'paragraph', text: 'Rate is 5 - 10% # not a heading' },
    ]);
    expect(parseCmsBody('-no space')).toEqual([{ type: 'paragraph', text: '-no space' }]);
    expect(parseCmsBody('##')).toEqual([{ type: 'paragraph', text: '##' }]);
  });

  it('never returns markup: text stays exactly as typed', () => {
    expect(parseCmsBody('<script>alert(1)</script>')).toEqual([
      { type: 'paragraph', text: '<script>alert(1)</script>' },
    ]);
  });

  it('accepts any heading depth', () => {
    expect(parseCmsBody('### Small')[0]).toEqual({ type: 'heading', text: 'Small' });
  });

  it('empty body gives no blocks', () => {
    expect(parseCmsBody('')).toEqual([]);
    expect(parseCmsBody(' \n \n')).toEqual([]);
  });
});

describe('CMS_SLUG_RE', () => {
  it('accepts url-safe slugs and rejects the rest', () => {
    for (const ok of ['terms', 'returns-policy', 'page-2', 'a']) expect(CMS_SLUG_RE.test(ok)).toBe(true);
    for (const bad of ['', 'Terms', 'a_b', 'a b', '-a', 'a-', 'a--b', '../x', 'a/b', 'ä']) {
      expect(CMS_SLUG_RE.test(bad)).toBe(false);
    }
  });
});
