'use client';

import { useId } from 'react';

export interface LinkCategory {
  slug: string;
  label: string;
}

type Mode = 'none' | 'category' | 'search' | 'custom';

function modeOf(value: string, cats: LinkCategory[]): Mode {
  if (!value || value === '#') return 'none';
  const m = /^\/category\/([^/?#]+)$/.exec(value);
  if (m && cats.some((c) => c.slug === m[1])) return 'category';
  if (value.startsWith('/search?q=')) return 'search';
  return 'custom';
}

/**
 * "Where does this banner go?" picker. Produces an in-app path the mobile app
 * understands (/category/<slug>, /search?q=…, /product/<slug>, /orders …) or a
 * full https:// URL. '#' means not tappable.
 */
export function LinkField({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: LinkCategory[];
}) {
  const id = useId();
  const mode = modeOf(value, categories);

  const setMode = (m: Mode) => {
    if (m === 'none') onChange('#');
    else if (m === 'category') onChange(categories[0] ? `/category/${categories[0].slug}` : '#');
    else if (m === 'search') onChange('/search?q=');
    else onChange(mode === 'custom' ? value : '/');
  };

  return (
    <div className="mh-link">
      <label className="auth-label" htmlFor={id}>
        Tap action
      </label>
      <select id={id} className="auth-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
        <option value="none">Nothing (image only)</option>
        <option value="category">Open a category</option>
        <option value="search">Search for…</option>
        <option value="custom">Custom link</option>
      </select>

      {mode === 'category' && (
        <select
          className="auth-input"
          aria-label="Category"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.slug} value={`/category/${c.slug}`}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {mode === 'search' && (
        <input
          className="auth-input"
          aria-label="Search text"
          placeholder="e.g. atta"
          value={decodeURIComponent(value.replace('/search?q=', ''))}
          onChange={(e) => onChange(`/search?q=${encodeURIComponent(e.target.value)}`)}
        />
      )}
      {mode === 'custom' && (
        <>
          <input
            className="auth-input"
            aria-label="Custom link"
            placeholder="/product/<slug> · /search?sort=discount · https://…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="prod-form__hint">
            Use an app path like /product/&lt;slug&gt;, /orders, /wishlist or a full https:// link.
          </span>
        </>
      )}
    </div>
  );
}
