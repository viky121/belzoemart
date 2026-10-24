import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { exportRowToInput, type SheetIssue, type SheetKey, type SheetRowInput } from '@belzo/shared';
import { BulkSheetService } from './bulk-sheet.service';
import { ProductService } from './product.service';
import { AdminCatalogueController } from './admin-catalogue.controller';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { InventoryService } from './inventory.service';
import type { CategoryService } from './category.service';

/**
 * BulkSheetService against an in-memory fake Prisma (design §11 "API specs").
 * The fake supports exactly the query shapes the service and
 * ProductService.uniqueSlug/findOrCreateBrandByName use, records every write,
 * rolls a failed $transaction back, and returns JSON columns with their object
 * keys in reverse-sorted order (like jsonb re-ordering) so the
 * key-order-insensitive diff is exercised.
 */

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

interface FCategory { id: string; name: string; slug: string; isActive: boolean; parentId: string | null }
interface FBrand { id: string; name: string; slug: string }
interface FProduct {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  description: string;
  categoryId: string;
  brandId: string | null;
  hsnCode: string;
  taxRatePct: number;
  attributesJson: unknown;
  status: 'draft' | 'published' | 'archived';
  isReturnable?: boolean;
  createdAt: number;
}
interface FVariant {
  id: string;
  productId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  costPrice: number | null;
  weightGrams: number;
  attributesJson: unknown;
  priceSlabsJson: unknown;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: number;
}
interface FImage { id: string; productId: string; url: string; alt: string; position: number }
interface FInventory { variantId: string; available: number; reserved: number }
interface FMovement { variantId: string; delta: number; reason: string; ref: string }
interface Db {
  categories: FCategory[];
  brands: FBrand[];
  products: FProduct[];
  variants: FVariant[];
  images: FImage[];
  inventory: FInventory[];
  movements: FMovement[];
}

const CATS: FCategory[] = [
  { id: 'c-grocery', name: 'Grocery', slug: 'grocery', isActive: true, parentId: null },
  { id: 'c-tea', name: 'Herbal Tea', slug: 'herbal-tea', isActive: true, parentId: 'c-grocery' },
  { id: 'c-ghee1', name: 'Ghee', slug: 'ghee', isActive: true, parentId: 'c-grocery' },
  { id: 'c-dairy', name: 'Dairy', slug: 'dairy', isActive: true, parentId: null },
  { id: 'c-ghee2', name: 'Ghee', slug: 'ghee-2', isActive: true, parentId: 'c-dairy' },
  { id: 'c-apparel', name: 'Apparel', slug: 'apparel', isActive: true, parentId: null },
  { id: 'c-old', name: 'Old', slug: 'old', isActive: false, parentId: null },
];

let clock = 0;
function prod(p: Partial<FProduct> & { id: string; title: string }): FProduct {
  return {
    slug: p.id,
    sku: null,
    description: '',
    categoryId: 'c-tea',
    brandId: null,
    hsnCode: '',
    taxRatePct: 12,
    attributesJson: {},
    status: 'published',
    createdAt: (clock += 1),
    ...p,
  };
}
function variant(v: Partial<FVariant> & { id: string; productId: string; sku: string }): FVariant {
  return {
    mrp: 99900,
    sellingPrice: 79900,
    costPrice: null,
    weightGrams: 0,
    attributesJson: {},
    priceSlabsJson: [],
    imageUrl: null,
    isActive: true,
    createdAt: (clock += 1),
    ...v,
  };
}
const inv = (variantId: string, available: number): FInventory => ({ variantId, available, reserved: 0 });

/** Deep copy with object keys in reverse-sorted order (mimics jsonb re-ordering). */
function jsonb(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonb);
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort().reverse()) out[k] = jsonb(src[k]);
    return out;
  }
  return v;
}

interface Write { op: string; args: any }

function setup(
  seed: Partial<Db> = {},
  opts: { failOn?: (op: string, args: any) => void } = {},
) {
  let db: Db = {
    categories: seed.categories ?? CATS.map((c) => ({ ...c })),
    brands: seed.brands ?? [],
    products: seed.products ?? [],
    variants: seed.variants ?? [],
    images: seed.images ?? [],
    inventory: seed.inventory ?? [],
    movements: [],
  };
  const writes: Write[] = [];
  const calls: string[] = [];
  const txOptions: unknown[] = [];
  let seq = 0;
  const newId = (p: string) => `${p}-new-${(seq += 1)}`;
  const write = (op: string, args: any) => {
    opts.failOn?.(op, args);
    writes.push({ op, args });
  };

  const activeCount = (pid: string) => db.variants.filter((v) => v.productId === pid && v.isActive).length;
  const invOf = (vid: string) => {
    const i = db.inventory.find((x) => x.variantId === vid);
    return i ? { ...i } : null;
  };
  const brandOf = (id: string | null) => {
    const b = db.brands.find((x) => x.id === id);
    return b ? { id: b.id, name: b.name } : null;
  };
  const productOut = (p: FProduct) => {
    const c = db.categories.find((x) => x.id === p.categoryId)!;
    return {
      ...p,
      attributesJson: jsonb(p.attributesJson),
      images: db.images
        .filter((i) => i.productId === p.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i })),
      brand: brandOf(p.brandId),
      category: { id: c.id, name: c.name, slug: c.slug },
      _count: { variants: activeCount(p.id) },
    };
  };
  const variantOut = (v: FVariant) => {
    const p = db.products.find((x) => x.id === v.productId)!;
    return {
      ...v,
      attributesJson: jsonb(v.attributesJson),
      priceSlabsJson: jsonb(v.priceSlabsJson),
      inventory: invOf(v.id),
      product: { id: p.id, sku: p.sku, title: p.title, _count: { variants: activeCount(p.id) } },
    };
  };

  const prisma: any = {
    category: { findMany: async () => db.categories.map((c) => ({ ...c })) },
    brand: {
      findFirst: async ({ where }: any) => {
        calls.push('brand.findFirst');
        return db.brands.find((b) => b.name.toLowerCase() === where.name.equals.toLowerCase()) ?? null;
      },
      findUnique: async ({ where }: any) => db.brands.find((b) => b.slug === where.slug) ?? null,
      create: async ({ data }: any) => {
        write('brand.create', { data });
        const b = { id: newId('b'), ...data };
        db.brands.push(b);
        return b;
      },
    },
    product: {
      findUnique: async ({ where }: any) => {
        const p = db.products.find((x) =>
          where.id !== undefined ? x.id === where.id : where.sku !== undefined ? x.sku === where.sku : x.slug === where.slug,
        );
        return p ? productOut(p) : null;
      },
      findFirst: async ({ where }: any) => {
        calls.push('product.findFirst');
        const s = String(where.sku.equals).toLowerCase();
        const p = db.products.find((x) => x.sku !== null && x.sku.toLowerCase() === s);
        return p ? { sku: p.sku } : null;
      },
      findMany: async (args: any) => {
        if (args?.where?.sku?.in) {
          return db.products
            .filter((p) => p.sku !== null && args.where.sku.in.includes(p.sku))
            .map((p) => ({ id: p.id, sku: p.sku, title: p.title }));
        }
        if (args?.where?.status?.in) {
          return db.products
            .filter((p) => args.where.status.in.includes(p.status))
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((p) => ({
              ...productOut(p),
              variants: db.variants
                .filter((v) => v.productId === p.id && v.isActive)
                .sort((a, b) => a.createdAt - b.createdAt)
                .map(variantOut),
            }));
        }
        return [...db.products]
          .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
          .map((p) => ({
            id: p.id,
            slug: p.slug,
            sku: p.sku,
            title: p.title,
            createdAt: p.createdAt,
            variants: db.variants
              .filter((v) => v.productId === p.id)
              .map((v) => ({ sku: v.sku, isActive: v.isActive })),
          }));
      },
      create: async ({ data }: any) => {
        write('product.create', { data });
        const p = prod({ id: newId('p'), ...data });
        db.products.push(p);
        return { ...p };
      },
      update: async ({ where, data }: any) => {
        write('product.update', { where, data });
        const p = db.products.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return { ...p };
      },
    },
    variant: {
      findUnique: async ({ where }: any) => {
        const v = db.variants.find((x) => x.sku === where.sku);
        return v ? variantOut(v) : null;
      },
      findMany: async ({ where }: any) => {
        if (where.OR) {
          return db.variants
            .filter((v) => where.OR.some((o: any) => String(o.sku.equals).toLowerCase() === v.sku.toLowerCase()))
            .map((v) => ({ sku: v.sku }));
        }
        return db.variants.filter((v) => where.sku.in.includes(v.sku)).map(variantOut);
      },
      create: async ({ data }: any) => {
        write('variant.create', { data });
        const v = variant({ id: newId('v'), ...data });
        db.variants.push(v);
        return { ...v };
      },
      update: async ({ where, data }: any) => {
        write('variant.update', { where, data });
        const v = db.variants.find((x) => x.id === where.id)!;
        Object.assign(v, data);
        return { ...v };
      },
    },
    inventory: {
      findUnique: async ({ where }: any) => invOf(where.variantId),
      create: async ({ data }: any) => {
        write('inventory.create', { data });
        db.inventory.push({ reserved: 0, ...data });
        return data;
      },
      upsert: async (args: any) => {
        write('inventory.upsert', args);
        const i = db.inventory.find((x) => x.variantId === args.where.variantId);
        if (i) i.available = args.update.available;
        else db.inventory.push({ reserved: 0, ...args.create });
        return args.create;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        write('stockMovement.create', { data });
        db.movements.push(data);
        return data;
      },
    },
    productImage: {
      deleteMany: async ({ where }: any) => {
        write('productImage.deleteMany', { where });
        db.images = db.images.filter((i) => i.productId !== where.productId);
        return { count: 0 };
      },
      create: async ({ data }: any) => {
        write('productImage.create', { data });
        db.images.push({ id: newId('img'), ...data });
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
      txOptions.push(options);
      const snapshot = JSON.stringify(db);
      const before = writes.length;
      try {
        return await fn(prisma);
      } catch (e) {
        db = JSON.parse(snapshot) as Db;
        writes.length = before;
        throw e;
      }
    },
  };

  const products = new ProductService(
    prisma as PrismaService,
    {} as CategoryService,
    {} as InventoryService,
  );
  const svc = new BulkSheetService(prisma as PrismaService, products);
  return {
    svc,
    writes,
    calls,
    txOptions,
    get db() {
      return db;
    },
    ops: () => writes.map((w) => w.op),
    reset: () => {
      writes.length = 0;
      calls.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

type Cells = Partial<Record<SheetKey, string>>;
const parent = (sku: string, cells: Cells = {}): Cells => ({ indicator: 'Parent', sku, ...cells });
const child = (parentSku: string, sku: string, cells: Cells = {}): Cells => ({
  indicator: 'Child',
  parentSku,
  sku,
  ...cells,
});
const sheet = (...rows: Cells[]): SheetRowInput[] => rows.map((r, i) => ({ row: i + 2, ...r }));
const errorsOf = (res: { issues: SheetIssue[] }) => res.issues.filter((i) => i.level === 'error');
const warningsOf = (res: { issues: SheetIssue[] }) => res.issues.filter((i) => i.level === 'warning');

const TIERS_TS = { tier1: '20%', tier2: '22%', tier3: '25%', tier4: '28%', tier5: '30%' };
const TIERS_SHOES = { tier1: '15%', tier2: '18%', tier3: '20%', tier4: '22%', tier5: '25%' };
const tsDesc = 'High quality 100% cotton casual t-shirt for men.';
const shoeDesc = 'Comfortable sports and running shoes with maximum cushioning.';
const tsChild = { finalDetail: 'Herbal Tea', brand: 'Zara', description: tsDesc, colour: 'Blue', hsnCode: '61091000', taxType: 'Inclusive', gstRate: '12%', packOf: '1', ...TIERS_TS };
const shoeChild = { finalDetail: 'Herbal Tea', brand: 'Nike', description: shoeDesc, colour: 'Black', hsnCode: '64041190', taxType: 'Inclusive', gstRate: '18%', packOf: '1', ...TIERS_SHOES };

/** The owner's 7 sample rows (Weight values are kg). */
function ownerRows(): SheetRowInput[] {
  return sheet(
    parent('TSHIRT-001', { finalDetail: 'Herbal Tea', brand: '1', title: "Men's Cotton Slim Fit T-Shirt", description: tsDesc, colour: 'Blue', hsnCode: '61091000', taxType: 'Inclusive', gstRate: '12%' }),
    child('TSHIRT-001', 'TSHIRT-001-S', { ...tsChild, title: "Men's Cotton Slim Fit T-Shirt - Small", size: 'S', weightKg: '0.2', mrp: '999', sellingPrice: '799', purchasePrice: '790', stock: '50' }),
    child('TSHIRT-001', 'TSHIRT-001-M', { ...tsChild, title: "Men's Cotton Slim Fit T-Shirt - Medium", size: 'M', weightKg: '0.22', mrp: '999', sellingPrice: '799', purchasePrice: '790', stock: '65' }),
    child('TSHIRT-001', 'TSHIRT-001-L', { ...tsChild, title: "Men's Cotton Slim Fit T-Shirt - Large", size: 'L', weightKg: '0.25', mrp: '1099', sellingPrice: '849', purchasePrice: '820', stock: '40' }),
    parent('SHOES-102', { finalDetail: 'Herbal Tea', brand: 'Nike', title: 'Air Max Running Shoes', description: shoeDesc, colour: 'Black', hsnCode: '64041190', taxType: 'Inclusive', gstRate: '18%' }),
    child('SHOES-102', 'SHOES-102-UK7', { ...shoeChild, title: 'Air Max Running Shoes - UK 7', size: 'UK 7', weightKg: '0.8', mrp: '4995', sellingPrice: '3999', purchasePrice: '3899', stock: '20' }),
    child('SHOES-102', 'SHOES-102-UK8', { ...shoeChild, title: 'Air Max Running Shoes - UK 8', size: 'UK 8', weightKg: '0.85', mrp: '4995', sellingPrice: '3999', purchasePrice: '3899', stock: '35' }),
  );
}

/** An existing product with a saved Parent SKU and one variant (common fixture). */
function teeSeed(over: { variant?: Partial<FVariant>; product?: Partial<FProduct>; inventory?: FInventory[] } = {}): Partial<Db> {
  return {
    brands: [{ id: 'b-zara', name: 'Zara', slug: 'zara' }],
    products: [prod({ id: 'p-tee', title: "Men's Tee", sku: 'TSHIRT-001', brandId: 'b-zara', categoryId: 'c-apparel', ...over.product })],
    variants: [
      variant({
        id: 'v-s',
        productId: 'p-tee',
        sku: 'TSHIRT-001-S',
        costPrice: 79000,
        weightGrams: 200,
        attributesJson: { Size: 'S', Color: 'Blue' },
        priceSlabsJson: [{ minQty: 5, unitPrice: 77922 }, { minQty: 9, unitPrice: 74925 }],
        ...over.variant,
      }),
    ],
    inventory: over.inventory ?? [inv('v-s', 50)],
  };
}

/** Legacy "Wildflower Honey" (null sku, variants HONEY-250/HONEY-500 -> derived HONEY). */
function honeySeed(extra: Partial<Db> = {}): Partial<Db> {
  return {
    brands: [{ id: 'b-bee', name: 'Bee', slug: 'bee' }],
    products: [
      prod({ id: 'p-honey', title: 'Wildflower Honey', brandId: 'b-bee', hsnCode: '0409', taxRatePct: 5 }),
      ...(extra.products ?? []),
    ],
    variants: [
      variant({ id: 'v-h250', productId: 'p-honey', sku: 'HONEY-250', mrp: 25000, sellingPrice: 20000 }),
      variant({ id: 'v-h500', productId: 'p-honey', sku: 'HONEY-500', mrp: 45000, sellingPrice: 40000 }),
      ...(extra.variants ?? []),
    ],
    images: [{ id: 'i-h', productId: 'p-honey', url: '/honey.jpg', alt: 'Jar', position: 0 }],
    inventory: [inv('v-h250', 5), inv('v-h500', 5)],
  };
}

// ---------------------------------------------------------------------------
// Owner sample, re-import, Exclusive, cascade
// ---------------------------------------------------------------------------

describe('BulkSheetService.importRows — owner sample', () => {
  it('creates both products exactly as AC-3 / AC-4 describe', async () => {
    const t = setup();
    const res = await t.svc.importRows(ownerRows());
    expect(errorsOf(res)).toEqual([]);
    expect(res).toMatchObject({ productsCreated: 2, productsUpdated: 0, variantsCreated: 5, variantsUpdated: 0 });

    const zara = t.db.brands.find((b) => b.name === 'Zara')!;
    const nike = t.db.brands.find((b) => b.name === 'Nike')!;
    const tee = t.db.products.find((p) => p.sku === 'TSHIRT-001')!;
    expect(tee).toMatchObject({
      title: "Men's Cotton Slim Fit T-Shirt",
      brandId: zara.id,
      categoryId: 'c-tea',
      taxRatePct: 12,
      hsnCode: '61091000',
      attributesJson: { Color: 'Blue' },
      status: 'published',
      isReturnable: true,
      description: tsDesc,
    });
    const shoes = t.db.products.find((p) => p.sku === 'SHOES-102')!;
    expect(shoes).toMatchObject({ brandId: nike.id, taxRatePct: 18 });

    const v = (sku: string) => t.db.variants.find((x) => x.sku === sku)!;
    const stock = (sku: string) => t.db.inventory.find((i) => i.variantId === v(sku).id)?.available;
    expect(['S', 'M', 'L'].map((s) => v(`TSHIRT-001-${s}`)).map((x) => [x.productId, x.attributesJson, x.weightGrams, x.mrp, x.sellingPrice, x.costPrice])).toEqual([
      [tee.id, { Size: 'S', Color: 'Blue' }, 200, 99900, 79900, 79000],
      [tee.id, { Size: 'M', Color: 'Blue' }, 220, 99900, 79900, 79000],
      [tee.id, { Size: 'L', Color: 'Blue' }, 250, 109900, 84900, 82000],
    ]);
    expect(['S', 'M', 'L'].map((s) => stock(`TSHIRT-001-${s}`))).toEqual([50, 65, 40]);
    expect(t.db.variants.filter((x) => x.productId === shoes.id)).toHaveLength(2);

    // AC-4 slabs.
    const s4 = [{ minQty: 5, unitPrice: 77922 }, { minQty: 9, unitPrice: 74925 }, { minQty: 13, unitPrice: 71928 }, { minQty: 21, unitPrice: 69930 }];
    expect(v('TSHIRT-001-S').priceSlabsJson).toEqual(s4);
    expect(v('TSHIRT-001-M').priceSlabsJson).toEqual(s4);
    expect(v('TSHIRT-001-L').priceSlabsJson).toEqual([{ minQty: 9, unitPrice: 82425 }, { minQty: 13, unitPrice: 79128 }, { minQty: 21, unitPrice: 76930 }]);
    const shoeSlabs = [{ minQty: 9, unitPrice: 399600 }, { minQty: 13, unitPrice: 389610 }, { minQty: 21, unitPrice: 374625 }];
    expect(v('SHOES-102-UK7').priceSlabsJson).toEqual(shoeSlabs);
    expect(v('SHOES-102-UK8').priceSlabsJson).toEqual(shoeSlabs);

    expect(warningsOf(res).map((w: any) => [w.row, w.message.slice(0, 30)])).toEqual([
      [2, 'Brand "1" looks like a number '],
      [5, 'Bulk Tier 2 (22% off MRP = ₹85'],
      [7, 'Bulk Tier 2 (18% off MRP = ₹40'],
      [8, 'Bulk Tier 2 (18% off MRP = ₹40'],
    ]);
    expect(res.issues.find((i) => i.row === 2)?.message).toBe(
      'Brand "1" looks like a number and was ignored — using "Zara" from row 3.',
    );
    // Opening stock is audited.
    expect(t.db.movements).toContainEqual({ variantId: v('TSHIRT-001-S').id, delta: 50, reason: 'adjustment', ref: 'bulk-sheet' });
    expect(t.txOptions[0]).toEqual({ timeout: 20_000 });
  });

  it('re-importing the same rows changes nothing (AC-5)', async () => {
    const t = setup();
    await t.svc.importRows(ownerRows());
    t.reset();
    const res = await t.svc.importRows(ownerRows());
    expect(res).toMatchObject({ productsCreated: 0, productsUpdated: 2, variantsCreated: 0, variantsUpdated: 5 });
    expect(errorsOf(res)).toEqual([]);
    expect(t.ops()).toEqual([]);
    expect(t.db.inventory).toHaveLength(5);
  });
});

describe('BulkSheetService.importRows — Exclusive and row isolation', () => {
  it('converts an Exclusive Selling Price; a converted price above MRP errors only that row (AC-6)', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('EX-1', { title: 'Exclusive tee', finalDetail: 'Apparel', gstRate: '12%' }),
        child('EX-1', 'EX-1-A', { taxType: 'Exclusive', mrp: '999', sellingPrice: '799' }),
        child('EX-1', 'EX-1-B', { taxType: 'Exclusive', mrp: '850', sellingPrice: '799' }),
      ),
    );
    expect(t.db.variants.map((v) => [v.sku, v.sellingPrice])).toEqual([['EX-1-A', 89488]]);
    expect(errorsOf(res)).toEqual([
      { row: 4, sku: 'EX-1-B', level: 'error', message: 'Selling Price ₹894.88 (incl. GST) is more than MRP ₹850.' },
    ]);
  });

  it('a Parent row error fails the group and cascades to its children (AC-10)', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('BAD', { title: 'Bad GST', finalDetail: 'Apparel', gstRate: '7%' }),
        child('BAD', 'BAD-1', { mrp: '100', sellingPrice: '90' }),
        child('BAD', 'BAD-2', { mrp: '100', sellingPrice: '90' }),
      ),
    );
    expect(res.issues).toEqual([
      { row: 2, sku: 'BAD', level: 'error', message: 'GST Rate must be one of 0%, 5%, 12%, 18%, 28%' },
      { row: 3, sku: 'BAD-1', level: 'error', message: 'Not imported: Parent row 2 has errors.' },
      { row: 4, sku: 'BAD-2', level: 'error', message: 'Not imported: Parent row 2 has errors.' },
    ]);
    expect(t.ops()).toEqual([]);
  });

  it('a too-large MRP errors only its row; siblings and the product are saved', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('BIG', { title: 'Big', finalDetail: 'Apparel', gstRate: '5%' }),
        child('BIG', 'BIG-1', { mrp: '99999999999', sellingPrice: '90' }),
        child('BIG', 'BIG-2', { mrp: '100', sellingPrice: '90' }),
      ),
    );
    expect(errorsOf(res)).toEqual([{ row: 3, sku: 'BIG-1', level: 'error', message: 'MRP is too large' }]);
    expect(res.productsCreated).toBe(1);
    expect(t.db.variants.map((v) => v.sku)).toEqual(['BIG-2']);
  });

  it('a transaction failure fails only that group; planner errors stay, plan warnings are dropped', async () => {
    const t = setup({}, {
      failOn: (op, args) => {
        if (op === 'product.create' && args.data.sku === 'G1') throw new Error('boom');
      },
    });
    const res = await t.svc.importRows(
      sheet(
        parent('G1', { title: 'Group one', finalDetail: 'Apparel', gstRate: '5%' }),
        child('G1', 'G1-A', { mrp: '100', sellingPrice: '90', tier2: '1%' }),
        child('G1', 'G1-B', { mrp: '100', sellingPrice: '190' }),
        parent('G2', { title: 'Group two', finalDetail: 'Apparel', gstRate: '5%', mrp: '100', sellingPrice: '90' }),
      ),
    );
    expect(res.issues).toEqual([
      { row: 4, sku: 'G1-B', level: 'error', message: 'Selling Price ₹190 is more than MRP ₹100.' },
      { row: 2, sku: 'G1', level: 'error', message: 'Not saved: boom' },
      { row: 3, sku: 'G1-A', level: 'error', message: 'Not saved: boom' },
    ]);
    expect(res.productsCreated).toBe(1);
    expect(t.db.products.map((p) => p.sku)).toEqual(['G2']);
    expect(t.db.variants.map((v) => v.sku)).toEqual(['G2']);
  });

  it("NIT 11: a P2002 race on slug gets the 'same title' message", async () => {
    const t = setup({}, {
      failOn: (op) => {
        if (op === 'product.create') {
          throw Object.assign(new Error('Unique constraint failed on the fields: (`slug`)'), {
            code: 'P2002',
            meta: { target: ['slug'] },
          });
        }
      },
    });
    const res = await t.svc.importRows(
      sheet(parent('RACE', { title: 'Race', finalDetail: 'Apparel', gstRate: '5%', mrp: '100', sellingPrice: '90' })),
    );
    expect(errorsOf(res)).toEqual([
      {
        row: 2,
        sku: 'RACE',
        level: 'error',
        message: 'Not saved: Another product with the same title was saved at the same moment — upload the file again.',
      },
    ]);
  });

  it('NIT 11: a P2002 on sku gets the SKU message', async () => {
    const t = setup({}, {
      failOn: (op) => {
        if (op === 'variant.create') throw Object.assign(new Error('x'), { code: 'P2002', meta: { target: 'variants_sku_key' } });
      },
    });
    const res = await t.svc.importRows(
      sheet(parent('RACE', { title: 'Race', finalDetail: 'Apparel', gstRate: '5%', mrp: '100', sellingPrice: '90' })),
    );
    expect(errorsOf(res)[0]?.message).toBe('Not saved: SKU is already used by another product or variant.');
  });
});

// ---------------------------------------------------------------------------
// Blank cells, stock, slabs, attributes
// ---------------------------------------------------------------------------

describe('BulkSheetService.importRows — blank cells keep values (child-only uploads)', () => {
  it('an MRP-only edit keeps the Selling Price, stock and slabs', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { mrp: '1099' })));
    expect(errorsOf(res)).toEqual([]);
    expect(t.writes).toEqual([{ op: 'variant.update', args: { where: { id: 'v-s' }, data: { mrp: 109900 } } }]);
  });

  it('a Selling Price cut drops slabs above it with a warning', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { sellingPrice: '750' })));
    expect(t.writes[0]?.args.data).toEqual({ sellingPrice: 75000, priceSlabsJson: [{ minQty: 9, unitPrice: 74925 }] });
    expect(warningsOf(res).map((w: any) => w.message)).toEqual([
      // costPrice 790 is now above the new Selling Price 750.
      'purchasing price is above the Selling Price.',
      'Existing bulk tier at 5+ units (₹779.22) is above the new Selling Price and was removed.',
    ]);
  });

  it('a stock change upserts inventory and writes a StockMovement with the delta', async () => {
    const t = setup(teeSeed());
    await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { stock: '45' })));
    expect(t.ops()).toEqual(['inventory.upsert', 'stockMovement.create']);
    expect(t.db.movements).toEqual([{ variantId: 'v-s', delta: -5, reason: 'adjustment', ref: 'bulk-sheet' }]);
    expect(t.db.inventory[0]?.available).toBe(45);
  });

  it('stock 0 on a variant without an inventory row writes nothing; stock 5 upserts with delta 5', async () => {
    const t = setup(teeSeed({ inventory: [] }));
    await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { stock: '0' })));
    expect(t.ops()).toEqual([]);
    await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { stock: '5' })));
    expect(t.ops()).toEqual(['inventory.upsert', 'stockMovement.create']);
    expect(t.db.movements[0]?.delta).toBe(5);
  });

  it('all filled tiers skipped clears the slabs; tiers without an MRP are skipped and keep slabs', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { tier2: '1%' })));
    expect(t.writes[0]?.args.data).toEqual({ priceSlabsJson: [] });
    expect(warningsOf(res)[0]?.message).toMatch(/^Bulk Tier 2 \(1% off MRP = ₹989.01\) is above the Selling Price/);

    const z = setup(
      teeSeed({ variant: { mrp: 0, sellingPrice: 0, costPrice: null, priceSlabsJson: [{ minQty: 5, unitPrice: 0 }] } }),
    );
    const res2 = await z.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { tier2: '10%' })));
    expect(z.ops()).toEqual([]);
    expect(warningsOf(res2).map((w: any) => w.message)).toEqual(['Bulk tiers need an MRP — tiers skipped']);
  });

  it('Tier 1 alone (even 99%) is never read', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { tier1: '99%' })));
    expect(res.issues).toEqual([]);
    expect(t.ops()).toEqual([]);
  });

  it('Pack Of: equal (incl. "02") unchanged, 3 rewrites the key, 1 removes it', async () => {
    const stored = { 'pack of': '2', Size: 'S' };
    const same = setup(teeSeed({ variant: { attributesJson: stored } }));
    await same.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { packOf: '2' })));
    expect(same.ops()).toEqual([]);

    const zero = setup(teeSeed({ variant: { attributesJson: { 'Pack Of': '02' } } }));
    await zero.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { packOf: '2' })));
    expect(zero.ops()).toEqual([]);

    const three = setup(teeSeed({ variant: { attributesJson: stored } }));
    await three.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { packOf: '3' })));
    expect(three.writes[0]?.args.data.attributesJson).toEqual({ Size: 'S', 'Pack Of': '3' });

    const one = setup(teeSeed({ variant: { attributesJson: stored } }));
    await one.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { packOf: '1' })));
    expect(one.writes[0]?.args.data.attributesJson).toEqual({ Size: 'S' });
  });

  it('an inactive variant SKU is reactivated', async () => {
    const t = setup(teeSeed({ variant: { isActive: false } }));
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { mrp: '999' })));
    expect(t.writes[0]?.args.data).toEqual({ isActive: true });
    expect(res.variantsUpdated).toBe(1);
  });

  it('a new variant with stock 10 gets inventory 10 and one StockMovement', async () => {
    const t = setup(teeSeed());
    await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-XL', { size: 'XL', mrp: '999', sellingPrice: '799', stock: '10' })));
    const v = t.db.variants.find((x) => x.sku === 'TSHIRT-001-XL')!;
    expect(v).toMatchObject({ productId: 'p-tee', attributesJson: { Size: 'XL' } });
    expect(t.db.inventory.find((i) => i.variantId === v.id)?.available).toBe(10);
    expect(t.db.movements).toEqual([{ variantId: v.id, delta: 10, reason: 'adjustment', ref: 'bulk-sheet' }]);
  });
});

describe('BulkSheetService.importRows — images', () => {
  it('Parent images replace the gallery in order and keep the alt of retained URLs (NIT 9)', async () => {
    const t = setup({
      ...teeSeed(),
      images: [
        { id: 'i1', productId: 'p-tee', url: '/a.jpg', alt: 'Front', position: 0 },
        { id: 'i2', productId: 'p-tee', url: '/b.jpg', alt: 'Back', position: 1 },
      ],
    });
    await t.svc.importRows(sheet(parent('TSHIRT-001', { image1: '/b.jpg', image2: 'https://cdn.test/c.jpg' })));
    expect(t.ops()).toEqual(['productImage.deleteMany', 'productImage.create', 'productImage.create']);
    expect(t.db.images.map((i) => [i.url, i.alt, i.position])).toEqual([
      ['/b.jpg', 'Back', 0],
      ['https://cdn.test/c.jpg', '', 1],
    ]);
  });

  it('a new product without Parent images builds its gallery from the Child images', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('GAL', { title: 'Gallery', finalDetail: 'Apparel', gstRate: '5%' }),
        child('GAL', 'GAL-1', { mrp: '100', sellingPrice: '90', image1: '/g1.jpg', image2: '/g2.jpg' }),
        child('GAL', 'GAL-2', { mrp: '100', sellingPrice: '90', image1: '/g1.jpg' }),
      ),
    );
    expect(res.issues).toEqual([]);
    expect(t.db.images.map((i) => i.url)).toEqual(['/g1.jpg', '/g2.jpg']);
    expect(t.db.variants.map((v) => v.imageUrl)).toEqual(['/g1.jpg', '/g1.jpg']);
  });

  it('an existing product with an empty gallery keeps it; Child image 1 sets only the variant photo', async () => {
    const t = setup(teeSeed());
    await t.svc.importRows(
      sheet(parent('TSHIRT-001'), child('TSHIRT-001', 'TSHIRT-001-S', { image1: '/s.jpg' })),
    );
    expect(t.writes).toEqual([{ op: 'variant.update', args: { where: { id: 'v-s' }, data: { imageUrl: '/s.jpg' } } }]);
  });

  it('a bad image ref is a row error', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'TSHIRT-001-S', { image1: 'ftp://x/y.jpg' })));
    expect(errorsOf(res)).toEqual([
      { row: 2, sku: 'TSHIRT-001-S', level: 'error', message: 'image 1 is not a link or a selected file' },
    ]);
    expect(t.ops()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Matching (§6a), ownership, case hints, NIT 3
// ---------------------------------------------------------------------------

describe('BulkSheetService.importRows — matching', () => {
  it('a child-only upload attaches to the product with that Parent SKU; an unknown one errors (AC-11)', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(
      sheet(
        child('TSHIRT-001', 'TSHIRT-001-XL', { mrp: '999', sellingPrice: '799' }),
        child('NOPE', 'NOPE-1', { mrp: '999', sellingPrice: '799' }),
        child('tshirt-001', 'X-1', { mrp: '999', sellingPrice: '799' }),
      ),
    );
    expect(t.db.variants.find((v) => v.sku === 'TSHIRT-001-XL')?.productId).toBe('p-tee');
    expect(errorsOf(res).map((e: any) => [e.row, e.message])).toEqual([
      [3, 'Parent SKU NOPE was not found in this file or in the catalogue — add its Parent row.'],
      [4, 'Parent SKU tshirt-001 was not found in this file or in the catalogue — add its Parent row. (did you mean TSHIRT-001?)'],
    ]);
    expect(t.ops()).not.toContain('product.update');
  });

  it('a new Child SKU that differs only in case from an existing variant is created with a warning', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(child('TSHIRT-001', 'tshirt-001-s', { mrp: '999', sellingPrice: '799' })));
    expect(t.db.variants.map((v) => v.sku)).toEqual(['TSHIRT-001-S', 'tshirt-001-s']);
    expect(warningsOf(res).map((w: any) => w.message)).toEqual([
      'A variant with SKU TSHIRT-001-S already exists (different letter case) — this row creates a new variant tshirt-001-s.',
    ]);
  });

  it('a new product whose Parent SKU differs only in case is created with a warning', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(
      sheet(
        parent('tshirt-001', { title: 'Lower tee', finalDetail: 'Apparel', gstRate: '5%' }),
        child('tshirt-001', 'tshirt-001-m', { mrp: '999', sellingPrice: '799' }),
      ),
    );
    expect(res.productsCreated).toBe(1);
    expect(warningsOf(res)).toContainEqual({
      row: 2,
      sku: 'tshirt-001',
      level: 'warning',
      message: 'A product with Parent SKU TSHIRT-001 already exists (different letter case) — this row creates a new product tshirt-001.',
    });
  });

  it('a null-sku product found through its Child SKU saves the Parent SKU', async () => {
    const t = setup({
      products: [prod({ id: 'p-jar', title: 'Jam Jar' })],
      variants: [variant({ id: 'v-js', productId: 'p-jar', sku: 'JAR-S' }), variant({ id: 'v-jm', productId: 'p-jar', sku: 'JAR-M' })],
    });
    const res = await t.svc.importRows(sheet(parent('JARS'), child('JARS', 'JAR-S')));
    expect(errorsOf(res)).toEqual([]);
    expect(t.writes).toEqual([{ op: 'product.update', args: { where: { id: 'p-jar' }, data: { sku: 'JARS' } } }]);
  });

  it("a Child SKU of a product with another Parent SKU is a group error", async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(parent('NEWP', { title: 'New', finalDetail: 'Apparel' }), child('NEWP', 'TSHIRT-001-S')));
    expect(res.issues.map((i) => [i.row, i.message])).toEqual([
      [2, 'SKU TSHIRT-001-S already belongs to the product with Parent SKU TSHIRT-001.'],
      [3, 'SKU TSHIRT-001-S already belongs to the product with Parent SKU TSHIRT-001.'],
    ]);
    expect(t.ops()).toEqual([]);
  });

  it('Child SKUs spread over two products are a group error', async () => {
    const t = setup(honeySeed({
      products: [prod({ id: 'p-jam', title: 'Jam' })],
      variants: [variant({ id: 'v-jam', productId: 'p-jam', sku: 'JAM-1' })],
    }));
    const res = await t.svc.importRows(sheet(child('MIX', 'HONEY-250'), child('MIX', 'JAM-1')));
    expect(errorsOf(res).map((e: any) => e.message)).toEqual([
      'These Child SKUs belong to different products — split them by Parent SKU.',
      'These Child SKUs belong to different products — split them by Parent SKU.',
    ]);
    expect(t.ops()).toEqual([]);
  });

  it('Sesame Oil: a new Parent SKU (with children) equal to an unrelated variant SKU is a group error', async () => {
    const t = setup({
      products: [prod({ id: 'p-oil', title: 'Sesame Oil' })],
      variants: [variant({ id: 'v-oil', productId: 'p-oil', sku: 'OIL' }), variant({ id: 'v-s1', productId: 'p-oil', sku: 'SESAME-1L' })],
    });
    const res = await t.svc.importRows(
      sheet(
        parent('OIL', { title: 'Mustard', finalDetail: 'Apparel', gstRate: '5%' }),
        child('OIL', 'OIL-1L', { mrp: '100', sellingPrice: '90' }),
        child('OIL', 'OIL-5L', { mrp: '100', sellingPrice: '90' }),
      ),
    );
    const msg = 'Parent SKU OIL is already the SKU of a variant of "Sesame Oil" — use a different Parent SKU.';
    expect(res.issues.map((i) => [i.row, i.message])).toEqual([[2, msg], [3, msg], [4, msg]]);
    expect(t.ops()).toEqual([]);
  });

  it("OIL-500: a legacy product whose own variant SKU is its derived Parent SKU is found by step 4", async () => {
    const t = setup({
      products: [prod({ id: 'p-o5', title: 'Oil 500' })],
      variants: [variant({ id: 'v-o5', productId: 'p-o5', sku: 'OIL-500' }), variant({ id: 'v-o5x', productId: 'p-o5', sku: 'OIL-500-X' })],
    });
    const res = await t.svc.importRows(
      sheet(parent('OIL-500', { title: 'Oil 500' }), child('OIL-500', 'OIL-500-Y', { mrp: '100', sellingPrice: '90' })),
    );
    expect(errorsOf(res)).toEqual([]);
    expect(t.ops()).toEqual(['product.update', 'variant.create', 'inventory.create']);
    expect(t.writes[0]?.args.data).toEqual({ sku: 'OIL-500' });
    expect(t.db.variants.find((v) => v.sku === 'OIL-500-Y')?.productId).toBe('p-o5');
  });

  it('a single Parent row naming a legacy single variant matches it by step 3', async () => {
    const t = setup({
      products: [prod({ id: 'p-one', title: 'Oil' })],
      variants: [variant({ id: 'v-one', productId: 'p-one', sku: 'OIL' })],
    });
    const res = await t.svc.importRows(sheet(parent('OIL', { mrp: '999', sellingPrice: '699' })));
    expect(errorsOf(res)).toEqual([]);
    expect(t.writes.map((w) => [w.op, w.args.data])).toEqual([
      ['product.update', { sku: 'OIL' }],
      ['variant.update', { sellingPrice: 69900 }],
    ]);
  });

  it('a single Parent row naming one variant of a multi-variant legacy product is a group error', async () => {
    const seed = (sku: string | null) => ({
      products: [prod({ id: 'p-mo', title: 'Mustard Oil', sku })],
      variants: [variant({ id: 'v-a', productId: 'p-mo', sku: 'OIL-500' }), variant({ id: 'v-b', productId: 'p-mo', sku: 'OIL-1L' })],
    });
    const t = setup(seed(null));
    const res = await t.svc.importRows(sheet(parent('OIL-500', { mrp: '999', sellingPrice: '799' })));
    expect(errorsOf(res).map((e: any) => e.message)).toEqual([
      'SKU OIL-500 is one of 2 variants of "Mustard Oil" — put it on a Child row with Parent SKU OIL.',
    ]);
    expect(t.ops()).toEqual([]);

    const saved = setup(seed('OIL'));
    const res2 = await saved.svc.importRows(sheet(parent('OIL-500', { mrp: '999', sellingPrice: '799' })));
    expect(errorsOf(res2).map((e: any) => e.message)).toEqual([
      'SKU OIL-500 already belongs to the product with Parent SKU OIL.',
    ]);
    expect(saved.ops()).toEqual([]);
  });

  it('a new variant SKU equal to another product\'s saved or derived Parent SKU is a row error', async () => {
    const t = setup({
      products: [
        prod({ id: 'p-a', title: 'Product A', sku: 'TSHIRT-001' }),
        prod({ id: 'p-b', title: 'Product B', sku: 'B' }),
        prod({ id: 'p-l', title: 'Lemon Tea' }),
      ],
      variants: [
        variant({ id: 'v-a', productId: 'p-a', sku: 'TSHIRT-001-S' }),
        variant({ id: 'v-b', productId: 'p-b', sku: 'B-1' }),
        variant({ id: 'v-l1', productId: 'p-l', sku: 'LEM-1' }),
        variant({ id: 'v-l2', productId: 'p-l', sku: 'LEM-2' }),
      ],
    });
    const res = await t.svc.importRows(
      sheet(
        child('B', 'TSHIRT-001', { mrp: '100', sellingPrice: '90' }),
        child('B', 'LEM', { mrp: '100', sellingPrice: '90' }),
        child('B', 'B-2', { mrp: '100', sellingPrice: '90' }),
      ),
    );
    expect(errorsOf(res).map((e: any) => [e.row, e.message])).toEqual([
      [2, 'SKU TSHIRT-001 is the Parent SKU of "Product A" — use a different SKU.'],
      [3, 'SKU LEM is the Parent SKU of "Lemon Tea" — use a different SKU.'],
    ]);
    expect(t.db.variants.filter((v) => v.productId === 'p-b').map((v) => v.sku)).toEqual(['B-1', 'B-2']);
  });

  it('NIT 3: saving sku = P may not take another legacy product\'s derived Parent SKU', async () => {
    const t = setup({
      products: [prod({ id: 'p-l', title: 'Lemon Tea' }), prod({ id: 'p-t', title: 'Tulsi Tea' })],
      variants: [
        variant({ id: 'v-l1', productId: 'p-l', sku: 'LEM-1' }),
        variant({ id: 'v-l2', productId: 'p-l', sku: 'LEM-2' }),
        variant({ id: 'v-t1', productId: 'p-t', sku: 'TUL-1' }),
        variant({ id: 'v-t2', productId: 'p-t', sku: 'TUL-2' }),
      ],
    });
    const res = await t.svc.importRows(sheet(parent('LEM'), child('LEM', 'TUL-1', { mrp: '1000' })));
    const msg = 'Parent SKU LEM is already the Parent SKU of "Lemon Tea" — use a different Parent SKU.';
    expect(res.issues.map((i) => [i.row, i.message])).toEqual([[2, msg], [3, msg]]);
    expect(t.ops()).toEqual([]);
  });

  describe('Wildflower Honey (legacy, derived Parent SKU HONEY)', () => {
    it('scenario A: a Parent row with new children matched only by the derived key is a group error', async () => {
      const t = setup(honeySeed());
      const res = await t.svc.importRows(
        sheet(
          parent('HONEY', { title: 'Honey Comb', finalDetail: 'Apparel', gstRate: '5%' }),
          child('HONEY', 'HONEY-COMB-1', { mrp: '100', sellingPrice: '90' }),
        ),
      );
      const msg =
        'Parent SKU HONEY is already the Parent SKU of "Wildflower Honey". To add variants to it, upload them as Child rows without its Parent row, or include one of its existing Child rows; otherwise use a different Parent SKU.';
      expect(res.issues.map((i) => [i.row, i.message])).toEqual([[2, msg], [3, msg]]);
      expect(t.ops()).toEqual([]);
    });

    it('a child-only upload attaches; product fields stay unchanged', async () => {
      const t = setup(honeySeed());
      const res = await t.svc.importRows(sheet(child('HONEY', 'HONEY-1KG', { mrp: '800', sellingPrice: '700' })));
      expect(errorsOf(res)).toEqual([]);
      expect(res.variantsCreated).toBe(1);
      expect(t.writes.filter((w) => w.op === 'product.update').map((w) => w.args.data)).toEqual([{ sku: 'HONEY' }]);
      expect(t.ops()).not.toContain('productImage.deleteMany');
      expect(t.db.products[0]).toMatchObject({ title: 'Wildflower Honey', brandId: 'b-bee', taxRatePct: 5, hsnCode: '0409' });
    });

    it('a Parent row with no Child rows and no variant cells edits the product', async () => {
      const t = setup(honeySeed());
      await t.svc.importRows(sheet(parent('HONEY', { title: 'Raw Honey' })));
      expect(t.writes).toEqual([
        { op: 'product.update', args: { where: { id: 'p-honey' }, data: { title: 'Raw Honey', sku: 'HONEY' } } },
      ]);
    });

    it('a Parent row with an existing Child plus a new Child is matched by step 2', async () => {
      const t = setup(honeySeed());
      const res = await t.svc.importRows(
        sheet(parent('HONEY'), child('HONEY', 'HONEY-250'), child('HONEY', 'HONEY-1KG', { mrp: '800', sellingPrice: '700' })),
      );
      expect(errorsOf(res)).toEqual([]);
      expect(t.ops()).toEqual(['product.update', 'variant.create', 'inventory.create']);
    });

    it('scenario B: a Child SKU owned by another product fails the ownership check', async () => {
      const t = setup(honeySeed({
        products: [prod({ id: 'p-jam', title: 'Jam', sku: 'JAM' })],
        variants: [variant({ id: 'v-jam', productId: 'p-jam', sku: 'JAM-1' })],
      }));
      const res = await t.svc.importRows(sheet(parent('JAM', { title: 'Jam 2' }), child('JAM', 'HONEY-250')));
      const msg =
        'SKU HONEY-250 belongs to "Wildflower Honey" (Parent SKU HONEY), not to Parent SKU JAM — fix the Parent SKU or the SKU.';
      expect(res.issues.map((i) => [i.row, i.message])).toEqual([[2, msg], [3, msg]]);
      expect(t.ops()).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Brand, GST, HSN, Finding 1, NIT 5
// ---------------------------------------------------------------------------

describe('BulkSheetService.importRows — brand, GST, HSN', () => {
  it('a brand that differs only in case is unchanged (no lookup, no update)', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(sheet(parent('TSHIRT-001', { brand: 'zara', title: "Men's Tee" })));
    expect(res.issues).toEqual([]);
    expect(t.calls).not.toContain('brand.findFirst');
    expect(t.ops()).toEqual([]);
  });

  it('existing 3% with cell 3% is kept with a warning; 4% is a parent error; a new product at 3% errors', async () => {
    const t = setup(teeSeed({ product: { taxRatePct: 3 } }));
    const kept = await t.svc.importRows(sheet(parent('TSHIRT-001', { gstRate: '3%' })));
    expect(kept.issues.map((i) => [i.level, i.message])).toEqual([['warning', 'GST Rate 3% is not a standard rate — kept as it is.']]);
    expect(t.ops()).toEqual([]);
    const four = await t.svc.importRows(sheet(parent('TSHIRT-001', { gstRate: '4%' })));
    expect(errorsOf(four).map((e: any) => e.message)).toEqual(['GST Rate must be one of 0%, 5%, 12%, 18%, 28%']);
    const fresh = await t.svc.importRows(
      sheet(parent('NEW-3', { title: 'New', finalDetail: 'Apparel', gstRate: '3%', mrp: '100', sellingPrice: '90' })),
    );
    expect(errorsOf(fresh).map((e: any) => e.message)).toEqual(['GST Rate must be one of 0%, 5%, 12%, 18%, 28%']);
  });

  it('a new product with blank GST: an Exclusive child errors, the product is created at 0%', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('NG', { title: 'No GST', finalDetail: 'Apparel' }),
        child('NG', 'NG-1', { taxType: 'Exclusive', mrp: '100', sellingPrice: '80' }),
        child('NG', 'NG-2', { mrp: '100', sellingPrice: '80' }),
      ),
    );
    expect(errorsOf(res)).toEqual([
      { row: 3, sku: 'NG-1', level: 'error', message: 'GST Rate is needed to convert an Exclusive price.' },
    ]);
    expect(warningsOf(res).map((w: any) => w.message)).toEqual(['GST Rate is blank — saved as 0%.']);
    expect(t.db.products[0]?.taxRatePct).toBe(0);
    expect(t.db.variants.map((v) => v.sku)).toEqual(['NG-2']);
  });

  it("a Child GST that differs from the Parent's is ignored with a warning; conversion uses the parent's", async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(
        parent('PG', { title: 'Parent GST', finalDetail: 'Apparel', gstRate: '12%' }),
        child('PG', 'PG-1', { taxType: 'Exclusive', gstRate: '18%', mrp: '999', sellingPrice: '799' }),
      ),
    );
    expect(warningsOf(res).map((w: any) => w.message)).toEqual([
      "GST Rate on Child rows is ignored — the Parent row's 12% is used.",
    ]);
    expect(t.db.variants[0]?.sellingPrice).toBe(89488);
  });

  it('a child-only Exclusive row converts with its own list rate; a non-list rate errors', async () => {
    const t = setup(teeSeed());
    const res = await t.svc.importRows(
      sheet(
        child('TSHIRT-001', 'TSHIRT-001-S', { taxType: 'Exclusive', gstRate: '18%', sellingPrice: '799' }),
        child('TSHIRT-001', 'TSHIRT-001-M', { taxType: 'Exclusive', gstRate: '7%', mrp: '999', sellingPrice: '799' }),
      ),
    );
    expect(t.writes[0]?.args.data).toEqual({ sellingPrice: 94282 });
    expect(t.ops()).not.toContain('product.update');
    expect(res.issues.map((i) => [i.row, i.level, i.message])).toEqual([
      [3, 'error', 'GST Rate must be one of 0%, 5%, 12%, 18%, 28%'],
      [2, 'warning', "GST Rate 18% is used only to convert this Exclusive price — the product's GST stays 12%."],
    ]);
  });

  it('a stored HSN with spaces matches the same digits without a warning', async () => {
    const t = setup(teeSeed({ product: { hsnCode: '0910 30' } }));
    const res = await t.svc.importRows(sheet(parent('TSHIRT-001', { hsnCode: '091030' })));
    expect(res.issues).toEqual([]);
    expect(t.ops()).toEqual([]);
  });

  it('a single Parent row with prices creates one variant with SKU = Parent SKU', async () => {
    const t = setup();
    const res = await t.svc.importRows(
      sheet(parent('ONE', { title: 'One', finalDetail: 'Apparel', gstRate: '5%', colour: 'Red', size: 'M', mrp: '100', sellingPrice: '90' })),
    );
    expect(errorsOf(res)).toEqual([]);
    expect(t.db.products[0]).toMatchObject({ sku: 'ONE', attributesJson: { Color: 'Red' } });
    expect(t.db.variants.map((v) => [v.sku, v.attributesJson])).toEqual([['ONE', { Size: 'M' }]]);
  });
});

describe('BulkSheetService.importRows — Finding 1 and NIT 5', () => {
  const wizard = (): Partial<Db> => ({
    products: [prod({ id: 'p-wz', title: 'Wizard Tee', sku: 'WZ-1', categoryId: 'c-apparel', attributesJson: { Size: 'M', Color: 'Blue' } })],
    variants: [variant({ id: 'v-wz', productId: 'p-wz', sku: 'WZ-1', attributesJson: { Size: 'M', Color: 'Blue' } })],
    inventory: [inv('v-wz', 3)],
  });

  it('single-row Size L / Colour Red update both twin attributes', async () => {
    const t = setup(wizard());
    await t.svc.importRows(sheet(parent('WZ-1', { size: 'L', mrp: '999' })));
    expect(t.db.products[0]?.attributesJson).toEqual({ Size: 'L', Color: 'Blue' });
    expect(t.db.variants[0]?.attributesJson).toEqual({ Size: 'L', Color: 'Blue' });

    const c = setup(wizard());
    await c.svc.importRows(sheet(parent('WZ-1', { colour: 'Red', mrp: '999' })));
    expect(c.db.products[0]?.attributesJson).toEqual({ Size: 'M', Color: 'Red' });
    expect(c.db.variants[0]?.attributesJson).toEqual({ Size: 'M', Color: 'Red' });
  });

  it('an unchanged export -> import of a wizard product makes no writes', async () => {
    const t = setup(wizard());
    const exported = await t.svc.exportSheet();
    expect(exported.rows).toHaveLength(1);
    const res = await t.svc.importRows(exported.rows.map((r, i) => exportRowToInput(r, i + 2)));
    expect(errorsOf(res)).toEqual([]);
    expect(t.ops()).toEqual([]);
  });

  it("weightUnit 'g' + '200' is a row error; '0.2' is fine; no hint + '200' only warns", async () => {
    const rows = (w: string) => sheet(parent('W-1', { title: 'Jar', finalDetail: 'Apparel', gstRate: '5%', mrp: '100', sellingPrice: '90', weightKg: w }));
    const g = setup();
    const res = await g.svc.importRows(rows('200'), { weightUnit: 'g' });
    expect(errorsOf(res).map((e: any) => e.message)).toEqual(['Weight is in kg — 200 looks like grams; enter 0.2 (e.g. 0.2)']);
    expect(g.ops()).toEqual([]);

    const ok = setup();
    const res2 = await ok.svc.importRows(rows('0.2'), { weightUnit: 'g' });
    expect(res2.issues).toEqual([]);
    expect(ok.db.variants[0]?.weightGrams).toBe(200);

    const none = setup();
    const res3 = await none.svc.importRows(rows('200'));
    expect(errorsOf(res3)).toEqual([]);
    expect(warningsOf(res3).map((w: any) => w.message)).toEqual(['Weight is in kg — 200 kg looks too high.']);
  });
});

// ---------------------------------------------------------------------------
// Export and round trip (AC-9)
// ---------------------------------------------------------------------------

function roundTripSeed(): Partial<Db> {
  const dims = 'd'.repeat(120);
  return {
    brands: [
      { id: 'b-acme', name: 'Acme', slug: 'acme' },
      { id: 'b-acme2', name: 'ACME', slug: 'acme-2' },
      { id: 'b-zara', name: 'Zara', slug: 'zara' },
      { id: 'b-nike', name: 'Nike', slug: 'nike' },
    ],
    products: [
      // Null-sku multi-variant at 3%, HSN with a space, trailing newline, 7-image duplicate gallery,
      // brand with a case twin, ambiguous category name.
      prod({
        id: 'p-rice',
        title: 'Basmati Rice',
        description: 'Aged rice\n',
        categoryId: 'c-ghee2',
        brandId: 'b-acme2',
        hsnCode: '0910 30',
        taxRatePct: 3,
        attributesJson: { Color: 'White', Dimensions: dims },
      }),
      // Null-sku single variant (wizard-shaped).
      prod({
        id: 'p-honey',
        title: 'Wild Honey',
        categoryId: 'c-tea',
        brandId: 'b-zara',
        hsnCode: '0409',
        taxRatePct: 5,
        attributesJson: { Size: '500 g', Color: 'Gold' },
      }),
      // Saved sku, 195-char title, empty gallery whose variants have photos.
      prod({ id: 'p-tea', title: 'T'.repeat(195), sku: 'TEA', categoryId: 'c-tea', brandId: 'b-nike', hsnCode: '0902', taxRatePct: 18 }),
      // Archived products are not exported.
      prod({ id: 'p-arch', title: 'Archived', sku: 'ARCH', status: 'archived' }),
    ],
    variants: [
      variant({
        id: 'v-r1',
        productId: 'p-rice',
        sku: 'RICE-1KG',
        mrp: 99900,
        sellingPrice: 79900,
        costPrice: 70000,
        weightGrams: 1000,
        attributesJson: { size: '1 kg', 'Pack Of': '2' },
        priceSlabsJson: [{ minQty: 5, unitPrice: 77922 }, { minQty: 9, unitPrice: 74925 }],
      }),
      variant({
        id: 'v-r5',
        productId: 'p-rice',
        sku: 'RICE-5KG',
        mrp: 450000,
        sellingPrice: 400000,
        costPrice: null,
        weightGrams: 5000,
        attributesJson: { Size: 's'.repeat(150), 'pack of': '2' },
        priceSlabsJson: [{ minQty: 2, unitPrice: 390000 }],
        imageUrl: '/rice5.jpg',
      }),
      variant({ id: 'v-h', productId: 'p-honey', sku: 'HONEY-1', mrp: 50000, sellingPrice: 45000, weightGrams: 500, attributesJson: { Size: '500 g', Color: 'Gold' } }),
      variant({ id: 'v-t250', productId: 'p-tea', sku: 'TEA-250', mrp: 20000, sellingPrice: 15000, costPrice: 1000, attributesJson: { Size: '250 g' }, imageUrl: '/t250.jpg' }),
      variant({ id: 'v-t500', productId: 'p-tea', sku: 'TEA-500', mrp: 35000, sellingPrice: 30000, imageUrl: '/t500.jpg' }),
      variant({ id: 'v-old', productId: 'p-tea', sku: 'TEA-OLD', isActive: false }),
      variant({ id: 'v-arch', productId: 'p-arch', sku: 'ARCH' }),
    ],
    images: ['/a', '/a', '/b', '/c', '/d', '/e', '/f'].map((url, position) => ({
      id: `i${position}`,
      productId: 'p-rice',
      url,
      alt: '',
      position,
    })),
    // v-r5 has no inventory row.
    inventory: [inv('v-r1', 10), inv('v-h', 3), inv('v-t250', 4), inv('v-t500', 0)],
  };
}

describe('BulkSheetService.exportSheet', () => {
  it('returns no rows and the leaf categories when there are no products', async () => {
    const t = setup();
    const res = await t.svc.exportSheet();
    expect(res.rows).toEqual([]);
    expect(res.categories).toEqual([
      { label: 'Apparel', slug: 'apparel', path: 'Apparel' },
      { label: 'ghee-2', slug: 'ghee-2', path: 'Dairy › Ghee' },
      { label: 'Ghee', slug: 'ghee', path: 'Grocery › Ghee' },
      { label: 'Herbal Tea', slug: 'herbal-tea', path: 'Grocery › Herbal Tea' },
    ]);
  });

  it('writes Parent + Child rows, single-row products, derived Parent SKUs and slug labels', async () => {
    const t = setup(roundTripSeed());
    const { rows } = await t.svc.exportSheet();
    expect(rows.map((r) => [r.indicator, r.parentSku, r.sku])).toEqual([
      ['Parent', null, 'TEA'],
      ['Child', 'TEA', 'TEA-250'],
      ['Child', 'TEA', 'TEA-500'],
      ['Parent', null, 'HONEY-1'],
      ['Parent', null, 'RICE'],
      ['Child', 'RICE', 'RICE-1KG'],
      ['Child', 'RICE', 'RICE-5KG'],
    ]);
    const rice = rows[4]!;
    expect(rice).toMatchObject({ finalDetail: 'ghee-2', brand: 'ACME', gstRate: '3%', hsnCode: '0910 30', image5: '/e' });
    expect(rows[5]).toMatchObject({ packOf: 2, purchasePrice: 700, size: '1 kg' });
    expect(rows[5]?.tier2).toBeCloseTo(22, 9);
    expect(rows[6]).toMatchObject({ purchasePrice: null, tier2: null, stock: 0, image1: '/rice5.jpg' });
    expect(rows[3]).toMatchObject({ size: '500 g', colour: 'Gold', mrp: 500, stock: 3, weightKg: 0.5 });
    expect(rows[1]?.title).toHaveLength(200);
  });
});

describe('BulkSheetService — round trip (AC-9)', () => {
  it('download -> upload changes only the null Parent SKUs; a second pass writes nothing', async () => {
    const t = setup(roundTripSeed());
    const first = await t.svc.exportSheet();
    const res = await t.svc.importRows(first.rows.map((r, i) => exportRowToInput(r, i + 2)));
    expect(errorsOf(res)).toEqual([]);
    expect(warningsOf(res).map((w: any) => w.message)).toEqual(['GST Rate 3% is not a standard rate — kept as it is.']);
    expect(t.writes.map((w) => [w.op, w.args.where, w.args.data])).toEqual([
      ['product.update', { id: 'p-honey' }, { sku: 'HONEY-1' }],
      ['product.update', { id: 'p-rice' }, { sku: 'RICE' }],
    ]);

    t.reset();
    const second = await t.svc.exportSheet();
    expect(second.rows).toEqual(first.rows);
    const res2 = await t.svc.importRows(second.rows.map((r, i) => exportRowToInput(r, i + 2)));
    expect(errorsOf(res2)).toEqual([]);
    expect(t.ops()).toEqual([]);
    expect(t.db.images.filter((i) => i.productId === 'p-rice')).toHaveLength(7);
  });
});

describe('AdminCatalogueController sheet routes', () => {
  it('are guarded by products.bulk; the rest of the controller defaults to products.edit', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminCatalogueController)).toEqual(['products.edit']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminCatalogueController.prototype.bulkSheetImport)).toEqual(['products.bulk']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminCatalogueController.prototype.bulkSheetExport)).toEqual(['products.view']);
    expect(typeof AdminCatalogueController.prototype.bulkSheetImport).toBe('function');
    expect(typeof AdminCatalogueController.prototype.bulkSheetExport).toBe('function');
    expect('exportProducts' in AdminCatalogueController.prototype).toBe(false);
  });
});
