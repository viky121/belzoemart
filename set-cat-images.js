/* eslint-disable */
// One-off: copy category images into the API uploads volume and point each
// category's imageUrl at the served /api/uploads/categories/<slug>.png URL.
// Run inside the api container with the images mounted at /tmp/catimg:
//   docker compose run --rm \
//     -v /home/ubuntu/belzo/catimg:/tmp/catimg \
//     -v /home/ubuntu/belzo/set-cat-images.js:/tmp/u.js \
//     api node /tmp/u.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const SRC = '/tmp/catimg';
const DEST = '/app/apps/api/uploads/categories';
const BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

// category slug -> source image filename
const MAP = {
  grocery: '01_Groceries.png',
  'personal-care': '02_Personal_Care.png',
  'home-care': '03_Home_Care.png',
  baverages: '05_Beverages.png',
  'rice-atta-dals-dry-fruites': '09_Rice_Atta_Dals_and_Dry_Fruits.png',
  'packaged-food': '10_Packaged_Food.png',
  'oil-sugar-masala': '11_Oil_Sugar_and_Masala.png',
  'dairy-fresh-frozen': '12_Dairy_Fresh_and_Frozen.png',
  'health-otc': '13_Health_and_OTC.png',
  biscuits: '06_Snacks_and_Biscuits.png',
  'baby-care': '07_Baby_Care.png',
};

(async () => {
  const prisma = new PrismaClient();
  fs.mkdirSync(DEST, { recursive: true });
  for (const [slug, file] of Object.entries(MAP)) {
    const src = path.join(SRC, file);
    if (!fs.existsSync(src)) {
      console.log('MISSING source', file);
      continue;
    }
    const destName = `${slug}.png`;
    fs.copyFileSync(src, path.join(DEST, destName));
    const url = `${BASE}/api/uploads/categories/${destName}`;
    const r = await prisma.category.updateMany({ where: { slug }, data: { imageUrl: url } });
    console.log(`${slug} -> updated ${r.count} -> ${url}`);
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
