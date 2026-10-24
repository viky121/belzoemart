'use client';

import { useState } from 'react';
import { ProductImage } from './product-image';

interface GalleryImage {
  url: string;
  alt: string;
}

/** PDP gallery: a large main image that swaps when a thumbnail is selected. */
export function ProductGallery({
  images,
  fallback,
  title,
}: {
  images: GalleryImage[];
  fallback: string;
  title: string;
}) {
  const list = images.length > 0 ? images : [{ url: '', alt: title }];
  const [sel, setSel] = useState(0);
  const current = list[Math.min(sel, list.length - 1)];

  // Hover zoom (mouse only): magnify the image around the cursor, like other
  // e-commerce stores. Touch devices keep the normal image.
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setOrigin(`${x}% ${y}%`);
    if (!zooming) setZooming(true);
  }

  return (
    <div className="pdp__gallery">
      <div
        className={`pdp__hero${zooming ? ' is-zooming' : ''}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setZooming(false)}
        data-testid="pdp-zoom"
      >
        <div
          className="pdp__zoom"
          style={{ transformOrigin: origin, transform: zooming ? 'scale(2.2)' : 'scale(1)' }}
        >
          <ProductImage
            key={sel}
            src={current.url || null}
            fallback={fallback}
            alt={current.alt || title}
            className="pdp__hero-img"
            testId="pdp-image"
          />
        </div>
      </div>
      <p className="pdp__zoom-hint">Hover over the image to zoom</p>
      {list.length > 1 && (
        <div className="pdp__thumbs">
          {list.map((img, i) => (
            <button
              key={i}
              type="button"
              className={`pdp__thumb${i === sel ? ' pdp__thumb--active' : ''}`}
              onClick={() => setSel(i)}
              onPointerEnter={(e) => {
                // Hover-to-preview is for mouse only; on touch, a tap selects via onClick.
                if (e.pointerType === 'mouse') setSel(i);
              }}
              aria-label={`View image ${i + 1}`}
              data-testid={`pdp-thumb-${i}`}
            >
              <ProductImage src={img.url || null} fallback={fallback} alt={img.alt} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
