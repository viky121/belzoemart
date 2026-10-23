import { isWeightUnit, weightToGrams, type WeightUnit } from '@belzo/shared';

/** Weight input state: the number as typed plus its unit. */
export interface WeightInput {
  value: string;
  unit: WeightUnit;
}

export const EMPTY_WEIGHT: WeightInput = { value: '', unit: 'gm' };

/**
 * Form state for an existing variant. A variant saved with a unit shows it; an older one that only has
 * grams shows those grams in "gm".
 */
export function initialWeight(v: {
  weightGrams?: number | null;
  weightValue?: number | null;
  weightUnit?: string | null;
}): WeightInput {
  if (typeof v.weightValue === 'number' && v.weightValue > 0 && isWeightUnit(v.weightUnit)) {
    return { value: String(v.weightValue), unit: v.weightUnit };
  }
  if ((v.weightGrams ?? 0) > 0) return { value: String(v.weightGrams), unit: 'gm' };
  return { ...EMPTY_WEIGHT };
}

/**
 * Fields POST /admin/variants takes for a weight. Blank = no weight. `fallbackGrams` is kept as the courier
 * weight for units with no mass (count, pc), where the shop default weight applies when it is 0.
 */
export function weightPayload(
  w: WeightInput,
  fallbackGrams = 0,
): { weightValue: number | null; weightUnit: WeightUnit | null; weightGrams: number } {
  const n = parseFloat(w.value);
  if (!w.value.trim() || !Number.isFinite(n) || n < 0) {
    return { weightValue: null, weightUnit: null, weightGrams: fallbackGrams };
  }
  return { weightValue: n, weightUnit: w.unit, weightGrams: weightToGrams(n, w.unit) ?? fallbackGrams };
}
