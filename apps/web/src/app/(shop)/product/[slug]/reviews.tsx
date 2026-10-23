import { apiFetch } from '@/lib/api-client';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
}

/**
 * Approved reviews for a product (FR-3.8). Server component fetching the public
 * reviews endpoint. Rendered on the product detail page.
 */
export async function ProductReviews({ productId }: { productId: string }) {
  const reviews = await apiFetch<Review[]>(`/products/${productId}/reviews`, { revalidate: 60 }).catch(
    () => [] as Review[],
  );

  return (
    <div className="pdp__reviews" data-testid="pdp-reviews">
      <h2>Ratings & reviews</h2>
      {reviews.length === 0 ? (
        <p>No reviews yet. Purchase and be the first to review.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="review" data-testid={`review-${r.id}`}>
              <div className="review__head">
                <span className="review__stars" aria-label={`${r.rating} of 5`}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </span>
                {r.verifiedPurchase && <span className="review__verified">Verified purchase</span>}
              </div>
              {r.title && <strong>{r.title}</strong>}
              <p>{r.body}</p>
              <span className="review__helpful">{r.helpfulCount} found this helpful</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
