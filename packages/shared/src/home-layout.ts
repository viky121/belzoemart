import { z } from 'zod';

/**
 * Order of the sections on the website home page ("Home page design" in Admin → Pages).
 *
 * The layout is only an ordered list. What each section shows lives where it always did
 * (product sections in `home.sections`, offer banners in the Mobile app offer rows, banner/card
 * blocks, promo tiles and "why choose" items in the home content), so the app and website keep
 * sharing that content and nothing needs to be migrated.
 */

/** Sections that exist exactly once on the home page. */
export const HOME_SINGLETON_KINDS = ['hero', 'categories', 'promos', 'brands', 'why'] as const;
/** Sections an admin can add any number of (each points at one content entry by `refId`). */
export const HOME_REPEAT_KINDS = ['offers', 'products', 'block'] as const;
export const HOME_LAYOUT_KINDS = [...HOME_SINGLETON_KINDS, ...HOME_REPEAT_KINDS] as const;

export type HomeSingletonKind = (typeof HOME_SINGLETON_KINDS)[number];
export type HomeRepeatKind = (typeof HOME_REPEAT_KINDS)[number];
export type HomeLayoutKind = (typeof HOME_LAYOUT_KINDS)[number];

export const homeLayoutItemSchema = z.object({
  /** Unique within the layout: the kind for a singleton, `<kind>:<refId>` for a repeatable. */
  id: z.string().min(1).max(100),
  kind: z.enum(HOME_LAYOUT_KINDS),
  /** The content entry a repeatable section shows (offer row id, product section id, block id). */
  refId: z.string().min(1).max(64).optional(),
  /**
   * On/off for a singleton. For a repeatable the content entry's own `enabled` flag decides
   * (it is shared with the app), and this value is ignored.
   */
  enabled: z.boolean().default(true),
});
export type HomeLayoutItem = z.infer<typeof homeLayoutItemSchema>;

export const HOME_LAYOUT_MAX = 60;
export const homeLayoutSchema = z.array(homeLayoutItemSchema).max(HOME_LAYOUT_MAX);

const isRepeat = (k: HomeLayoutKind): k is HomeRepeatKind => (HOME_REPEAT_KINDS as readonly string[]).includes(k);

export const layoutItemId = (kind: HomeLayoutKind, refId?: string): string =>
  isRepeat(kind) ? `${kind}:${refId ?? ''}` : kind;

/** The content entries that exist right now (just what the layout needs to know about them). */
export interface HomeLayoutContent {
  /** Offer-banner rows; `position` only seeds the default order. */
  offerRows: { id: string; position: 'after_hero' | 'after_categories' | 'after_deals'; enabled: boolean }[];
  sections: { id: string; enabled: boolean }[];
  blocks: { id: string; enabled: boolean }[];
}

/** Keep only well-formed items, with unique ids and the id that matches kind/refId. */
export function sanitizeHomeLayout(value: unknown): HomeLayoutItem[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: HomeLayoutItem[] = [];
  for (const entry of raw) {
    const r = homeLayoutItemSchema.safeParse(entry);
    if (!r.success) continue;
    const item = r.data;
    if (isRepeat(item.kind) && !item.refId) continue;
    const id = layoutItemId(item.kind, item.refId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...item, id, ...(isRepeat(item.kind) ? {} : { refId: undefined }) });
  }
  return out.slice(0, HOME_LAYOUT_MAX);
}

const single = (kind: HomeSingletonKind): HomeLayoutItem => ({ id: kind, kind, enabled: true });
const repeat = (kind: HomeRepeatKind, refId: string): HomeLayoutItem => ({
  id: layoutItemId(kind, refId),
  kind,
  refId,
  enabled: true,
});

/**
 * The order the home page has always had, used until an admin saves a layout:
 * main banner, offers under it, categories, offers under them, promo tiles, custom blocks,
 * product sections, offers under the sections, brands, why choose us.
 */
export function defaultHomeLayout(content: HomeLayoutContent): HomeLayoutItem[] {
  const offers = (pos: HomeLayoutContent['offerRows'][number]['position']) =>
    content.offerRows.filter((r) => r.position === pos).map((r) => repeat('offers', r.id));
  return [
    single('hero'),
    ...offers('after_hero'),
    single('categories'),
    ...offers('after_categories'),
    single('promos'),
    ...content.blocks.map((b) => repeat('block', b.id)),
    ...content.sections.map((s) => repeat('products', s.id)),
    ...offers('after_deals'),
    single('brands'),
    single('why'),
  ];
}

/**
 * The complete, ready-to-render layout.
 *  - No saved layout → the default order.
 *  - Items pointing at content that no longer exists are dropped.
 *  - Content that exists but isn't in the saved layout (added elsewhere, e.g. a new offer row
 *    in the Mobile app module) is placed after the last section of its kind, or at the end.
 *  - A repeatable section is on or off according to its content entry; a singleton according to
 *    the layout.
 */
export function resolveHomeLayout(stored: unknown, content: HomeLayoutContent): HomeLayoutItem[] {
  const saved = sanitizeHomeLayout(stored);
  const base = saved.length > 0 ? saved : defaultHomeLayout(content);

  const enabledOf: Record<HomeRepeatKind, Map<string, boolean>> = {
    offers: new Map(content.offerRows.map((r) => [r.id, r.enabled])),
    products: new Map(content.sections.map((s) => [s.id, s.enabled])),
    block: new Map(content.blocks.map((b) => [b.id, b.enabled])),
  };

  const items: HomeLayoutItem[] = [];
  for (const it of base) {
    if (isRepeat(it.kind)) {
      const on = enabledOf[it.kind].get(it.refId!);
      if (on === undefined) continue; // its content is gone
      items.push({ ...it, enabled: on });
    } else {
      items.push(it);
    }
  }

  const has = new Set(items.map((i) => i.id));
  const insertAfterLastOfKind = (item: HomeLayoutItem) => {
    let at = -1;
    items.forEach((x, i) => {
      if (x.kind === item.kind) at = i;
    });
    items.splice(at >= 0 ? at + 1 : items.length, 0, item);
    has.add(item.id);
  };

  for (const kind of HOME_SINGLETON_KINDS) if (!has.has(kind)) insertAfterLastOfKind(single(kind));
  for (const r of content.offerRows) if (!has.has(layoutItemId('offers', r.id))) insertAfterLastOfKind({ ...repeat('offers', r.id), enabled: r.enabled });
  for (const s of content.sections) if (!has.has(layoutItemId('products', s.id))) insertAfterLastOfKind({ ...repeat('products', s.id), enabled: s.enabled });
  for (const b of content.blocks) if (!has.has(layoutItemId('block', b.id))) insertAfterLastOfKind({ ...repeat('block', b.id), enabled: b.enabled });

  return items;
}

/** What the website renders, in order: the resolved layout without switched-off sections. */
export function visibleHomeLayout(stored: unknown, content: HomeLayoutContent): HomeLayoutItem[] {
  return resolveHomeLayout(stored, content).filter((i) => i.enabled);
}

/** Move the item at `from` so it ends up at index `to` (clamped); returns a new list. */
export function moveLayoutItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}
