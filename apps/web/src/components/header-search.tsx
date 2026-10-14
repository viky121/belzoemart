'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductCardDto } from '@belzo/shared';
import { catalogueApi, formatInr } from '@/lib/catalogue-api';

/** Header search with live product suggestions dropdown. */
export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductCardDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced live search as the user types.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const data = await catalogueApi.search(
          new URLSearchParams({ q: term, pageSize: '6' }).toString(),
        );
        setResults(data.items);
        setActive(-1);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    setOpen(false);
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  function go(slug: string) {
    setOpen(false);
    setQ('');
    router.push(`/product/${slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        go(results[active].slug);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const showDropdown = open && results.length > 0;

  return (
    <div className="header-search-wrap" ref={boxRef}>
      <form onSubmit={submit} className="header-search" role="search">
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for products, brands and more"
          aria-label="Search"
          autoComplete="off"
          data-testid="header-search-input"
        />
        <button type="submit" className="header-search__btn" aria-label="Search">
          🔍
        </button>
      </form>

      {showDropdown && (
        <div className="search-suggest" data-testid="search-suggest">
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`search-suggest__item${i === active ? ' is-active' : ''}`}
              onClick={() => go(p.slug)}
              onMouseEnter={() => setActive(i)}
              data-testid={`suggest-${p.slug}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="search-suggest__img" loading="lazy" />
              ) : (
                <span className="search-suggest__img search-suggest__img--ph" aria-hidden />
              )}
              <span className="search-suggest__title">{p.title}</span>
              <span className="search-suggest__price">{formatInr(p.sellingPrice)}</span>
            </button>
          ))}
          <Link
            href={`/search?q=${encodeURIComponent(q.trim())}`}
            className="search-suggest__all"
            onClick={() => setOpen(false)}
          >
            See all results for “{q.trim()}”
          </Link>
        </div>
      )}
    </div>
  );
}
