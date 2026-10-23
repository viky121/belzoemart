import { parseCmsBody, CMS_SLUG_RE } from '@belzo/shared';
import { LEGAL_PAGES } from '../../../prisma/legal-content';

const bySlug = (slug: string) => LEGAL_PAGES.find((p) => p.slug === slug)!;
const text = (slug: string) => bySlug(slug).body;

describe('legal policy pages (from the Belzo eMart legal document)', () => {
  it('has every policy section of the document as a page, with valid unique slugs', () => {
    const slugs = LEGAL_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.sort()).toEqual(
      [
        'account-features',
        'cancellation-policy',
        'contact',
        'grievance-support',
        'payment-policy',
        'privacy',
        'returns-policy',
        'shipping-policy',
        'terms',
      ].sort(),
    );
    for (const p of LEGAL_PAGES) {
      expect(CMS_SLUG_RE.test(p.slug)).toBe(true);
      expect(p.title.length).toBeGreaterThan(2);
    }
  });

  it('every page is structured as headed sections with real text under each heading', () => {
    for (const p of LEGAL_PAGES) {
      const blocks = parseCmsBody(p.body);
      expect(blocks[0]!.type).toBe('heading');
      blocks.forEach((b, i) => {
        if (b.type === 'heading') expect(blocks[i + 1]).toBeDefined();
        if (b.type === 'heading' && blocks[i + 1]) expect(blocks[i + 1]!.type).not.toBe('heading');
      });
    }
  });

  it('has clean spacing (the source file had words run together) and no stray glyphs', () => {
    // Words run together ("BelzoeMart"), the missing-glyph box, doubled dots, doubled/odd spaces.
    const bad = [/\bBelzoeMart/, /■/, /\.\./, /\s{2,}/, /\u00a0/];
    for (const p of LEGAL_PAGES) {
      for (const re of bad) {
        const hit = p.body.split('\n').find((l) => re.test(l));
        if (hit) throw new Error(`${p.slug}: "${hit.slice(0, 80)}" matches ${re}`);
      }
    }
  });

  it('keeps the business facts exactly as supplied', () => {
    const contact = text('contact');
    expect(contact).toContain('GSTIN: 23ABHFB6830B1ZY');
    expect(contact).toContain('PAN: ABHFB6830B');
    expect(contact).toContain('FSSAI Registration Number: 21426510000951');
    expect(contact).toContain('Email: belzoemart@gmail.com');
    expect(contact).toContain('Phone/WhatsApp: 8839095625');
    expect(contact).toContain('BRAMMAD COLONY KUNWARPURA ROAD, Tikamgarh, Madhya Pradesh – 472001');
    expect(contact).toContain('Support Hours: 09:00 AM to 09:00 PM');
  });

  it('states the delivery charge rule with the rupee sign in both places it appears', () => {
    const rule = /Orders of ₹300 or more are eligible for free delivery\. Orders below ₹300 may attract a ₹30 delivery charge/;
    expect(text('terms')).toMatch(rule);
    expect(text('shipping-policy')).toMatch(rule);
  });

  it('carries the policy substance a customer relies on', () => {
    expect(text('terms')).toContain('Governing Law & Jurisdiction');
    expect(text('terms')).toContain('Tikamgarh, Madhya Pradesh');
    expect(text('returns-policy')).toContain('initiate the applicable refund on the same day');
    expect(text('cancellation-policy')).toContain('no cancellation charge will be imposed');
    expect(text('payment-policy')).toContain('Razorpay and Cash on Delivery');
    expect(text('privacy')).toContain('Account Deletion');
    expect(text('grievance-support')).toContain('8839095625');
  });

  it('does not publish the document\'s internal drafting notes', () => {
    for (const p of LEGAL_PAGES) {
      expect(p.body).not.toMatch(/reviewed by an Indian lawyer|legal\/compliance professional|Effective Date/i);
    }
  });

  it('lists the sample texts it may replace, and never lists its own text as a placeholder', () => {
    for (const p of LEGAL_PAGES) expect(p.placeholders).not.toContain(p.body);
    expect(bySlug('terms').placeholders).toContain('Standard terms of use for Belzo eMart.');
  });
});
