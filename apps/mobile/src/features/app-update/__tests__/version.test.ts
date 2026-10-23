import { compareVersions, resolveDownloadUrl } from '../version';

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    expect(compareVersions('0.10.0', '0.9.2')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
  it('treats missing parts as 0 and equal versions as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });
});

describe('resolveDownloadUrl', () => {
  it('keeps absolute links and resolves site-relative ones', () => {
    expect(resolveDownloadUrl('https://cdn.x/app.apk', 'https://belzoemart.com')).toBe('https://cdn.x/app.apk');
    expect(resolveDownloadUrl('/downloads/a.apk', 'https://belzoemart.com/')).toBe(
      'https://belzoemart.com/downloads/a.apk',
    );
  });
});
