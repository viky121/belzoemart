'use client';

import { useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';

interface CategoryNode {
  id: string;
  name: string;
}
interface Brand {
  id: string;
  name: string;
}

const toPaise = (rupees: string) => Math.round(parseFloat(rupees || '0') * 100);

/** Full "Add product" form: details + first variant + images, optional publish. */
export function AddProductForm({
  categories,
  brands,
  onCreated,
}: {
  categories: CategoryNode[];
  brands: Brand[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [brandId, setBrandId] = useState('');
  const [description, setDescription] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('5');
  const [images, setImages] = useState<string[]>([]);
  const [sku, setSku] = useState('');
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [publish, setPublish] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const { url } = await adminUpload(f, 'products');
        setImages((cur) => [...cur, url]);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function reset() {
    setTitle('');
    setBrandId('');
    setDescription('');
    setHsnCode('');
    setTaxRatePct('5');
    setImages([]);
    setSku('');
    setMrp('');
    setPrice('');
    setStock('');
    setPublish(true);
  }

  async function submit() {
    setMsg(null);
    if (!title || !categoryId) {
      setMsg('Title and category are required.');
      return;
    }
    const wantVariant = Boolean(sku && mrp && price);
    if (publish && !wantVariant) {
      setMsg('To publish, add the first variant (SKU, MRP, selling price).');
      return;
    }
    if (wantVariant && toPaise(price) > toPaise(mrp)) {
      setMsg('Selling price cannot exceed MRP.');
      return;
    }
    setBusy(true);
    try {
      // 1. Create the product (draft).
      const product = await adminFetch<{ id: string }>('/admin/products', {
        method: 'POST',
        body: {
          title,
          categoryId,
          brandId: brandId || undefined,
          description: description || undefined,
          hsnCode: hsnCode || undefined,
          taxRatePct: Number(taxRatePct) || 0,
        },
      });

      // 2. Images (gallery).
      if (images.length > 0) {
        await adminFetch(`/admin/products/${product.id}/images`, {
          method: 'PUT',
          body: { images: images.map((url) => ({ url })) },
        });
      }

      // 3. First variant + stock.
      if (wantVariant) {
        const variant = await adminFetch<{ id: string }>('/admin/variants', {
          method: 'POST',
          body: { productId: product.id, sku, mrp: toPaise(mrp), sellingPrice: toPaise(price) },
        });
        const qty = parseInt(stock || '0', 10);
        if (qty > 0) {
          await adminFetch(`/admin/inventory/${variant.id}/adjust`, {
            method: 'POST',
            body: { delta: qty, ref: 'initial-stock' },
          });
        }
      }

      // 4. Publish.
      if (publish && wantVariant) {
        await adminFetch(`/admin/products/${product.id}/status`, {
          method: 'PATCH',
          body: { status: 'published' },
        });
      }

      setMsg(`"${title}" saved${publish && wantVariant ? ' and published' : ' as draft'}.`);
      reset();
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not create product.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prod-form" data-testid="add-product-form">
      <h2>Add product</h2>
      {msg && <p className="prod-form__msg" role="status">{msg}</p>}

      <div className="prod-grid">
        <div className="prod-grid__full">
          <label className="auth-label">Title *</label>
          <input className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="catalogue-title" />
        </div>
        <div>
          <label className="auth-label">Category *</label>
          <select className="auth-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="catalogue-category">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="auth-label">Brand</label>
          <select className="auth-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">— none —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="auth-label">HSN code</label>
          <input className="auth-input" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 6109" />
        </div>
        <div>
          <label className="auth-label">GST %</label>
          <input className="auth-input" type="number" min={0} max={28} value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
        </div>
        <div className="prod-grid__full">
          <label className="auth-label">Description</label>
          <textarea className="auth-input prod-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="prod-section">
        <label className="auth-label">Images</label>
        <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} data-testid="product-images" />
        {uploading && <span className="prod-form__hint"> Uploading…</span>}
        {images.length > 0 && (
          <div className="prod-thumbs">
            {images.map((url, i) => (
              <div className="prod-thumb" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prod-section">
        <h3 className="prod-subhead">First variant &amp; stock</h3>
        <div className="prod-grid">
          <div>
            <label className="auth-label">SKU</label>
            <input className="auth-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="TSHIRT-BLK-M" />
          </div>
          <div>
            <label className="auth-label">MRP (₹)</label>
            <input className="auth-input" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </div>
          <div>
            <label className="auth-label">Selling price (₹)</label>
            <input className="auth-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="auth-label">Stock qty</label>
            <input className="auth-input" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        </div>
      </div>

      <label className="prod-publish">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        Publish immediately (needs a variant)
      </label>

      <button className="auth-btn prod-save" onClick={submit} disabled={busy} data-testid="catalogue-create">
        {busy ? 'Saving…' : 'Create product'}
      </button>
    </div>
  );
}
