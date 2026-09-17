export interface GenConfig {
  apiBase?: string;
  token?: string;
  apiKey?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __GEN_CONFIG__?: GenConfig;
  }
}

let cached: GenConfig | null = null;

function readRuntimeConfig(): GenConfig {
  if (typeof window !== 'undefined' && window.__GEN_CONFIG__) return window.__GEN_CONFIG__;
  return {};
}

/**
 * Konfigurasi runtime app. Nilai secret (token, x-api-key) HANYA lewat
 * window.__GEN_CONFIG__ (disuntik host / alur runtime) — TIDAK pernah dari
 * build-env REACT_APP_* sehingga tidak masuk bundle.
 */
export function getConfig(): GenConfig {
  if (cached === null) {
    cached = readRuntimeConfig();
    if (!cached.apiBase && !cached.token && !cached.apiKey) {
      // guard: app tetap render, API call memakai apiBase kosong (relative = origin app)
      console.warn(
        '[gen/config] window.__GEN_CONFIG__ kosong (tanpa apiBase/token/apiKey) - app tetap render; ' +
          'API call akan memakai base URL kosong.',
      );
    }
  }
  return cached;
}

export function setConfigForTest(cfg: GenConfig): void {
  cached = cfg;
}

export function resetConfigCache(): void {
  cached = null;
}