import { getConfig } from './config';

export interface ApiEnvelope<T = unknown> {
  status: number;
  data: T | null;
  total?: number; // dari header X-Total-Count (server-mode grid)
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
}

/**
 * Fetch wrapper: base URL dari gen.config.apiBase (runtime), header dinamis
 * x-api-key / Authorization dari gen.config — secret TIDAK pernah di-bundle.
 * Parse X-Total-Count; 204 → data null; non-2xx → ApiError {status, message}.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const cfg = getConfig();
  const url = new URL(`${cfg.apiBase ?? ''}${path}`, window.location.origin);

  const params = options.params ?? {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey; // kontrak BE ApiKeyGuard
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return { status: 204, data: null };

  const totalRaw = res.headers.get('X-Total-Count');
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  const envelope: ApiEnvelope<T> = {
    status: res.status,
    data: data as T,
    ...(totalRaw !== null ? { total: Number(totalRaw) } : {}),
  };

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return envelope;
}
