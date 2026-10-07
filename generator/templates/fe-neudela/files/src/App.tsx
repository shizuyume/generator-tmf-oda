import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NeuronToggle } from 'neudela';
import './App.css';
import './app/theme.css'; // per-app token / layout overrides (generated), after the template styles
import { BRAND, NAV_ITEMS, THEME_STORAGE_KEY } from './app/shell';

// Full-app shell: topbar + sidebar + routes + dark mode, from src/app/shell.tsx. Pages are
// mounted through the same createProtectedPage-wrapped exposes a host would consume, so the
// shell is the only part that would be dropped if this app is federated later.

function readInitialDarkMode(): boolean {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) return saved === 'dark';
  } catch {
    // storage unavailable (private mode) — fall through to the OS preference
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Applies the theme to <html> and <body> in one style flush with every CSS transition off.
 * neudela components animate background/colour/border (≈150–200ms) while the shell does
 * not, so without this the page switched first and the components faded in after it.
 * `.dark-theme` sits on <html> too: the page scrollbar and color-scheme belong to the root.
 */
function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.classList.toggle('dark-theme', dark);
  document.body.classList.toggle('dark-theme', dark);
  void root.offsetHeight; // force the restyle while transitions are disabled
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function Shell({ darkMode, onDarkModeChange }: Readonly<{ darkMode: boolean; onDarkModeChange: (dark: boolean) => void }>) {
  const location = useLocation();

  return (
    <div className="lab-shell">
      <header className="lab-topbar">
        <div className="lab-topbar__brand">
          <span className="lab-topbar__logo" aria-hidden="true">{BRAND.logoLetter}</span>
          <div>
            <div className="lab-topbar__title">{BRAND.title}</div>
            <div className="lab-topbar__caption">{BRAND.caption}</div>
          </div>
        </div>
        <NeuronToggle size="sm" checked={darkMode} onChange={onDarkModeChange} label="Dark mode" />
      </header>

      <div className="lab-body">
        <nav className="lab-sidebar" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `lab-nav-item${isActive ? ' is-active' : ''}`}
            >
              <span className="lab-nav-item__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="lab-content">
          <Routes>
            {NAV_ITEMS.map(({ path, page: Page, remountOnNav }) => (
              // key: re-clicking the nav item returns from the detail view to the list
              <Route key={path} path={path} element={remountOnNav ? <Page key={location.key} /> : <Page />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(readInitialDarkMode);

  // before paint, so no frame ever shows the old theme next to the new one
  // (index.html already set it on first load — this keeps it in sync afterwards)
  useLayoutEffect(() => {
    applyTheme(darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // not persisted — the toggle still works for this session
    }
  }, [darkMode]);

  // The whole page cross-fades in one go via the View Transitions API when available;
  // flushSync makes React commit (and the layout effect apply the theme) inside the
  // transition callback, so the new snapshot already has the new theme.
  const changeTheme = useCallback((dark: boolean) => {
    if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
      setDarkMode(dark);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setDarkMode(dark));
    });
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell darkMode={darkMode} onDarkModeChange={changeTheme} />
    </BrowserRouter>
  );
}
