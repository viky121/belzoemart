import type { ProductParams, SearchParams } from './types';

/** Query key factory (design §6.2). */
export const qk = {
  settings: ['settings', 'public'] as const,
  banners: ['banners', 'home_hero'] as const,
  categories: ['categories'] as const,
  brands: ['brands'] as const,
  products: (p: ProductParams) => ['products', p] as const,
  productsByIds: (ids: string[]) => ['products', 'ids', ids.join(',')] as const,
  product: (idOrSlug: string) => ['product', idOrSlug] as const,
  related: (categoryId: string) => ['products', 'related', categoryId] as const,
  reviews: (productId: string) => ['reviews', productId] as const,
  search: (p: SearchParams) => ['search', p] as const,
  autocomplete: (q: string) => ['autocomplete', q] as const,
  serviceability: (pin: string) => ['serviceability', pin] as const,
  /** identity = session.status === 'authenticated' ? 'customer' : 'guest' (useCartIdentity). */
  cart: (identity: 'customer' | 'guest') => ['cart', identity] as const,
  wishlist: ['wishlist'] as const,
  me: ['me'] as const,
  addresses: ['addresses'] as const,
  preview: (addressId: string, coupon: string | null | undefined, method: string) =>
    ['checkout', 'preview', addressId, coupon ?? '', method] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  notifications: ['notifications'] as const,
  cmsPages: ['cms', 'pages'] as const,
  cmsPage: (slug: string) => ['cms', 'page', slug] as const,
  dataRequests: ['dpdp', 'requests'] as const,
};

/** Per-key staleTime overrides (design §6.1). */
export const STALE = {
  default: 30_000,
  catalogue: 10 * 60_000, // categories, brands, CMS pages
  settings: 2 * 60_000, // settings/public, banners
  product: 60_000,
  cart: 0,
  orders: 30_000,
} as const;
