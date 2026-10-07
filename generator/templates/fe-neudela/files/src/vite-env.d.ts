/// <reference types="vite/client" />

// Env vars every generated app reads; the relation lookups' base URLs (src/app/lookups.ts)
// go through vite/client's index signature.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
