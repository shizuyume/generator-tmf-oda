import { createTheme, Theme } from '@mui/material/styles';
import { genThemeDark, genThemeLight } from './theme.generated';

/**
 * MUI theme dari tokens FE spec (ui.theme.tokens) — data tema di-generate
 * scaffold-time oleh generator/libs/mui.adapter.js (theme.generated.ts),
 * createTheme di-instansiasi di runtime app. Dark = colorSchemes.dark.
 */
export function buildTheme(darkMode: boolean): Theme {
  return createTheme(darkMode ? genThemeDark : genThemeLight);
}