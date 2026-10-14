'use client';

/**
 * Browser-side image downscaling/compression for admin uploads.
 *
 * Why: the API caps uploads (15 MB). A phone photo is often 4-12 MB, and when
 * the server rejects an oversized body mid-stream the browser surfaces a raw
 * `net::ERR_CONNECTION_RESET` instead of the real 413 — which looked like a
 * broken upload. Shrinking the image client-side keeps bodies small, uploads
 * fast, and avoids that failure entirely.
 *
 * Behaviour:
 * - Only touches large raster photos (jpeg/png/webp over `compressOverBytes`).
 * - Leaves small images, SVGs and GIFs (possibly animated) untouched so
 *   transparent category icons keep their alpha channel.
 * - Downscales to fit `maxDim` on the longest edge and re-encodes as JPEG.
 */
export interface CompressOptions {
  /** Longest-edge pixel cap. Default 1600 (plenty for product cards/zoom). */
  maxDim?: number;
  /** JPEG quality 0..1. Default 0.82. */
  quality?: number;
  /** Only compress files larger than this. Default 1.5 MB. */
  compressOverBytes?: number;
}

const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/;

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;
  const threshold = opts.compressOverBytes ?? 1.5 * 1024 * 1024;

  if (typeof window === 'undefined') return file;
  if (!COMPRESSIBLE.test(file.type)) return file; // keep svg/gif intact
  if (file.size <= threshold) return file; // small icons: leave as-is (keeps PNG alpha)

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // decode failed — upload original and let the server decide
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, maxDim / longest);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // White matte so transparent PNGs don't turn black when flattened to JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob || blob.size >= file.size) return file; // no win — keep original

  const name = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
