import { ReactElement, ReactNode, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Moon, Percent, Sun } from 'lucide-react';
import { useApplyTheme } from './gen/theme';
import { ThemeModeContext, useThemeMode } from './gen/themeModeContext';
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
}

const DEFAULT_MENU: MenuItemDef[] = [{ key: 'home', path: '/', icon: 'home', titleKey: 'page.home' }];

const ICONS: Record<string, ReactNode> = {
  home: <HomeIcon size={18} />,
  percent: <Percent size={18} />,
};

function Shell({ menu = DEFAULT_MENU, title, routes }: AppProps): ReactElement {
  const location = useLocation();
  const appTitle = title ?? t('appTitle');
  return (
    <div className="neudela-shell">
      <header className="neudela-topbar">
        <div className="neudela-topbar__title">{appTitle}</div>
        <ThemeToggle />
      </header>
      <div className="neudela-body">
        <nav className="neudela-sidebar">
          {menu.map((item) => {
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.key} to={item.path} className={`neudela-nav-item${active ? ' is-active' : ''}`}>
                {ICONS[item.icon ?? ''] && <span className="neudela-nav-item__icon">{ICONS[item.icon ?? '']}</span>}
                <span className="neudela-nav-item__label">{t(item.titleKey ?? `page.${item.key}`)}</span>
              </Link>
            );
          })}
        </nav>
        <main className="neudela-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="*" element={<HomePage />} />
            {routes}
          </Routes>
        </main>
      </div>
    </div>
  );
}

function ThemeToggle(): ReactElement {
  const { darkMode, toggle } = useThemeMode();
  return (
    <div className="neudela-theme-toggle">
      {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      <label className="neudela-theme-switch">
        <input type="checkbox" checked={darkMode} onChange={() => toggle()} aria-label="dark mode" />
        <span className="neudela-theme-switch__track" />
      </label>
    </div>
  );
}

export default function App({ menu = DEFAULT_MENU, title, routes }: AppProps): ReactElement {
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    typeof window !== 'undefined' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false) : false,
  );
  useApplyTheme(darkMode);

  return (
    <ThemeModeContext.Provider value={{ darkMode, setDarkMode, toggle: () => setDarkMode((d) => !d) }}>
      <BrowserRouter>
        <Shell menu={menu} title={title} routes={routes} />
      </BrowserRouter>
    </ThemeModeContext.Provider>
  );
}