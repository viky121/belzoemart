import { PrismaClient } from '@prisma/client';

/**
 * Demo home-page catalogue seed (idempotent).
 *
 * Populates the storefront "Best Deals for You", "Best Seller" and "Top Brands"
 * sections with the sample FMCG products + brands shown in the home mockup,
 * mapped onto the store's existing category tree. Safe to re-run: products are
 * keyed by slug and brands by slug, so nothing is duplicated. These are demo
 * rows — edit or delete them from Admin → Products / Brands at any time.
 */
const prisma = new PrismaClient();

const BRANDS = [
  'TATA',
  'Dove',
  'Colgate',
  'P&G',
  'Himalaya',
  'Nestlé',
  'Maggi',
  'Surf Excel',
  'Fortune',
  'LUX',
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'brand';

interface DemoProduct {
  slug: string;
  title: string;
  /** Preferred category slugs in priority order (first existing wins). */
  categorySlugs: string[];
  brand?: string;
  hsn: string;
  tax: number;
  mrp: number; // paise
  sp: number; // paise
  ratingAvg: number;
  ratingCount: number;
  pack: string;
}

const PRODUCTS: DemoProduct[] = [
  { slug: 'tata-tea-gold-500g', title: 'Tata Tea Gold (500g)', categorySlugs: ['tea-coffee', 'tea', 'baverages'], brand: 'TATA', hsn: '0902', tax: 5, mrp: 27500, sp: 22000, ratingAvg: 4.5, ratingCount: 203, pack: '500 g' },
  { slug: 'fortune-refined-oil-1l', title: 'Fortune Refined Oil (1L)', categorySlugs: ['oil-ghee', 'oil-sugar-masala'], brand: 'Fortune', hsn: '1512', tax: 5, mrp: 14700, sp: 12500, ratingAvg: 4.3, ratingCount: 99, pack: '1 L' },
  { slug: 'harpic-toilet-cleaner-500ml', title: 'Harpic Toilet Cleaner (500ml)', categorySlugs: ['house-kitchen-cleaning', 'home-care'], hsn: '3402', tax: 18, mrp: 11300, sp: 8500, ratingAvg: 4.4, ratingCount: 76, pack: '500 ml' },
  { slug: 'dove-shampoo-600ml', title: 'Dove Shampoo (600ml)', categorySlugs: ['hair-care', 'personal-care'], brand: 'Dove', hsn: '3305', tax: 18, mrp: 34900, sp: 28500, ratingAvg: 4.4, ratingCount: 140, pack: '600 ml' },
  { slug: 'maggi-2-minute-noodles-70g', title: 'Maggi 2-Minute Noodles (70g)', categorySlugs: ['namkeen-chips-savory', 'packaged-food'], brand: 'Maggi', hsn: '1902', tax: 12, mrp: 2300, sp: 1800, ratingAvg: 4.5, ratingCount: 210, pack: '70 g' },
  { slug: 'surf-excel-detergent-1kg', title: 'Surf Excel Detergent (1kg)', categorySlugs: ['laundry', 'home-care'], brand: 'Surf Excel', hsn: '3402', tax: 18, mrp: 12700, sp: 10500, ratingAvg: 4.4, ratingCount: 140, pack: '1 kg' },
];

async function uniqueBrandSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  for (;;) {
    const existing = await prisma.brand.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${++n}`;
  }
}

async function main(): Promise<void> {
  // --- Brands (idempotent by name) ---
  const brandIdByName = new Map<string, string>();
  for (const name of BRANDS) {
    const existing = await prisma.brand.findFirst({ where: { name } });
    if (existing) {
      brandIdByName.set(name, existing.id);
      continue;
    }
    const created = await prisma.brand.create({
      data: { name, slug: await uniqueBrandSlug(slugify(name)), isActive: true },
    });
    brandIdByName.set(name, created.id);
  }
  console.log(`Brands ready: ${brandIdByName.size}`);

  // --- Resolve a category id for each product ---
  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const fallbackCat = cats[0]?.id;
  if (!fallbackCat) {
    console.error('No categories exist — create categories first.');
    return;
  }

  let created = 0;
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) continue;
    const categoryId = p.categorySlugs.map((s) => catBySlug.get(s)).find(Boolean) ?? fallbackCat;

    const product = await prisma.product.create({
      data: {
        title: p.title,
        slug: p.slug,
        description: `${p.title} — everyday essential from Belzo eMart.`,
        categoryId,
        brandId: p.brand ? (brandIdByName.get(p.brand) ?? null) : null,
        hsnCode: p.hsn,
        taxRatePct: p.tax,
        status: 'published',
        isReturnable: p.tax === 5 ? false : true, // food/grocery (5% GST) → non-returnable
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
      },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        sku: `${p.slug.toUpperCase().replace(/-/g, '')}`,
        mrp: p.mrp,
        sellingPrice: p.sp,
        attributesJson: { Pack: p.pack },
        weightGrams: 500,
      },
    });
    await prisma.inventory.create({
      data: { variantId: variant.id, available: 100, reserved: 0, reorderLevel: 10 },
    });
    created += 1;
  }
  console.log(`Demo products created: ${created} (existing skipped).`);
  console.log('Demo home seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
