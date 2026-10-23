/* eslint-disable */
// End-to-end test for bulk product upload. Runs inside a container on the
// compose network (reaches the live API as http://api:4000). Logs in as the
// seed admin, posts a valid + an invalid row, prints the result, then deletes
// the test products it created (cleanup).
const fs = require('fs');

const BASE = 'http://api:4000/api/v1';

async function main() {
  const login = await fetch(`${BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }),
  });
  console.log('LOGIN status', login.status);
  const lj = await login.json();
  const token = lj.accessToken;
  if (!token) {
    console.log('LOGIN body', JSON.stringify(lj));
    throw new Error('no admin token — check SEED_ADMIN creds');
  }
  const auth = { authorization: `Bearer ${token}` };

  const rows = [
    { sku: 'TESTBULK-001', title: 'Test Bulk Product One', categorySlug: 'grocery', mrp: 19900, sellingPrice: 14900, hsnCode: '1006', taxRatePct: 5 },
    { sku: 'TESTBULK-002', title: 'Test Bulk Product Two', categorySlug: 'does-not-exist', mrp: 9900, sellingPrice: 8900 },
    { sku: 'TESTBULK-003', title: 'Bad Price Product', categorySlug: 'grocery', mrp: 10000, sellingPrice: 20000 },
  ];
  const res = await fetch(`${BASE}/admin/products/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ rows }),
  });
  console.log('BULK status', res.status);
  const body = await res.json();
  console.log('BULK result', JSON.stringify(body));

  // Verify + cleanup
  const list = await (await fetch(`${BASE}/admin/products`, { headers: auth })).json();
  const created = Array.isArray(list) ? list.filter((p) => String(p.title).startsWith('Test Bulk Product') || p.title === 'Bad Price Product') : [];
  console.log('CREATED', JSON.stringify(created.map((p) => ({ title: p.title, status: p.status, mrp: p.mrp, selling: p.sellingPrice }))));
  for (const p of created) {
    const d = await fetch(`${BASE}/admin/products/${p.id}`, { method: 'DELETE', headers: auth });
    console.log('CLEANUP delete', p.title, d.status);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
