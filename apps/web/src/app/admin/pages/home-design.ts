import {
  HOME_LAYOUT_MAX,
  MOBILE_LIMITS,
  homeBlockSchema,
  homeSectionsSchema,
  layoutItemId,
  mobileOfferRowSchema,
  moveLayoutItem,
  promoContentSchema,
  whyItemSchema,
  type HomeBlock,
  type HomeLayoutItem,
  type HomeLayoutKind,
  type HomeSection,
  type MobileOfferRow,
  type PromoContent,
  type WhyItem,
} from '@belzo/shared';

/** Everything the Home page design editor works on (the same shape the API returns and accepts). */
export interface DesignState {
  layout: HomeLayoutItem[];
  productSections: HomeSection[];
  offerRows: MobileOfferRow[];
  blocks: HomeBlock[];
  promos: PromoContent[];
  why: WhyItem[];
}

export const LIMITS = {
  productSections: 24,
  offerRows: MOBILE_LIMITS.offerRows,
  blocks: 10,
  promos: 12,
  why: 12,
  cards: 12,
} as const;

const isRepeat = (k: HomeLayoutKind) => k === 'offers' || k === 'products' || k === 'block';

/** Whether a section is currently shown on the website. */
export function isOn(state: DesignState, item: HomeLayoutItem): boolean {
  if (item.kind === 'offers') return state.offerRows.find((r) => r.id === item.refId)?.enabled ?? false;
  if (item.kind === 'products') return state.productSections.find((s) => s.id === item.refId)?.enabled ?? false;
  if (item.kind === 'block') {
    const b = state.blocks.find((x) => x.id === item.refId);
    return !!b && b.enabled !== false;
  }
  return item.enabled;
}

/** Show/hide a section. Built-ins are switched in the layout; added sections through their own flag. */
export function setOn(state: DesignState, id: string, on: boolean): DesignState {
  const item = state.layout.find((i) => i.id === id);
  if (!item) return state;
  if (item.kind === 'offers') {
    return { ...state, offerRows: state.offerRows.map((r) => (r.id === item.refId ? { ...r, enabled: on } : r)) };
  }
  if (item.kind === 'products') {
    return { ...state, productSections: state.productSections.map((s) => (s.id === item.refId ? { ...s, enabled: on } : s)) };
  }
  if (item.kind === 'block') {
    return { ...state, blocks: state.blocks.map((b) => (b.id === item.refId ? { ...b, enabled: on } : b)) };
  }
  return { ...state, layout: state.layout.map((i) => (i.id === id ? { ...i, enabled: on } : i)) };
}

/** Drag a section from one position to another. */
export function moveSection(state: DesignState, from: number, to: number): DesignState {
  const layout = moveLayoutItem(state.layout, from, to);
  return layout === state.layout ? state : { ...state, layout };
}

/** Only sections an admin added can be deleted (the built-in ones can be switched off). */
export function canRemove(state: DesignState, item: HomeLayoutItem): boolean {
  if (!isRepeat(item.kind)) return false;
  // The product rails fall back to the defaults when none are saved, so keep at least one (switch it off instead).
  if (item.kind === 'products') return state.productSections.length > 1;
  return true;
}

export function removeSection(state: DesignState, id: string): DesignState {
  const item = state.layout.find((i) => i.id === id);
  if (!item || !canRemove(state, item)) return state;
  const layout = state.layout.filter((i) => i.id !== id);
  if (item.kind === 'offers') return { ...state, layout, offerRows: state.offerRows.filter((r) => r.id !== item.refId) };
  if (item.kind === 'products') {
    return { ...state, layout, productSections: state.productSections.filter((s) => s.id !== item.refId) };
  }
  return { ...state, layout, blocks: state.blocks.filter((b) => b.id !== item.refId) };
}

export type AddKind = 'products' | 'offers' | 'banner' | 'cards';

export const ADD_OPTIONS: { kind: AddKind; icon: string; label: string; hint: string }[] = [
  { kind: 'products', icon: '🛍️', label: 'Product section', hint: 'A row of products (best sellers, a category, hand-picked…)' },
  { kind: 'offers', icon: '🏷️', label: 'Offer banners', hint: 'One or more picture banners, 1–3 per line' },
  { kind: 'banner', icon: '🖼️', label: 'Banner with text', hint: 'A picture with a heading, text and a button' },
  { kind: 'cards', icon: '🗂️', label: 'Info cards', hint: 'A grid of small cards with an icon and a link' },
];

/** Add a section at the end of the page. Returns the new state and the new section's layout id, or an error. */
export function addSection(
  state: DesignState,
  kind: AddKind,
  newId: () => string,
): { state: DesignState; id: string } | { error: string } {
  if (state.layout.length >= HOME_LAYOUT_MAX) return { error: 'The home page cannot have more sections.' };
  const refId = newId();
  if (kind === 'products') {
    if (state.productSections.length >= LIMITS.productSections) return { error: `At most ${LIMITS.productSections} product sections.` };
    const section: HomeSection = {
      id: refId,
      title: 'New product section',
      source: { type: 'sort', sort: 'discount' },
      limit: 12,
      enabled: true,
    };
    const id = layoutItemId('products', refId);
    return {
      id,
      state: {
        ...state,
        productSections: [...state.productSections, section],
        layout: [...state.layout, { id, kind: 'products', refId, enabled: true }],
      },
    };
  }
  if (kind === 'offers') {
    if (state.offerRows.length >= LIMITS.offerRows) return { error: `At most ${LIMITS.offerRows} offer rows.` };
    const row: MobileOfferRow = {
      id: refId,
      title: '',
      columns: 2,
      position: 'after_categories',
      banners: [],
      enabled: true,
      showOn: 'both',
    };
    const id = layoutItemId('offers', refId);
    return {
      id,
      state: {
        ...state,
        offerRows: [...state.offerRows, row],
        layout: [...state.layout, { id, kind: 'offers', refId, enabled: true }],
      },
    };
  }
  if (state.blocks.length >= LIMITS.blocks) return { error: `At most ${LIMITS.blocks} banner / card blocks.` };
  const block: HomeBlock =
    kind === 'banner'
      ? { type: 'banner', id: refId, title: '', text: '', imageUrl: '', ctaText: '', ctaHref: '#', enabled: true }
      : { type: 'cards', id: refId, title: '', cards: [], enabled: true };
  const id = layoutItemId('block', refId);
  return {
    id,
    state: {
      ...state,
      blocks: [...state.blocks, block],
      layout: [...state.layout, { id, kind: 'block', refId, enabled: true }],
    },
  };
}

export interface ItemInfo {
  icon: string;
  title: string;
  subtitle: string;
  /** Whether the section has anything to edit in the designer. */
  editable: boolean;
}

const SORT_LABEL: Record<string, string> = {
  discount: 'biggest discount',
  newest: 'newest',
  popularity: 'most popular',
  rating: 'top rated',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Name and one-line summary of a section, for the list. */
export function itemInfo(state: DesignState, item: HomeLayoutItem): ItemInfo {
  switch (item.kind) {
    case 'hero':
      return { icon: '🖼️', title: 'Main banner', subtitle: 'The big slider at the top', editable: true };
    case 'categories':
      return { icon: '🗂️', title: 'Shop by Category', subtitle: 'Circles for your categories', editable: true };
    case 'promos':
      return { icon: '🎯', title: 'Promo tiles', subtitle: plural(state.promos.length, 'tile'), editable: true };
    case 'brands':
      return { icon: '🏷️', title: 'Top Brands', subtitle: 'Brand logos', editable: true };
    case 'why':
      return { icon: '⭐', title: 'Why choose us', subtitle: plural(state.why.length, 'point'), editable: true };
    case 'offers': {
      const r = state.offerRows.find((x) => x.id === item.refId);
      if (!r) return { icon: '🏷️', title: 'Offer banners', subtitle: '', editable: false };
      const shown = r.banners.length;
      return {
        icon: '🏷️',
        title: r.title || 'Offer banners',
        subtitle: `${plural(shown, 'banner')} · ${r.columns} per line`,
        editable: true,
      };
    }
    case 'products': {
      const s = state.productSections.find((x) => x.id === item.refId);
      if (!s) return { icon: '🛍️', title: 'Product section', subtitle: '', editable: false };
      const src =
        s.source.type === 'sort'
          ? SORT_LABEL[s.source.sort] ?? s.source.sort
          : s.source.type === 'category'
            ? 'from a category'
            : `${plural(s.source.productIds.length, 'hand-picked product')}`;
      return { icon: '🛍️', title: s.title, subtitle: `${src} · up to ${s.limit}`, editable: true };
    }
    case 'block': {
      const b = state.blocks.find((x) => x.id === item.refId);
      if (!b) return { icon: '🖼️', title: 'Block', subtitle: '', editable: false };
      return b.type === 'banner'
        ? { icon: '🖼️', title: b.title || 'Banner with text', subtitle: 'Picture, text and button', editable: true }
        : { icon: '🗂️', title: b.title || 'Info cards', subtitle: plural(b.cards.length, 'card'), editable: true };
    }
  }
}

/** Why the design can't be saved yet (first problem, in plain words), or null. */
export function validateDesign(state: DesignState): string | null {
  const sections = homeSectionsSchema.safeParse(state.productSections);
  if (!sections.success) {
    const i = sections.error.issues[0]!;
    const idx = typeof i.path[0] === 'number' ? state.productSections[i.path[0]]?.title : undefined;
    return `Product section${idx ? ` “${idx}”` : ''}: ${i.message}`;
  }
  const manual = state.productSections.find((s) => s.source.type === 'category' && !s.source.categoryId);
  if (manual) return `Product section “${manual.title}”: choose a category.`;
  for (const r of state.offerRows) {
    const p = mobileOfferRowSchema.safeParse(r);
    if (!p.success) {
      const issue = p.error.issues[0]!;
      const needsImage = issue.path.includes('imageUrl');
      return `Offer banners${r.title ? ` “${r.title}”` : ''}: ${needsImage ? 'every banner needs an image (or remove the empty banner).' : issue.message}`;
    }
  }
  for (const b of state.blocks) {
    const p = homeBlockSchema.safeParse(b);
    if (!p.success) return `Block${b.title ? ` “${b.title}”` : ''}: ${p.error.issues[0]!.message}`;
  }
  for (const p of state.promos) {
    const r = promoContentSchema.safeParse(p);
    if (!r.success) return `Promo tile${p.title ? ` “${p.title}”` : ''}: a title is required.`;
  }
  if (state.promos.length === 0) return 'Keep at least one promo tile (or switch the whole section off).';
  for (const w of state.why) {
    if (!whyItemSchema.safeParse(w).success) return 'Why choose us: every point needs a title.';
  }
  if (state.why.length === 0) return 'Keep at least one “why choose us” point (or switch the section off).';
  return null;
}

/** The body sent to the server. */
export function designPayload(state: DesignState): DesignState {
  return {
    layout: state.layout.map((i) => ({ ...i })),
    productSections: state.productSections,
    offerRows: state.offerRows,
    blocks: state.blocks,
    promos: state.promos,
    why: state.why,
  };
}

/** True when `a` and `b` would save differently. */
export function isDirty(a: DesignState | null, b: DesignState | null): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
