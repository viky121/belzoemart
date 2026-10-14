import { apiFetch } from './api-client';

/** A CMS banner as returned by the public `/banners` endpoint. */
export interface BannerDto {
  id: string;
  placement: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  displayOrder: number;
}

/** Public CMS reads for the storefront (banners, etc.). */
export const contentApi = {
  /** Active banners for a placement (default: home hero carousel). */
  banners: (placement = 'home_hero') =>
    apiFetch<BannerDto[]>(`/banners?placement=${encodeURIComponent(placement)}`, {
      revalidate: 120,
    }),
};
