import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { LEGAL_PAGES } from './legal-content';

/**
 * Idempotent seed. Creates:
 * - RBAC permissions + roles (super_admin holds all)
 * - a super_admin user (credentials from env or safe local defaults)
 * - a test customer (email + password)
 *
 * Later units extend this with sample catalogue, orders, etc.
 */
const prisma = new PrismaClient();

const PERMISSIONS = [
  'catalogue.read',
  'catalogue.write',
  'inventory.write',
  'order.read',
  'order.write',
  'marketing.write',
  'customer.read',
  'customer.write',
  'report.read',
  'settings.write',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSIONS, // all
  catalogue_manager: ['catalogue.read', 'catalogue.write', 'inventory.write'],
  order_manager: ['order.read', 'order.write', 'customer.read'],
  marketing: ['marketing.write', 'catalogue.read', 'report.read'],
  support: ['order.read', 'customer.read'],
};

async function main(): Promise<void> {
  // Health probe (U1 baseline)
  const probe = await prisma.healthProbe.findFirst();
  if (!probe) await prisma.healthProbe.create({ data: { note: 'seed-ok' } });

  // Permissions
  const permByKey = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
    permByKey.set(key, p.id);
  }

  // Roles + role-permissions
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: roleName },
    });
    for (const key of keys) {
      const permissionId = permByKey.get(key)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // Super admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@belzo.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe#12345';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Belzo Admin',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      },
    });
    const superRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
    if (superRole) {
      await prisma.adminUserRole.create({
        data: { adminUserId: admin.id, roleId: superRole.id },
      });
    }
    // eslint-disable-next-line no-console
    console.log(`Seeded super_admin: ${adminEmail}`);
  }

  // Test customer
  const custEmail = 'customer@belzo.local';
  const existingCustomer = await prisma.customer.findUnique({ where: { email: custEmail } });
  if (!existingCustomer) {
    await prisma.customer.create({
      data: {
        email: custEmail,
        name: 'Test Customer',
        passwordHash: await argon2.hash('Customer#12345', { type: argon2.argon2id }),
        locale: 'en',
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded test customer: ${custEmail}`);
  }

  await seedCatalogue();
  await seedCoupons();
  await seedCms();
  await seedSettings();

  // eslint-disable-next-line no-console
  console.log('Seed complete (U2 identity + U3 catalogue + U4 coupons + U6 CMS + U7 settings).');
}

/** Default store settings (idempotent by key). */
async function seedSettings(): Promise<void> {
  const settings: Record<string, unknown> = {
    'store.name': 'Belzo eMart',
    'store.currency': 'INR',
    'store.gstin': process.env.STORE_GSTIN ?? '',
    'store.state': process.env.STORE_STATE ?? 'Karnataka',
    'shipping.freeThresholdPaise': 50000,
    'shipping.flatPaise': 4900,
    'shipping.pickupPincode': '560001',
    'shipping.defaultItemWeightGrams': 500,
    'payment.codEnabled': true,
    'payment.codFeePaise': 3900,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, valueJson: value as object },
    });
  }
}

/** Sample CMS pages + a home banner (idempotent by slug/placement). */
async function seedCms(): Promise<void> {
  const pages = [
    { slug: 'about', title: 'About Belzo eMart', body: 'Belzo eMart brings apparel, groceries, electronics and handicrafts to your doorstep across India.' },
    // Legal policies (terms, privacy, returns, shipping, cancellation, payment, grievance, contact, ...).
    ...LEGAL_PAGES.map(({ slug, title, body }) => ({ slug, title, body })),
  ];
  for (const p of pages) {
    await prisma.cmsPage.upsert({ where: { slug: p.slug }, update: {}, create: p });
  }
  const banners = await prisma.banner.count({ where: { placement: 'home_hero' } });
  if (banners === 0) {
    await prisma.banner.create({
      data: { placement: 'home_hero', imageUrl: '/seed/banner-home.jpg', title: 'Festive Sale', linkUrl: '/category/apparel', displayOrder: 0 },
    });
  }
}

/** Demo coupons (idempotent by code). */
async function seedCoupons(): Promise<void> {
  const coupons = [
    { code: 'WELCOME10', kind: 'percent' as const, value: 10, minOrder: 50000, maxDiscount: 20000 },
    { code: 'FLAT100', kind: 'flat' as const, value: 10000, minOrder: 100000 },
    { code: 'FREESHIP', kind: 'free_shipping' as const, value: 0, minOrder: 49900 },
  ];
  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        kind: c.kind,
        value: c.value,
        minOrder: c.minOrder,
        maxDiscount: 'maxDiscount' in c ? (c.maxDiscount as number) : null,
        isActive: true,
      },
    });
  }
}

/** Sample catalogue across the four product categories (idempotent by slug). */
async function seedCatalogue(): Promise<void> {
  const categories = [
    { name: 'Apparel', slug: 'apparel' },
    { name: 'Grocery', slug: 'grocery' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Handicraft', slug: 'handicraft' },
  ];
  const categoryIdBySlug = new Map<string, string>();
  for (const [i, c] of categories.entries()) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, displayOrder: i, isActive: true },
    });
    categoryIdBySlug.set(c.slug, cat.id);
  }

  const products: Array<{
    slug: string;
    title: string;
    category: string;
    hsn: string;
    tax: number;
    mrp: number;
    sp: number;
  }> = [
    { slug: 'cotton-tshirt', title: 'Cotton Round-Neck T-Shirt', category: 'apparel', hsn: '6109', tax: 5, mrp: 79900, sp: 49900 },
    { slug: 'denim-jeans', title: 'Slim-Fit Denim Jeans', category: 'apparel', hsn: '6203', tax: 12, mrp: 199900, sp: 149900 },
    { slug: 'basmati-rice-5kg', title: 'Basmati Rice 5kg', category: 'grocery', hsn: '1006', tax: 5, mrp: 89900, sp: 79900 },
    { slug: 'cold-pressed-oil-1l', title: 'Cold-Pressed Groundnut Oil 1L', category: 'grocery', hsn: '1508', tax: 5, mrp: 34900, sp: 29900 },
    { slug: 'bluetooth-earbuds', title: 'Wireless Bluetooth Earbuds', category: 'electronics', hsn: '8518', tax: 18, mrp: 299900, sp: 179900 },
    { slug: 'usb-c-charger-30w', title: 'USB-C 30W Fast Charger', category: 'electronics', hsn: '8504', tax: 18, mrp: 149900, sp: 99900 },
    { slug: 'handwoven-jute-bag', title: 'Handwoven Jute Tote Bag', category: 'handicraft', hsn: '4602', tax: 12, mrp: 129900, sp: 99900 },
    { slug: 'terracotta-vase', title: 'Handmade Terracotta Vase', category: 'handicraft', hsn: '6913', tax: 12, mrp: 159900, sp: 119900 },
  ];

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) continue;
    const product = await prisma.product.create({
      data: {
        title: p.title,
        slug: p.slug,
        description: `${p.title} — quality product from Belzo eMart.`,
        categoryId: categoryIdBySlug.get(p.category)!,
        hsnCode: p.hsn,
        taxRatePct: p.tax,
        status: 'published',
        ratingAvg: 4.2,
        ratingCount: 12,
        images: { create: [{ url: `/seed/${p.slug}.jpg`, alt: p.title, position: 0 }] },
      },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        sku: `${p.slug.toUpperCase().replace(/-/g, '')}-STD`,
        mrp: p.mrp,
        sellingPrice: p.sp,
        attributesJson: { Pack: 'Standard' },
        weightGrams: 500,
      },
    });
    await prisma.inventory.create({
      data: { variantId: variant.id, available: 100, reserved: 0, reorderLevel: 10 },
    });
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
