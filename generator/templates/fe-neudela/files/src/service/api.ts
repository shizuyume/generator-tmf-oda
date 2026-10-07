/**
 * Generic API service layer following the product-qualification pattern.
 * Uses TMF630 pagination (offset/limit, X-Total-Count header).
 *
 * Same as design-lab/revenue-sharing-algorithm except env access: Vite exposes
 * VITE_* via import.meta.env (no REACT_APP_* / process.env). API_BASE_URL defaults
 * to same-origin because the Vite dev server proxies /tmf-api (see vite.config.ts).
 * The API base path comes from src/app/env.ts (per app).
 */
import { TMF_BASE } from '../app/env';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY = import.meta.env.VITE_API_KEY ?? '';

export interface ListParams {
  offset?: number;
  limit?: number;
  fields?: string;
  /** string[] repeats the query key (several filters on one attribute, ANDed). */
  [key: string]: string | number | string[] | undefined;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  resultCount: number;
}

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, message: string, body?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  return headers;
}

type QueryParams = Record<string, string | number | string[] | undefined>;

function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    // an array repeats the key (`name=a&name=b`) — conditions on the same attribute are ANDed
    const values = Array.isArray(value) ? value : [value];
    values.forEach((v) => {
      if (v !== undefined && v !== '') {
        searchParams.append(key, String(v));
      }
    });
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(
  endpoint: string,
  options: { method?: string; body?: any; params?: QueryParams } = {},
): Promise<{ data: T; headers: Headers }> {
  const { method = 'GET', body, params } = options;
  const url = `${API_BASE_URL}${TMF_BASE}${endpoint}${buildQueryString(params)}`;

  const response = await fetch(url, {
    method,
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.message || errorBody.error || `HTTP ${response.status}`,
      errorBody,
    );
  }

  if (method === 'DELETE') {
    // 202 = Accepted (async task-based delete), 204 = Deleted (sync immediate)
    return { data: { accepted: response.status === 202 } as unknown as T, headers: response.headers };
  }

  // 202 Accepted (an async PATCH) carries no body
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : undefined;
  return { data, headers: response.headers };
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string | undefined>): Promise<T> {
  const { data } = await request<T>(endpoint, { params });
  return data;
}

export async function apiGetList<T>(
  endpoint: string,
  params?: QueryParams,
): Promise<{ data: T[]; total: number; resultCount: number }> {
  const { data, headers } = await request<T[]>(endpoint, { params });
  const total = Number(headers.get('X-Total-Count') ?? headers.get('x-total-count') ?? data.length);
  const resultCount = Number(headers.get('X-Result-Count') ?? headers.get('x-result-count') ?? data.length);
  return { data, total, resultCount };
}

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  const { data } = await request<T>(endpoint, { method: 'POST', body });
  return data;
}

export async function apiPatch<T>(endpoint: string, body: any): Promise<T> {
  const { data } = await request<T>(endpoint, { method: 'PATCH', body });
  return data;
}

export async function apiDelete(endpoint: string): Promise<{ accepted: boolean }> {
  const { data } = await request<{ accepted: boolean }>(endpoint, { method: 'DELETE' });
  return data;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
