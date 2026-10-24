'use client';
import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { uploadProfileImage } from '@/lib/customer-upload';

/** Two initials (or one) from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0]!.charAt(0) + (parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '')).toUpperCase();
}

/**
 * Round profile picture with a "Change photo" button. The photo is shrunk in the browser, uploaded, and its
 * address is saved on the profile straight away (PATCH /me), so the next visit shows the same picture.
 */
export function ProfilePhotoEditor({ photoUrl, name, onChanged }: { photoUrl: string | null | undefined; name: string; onChanged: (url: string) => void }) {
  const { accessToken, authFetch } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadProfileImage(file, accessToken ?? undefined);
      const updated = await authFetch<{ photoUrl: string | null }>('/me', { method: 'PATCH', body: { photoUrl: uploaded.url } });
      onChanged(updated.photoUrl ?? uploaded.url);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not update the photo. Please try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const initials = initialsOf(name);
  return (
    <div className="profphoto" data-testid="profile-photo">
      <div className="profphoto__avatar">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Your profile photo" data-testid="profile-photo-img" />
        ) : (
          <span aria-hidden="true">{initials || '👤'}</span>
        )}
      </div>
      <button type="button" className="profphoto__btn" disabled={busy} onClick={() => input.current?.click()} data-testid="profile-photo-change">
        {busy ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add photo'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
        data-testid="profile-photo-input"
      />
      {error && <p role="alert" className="profphoto__err" data-testid="profile-photo-error">{error}</p>}
    </div>
  );
}
