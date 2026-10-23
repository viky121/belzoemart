export const dynamic = 'force-dynamic';

/**
 * Web health page. Confirms the web app renders and can reach the API's
 * readiness endpoint. Useful as a smoke test during deployment.
 */
async function getApiHealth(): Promise<{ reachable: boolean; status?: string }> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/api/v1/health/ready`, { cache: 'no-store' });
    const data = (await res.json()) as { status?: string };
    return { reachable: res.ok, status: data.status };
  } catch {
    return { reachable: false };
  }
}

export default async function HealthPage() {
  const api = await getApiHealth();
  return (
    <main className="container" style={{ padding: '2rem 1rem' }} data-testid="web-health">
      <h1>Web OK</h1>
      <p data-testid="api-health-status">
        API: {api.reachable ? `reachable (${api.status ?? 'unknown'})` : 'unreachable'}
      </p>
    </main>
  );
}
