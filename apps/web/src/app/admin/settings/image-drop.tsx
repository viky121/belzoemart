'use client';

import { useId, useRef, useState } from 'react';
import { adminUpload } from '@/lib/admin-api';
import { isUsableImageUrl } from '@/lib/category-theme';
import { MediaPicker } from '@/components/media-picker';

interface ImageDropProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

/**
 * Reusable drag-and-drop image uploader wrapping `adminUpload(file, 'banners')`.
 * Supports drag-drop and click-to-browse (hidden file input for accessibility),
 * shows an uploading state, accepts image MIME types only, and surfaces upload
 * errors. On success calls `onChange(url)`.
 */
export function ImageDrop({ value, onChange, label }: ImageDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return; // ignore non-images
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminUpload(file, 'banners');
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && (
        <label className="auth-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div
        className={`image-drop${dragOver ? ' image-drop--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
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
          id={inputId}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <span className="prod-form__hint">Uploading…</span>
        ) : (
          <span className="prod-form__hint">Drag &amp; drop an image here, or click to browse</span>
        )}
      </div>
      <button
        type="button"
        className="mediapick__open"
        onClick={() => setPickerOpen(true)}
        data-testid="imagedrop-choose-library"
      >
        Choose from library
      </button>
      {error && <p className="prod-form__msg">{error}</p>}
      {isUsableImageUrl(value) && value !== '#' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" style={{ marginTop: 8, maxHeight: 90, borderRadius: 8 }} />
      )}
      {pickerOpen && (
        <MediaPicker
          folder="banners"
          title="Choose image"
          onSelect={(url) => onChange(url)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
