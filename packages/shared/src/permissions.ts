/**
 * Admin panel permissions. A staff type (role) is a name plus a list of these keys. The API checks the key on
 * every admin route; the admin screens use the same list to build the tick boxes and to hide menu items.
 */

export interface PermissionDef {
  key: string;
  /** Short name shown next to the tick box. */
  label: string;
  /** One line that says what ticking it allows. */
  help: string;
  /** Area it belongs to (the group heading in the role editor). */
  group: string;
  /** Other permissions this one needs (ticking it ticks them too). */
  requires?: string[];
  /** Shows cost, profit or secret keys: the editor warns before it is ticked. */
  sensitive?: boolean;
  /** Only the Super Admin has it; it cannot be given to a staff type (no one can raise their own access). */
  superAdminOnly?: boolean;
}

export const PERMISSION_DEFS = [
  { key: 'dashboard.view', label: 'View', help: 'Open the dashboard numbers and sales chart.', group: 'Dashboard' },

  { key: 'products.view', label: 'View', help: 'See products, variants and stock.', group: 'Products' },
  { key: 'products.edit', label: 'Edit', help: 'Add, change and delete products and variants, set prices and images.', group: 'Products', requires: ['products.view'] },
  { key: 'products.bulk', label: 'Bulk upload and bulk edit', help: 'Import an Excel sheet or change many products at once.', group: 'Products', requires: ['products.view', 'products.edit'] },
  { key: 'stock.adjust', label: 'Adjust stock', help: 'Add or remove stock of a variant.', group: 'Products', requires: ['products.view'] },

  { key: 'taxonomy.view', label: 'View', help: 'See categories and brands.', group: 'Categories and brands' },
  { key: 'taxonomy.edit', label: 'Edit', help: 'Add, change and delete categories and brands.', group: 'Categories and brands', requires: ['taxonomy.view'] },

  { key: 'orders.view', label: 'View', help: 'See orders and their details.', group: 'Orders' },
  { key: 'orders.manage', label: 'Manage', help: 'Change order status, cancel, make a shipment, regenerate an invoice.', group: 'Orders', requires: ['orders.view'] },
  { key: 'returns.view', label: 'View', help: 'See return requests.', group: 'Returns' },
  { key: 'returns.manage', label: 'Manage', help: 'Approve, receive or reject returns (this can refund money).', group: 'Returns', requires: ['returns.view'] },
  { key: 'payments.view', label: 'View', help: 'See payments and refunds.', group: 'Payments' },

  { key: 'customers.view', label: 'View', help: 'See customers and their details.', group: 'Customers' },
  { key: 'customers.block', label: 'Block or unblock', help: 'Stop a customer from signing in, or allow them again.', group: 'Customers', requires: ['customers.view'] },
  { key: 'reviews.moderate', label: 'Moderate reviews', help: 'Approve or reject customer reviews.', group: 'Customers' },

  { key: 'coupons.view', label: 'View', help: 'See coupons.', group: 'Coupons' },
  { key: 'coupons.edit', label: 'Edit', help: 'Add, change and delete coupons.', group: 'Coupons', requires: ['coupons.view'] },

  { key: 'offers.view', label: 'View', help: 'See special price offers (for example "shop 2000, get sugar at 29").', group: 'Offers' },
  { key: 'offers.edit', label: 'Edit', help: 'Add, change, switch off and delete special price offers.', group: 'Offers', requires: ['offers.view'], sensitive: true },

  { key: 'content.edit', label: 'Banners and pages', help: 'Edit website banners and the text pages (terms, privacy and others).', group: 'Content' },
  { key: 'mobile.edit', label: 'Mobile app and home page design', help: 'Change the mobile app home screen and the website home page layout.', group: 'Content' },
  { key: 'media.manage', label: 'Media library', help: 'Upload and browse pictures.', group: 'Content' },

  { key: 'reports.view', label: 'View', help: 'Open the sales, orders, users, products, categories, brands, best sellers, payments and search terms reports.', group: 'Reports' },
  { key: 'reports.export', label: 'Download CSV', help: 'Download reports as CSV files.', group: 'Reports', requires: ['reports.view'] },
  { key: 'reports.profit', label: 'Profit and loss', help: 'Open the profit and loss report. It shows what products cost the shop.', group: 'Reports', requires: ['reports.view'], sensitive: true },

  { key: 'delivery.partners', label: 'Partners and zones', help: 'Add delivery partners, set their zones, reset their passwords.', group: 'Delivery' },
  { key: 'delivery.jobs', label: 'Assign and follow jobs', help: 'Assign orders to partners and follow, reassign or cancel delivery jobs.', group: 'Delivery' },
  { key: 'delivery.settings', label: 'Delivery settings', help: 'Change delivery rules such as OTP time and QR payment.', group: 'Delivery', sensitive: true },

  { key: 'serviceability.edit', label: 'PIN codes we deliver to', help: 'Change the list of serviceable PIN codes.', group: 'Store setup' },
  { key: 'settings.edit', label: 'Store settings', help: 'Change store name, tax, shipping and COD settings.', group: 'Store setup', sensitive: true },
  { key: 'gateway.edit', label: 'Payment and SMS keys', help: 'Change the payment gateway and SMS gateway keys.', group: 'Store setup', sensitive: true },
  { key: 'audit.view', label: 'Audit log', help: 'See who changed what in the admin panel.', group: 'Store setup', sensitive: true },

  { key: 'staff.manage', label: 'Manage staff and types', help: 'Add staff, make staff types and choose their access.', group: 'Staff', sensitive: true, superAdminOnly: true },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSION_DEFS)[number]['key'];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_DEFS.map((p) => p.key);

/** Keys a staff type may be given (everything except the Super Admin only ones). */
export const GRANTABLE_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_DEFS.filter(
  (p) => !(p as PermissionDef).superAdminOnly,
).map((p) => p.key);

const DEF_BY_KEY = new Map<string, PermissionDef>(PERMISSION_DEFS.map((p) => [p.key, p as PermissionDef]));

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && DEF_BY_KEY.has(value);
}

export function permissionDef(key: string): PermissionDef | undefined {
  return DEF_BY_KEY.get(key);
}

/** The groups in display order, each with its permissions. */
export function permissionGroups(): { group: string; items: PermissionDef[] }[] {
  const out: { group: string; items: PermissionDef[] }[] = [];
  for (const def of PERMISSION_DEFS as readonly PermissionDef[]) {
    let g = out.find((x) => x.group === def.group);
    if (!g) {
      g = { group: def.group, items: [] };
      out.push(g);
    }
    g.items.push(def);
  }
  return out;
}

/**
 * Adds what a ticked permission needs (edit needs view, and so on), drops unknown keys and keys that cannot
 * be granted, removes duplicates. The result is in catalogue order.
 */
export function normalizePermissions(keys: readonly string[], opts: { allowSuperAdminOnly?: boolean } = {}): PermissionKey[] {
  const grantable = new Set<string>(opts.allowSuperAdminOnly ? ALL_PERMISSION_KEYS : GRANTABLE_PERMISSION_KEYS);
  const chosen = new Set<string>();
  const add = (key: string) => {
    if (!grantable.has(key) || chosen.has(key)) return;
    chosen.add(key);
    for (const need of DEF_BY_KEY.get(key)?.requires ?? []) add(need);
  };
  for (const key of keys) add(key);
  return ALL_PERMISSION_KEYS.filter((k) => chosen.has(k));
}

/** Unticks a permission and everything that needs it (unticking view also unticks edit). */
export function withoutPermission(keys: readonly string[], key: string): PermissionKey[] {
  const drop = new Set<string>([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const def of PERMISSION_DEFS as readonly PermissionDef[]) {
      if (!drop.has(def.key) && (def.requires ?? []).some((r) => drop.has(r))) {
        drop.add(def.key);
        grew = true;
      }
    }
  }
  return normalizePermissions(keys.filter((k) => !drop.has(k)));
}

// ---------------------------------------------------------------------------
// Staff types that come ready-made
// ---------------------------------------------------------------------------

export const SUPER_ADMIN_ROLE_NAME = 'super_admin';

export interface RoleTemplate {
  name: string;
  description: string;
  permissions: PermissionKey[];
}

const everythingButSensitive = GRANTABLE_PERMISSION_KEYS.filter((k) => !['gateway.edit', 'audit.view'].includes(k));

/**
 * The staff types created on a fresh install. The first five do what the old fixed roles did; Admin, Manager
 * and Accountant are the new starters. Once created they are edited like any other type.
 */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    name: 'admin',
    description: 'Everything except staff and types, payment and SMS keys, and the audit log.',
    permissions: normalizePermissions(everythingButSensitive),
  },
  {
    name: 'manager',
    description: 'Runs the shop day to day: catalogue, orders, returns, customers, offers, content, delivery and reports. No profit report, no settings or keys.',
    permissions: normalizePermissions([
      'dashboard.view', 'products.view', 'products.edit', 'products.bulk', 'stock.adjust', 'taxonomy.view', 'taxonomy.edit',
      'orders.view', 'orders.manage', 'returns.view', 'returns.manage', 'payments.view', 'customers.view', 'customers.block',
      'reviews.moderate', 'coupons.view', 'coupons.edit', 'offers.view', 'offers.edit', 'content.edit', 'mobile.edit', 'media.manage',
      'reports.view', 'reports.export', 'delivery.partners', 'delivery.jobs', 'serviceability.edit',
    ]),
  },
  {
    name: 'accountant',
    description: 'Money and reports: orders, payments, returns, customers (view only) and all reports including profit and loss.',
    permissions: normalizePermissions([
      'dashboard.view', 'products.view', 'orders.view', 'returns.view', 'payments.view', 'customers.view',
      'reports.view', 'reports.export', 'reports.profit',
    ]),
  },
  {
    name: 'catalogue_manager',
    description: 'Products, categories, brands, stock and pictures.',
    permissions: normalizePermissions(['products.view', 'products.edit', 'products.bulk', 'stock.adjust', 'taxonomy.view', 'taxonomy.edit', 'media.manage']),
  },
  {
    name: 'order_manager',
    description: 'Orders, returns, payments, customers (view), delivery and reports.',
    permissions: normalizePermissions([
      'dashboard.view', 'orders.view', 'orders.manage', 'returns.view', 'returns.manage', 'payments.view', 'customers.view',
      'reports.view', 'reports.export', 'delivery.partners', 'delivery.jobs',
    ]),
  },
  {
    name: 'marketing',
    description: 'Coupons, banners, pages, the mobile app home screen, pictures and reports.',
    permissions: normalizePermissions([
      'dashboard.view', 'payments.view', 'customers.view', 'coupons.view', 'coupons.edit', 'offers.view', 'offers.edit', 'content.edit', 'mobile.edit',
      'media.manage', 'reports.view', 'reports.export',
    ]),
  },
  {
    name: 'support',
    description: 'Customers (view) and review moderation.',
    permissions: normalizePermissions(['customers.view', 'reviews.moderate']),
  },
];

/** What a role name may look like. `super_admin` is reserved. */
export function validRoleName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _&.\-/]*$/u.test(name)) return null;
  if (name.toLowerCase().replace(/[\s-]/g, '_') === SUPER_ADMIN_ROLE_NAME) return null;
  return name;
}

/** `order_manager` -> `Order manager`; names that already look nice are left alone. */
export function roleLabel(name: string): string {
  if (!/[_]/.test(name) && name !== name.toLowerCase()) return name;
  const spaced = name.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
