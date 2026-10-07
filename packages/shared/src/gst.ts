/**
 * Indian GST presentation helpers (tax invoice): GST state codes, GSTIN/PAN,
 * amount-in-words in the Indian numbering system, and exact proportional
 * allocation of integer paise. Pure and I/O-free so they are unit-testable and
 * reusable by both the API (invoice rendering) and the web app.
 */

/** GST state / UT codes as used in GSTINs and place-of-supply declarations. */
export const GST_STATES: readonly { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

/** Lowercase, `&` -> `and`, drop everything except a-z. */
function normaliseStateName(name: string): string {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
}

/** Common alternate spellings / old names (keys already normalised). */
const STATE_ALIASES: Record<string, string> = {
  newdelhi: '07',
  nctofdelhi: '07',
  orissa: '21',
  pondicherry: '34',
  uttaranchal: '05',
  chattisgarh: '22',
  jk: '01',
  damananddiu: '26',
  dadraandnagarhaveli: '26',
  andamanandnicobar: '35',
};

const STATE_CODE_BY_NAME: ReadonlyMap<string, string> = new Map([
  ...GST_STATES.map((s) => [normaliseStateName(s.name), s.code] as const),
  ...Object.entries(STATE_ALIASES),
]);

/**
 * GST state code for a state name (case-, space- and punctuation-insensitive),
 * e.g. "Karnataka" -> "29", "  DELHI " -> "07". Null when blank or unknown.
 */
export function gstStateCode(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const key = normaliseStateName(name);
  if (!key) return null;
  return STATE_CODE_BY_NAME.get(key) ?? null;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** True when `gstin` (trimmed, case-insensitive) has the 15-char GSTIN shape. */
export function isValidGstin(gstin: string | null | undefined): boolean {
  if (typeof gstin !== 'string') return false;
  return GSTIN_RE.test(gstin.trim().toUpperCase());
}

/** PAN embedded in a GSTIN (chars 3-12), or null when the GSTIN is not valid. */
export function panFromGstin(gstin: string | null | undefined): string | null {
  if (!isValidGstin(gstin)) return null;
  return (gstin as string).trim().toUpperCase().slice(2, 12);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Words for 1..99 ('' for 0). */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  const o = ONES[n % 10]!;
  return o ? `${t} ${o}` : t;
}

/** Words for 1..999 ('' for 0). */
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(' ');
}

/** Words for a non-negative integer in the Indian system (crore, lakh, thousand). */
function integerToIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore > 0) parts.push(`${integerToIndianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh > 0) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand > 0) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/**
 * Amount in words for an INR amount given in integer paise, Indian numbering:
 * 1006740 -> "Rupees Ten Thousand Sixty Seven and Forty Paise Only",
 * 0 -> "Rupees Zero Only". Throws RangeError for negative / non-integer input.
 */
export function amountInWordsInr(paiseAmount: number): string {
  if (!Number.isSafeInteger(paiseAmount) || paiseAmount < 0) {
    throw new RangeError(`amount (paise) must be a non-negative integer, received: ${paiseAmount}`);
  }
  const rupees = Math.floor(paiseAmount / 100);
  const p = paiseAmount % 100;
  const rupeeWords = integerToIndianWords(rupees);
  return p > 0
    ? `Rupees ${rupeeWords} and ${belowHundred(p)} Paise Only`
    : `Rupees ${rupeeWords} Only`;
}

/**
 * Split an integer `total` across `weights` so the parts sum EXACTLY to
 * `total`. Each part is floor(total * w / Σw); the leftover paise go to the
 * last index with a positive weight (spilling backwards over earlier positive
 * weights only when `caps` would be exceeded). Zero-weight entries receive 0
 * whenever some weight is positive; if every weight is 0 the whole total goes
 * to the last index. Uses BigInt for the products so large paise values stay
 * exact. Throws RangeError for invalid input or when caps cannot hold `total`.
 */
export function allocateProportional(total: number, weights: number[], caps?: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`total must be a non-negative integer, received: ${total}`);
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError('weights must be non-negative integers');
  }
  if (caps && (caps.length !== weights.length || caps.some((c) => !Number.isSafeInteger(c) || c < 0))) {
    throw new RangeError('caps must be non-negative integers, one per weight');
  }
  const out = weights.map(() => 0);
  if (total === 0) return out;
  if (weights.length === 0) throw new RangeError('cannot allocate a positive total over no weights');

  const sumW = weights.reduce((s, w) => s + BigInt(w), 0n);
  const capOf = (i: number) => (caps ? caps[i]! : Number.POSITIVE_INFINITY);

  if (sumW === 0n) {
    const last = weights.length - 1;
    if (total > capOf(last)) throw new RangeError('caps cannot hold the total');
    out[last] = total;
    return out;
  }

  const bigTotal = BigInt(total);
  let allocated = 0;
  for (let i = 0; i < weights.length; i++) {
    const share = Number((bigTotal * BigInt(weights[i]!)) / sumW);
    out[i] = Math.min(share, capOf(i));
    allocated += out[i]!;
  }

  let remainder = total - allocated;
  for (let i = weights.length - 1; i >= 0 && remainder > 0; i--) {
    if (weights[i]! <= 0) continue;
    const room = capOf(i) - out[i]!;
    const add = Math.min(remainder, room);
    out[i] = out[i]! + add;
    remainder -= add;
  }
  if (remainder > 0) throw new RangeError('caps cannot hold the total');
  return out;
}
