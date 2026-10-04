'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** In-app notification centre (FR-6.3). */
export default function NotificationsPage() {
  const router = useRouter();
  const { accessToken, authFetch } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref('/notifications'));
      return;
    }
    void authFetch<Notif[]>('/notifications').then(setItems);
  }, [accessToken, authFetch, router]);

  async function markAllRead() {
    const unread = items.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length === 0) return;
    await authFetch('/notifications/read', { method: 'POST', body: { ids: unread } });
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  return (
    <section style={{ padding: '1.5rem 0' }} data-testid="notifications-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Notifications</h1>
        <button className="btn" onClick={markAllRead} data-testid="notifications-mark-read">Mark all read</button>
      </div>
      {items.length === 0 ? (
        <p data-testid="notifications-empty">No notifications.</p>
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'notif read' : 'notif unread'} data-testid={`notif-${n.id}`}>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <span>{new Date(n.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
