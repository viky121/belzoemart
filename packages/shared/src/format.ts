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

/** "12 Jun 2025, 3:45 pm" (en-IN), or null for a missing/invalid time. */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "12 Jun 2025" (en-IN), or null for a missing/invalid date. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
