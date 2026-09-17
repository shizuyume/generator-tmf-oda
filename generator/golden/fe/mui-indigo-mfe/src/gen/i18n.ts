import { labels as generatedLabels } from './i18n.generated';

export const lang: string = generatedLabels.lang ?? 'id';

/** Label single-language v1 — dict di-inject scaffold-time dari YAML (i18n.generated.ts). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = generatedLabels[key] ?? FALLBACK[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => String(vars[name] ?? m));
}

// Fallback lokal bila key tidak ada di dict YAML — app tetap render, tidak crash.
const FALLBACK: Record<string, string> = {
  lang: 'id',
  appTitle: 'Aplikasi',
  'page.home': 'Beranda',
};