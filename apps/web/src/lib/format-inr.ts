/**
 * Format integer paise as an INR string for display. Whole-rupee amounts have
 * no decimals (₹9,588); fractional amounts always show two (₹10,067.40).
 * Presentation only: no rounding of the stored amount beyond 2 decimals.
 */
export function formatInr(paise: number): string {
  const fractionDigits = paise % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
