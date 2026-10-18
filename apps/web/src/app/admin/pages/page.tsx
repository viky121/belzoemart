'use client';

import { useState } from 'react';
import { HomeDesigner } from './home-designer';
import { PagesManager } from './pages-manager';

type Tab = 'pages' | 'home';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pages', label: 'Pages', icon: '📄' },
  { id: 'home', label: 'Home page design', icon: '🧩' },
];

/**
 * Admin "Pages": the website's text pages (About, Contact, policies…) and the design of the
 * home page (order and content of its sections).
 */
export default function AdminPagesPage() {
  const [tab, setTab] = useState<Tab>('pages');
  return (
    <div className="admin-page" data-testid="admin-pages-module">
      <h1>📄 Pages</h1>
      <div className="mh-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mh-tab${tab === t.id ? ' mh-tab--on' : ''}`}
            onClick={() => setTab(t.id)}
            data-testid={`pages-tab-${t.id}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'pages' ? <PagesManager /> : <HomeDesigner />}
    </div>
  );
}
