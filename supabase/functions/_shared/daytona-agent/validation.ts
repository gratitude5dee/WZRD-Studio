import type { CreateSessionRequest, PtyTokenRequest } from './types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_RE = /^[^/\\\0]{1,255}$/;

export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    return typeof body === 'object' && body !== null ? (body as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export async function parseCreateSessionRequest(req: Request): Promise<CreateSessionRequest> {
  const body = await parseJsonBody<Record<string, unknown>>(req);
  const projectId = normalizeOptionalUuid(body.projectId);
  return {
    projectId,
    forceNew: body.forceNew === true,
  };
}

export async function parsePtyTokenRequest(req: Request): Promise<PtyTokenRequest> {
  const body = await parseJsonBody<Record<string, unknown>>(req);
  const sessionId = normalizeRequiredUuid(body.sessionId, 'sessionId');
  return { sessionId };
}

export function parseFileListRequest(url: URL): { sessionId: string; path: string } {
  return {
    sessionId: normalizeRequiredUuid(url.searchParams.get('sessionId'), 'sessionId'),
    path: normalizeSandboxPath(url.searchParams.get('path') || '/tmp/wzrd-output'),
  };
}

export function normalizeOptionalUuid(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return normalizeRequiredUuid(value, 'id');
}

export function normalizeRequiredUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new Error(`${label}_invalid`);
  }
  return value.trim();
}

export function normalizeSandboxPath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('sandbox_path_invalid');
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new Error('sandbox_path_invalid');
  }
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('sandbox_path_invalid');
  }
  return `/${segments.join('/')}`;
}

export function normalizeFilename(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('filename_invalid');
  }
  const base = value.split(/[\\/]/).pop()?.trim() ?? '';
  if (!SAFE_FILENAME_RE.test(base) || base === '.' || base === '..') {
    throw new Error('filename_invalid');
  }
  return base;
}

export function joinSandboxPath(dir: string, filename: string): string {
  return dir === '/' ? `/${filename}` : `${dir}/${filename}`;
}
