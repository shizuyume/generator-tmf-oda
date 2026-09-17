import { createContext, useContext } from 'react';

export interface ThemeModeValue {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggle: () => void;
}

export const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function useThemeMode(): ThemeModeValue {
  const value = useContext(ThemeModeContext);
  if (!value) throw new Error('useThemeMode harus dipakai di dalam <ThemeModeContext.Provider>');
  return value;
}
