import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Switch,
  ThemeProvider,
  Toolbar,
  Typography,
} from '@mui/material';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Moon, Percent, Sun } from 'lucide-react';
import { buildTheme } from './gen/theme';
import { ThemeModeContext, useThemeMode } from './gen/themeModeContext';
import { Severity } from './gen/useCrudPage';
import { t } from './gen/i18n';
import HomePage from './pages/Home';

export interface MenuItemDef {
  key: string;
  path: string;
  icon?: string;
  titleKey?: string;
}

export interface AppProps {
  menu?: MenuItemDef[];
  title?: string;
  /** Halaman tambahan dari emitter M4 (Routes children). */
  routes?: ReactNode;
  /** Snackbar callback — page emitters menyambungkannya ke useCrudPage. */
  onSnack?: (message: string, severity: Severity) => void;
}

const DEFAULT_MENU: MenuItemDef[] = [{ key: 'home', path: '/', icon: 'home', titleKey: 'page.home' }];

const ICONS: Record<string, ReactNode> = {
  home: <HomeIcon size={18} />,
  percent: <Percent size={18} />,
};

function Shell({ menu = DEFAULT_MENU, title, routes, notify }: AppProps & { notify: (m: string, s: Severity) => void }): ReactElement {
  const location = useLocation();
  const appTitle = title ?? t('appTitle');

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            {appTitle}
          </Typography>
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      <Drawer variant="permanent" sx={{ width: 240, flexShrink: 0, '& .MuiDrawer-paper': { width: 240, boxSizing: 'border-box' } }}>
        <Toolbar />
        <List>
          {menu.map((item) => {
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <ListItem key={item.key} disablePadding>
                <ListItemButton component={Link} to={item.path} selected={active}>
                  {ICONS[item.icon ?? ''] && <ListItemIcon>{ICONS[item.icon ?? '']}</ListItemIcon>}
                  <ListItemText primary={t(item.titleKey ?? `page.${item.key}`)} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, ml: 0, width: '100%' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<HomePage />} />
          {routes}
        </Routes>
      </Box>
    </Box>
  );
}

function ThemeToggle(): ReactElement {
  const { darkMode, toggle } = useThemeMode();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton size="small" color="inherit" aria-label="mode gelap">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </IconButton>
      <Switch checked={darkMode} onChange={() => toggle()} slotProps={{ input: { 'aria-label': 'dark mode' } }} size="small" />
    </Box>
  );
}

export default function App({ menu = DEFAULT_MENU, title, routes, onSnack }: AppProps): ReactElement {
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    typeof window !== 'undefined' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false) : false,
  );
  const [snack, setSnack] = useState<{ message: string; severity: Severity } | null>(null);

  const theme = useMemo(() => buildTheme(darkMode), [darkMode]);
  const themeMode = useMemo(
    () => ({ darkMode, setDarkMode, toggle: () => setDarkMode((d) => !d) }),
    [darkMode],
  );
  const notify = (message: string, severity: Severity = 'info') => {
    setSnack({ message, severity });
    onSnack?.(message, severity);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ThemeModeContext.Provider value={themeMode}>
        <BrowserRouter>
          <Shell menu={menu} title={title} routes={routes} notify={notify} />
          <Snackbar
            open={snack !== null}
            autoHideDuration={4000}
            onClose={() => setSnack(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Alert severity={snack?.severity ?? 'info'} onClose={() => setSnack(null)} variant="filled">
              {snack?.message}
            </Alert>
          </Snackbar>
        </BrowserRouter>
      </ThemeModeContext.Provider>
    </ThemeProvider>
  );
}
