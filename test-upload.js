/* eslint-disable */
// Tests the admin media upload endpoint directly against the live API
// (http://api:4000) to isolate server vs browser/proxy issues.
const fs = require('fs');
const BASE = (process.env.TEST_BASE || 'http://api:4000') + '/api/v1';

async function main() {
  const login = await fetch(`${BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }),
  });
  const lj = await login.json();
  console.log('LOGIN', login.status, 'token?', !!lj.accessToken);
  if (!lj.accessToken) {
    console.log(JSON.stringify(lj));
    return;
  }

  // Build a test image of a configurable size (default ~2MB).
  const mb = Number(process.env.TEST_MB || '2');
  const buf = Buffer.alloc(mb * 1024 * 1024, 1);
  console.log('TEST size MB=', mb);
  const form = new FormData();
  form.append('folder', 'products');
  form.append('file', new Blob([buf], { type: 'image/png' }), 'test.png');

  const res = await fetch(`${BASE}/admin/media/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${lj.accessToken}` },
    body: form,
  });
  console.log('UPLOAD status', res.status);
  console.log('UPLOAD body', await res.text());
}

main().catch((e) => {
  console.error('ERR', e && e.message ? e.message : e);
  process.exit(1);
});
