import { DenseProductCard } from './DenseProductCard';
import { ProductCard, type ProductCardProps } from './ProductCard';

export interface ProductGridCardProps extends ProductCardProps {
  /** True when three products share a row (see useGridColumns): the small card is used. */
  dense: boolean;
}

/** One product in a grid: the compact card for three in a row, the usual card for two. */
export function ProductGridCard({ dense, ...card }: ProductGridCardProps) {
  return dense ? <DenseProductCard {...card} /> : <ProductCard {...card} />;
}
