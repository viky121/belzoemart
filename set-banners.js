/* eslint-disable */
// One-off: copy hero banner images into the API uploads volume and create
// home_hero Banner rows so the storefront hero slider shows them.
// Run inside the api container with the images mounted at /tmp/banner:
//   docker compose run --rm \
//     -v /home/ubuntu/belzo/banner:/tmp/banner \
//     -v /home/ubuntu/belzo/set-banners.js:/app/apps/api/u.js \
//     api node u.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const SRC = '/tmp/banner';
const DEST = '/app/apps/api/uploads/banners';
const BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

// Source files in display order.
const FILES = ['Picture2.jpg', 'Picture3.jpg', 'Picture4.jpg', 'Picture5.jpg', 'Picture6.jpg', 'Picture7.jpg'];

(async () => {
  const prisma = new PrismaClient();
  fs.mkdirSync(DEST, { recursive: true });

  // Remove broken seed banner(s) that point at non-existent /seed/ assets.
  const purged = await prisma.banner.deleteMany({
    where: { placement: 'home_hero', imageUrl: { startsWith: '/seed/' } },
  });
  if (purged.count) console.log(`Removed ${purged.count} placeholder banner(s).`);

  let order = 0;
  for (const file of FILES) {
    const src = path.join(SRC, file);
    if (!fs.existsSync(src)) {
      console.log('MISSING source', file);
      continue;
    }
    const destName = `hero-${order + 1}.jpg`;
    fs.copyFileSync(src, path.join(DEST, destName));
    const url = `${BASE}/api/uploads/banners/${destName}`;

    const existing = await prisma.banner.findFirst({ where: { placement: 'home_hero', imageUrl: url } });
    if (existing) {
      await prisma.banner.update({ where: { id: existing.id }, data: { displayOrder: order, isActive: true } });
      console.log(`updated ${url}`);
    } else {
      await prisma.banner.create({
        data: {
          placement: 'home_hero',
          imageUrl: url,
          linkUrl: '/search?sort=discount',
          title: `Belzo offer ${order + 1}`,
          displayOrder: order,
          isActive: true,
        },
      });
      console.log(`created ${url}`);
    }
    order += 1;
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
