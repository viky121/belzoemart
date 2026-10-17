import { escapeHtml, renderHostedPage, safeJson } from './hosted-page';

const base = {
  nonce: 'NONCE123',
  keyId: 'rzp_live_abc',
  providerOrderId: 'order_1',
  amountPaise: 118050,
  description: 'Belzo order 6f1d0c9e',
  prefill: { name: 'Asha', contact: '9876543210', email: 'a@b.in' },
  callbackUrl: 'https://belzoemart.com/api/v1/payments/hosted/callback?t=T',
  cancelUrl: 'https://belzoemart.com/api/v1/payments/hosted/cancel?t=T',
};

describe('hosted checkout page', () => {
  it('opens Razorpay checkout in redirect mode for the gateway order', () => {
    const html = renderHostedPage(base);
    expect(html).toContain('https://checkout.razorpay.com/v1/checkout.js');
    expect(html).toContain('"key":"rzp_live_abc"');
    expect(html).toContain('"order_id":"order_1"');
    expect(html).toContain('"amount":118050');
    expect(html).toContain('"redirect":true');
    expect(html).toContain('"callback_url":"https://belzoemart.com/api/v1/payments/hosted/callback?t=T"');
    expect(html).toContain('&#8377;1180.50');
  });

  it('puts the CSP nonce on both scripts and the cancel link works without JavaScript', () => {
    const html = renderHostedPage(base);
    expect(html.match(/<script nonce="NONCE123"/g)).toHaveLength(2);
    expect(html).toContain('href="https://belzoemart.com/api/v1/payments/hosted/cancel?t=T"');
  });

  it('cannot be broken out of by hostile values', () => {
    const html = renderHostedPage({
      ...base,
      description: '</script><script>alert(1)</script>',
      prefill: { name: '"><img src=x onerror=alert(1)>', email: "a'b@c.in" },
    });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('\\u003c/script\\u003e');
  });

  it('never contains the key secret (only the public key id)', () => {
    process.env.RAZORPAY_KEY_SECRET = 'super-secret-value';
    expect(renderHostedPage(base)).not.toContain('super-secret-value');
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it('escapeHtml and safeJson neutralise markup characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(safeJson({ a: '<>&\u2028' })).toBe('{"a":"\\u003c\\u003e\\u0026\\u2028"}');
  });
});
