'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface Review {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  imagesJson?: string[];
  status: ReviewStatus;
  helpfulCount: number;
  createdAt: string;
  product?: { id: string; title: string; slug: string } | null;
}

type Filter = 'all' | ReviewStatus;

const STATUS_META: Record<ReviewStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'admin-status--warn' },
  approved: { label: 'Approved', cls: 'admin-status--ok' },
  rejected: { label: 'Rejected', cls: 'admin-status--bad' },
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

/** Admin review moderation — lists every review with its status (FR-3.8). */
export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setReviews(await adminFetch<Review[]>('/admin/reviews').catch(() => []));
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function moderate(id: string, action: 'approve' | 'reject') {
    await adminFetch(`/admin/reviews/${id}/moderate`, { method: 'PATCH', body: { action } });
    setMsg(`Review ${action}d.`);
    void load();
  }

  const counts = useMemo(() => {
    const c = { all: reviews.length, pending: 0, approved: 0, rejected: 0 } as Record<Filter, number>;
    for (const r of reviews) c[r.status] += 1;
    return c;
  }, [reviews]);

  const visible = useMemo(
    () => (filter === 'all' ? reviews : reviews.filter((r) => r.status === filter)),
    [reviews, filter],
  );

  return (
    <div data-testid="admin-reviews">
      <h1>Review Moderation</h1>
      <p className="admin-subtitle">
        Every customer review and its status. Approve to show it on the storefront, or reject to hide it.
      </p>
      {msg && (
        <p role="status" data-testid="reviews-msg" className="admin-success">
          {msg}
        </p>
      )}

      <div className="rvw-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`rvw-filter${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
            data-testid={`filter-${f.key}`}
          >
            {f.label} <span className="rvw-filter__count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-empty">Loading reviews…</div>
      ) : visible.length === 0 ? (
        <div className="admin-empty" data-testid="reviews-empty">
          {filter === 'all' ? 'No reviews yet.' : `No ${filter} reviews.`}
        </div>
      ) : (
        <section className="admin-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Verified</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ minWidth: 140 }}>
                    {r.product ? (
                      <a href={`/product/${r.product.slug}`} target="_blank" rel="noreferrer">
                        {r.product.title}
                      </a>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>#{r.productId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td style={{ color: '#f5a623', whiteSpace: 'nowrap' }}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </td>
                  <td>
                    {r.title ? <strong>{r.title} </strong> : null}
                    {r.body}
                    {Array.isArray(r.imagesJson) && r.imagesJson.length > 0 && (
                      <div className="rvw-admin-photos">
                        {r.imagesJson.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt="" />
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.verifiedPurchase ? (
                      <span className="admin-status admin-status--ok">Verified</span>
                    ) : (
                      <span className="admin-status">No</span>
                    )}
                  </td>
                  <td>
                    <span className={`admin-status ${STATUS_META[r.status].cls}`}>
                      {STATUS_META[r.status].label}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.8rem' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    {r.status !== 'approved' && (
                      <button onClick={() => moderate(r.id, 'approve')} data-testid={`approve-${r.id}`}>
                        Approve
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button
                        className="admin-btn--danger"
                        onClick={() => moderate(r.id, 'reject')}
                        data-testid={`reject-${r.id}`}
                      >
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
