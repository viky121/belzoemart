import Link from 'next/link';
import { DEFAULT_FOOTER, type FooterContent } from '@/lib/site-content';

interface Cat {
  id: string;
  name: string;
  slug: string;
}

/** eMart storefront footer — content (description, support, social, newsletter) is admin-editable. */
export function EmartFooter({
  categories,
  content = DEFAULT_FOOTER,
}: {
  categories: Cat[];
  content?: FooterContent;
}) {
  const socials: { label: string; href: string }[] = [
    { label: 'f', href: content.facebook || '#' },
    { label: '◎', href: content.instagram || '#' },
    { label: '▶', href: content.youtube || '#' },
    { label: 'in', href: content.linkedin || '#' },
  ];

  return (
    <footer className="em-footer">
      <div className="container em-footer__grid">
        <div className="em-footer__brand">
          <span className="em-footer__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/belzo-logo.svg" alt="Belzo eMart" />
          </span>
          <p>{content.description}</p>
          <div className="em-footer__social">
            {socials.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            ))}
          </div>
        </div>

        <div className="em-footer__col">
          <h4>Quick Links</h4>
          <Link href="/">Home</Link>
          <Link href="/page/about">About Us</Link>
          <Link href="/page/contact">Contact Us</Link>
          <Link href="/page/terms">Terms &amp; Conditions</Link>
          <Link href="/page/privacy">Privacy Policy</Link>
        </div>

        <div className="em-footer__col">
          <h4>Shop by Category</h4>
          {categories.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>

        <div className="em-footer__col">
          <h4>Customer Support</h4>
          {content.phone && <span>📞 {content.phone}</span>}
          {content.email && <span>✉️ {content.email}</span>}
          {content.hours && <span>🕘 {content.hours}</span>}
        </div>

        <div className="em-footer__col em-footer__news">
          <h4>{content.newsletter}</h4>
          <form className="em-news" action="#">
            <input type="email" placeholder="Enter your email address" aria-label="Email address" />
            <button type="submit">Subscribe</button>
          </form>
        </div>
      </div>

      <div className="em-footer__bar container">
        <span>
          © {new Date().getFullYear()} {content.copyright}. All Rights Reserved.
        </span>
        <span className="em-footer__pay">
          <span className="em-pay-badge">UPI</span>
          <span className="em-pay-badge">VISA</span>
          <span className="em-pay-badge">MC</span>
          <span className="em-pay-badge">RuPay</span>
          <span className="em-footer__secure">🔒 100% Secure Payments</span>
        </span>
      </div>
    </footer>
  );
}
