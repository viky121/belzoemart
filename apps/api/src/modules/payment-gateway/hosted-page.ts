export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface HostedPageInput {
  nonce: string;
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  description: string;
  prefill: { name?: string; contact?: string; email?: string };
  callbackUrl: string;
  cancelUrl: string;
}

/**
 * JSON that is safe inside an inline <script>: `<`, `>`, `&` and the JS line
 * separators are escaped, so no value can close the tag or break out of the string.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * The page the app opens in the phone's browser to take a payment. It opens
 * Razorpay Checkout in redirect mode: when the customer pays, Razorpay POSTs the
 * result to `callbackUrl` and the server sends the browser back into the app.
 */
export function renderHostedPage(i: HostedPageInput): string {
  const options = {
    key: i.keyId,
    order_id: i.providerOrderId,
    amount: i.amountPaise,
    currency: 'INR',
    name: 'Belzo eMart',
    description: i.description,
    prefill: i.prefill,
    theme: { color: '#136b53' },
    callback_url: i.callbackUrl,
    redirect: true,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pay securely - Belzo eMart</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f8f7;color:#16302a;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
  .card{max-width:360px}
  .spin{width:36px;height:36px;border:4px solid #cfe3dc;border-top-color:#136b53;border-radius:50%;margin:0 auto 16px;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  a,button{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:10px;background:#136b53;color:#fff;font-weight:700;text-decoration:none;border:0;font-size:1rem}
  a.alt{background:transparent;color:#136b53}
  p{margin:6px 0;color:#4a6a62}
</style>
</head>
<body>
<div class="card">
  <div class="spin" aria-hidden="true"></div>
  <h1 style="font-size:1.2rem;margin:0 0 6px">Opening secure payment&hellip;</h1>
  <p>Amount: &#8377;${escapeHtml((i.amountPaise / 100).toFixed(2))}</p>
  <p id="msg">Please wait. Do not close this page.</p>
  <button id="pay" type="button" hidden>Pay now</button><br>
  <a class="alt" id="cancel" href="${escapeHtml(i.cancelUrl)}">Cancel</a>
</div>
<script nonce="${escapeHtml(i.nonce)}" src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script nonce="${escapeHtml(i.nonce)}">
(function () {
  var options = ${safeJson(options)};
  var cancelUrl = ${safeJson(i.cancelUrl)};
  var btn = document.getElementById('pay');
  var msg = document.getElementById('msg');
  function open() {
    if (!window.Razorpay) { msg.textContent = 'Could not load the payment window. Check your connection and tap Pay now.'; btn.hidden = false; return; }
    var rzp = new window.Razorpay(Object.assign({}, options, {
      modal: { ondismiss: function () { window.location.href = cancelUrl; } }
    }));
    btn.onclick = function () { rzp.open(); };
    rzp.open();
  }
  if (document.readyState === 'complete') open(); else window.addEventListener('load', open);
})();
</script>
</body>
</html>`;
}
