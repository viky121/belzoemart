import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Download the Belzo eMart app' };

interface AppVersion {
  version: string;
  apkUrl: string;
  notes: string;
}

/** Reads public/app-version.json (the same file the mobile app checks for updates). */
async function readAppVersion(): Promise<AppVersion | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'app-version.json'), 'utf8');
    const j = JSON.parse(raw) as Partial<AppVersion>;
    if (typeof j.version !== 'string' || !j.version) return null;
    return { version: j.version, apkUrl: j.apkUrl?.trim() ?? '', notes: j.notes?.trim() ?? '' };
  } catch {
    return null;
  }
}

/** Android app download page. The button appears once an APK link is published in app-version.json. */
export default async function DownloadPage() {
  const info = await readAppVersion();
  const ready = Boolean(info?.apkUrl);
  return (
    <section className="cms-page" data-testid="download-page">
      <h1>Belzo eMart for Android</h1>
      <p>Shop faster with the Belzo eMart app: your cart, orders and offers in one place.</p>
      {ready && info ? (
        <>
          <p>
            <a className="btn-buy" href={info.apkUrl} download data-testid="download-apk" style={{ display: 'inline-flex', padding: '0 24px', textDecoration: 'none' }}>
              Download app (v{info.version})
            </a>
          </p>
          {info.notes ? <p>{info.notes}</p> : null}
          <h2>How to install</h2>
          <ul>
            <li>Open the downloaded file on your Android phone.</li>
            <li>If asked, allow installs from this source (Settings, Install unknown apps).</li>
            <li>Tap Install and open Belzo eMart.</li>
          </ul>
        </>
      ) : (
        <p data-testid="download-soon">The app download will be available here soon.</p>
      )}
    </section>
  );
}
