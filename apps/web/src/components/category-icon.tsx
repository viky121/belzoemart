import type { ReactNode } from 'react';

/**
 * Flipkart-style line icons for category navigation. Thin stroke line-art on a
 * transparent background (inherits `currentColor`), with the "For You" bag
 * rendered as a filled Flipkart-yellow mark. Icons are resolved from a category
 * slug or name via keyword matching, with a shopping-bag fallback.
 */

type IconKey =
  | 'for-you'
  | 'fashion'
  | 'mobiles'
  | 'electronics'
  | 'beauty'
  | 'home'
  | 'appliances'
  | 'toys'
  | 'food'
  | 'auto'
  | 'sports'
  | 'furniture'
  | 'books'
  | 'twowheeler'
  | 'handicraft'
  | 'grocery'
  | 'truck'
  | 'bag';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Inner SVG markup per icon (24x24 viewBox). */
const PATHS: Record<IconKey, ReactNode> = {
  fashion: (
    <path
      d="M9 3.5l3 2 3-2 5 3.5-2.6 2.8V20.5H5.6V9.8L3 7z"
      {...STROKE}
    />
  ),
  mobiles: (
    <>
      <rect x="7.5" y="2.5" width="9" height="19" rx="2.2" {...STROKE} />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" {...STROKE} />
    </>
  ),
  electronics: (
    <>
      <rect x="5.5" y="5" width="13" height="9" rx="1.2" {...STROKE} />
      <path d="M3.5 18.5l1.6-2.2h13.8l1.6 2.2z" {...STROKE} />
    </>
  ),
  appliances: (
    <>
      <rect x="4" y="5" width="16" height="10.5" rx="1.4" {...STROKE} />
      <path d="M9 19.5h6" {...STROKE} />
      <line x1="12" y1="15.5" x2="12" y2="19.5" {...STROKE} />
    </>
  ),
  beauty: (
    <>
      <rect x="9" y="9" width="6" height="12.5" rx="1" {...STROKE} />
      <path d="M9.6 9l1-4.4 3.1 1L13 9" {...STROKE} />
    </>
  ),
  home: (
    <>
      <path d="M9 3h6l2.2 6.2H6.8z" {...STROKE} />
      <line x1="12" y1="9.2" x2="12" y2="18" {...STROKE} />
      <path d="M9.5 18h5" {...STROKE} />
      <path d="M8 21.5h8" {...STROKE} />
    </>
  ),
  toys: (
    <>
      <circle cx="12" cy="7.5" r="3" {...STROKE} />
      <circle cx="8.4" cy="5.2" r="1.6" {...STROKE} />
      <circle cx="15.6" cy="5.2" r="1.6" {...STROKE} />
      <path d="M8 12h8v4.5a4 4 0 01-8 0z" {...STROKE} />
    </>
  ),
  food: (
    <path
      d="M10 2.5h4v2.8l1 2.2v12a1.2 1.2 0 01-1.2 1.2h-3.6A1.2 1.2 0 019 19.5v-12l1-2.2z"
      {...STROKE}
    />
  ),
  grocery: (
    <>
      <path d="M4 7h16l-1.4 12.5H5.4z" {...STROKE} />
      <path d="M8.5 7a3.5 3.5 0 017 0" {...STROKE} />
    </>
  ),
  auto: (
    <>
      <path d="M4.5 15l1.8-5.2h11.4L19.5 15" {...STROKE} />
      <path d="M3.5 15h17v3.2h-17z" {...STROKE} />
      <circle cx="7.5" cy="18.4" r="1.6" {...STROKE} />
      <circle cx="16.5" cy="18.4" r="1.6" {...STROKE} />
    </>
  ),
  sports: (
    <path
      d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"
      {...STROKE}
    />
  ),
  furniture: (
    <>
      <path d="M5 11V9.5A2 2 0 017 7.5h10a2 2 0 012 2V11" {...STROKE} />
      <rect x="4" y="11" width="16" height="6" rx="2" {...STROKE} />
      <path d="M6 17v2.5M18 17v2.5" {...STROKE} />
    </>
  ),
  books: (
    <>
      <path d="M6 3.5h11a1.5 1.5 0 011.5 1.5v15.5H7.5A1.5 1.5 0 016 20z" {...STROKE} />
      <line x1="9" y1="3.5" x2="9" y2="20.5" {...STROKE} />
    </>
  ),
  twowheeler: (
    <>
      <circle cx="6" cy="16.5" r="2.8" {...STROKE} />
      <circle cx="18" cy="16.5" r="2.8" {...STROKE} />
      <path d="M8.8 16.5h6l1.9-7.5H19" {...STROKE} />
      <path d="M15 9l-2 7.5" {...STROKE} />
      <path d="M6 8.5h3l1 2.5" {...STROKE} />
    </>
  ),
  handicraft: (
    <>
      <path d="M9 3.5h6" {...STROKE} />
      <path d="M10 3.5c0 2.2-2 3-2 6a4 4 0 108 0c0-3-2-3.8-2-6" {...STROKE} />
      <path d="M8.2 13c0 4 1.2 7.5 3.8 7.5s3.8-3.5 3.8-7.5" {...STROKE} />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h11v9H3z" {...STROKE} />
      <path d="M14 9.5h3.6l2.9 3v3H14z" {...STROKE} />
      <circle cx="7" cy="17.5" r="1.6" {...STROKE} />
      <circle cx="17" cy="17.5" r="1.6" {...STROKE} />
    </>
  ),
  bag: (
    <>
      <path d="M6.5 8h11l-1.1 12.5H7.6z" {...STROKE} />
      <path d="M9 8a3 3 0 016 0" {...STROKE} />
    </>
  ),
  // Line-art bag using currentColor so it follows active/inactive coloring like
  // every other category (dark when inactive, blue when active).
  'for-you': (
    <>
      <path d="M6.5 8h11l-1.1 12.5H7.6z" {...STROKE} />
      <path d="M9 8a3 3 0 016 0" {...STROKE} />
    </>
  ),
};

/** Keyword → icon key. Order matters (first match wins). */
const RULES: [RegExp, IconKey][] = [
  [/for.?you|home-?feed/, 'for-you'],
  [/apparel|fashion|cloth|dress|shirt|wear/, 'fashion'],
  [/mobile|phone|smartphone/, 'mobiles'],
  [/electronic|laptop|computer|gadget/, 'electronics'],
  [/appliance|tv|television/, 'appliances'],
  [/beauty|cosmetic|makeup|personal.?care/, 'beauty'],
  [/grocer|supermarket|daily/, 'grocery'],
  [/food|kitchen|snack|staple/, 'food'],
  [/toy|kids|baby/, 'toys'],
  [/auto|car|vehicle.*part/, 'auto'],
  [/sport|fitness|gym|outdoor/, 'sports'],
  [/furnitur|sofa|decor/, 'furniture'],
  [/book|stationery/, 'books'],
  [/wheeler|scooter|bike|motorc/, 'twowheeler'],
  [/handicraft|craft|artisan|pottery|handmade/, 'handicraft'],
  [/track|order|deliver|shipping/, 'truck'],
  [/home|living/, 'home'],
];

export function resolveCategoryIcon(nameOrSlug: string): IconKey {
  const hay = nameOrSlug.toLowerCase();
  for (const [re, key] of RULES) if (re.test(hay)) return key;
  return 'bag';
}

export interface CategoryIconProps {
  /** Category slug or name (e.g. "apparel", "For You"). */
  name: string;
  /** Explicit icon key overrides keyword resolution. */
  icon?: IconKey;
  size?: number;
  className?: string;
}

/** Render a Flipkart-style category icon. */
export function CategoryIcon({ name, icon, size = 26, className }: CategoryIconProps) {
  const key = icon ?? resolveCategoryIcon(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${name} icon`}
      focusable="false"
    >
      {PATHS[key]}
    </svg>
  );
}
