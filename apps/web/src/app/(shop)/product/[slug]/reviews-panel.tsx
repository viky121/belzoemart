'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { uploadReviewImage } from '@/lib/customer-upload';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
  imagesJson?: string[];
}

const MAX_REVIEW_IMAGES = 5;

/** Customer reviews: rating summary + histogram + write-a-review + list. */
export function ReviewsPanel({
  productId,
  ratingAvg,
  ratingCount,
}: {
  productId: string;
  ratingAvg: number;
  ratingCount: number;
}) {
  const { accessToken, authFetch } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    // Review photo upload requires a logged-in customer. Without a token the
    // API returns 401 — surface the real reason instead of blaming image size.
    if (!accessToken) {
      setMsg('login');
      return;
    }
    setMsg(null);
    setUploading(true);
    try {
      for (const f of files) {
        if (images.length >= MAX_REVIEW_IMAGES) break;
        const { url } = await uploadReviewImage(f, accessToken);
        setImages((cur) => (cur.length < MAX_REVIEW_IMAGES ? [...cur, url] : cur));
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const load = useCallback(async () => {
    const r = await apiFetch<Review[]>(`/products/${productId}/reviews`).catch(() => [] as Review[]);
    setReviews(r);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Histogram from loaded (approved) reviews; falls back to the denormalised count.
  const total = reviews.length || ratingCount;
  const dist = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : ratingAvg;

  async function submit() {
    setMsg(null);
    if (!accessToken) {
      setMsg('login');
      return;
    }
    if (body.trim().length < 3) {
      setMsg('Please write a few words about the product.');
      return;
    }
    setBusy(true);
    try {
      await authFetch('/reviews', {
        method: 'POST',
        body: {
          productId,
          rating,
          title: title.trim() || undefined,
          body: body.trim(),
          images: images.length ? images : undefined,
        },
      });
      setMsg('Thanks! Your review was submitted and will appear once approved.');
      setTitle('');
      setBody('');
      setRating(5);
      setImages([]);
      setShowForm(false);
    } catch {
      setMsg('Could not submit your review. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rvw" data-testid="pdp-reviews">
      <div className="rvw__summary">
        <div className="rvw__score">
          <span className="rvw__avg">{avg.toFixed(1)}</span>
          <span className="rvw__stars" aria-hidden="true">
            {'★'.repeat(Math.round(avg))}
            {'☆'.repeat(5 - Math.round(avg))}
          </span>
          <span className="rvw__count">{total.toLocaleString('en-IN')} reviews</span>
        </div>
        <div className="rvw__bars">
          {dist.map((d) => (
            <div key={d.star} className="rvw__bar">
              <span className="rvw__bar-label">{d.star} ★</span>
              <span className="rvw__bar-track">
                <span className="rvw__bar-fill" style={{ width: `${d.pct}%` }} />
              </span>
              <span className="rvw__bar-pct">{d.pct}%</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="rvw__write-btn"
          onClick={() => setShowForm((s) => !s)}
          data-testid="review-write-toggle"
        >
          ✍️ Write a Review
        </button>
      </div>

      {showForm && (
        <div className="rvw__form" data-testid="review-form">
          <label className="rvw__form-label">Your rating</label>
          <div className="rvw__rate">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`rvw__rate-star${n <= rating ? ' is-on' : ''}`}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            className="auth-input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="review-title"
          />
          <textarea
            className="auth-input rvw__textarea"
            placeholder="Share your experience with this product…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            data-testid="review-body"
          />

          <label className="rvw__form-label">Add photos (optional)</label>
          <div className="rvw__photos">
            {images.map((url, i) => (
              <div className="rvw__photo" key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
            {images.length < MAX_REVIEW_IMAGES && (
              <label className={`rvw__photo-add${uploading ? ' is-busy' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImages}
                  disabled={uploading}
                  data-testid="review-images"
                  hidden
                />
                {uploading ? '…' : '＋'}
              </label>
            )}
          </div>
          <p className="rvw__photo-hint">Up to {MAX_REVIEW_IMAGES} photos · JPG or PNG · optional</p>

          <button className="rvw__submit" onClick={submit} disabled={busy || uploading} data-testid="review-submit">
            {busy ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      )}

      {msg === 'login' ? (
        <p className="rvw__msg">
          Please <Link href="/login">log in</Link> to write a review.
        </p>
      ) : (
        msg && <p className="rvw__msg">{msg}</p>
      )}

      {reviews.length === 0 ? (
        <p className="rvw__empty">No reviews yet. Be the first to review this product.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="review" data-testid={`review-${r.id}`}>
              <div className="review__head">
                <span className="review__stars" aria-label={`${r.rating} of 5`}>
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </span>
                {r.verifiedPurchase && <span className="review__verified">Verified purchase</span>}
              </div>
              {r.title && <strong>{r.title}</strong>}
              <p>{r.body}</p>
              {Array.isArray(r.imagesJson) && r.imagesJson.length > 0 && (
                <div className="review__photos">
                  {r.imagesJson.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Review photo" />
                    </a>
                  ))}
                </div>
              )}
              <span className="review__helpful">{r.helpfulCount} found this helpful</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
