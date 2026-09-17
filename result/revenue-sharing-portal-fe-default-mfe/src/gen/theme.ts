import { useEffect } from 'react';
import { genThemeDark, genThemeLight } from './theme.generated';

/**
 * fe-default theme dari tokens FE spec (ui.theme.tokens) — CSS variables di-generate
 * scaffold-time oleh generator/libs/fe-default.adapter.js (theme.generated.ts).
 * Tema diterapkan sebagai <style> blok di document + toggle atribut `data-theme="dark"`
 * di <html> (pola example-component-in-dashboard.html toggleTheme()). Base variables +
 * [data-accent] tetap datang dari src/gen/tokens.css (committed, statis).
 */
function cssText(blocks: Record<string, Record<string, string>>): string {
  return Object.entries(blocks)
    .map(([sel, vars]) => `${sel}{${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')}}`)
    .join('');
}

export function buildTheme(darkMode: boolean): void {
  let style = document.getElementById('gen-theme') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'gen-theme';
    document.head.appendChild(style);
  }
  style.textContent = cssText(darkMode ? genThemeDark : genThemeLight);
  document.documentElement.dataset.theme = darkMode ? 'dark' : '';
}

export function useApplyTheme(darkMode: boolean): void {
  useEffect(() => {
    buildTheme(darkMode);
  }, [darkMode]);
}
