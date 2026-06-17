/**
 * Client for the QCut license-server's /api/sandbox/spawn endpoint.
 *
 * Auth: pass the user's QCut session token (`QCUT_AUTH_TOKEN` returned
 * by `qcut system login`, persisted in this app's auth store).
 *
 * @module features/qcut-sandbox/api/sandbox-client
 */

export type ResourceClass = 'standard' | 'large';

export interface SpawnResponse {
  session_id: string;
  ws_url: string;
  expires_at: string;
  cost_credits?: number;
  remaining_credits?: number;
}

const LICENSE_SERVER_URL =
  import.meta.env.VITE_QCUT_LICENSE_SERVER_URL ??
  'https://qcut-license-server.zdhpeter.workers.dev';

export async function spawnSandbox(
  qcutAuthToken: string,
  resource_class: ResourceClass = 'standard',
): Promise<SpawnResponse> {
  const r = await fetch(`${LICENSE_SERVER_URL}/api/sandbox/spawn`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qcutAuthToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resource_class }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`spawn_failed: ${r.status} ${text.slice(0, 200)}`);
  }
  return (await r.json()) as SpawnResponse;
}
