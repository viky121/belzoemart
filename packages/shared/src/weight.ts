/**
 * Variant weight / pack size, entered by the admin as a number plus a unit.
 * `weightGrams` stays the shipping figure; the value + unit is what customers see ("500 gm", "6 pc").
 */
export const WEIGHT_UNITS = ['kg', 'gm', 'count', 'pc', 'litre', 'ml'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** Shown in the admin dropdown. */
export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  kg: 'kg',
  gm: 'gm',
  count: 'count',
  pc: 'pc',
  litre: 'litre',
  ml: 'ml',
};

export function isWeightUnit(v: unknown): v is WeightUnit {
  return typeof v === 'string' && (WEIGHT_UNITS as readonly string[]).includes(v);
}

/** "500 gm", "1.5 kg", "6 pc". Up to 3 decimals, no trailing zeros. */
export function formatWeight(value: number, unit: WeightUnit): string {
  return `${Number(value.toFixed(3))} ${unit}`;
}

/**
 * Courier weight in grams for a value + unit, or null when the unit is a count (a pack of 6 has no
 * single mass). Litres and ml use 1 ml = 1 g, which is close enough for grocery liquids.
 */
export function weightToGrams(value: number, unit: WeightUnit): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  switch (unit) {
    case 'kg':
    case 'litre':
      return Math.round(value * 1000);
    case 'gm':
    case 'ml':
      return Math.round(value);
    default:
      return null;
  }
}

const UNIT_ATTRIBUTE_KEYS = ['Weight', 'Net Weight', 'Volume', 'Size', 'Pack', 'Quantity'];

/**
 * The pack label customers see for a variant. Order: the weight + unit the admin entered, then a
 * Weight/Volume/Size/Pack/Quantity attribute, then the legacy gram figure ("500 g" / "1 kg").
 */
export function variantUnitLabel(
  v:
    | {
        attributesJson?: unknown;
        weightGrams?: number | null;
        weightValue?: number | null;
        weightUnit?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!v) return null;
  if (typeof v.weightValue === 'number' && v.weightValue > 0 && isWeightUnit(v.weightUnit)) {
    return formatWeight(v.weightValue, v.weightUnit);
  }
  const attrs = (v.attributesJson as Record<string, string> | null | undefined) ?? {};
  for (const key of UNIT_ATTRIBUTE_KEYS) {
    const found = Object.entries(attrs).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found && found[1]) return String(found[1]);
  }
  const g = v.weightGrams ?? 0;
  if (g > 0) return g >= 1000 ? `${g / 1000} kg` : `${g} g`;
  return null;
}
