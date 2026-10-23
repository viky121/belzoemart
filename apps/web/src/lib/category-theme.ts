/**
 * Visual theming for storefront categories. Keyed by category slug (from the
 * catalogue) with sensible fallbacks so new categories still render nicely.
 * Also generates lightweight inline SVG "dummy" product images (with an icon)
 * so listings never show broken image links while real photography is pending.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  apparel: '👕',
  grocery: '🛒',
  electronics: '🎧',
  handicraft: '🏺',
  mobiles: '📱',
  home: '🛋️',
  beauty: '💄',
  toys: '🧸',
};

/** Two-stop gradients as raw color pairs (usable for both CSS and SVG). */
export const CATEGORY_COLORS: Record<string, [string, string]> = {
  apparel: ['#f857a6', '#ff5858'],
  grocery: ['#11998e', '#38ef7d'],
  electronics: ['#396afc', '#2948ff'],
  handicraft: ['#f7971e', '#ffd200'],
};

const FALLBACK_COLORS: [string, string][] = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#30cfd0', '#330867'],
];

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic color pair for any slug/key. */
export function colorsFor(key: string): [string, string] {
  return CATEGORY_COLORS[key] ?? FALLBACK_COLORS[hash(key) % FALLBACK_COLORS.length];
}

/** Deterministic CSS gradient for any slug (categories, promos, fallbacks). */
export function gradientFor(key: string): string {
  const [a, b] = colorsFor(key);
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function iconFor(slug: string): string {
  return CATEGORY_ICONS[slug] ?? '🛍️';
}

/**
 * Whether an image URL points at a real, loadable asset. Seed placeholder paths
 * (`/seed/*`) are not shipped in this build, so they are treated as absent and
 * the generated dummy image is used instead (no broken-image flash).
 */
export function isUsableImageUrl(url: string | null | undefined): url is string {
  return !!url && !url.startsWith('/seed/');
}

/** Keyword → emoji, so an individual product gets a sensible icon by title. */
const PRODUCT_ICON_RULES: [RegExp, string][] = [
  [/vase|terracotta|pottery|ceramic|clay/, '🏺'],
  [/bag|tote|jute|backpack|purse|wallet/, '👜'],
  [/shirt|tee|t-shirt|kurta|apparel|dress|jean|trouser|saree|cloth/, '👕'],
  [/shoe|sneaker|footwear|sandal/, '👟'],
  [/watch/, '⌚'],
  [/head|ear|buds|audio|speaker|sound/, '🎧'],
  [/charg|cable|power|adapter|plug/, '🔌'],
  [/phone|mobile|smartphone/, '📱'],
  [/laptop|computer|keyboard|mouse/, '💻'],
  [/camera/, '📷'],
  [/rice|grain|wheat|flour|atta/, '🍚'],
  [/oil|ghee/, '🛢️'],
  [/tea|coffee/, '☕'],
  [/spice|masala|salt|sugar/, '🧂'],
  [/snack|biscuit|cookie|chocolate/, '🍫'],
  [/grocery|food/, '🛒'],
  [/candle|decor|lamp|light/, '🕯️'],
  [/toy|game/, '🧸'],
  [/beauty|cream|lotion|soap|cosmetic/, '💄'],
];

/** Best-effort emoji icon for a product based on its title/slug. */
export function iconForProduct(title: string, slug = ''): string {
  const hay = `${title} ${slug}`.toLowerCase();
  for (const [re, icon] of PRODUCT_ICON_RULES) if (re.test(hay)) return icon;
  return '🛍️';
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap a title into up to two lines for the placeholder caption. */
function wrap(title: string, max = 22): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = `${cur} ${w}`.trim();
    }
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur.trim());
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    lines[1] = `${lines[1].slice(0, max - 1)}…`;
  }
  return lines.slice(0, 2);
}

/**
 * Generate a self-contained SVG dummy product image (data URI) featuring a
 * themed gradient, a large category/product icon and the product title.
 */
export function placeholderImage(title: string, key: string): string {
  const [c1, c2] = colorsFor(key);
  const icon = iconForProduct(title, key);
  const lines = wrap(title);
  const caption = lines
    .map(
      (ln, i) =>
        `<text x="200" y="${232 + i * 26}" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="19" font-weight="600" fill="#ffffff">${xmlEscape(
          ln,
        )}</text>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="${xmlEscape(
    title,
  )}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#g)"/>
  <circle cx="330" cy="60" r="90" fill="#ffffff" opacity="0.08"/>
  <circle cx="60" cy="250" r="70" fill="#ffffff" opacity="0.08"/>
  <text x="24" y="40" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="2" fill="#ffffff" opacity="0.85">BELZO</text>
  <text x="200" y="150" text-anchor="middle" font-size="96">${icon}</text>
  ${caption}
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
