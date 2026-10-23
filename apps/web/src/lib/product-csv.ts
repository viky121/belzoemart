import { CSV_BOM, toCsv } from './csv';

/** Bulk upload / export CSV columns, in file order. */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'title',
  'categorySlug',
  'mrp',
  'sellingPrice',
  'description',
  'brand',
  'hsnCode',
  'taxRatePct',
  'stock',
  'status',
  'imageUrl',
] as const;

/** Mirror of the API's ProductExportRow (GET /admin/products/export). Prices in rupees. */
export interface ProductExportRow {
  sku: string;
  title: string;
  categorySlug: string;
  mrp: number;
  sellingPrice: number;
  description: string;
  brand: string;
  hsnCode: string;
  taxRatePct: number;
  stock: number;
  status: 'draft' | 'published';
  imageUrl: string;
}

/** Excel-friendly product CSV (UTF-8 BOM + RFC-4180). */
export function buildProductsCsv(rows: ProductExportRow[]): string {
  return CSV_BOM + toCsv(PRODUCT_CSV_COLUMNS, rows as unknown as Record<string, string | number>[]);
}

/** belzo-products-YYYY-MM-DD.csv using the local date. */
export function productsCsvFilename(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `belzo-products-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}
