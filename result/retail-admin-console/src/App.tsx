import { ReactElement, ReactNode, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Building2, Home as HomeIcon, Moon, Percent, Sun } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { Sidebar } from './components/Sidebar';
import { NavItem } from './components/NavItem';
import { Topbar } from './components/Topbar';
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
  /** Halaman tambahan dari emitter (Routes children). */
  routes?: ReactNode;
}

const DEFAULT_MENU: MenuItemDef[] = [{ key: 'home', path: '/', icon: 'home', titleKey: 'page.home' }];

const ICONS: Record<string, ReactNode> = {
  home: <HomeIcon size={18} strokeWidth={1.75} />,
  percent: <Percent size={18} strokeWidth={1.75} />,
  building2: <Building2 size={18} strokeWidth={1.75} />,
};

function Shell({ menu = DEFAULT_MENU, title, routes }: AppProps): ReactElement {
  const location = useLocation();
  const appTitle = title ?? t('appTitle');
  return (
    <AppShell
      sidebar={
        <Sidebar
          logo={
            <div className="flex items-center gap-2 font-bold tracking-tight text-text-primary">
              <span className="grid h-[30px] w-[30px] place-items-center rounded-md bg-app-brand-strong text-white">
                {appTitle.charAt(0).toUpperCase()}
              </span>
              <span className="text-[17px]">{appTitle}</span>
            </div>
          }
          sectionLabel="Workspace"
        >
          {menu.map((item) => {
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavItem
                key={item.key}
                to={item.path}
                icon={ICONS[item.icon ?? '']}
                label={t(item.titleKey ?? `page.${item.key}`)}
                active={active}
              />
            );
          })}
        </Sidebar>
      }
      topbar={<Topbar searchPlaceholder="Cari..." right={<ThemeToggle />} />}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<HomePage />} />
        {routes}
      </Routes>
    </AppShell>
  );
}

function ThemeToggle(): ReactElement {
  const { darkMode, toggle } = useThemeMode();
  return (
    <button
      type="button"
      onClick={() => toggle()}
      aria-label="mode gelap"
      title="Theme"
      className="grid h-[34px] w-[34px] place-items-center rounded-md text-text-secondary hover:bg-app-surface-secondary hover:text-text-primary"
    >
      {darkMode ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
    </button>
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
