import type { HomeSection, ProductCardDto } from '@belzo/shared';

import { ProductRail } from '@/ui/ProductRail';

import { useSectionRail } from '../hooks';

export interface HomeRailProps {
  section: HomeSection;
  onPressProduct: (product: ProductCardDto) => void;
  /** Called for sort/category rails only; manual rails hide "View all". */
  onViewAll: (section: HomeSection) => void;
}

/** One home rail with its own products query; renders nothing until it has items (design §11). */
export function HomeRail({ section, onPressProduct, onViewAll }: HomeRailProps) {
  const { data } = useSectionRail(section);
  const products = data ?? [];
  const showViewAll = section.source.type !== 'manual';
  return (
    <ProductRail
      title={section.title}
      products={products}
      onPressProduct={onPressProduct}
      onViewAll={showViewAll ? () => onViewAll(section) : undefined}
    />
  );
}
