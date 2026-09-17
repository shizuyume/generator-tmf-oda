import { useEffect } from 'react';
import { genThemeDark, genThemeLight } from './theme.generated';
import 'neudela/styles.css';

/**
 * Neudela theme dari tokens FE spec (ui.theme.tokens) — data CSS variables di-
 * generate scaffold-time oleh generator/libs/neudela.adapter.js (theme.generated.ts).
 * Tema diterapkan sebagai <style> blok di document + toggle class `.dark-theme` di <body>
 * (pola tokens.css neudela). Runtime app meng-import neudela/styles.css (stylesheet penuh).
 */
function cssText(blocks: Record<string, Record<string, string>>): string {
  return Object.entries(blocks)
    .map(([sel, vars]) => `${sel}{${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')}}`)
    .join('');
}

export function buildTheme(darkMode: boolean): void {
  let style = document.getElementById('neudela-gen-theme') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'neudela-gen-theme';
    document.head.appendChild(style);
  }
  style.textContent = cssText(darkMode ? genThemeDark : genThemeLight);
  document.body.classList.toggle('dark-theme', darkMode);
}

export function useApplyTheme(darkMode: boolean): void {
  useEffect(() => {
    buildTheme(darkMode);
  }, [darkMode]);
}