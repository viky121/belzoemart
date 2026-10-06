'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminListMedia, adminUpload, type MediaItem } from '@/lib/admin-api';
import { formatMediaDate, formatMediaSize, sortMediaItems } from './media-picker-utils';

type Folder = 'products' | 'banners' | 'categories' | 'brands' | 'misc';
const FOLDER_OPTS: Folder[] = ['products', 'banners', 'categories', 'brands', 'misc'];

interface MediaPickerProps {
  /** Default folder to list / upload into. */
  folder?: Folder;
  /** Called with the chosen image URL. The caller sets a field or appends. */
  onSelect: (url: string) => void;
  /** Close the modal (overlay click, Escape, Cancel, or after a selection). */
  onClose: () => void;
  title?: string;
}

/**
 * Reusable image picker modal. Two tabs: a Library of already-uploaded server
 * images (with details) to pick from, and an Upload tab (drag-and-drop + click)
 * that reuses `adminUpload`. Selecting returns the image URL to the caller.
 * Listing degrades gracefully — when none is available the Upload tab is shown
 * with a note, so uploading always works.
 */
export function MediaPicker({ folder = 'misc', onSelect, onClose, title }: MediaPickerProps) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [filter, setFilter] = useState<Folder | ''>(folder);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(false);
    try {
      const res = await adminListMedia(filter || undefined);
      setItems(sortMediaItems(res.items));
    } catch {
      setListError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function choose(item: MediaItem) {
    setSelected(item);
    onSelect(item.url);
    onClose();
  }

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { url } = await adminUpload(file, filter || folder);
      // Refresh the library so the new image appears, then select + close.
      await refresh().catch(() => undefined);
      setSelected({
        key: url,
        url,
        folder: filter || folder,
        name: file.name,
        size: file.size,
        lastModified: new Date().toISOString(),
      });
      onSelect(url);
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const emptyLibrary = !loading && items.length === 0;

  return (
    <div
      className="pm-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Choose image'}
      data-testid="media-picker"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pm-modal__card mediapick__card">
        <div className="mediapick__head">
          <h3>{title ?? 'Choose image'}</h3>
          <button type="button" className="mediapick__close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mediapick__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'library'}
            className={`mediapick__tab${tab === 'library' ? ' is-on' : ''}`}
            onClick={() => setTab('library')}
            data-testid="media-picker-tab-library"
          >
            Library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            className={`mediapick__tab${tab === 'upload' ? ' is-on' : ''}`}
            onClick={() => setTab('upload')}
            data-testid="media-picker-tab-upload"
          >
            Upload new
          </button>
        </div>

        {tab === 'library' && (
          <div className="mediapick__body">
            <div className="mediapick__filter">
              <label className="auth-label" htmlFor="mediapick-folder">
                Folder
              </label>
              <select
                id="mediapick-folder"
                className="auth-input"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Folder | '')}
                data-testid="media-picker-folder"
              >
                <option value="">All folders</option>
                {FOLDER_OPTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="prod-form__hint">Loading images…</p>
            ) : listError || emptyLibrary ? (
              <p className="prod-form__hint" data-testid="media-picker-empty">
                {listError
                  ? 'Image listing is unavailable here — switch to “Upload new” to add an image.'
                  : 'No images found in this folder — switch to “Upload new” to add one.'}
              </p>
            ) : (
              <div className="mediapick__grid" data-testid="media-picker-grid">
                {items.map((it) => (
                  <button
                    type="button"
                    key={it.key}
                    className="mediapick__tile"
                    onClick={() => choose(it)}
                    title={`${it.name} — pick this image`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt={it.name} className="mediapick__thumb" />
                    <span className="mediapick__meta">
                      <span className="mediapick__name">{it.name}</span>
                      <span className="mediapick__sub">
                        {it.folder || '—'} · {formatMediaSize(it.size)} · {formatMediaDate(it.lastModified)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'upload' && (
          <div className="mediapick__body">
            <div
              className={`image-drop${dragOver ? ' image-drop--over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file && !uploading) void upload(file);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                data-testid="media-picker-upload-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = '';
                }}
              />
              <span className="prod-form__hint">
                {uploading ? 'Uploading…' : 'Drag & drop an image here, or click to browse'}
              </span>
            </div>
            {uploadError && <p className="prod-form__msg">{uploadError}</p>}
          </div>
        )}

        {selected && (
          <div className="mediapick__selected">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt="" />
            <span>{selected.name}</span>
          </div>
        )}

        <div className="pm-modal__actions">
          <button type="button" className="admin-inline-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
