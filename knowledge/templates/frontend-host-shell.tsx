// ═══════════════════════════════════════════════════════════════════════
// FRONTEND HOST SHELL — GOLDEN TEMPLATE
// ============================================================================
// Cara pakai:
// 1. Copy file ini ke sales-service/frontend/src/App.tsx (atau service baru)
// 2. Cari todo: "TODO: CUSTOMIZE" — ganti sesuai domain baru
// 3. Copas juga frontend-host-shell.css
// 4. Jangan ubah struktur — hanya ganti value
// ============================================================================

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import './App.css';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

// ═══ TODO: CUSTOMIZE — Ganti remoteEntryUrl sesuai domain ═══════════════════
// geographic-address: http://localhost:4017/geographicAddressRemoteEntry.js
// partnership:        http://localhost:4018/partnershipManagementRemoteEntry.js
// sales:              http://localhost:4001/leadRemoteEntry.js
const remoteEntryUrl = 'http://localhost:4001/leadRemoteEntry.js';

const SidebarV2 = lazy(() => import('common_remote/SidebarV2'));
const HeaderBarV2 = lazy(() => import('common_remote/HeaderBarV2'));

const normalizeRemoteModule = (mod: any) => ({
  default: mod?.default ?? mod,
});

// ═══ TODO: CUSTOMIZE — Daftar remote loader sesuai exposes domain ═══════════
const remoteLoaders = {
  PageOne: () => import('your_remote/PageOne').then(normalizeRemoteModule),
  PageTwo: () => import('your_remote/PageTwo').then(normalizeRemoteModule),
  Hub: () => import('your_remote/Hub').then(normalizeRemoteModule),
};

/* ── SVG Icons — 3D filled icons with gradient and shadow ── */
// ═══ IKON INI SUDAH STANDAR — TIDAK PERLU DIUBAH ═══════════════════════════
// DashboardIcon = 4 filled rects dengan gradient — JANGAN ganti dengan stroke-based house

const DashboardIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <filter id="shadow-dash" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
      <linearGradient id="grad-dash" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor: '#4f46e5', stopOpacity: 1}} />
        <stop offset="100%" style={{stopColor: '#2563eb', stopOpacity: 1}} />
      </linearGradient>
    </defs>
    <g filter="url(#shadow-dash)">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="url(#grad-dash)" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="url(#grad-dash)" opacity="0.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="url(#grad-dash)" opacity="0.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="url(#grad-dash)" />
    </g>
  </svg>
);

// ═══ TODO: CUSTOMIZE — Tambah icon untuk setiap menu sidebar ═══════════════
// Pattern: SVG dengan filter shadow + linearGradient, filled path
// CONTOH:
const AddressIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <filter id="shadow-addr" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
      <linearGradient id="grad-addr" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor: '#3b82f6', stopOpacity: 1}} />
        <stop offset="100%" style={{stopColor: '#1d4ed8', stopOpacity: 1}} />
      </linearGradient>
    </defs>
    <g filter="url(#shadow-addr)">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="url(#grad-addr)" opacity="0.85" />
      <circle cx="12" cy="9" r="2.5" fill="#fff" />
    </g>
  </svg>
);

const HubIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <filter id="shadow-hub" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
      <linearGradient id="grad-hub" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor: '#06b6d4', stopOpacity: 1}} />
        <stop offset="100%" style={{stopColor: '#0891b2', stopOpacity: 1}} />
      </linearGradient>
    </defs>
    <g filter="url(#shadow-hub)">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="url(#grad-hub)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

/* ── Navigation structure ── */
// ═══ TODO: CUSTOMIZE — Sesuaikan menu dengan domain ═════════════════════════
// Aturan:
// - GENERAL group: hanya berisi Home (DashboardIcon)
// - Group kedua: nama domain, berisi menu-menu spesifik
// - iconColor Home harus match brandColor

const sidebarNavigationGroups = [
  {
    title: 'GENERAL',
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: 'home', label: 'Home', path: '/', icon: DashboardIcon, iconColor: '#2563eb' },
    ],
  },
  {
    title: 'DOMAIN NAME',               // TODO: GANTI
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: 'resource-one', label: 'Resource One', path: '/resource-one', icon: AddressIcon, iconColor: '#1d4ed8' },
      { id: 'hub', label: 'Event Subscriptions', path: '/hub', icon: HubIcon, iconColor: '#0891b2' },
    ],
  },
];

/* ── Route cards (untuk Dashboard grid) ── */
// ═══ TODO: CUSTOMIZE — Sesuaikan dengan halaman domain ══════════════════════
const routeCards = [
  {
    title: 'Resource One',
    path: '/resource-one',
    summary: 'Description of this resource page.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ic-r1" x1="4" y1="4" x2="20" y2="20"><stop stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></linearGradient></defs><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="url(#ic-r1)" opacity="0.85" /><circle cx="12" cy="9" r="2.5" fill="#fff" /></svg>,
  },
  {
    title: 'Event Subscriptions',
    path: '/hub',
    summary: 'Manage event subscriptions for domain notifications.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ic-hub" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#0891b2" /></linearGradient></defs><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="url(#ic-hub)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
];

/* ── HeaderBarV2 config ── */
// ═══ BAGIAN INI SUDAH STANDAR — TIDAK PERLU DIUBAH ═════════════════════════
const ProfileIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const LogoutIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;

// ═══ TODO: CUSTOMIZE — Sesuaikan user info ══════════════════════════════════
const sidebarUser = {
  name: 'Administrator',
  role: 'Domain Name',         // TODO: ganti
  initials: 'XX',              // TODO: ganti
  avatarColor: '#2563eb',     // TODO: ganti dengan brandColor
};

const headerBarUser = {
  name: 'Administrator',
  email: 'admin@neuronworks.id',
  role: 'Administrator',
  roleColor: '#2563eb',        // TODO: ganti dengan brandColor
  initials: 'XX',              // TODO: ganti
  avatarColor: '#2563eb',      // TODO: ganti dengan brandColor
};

const headerBarDropdownItems = [
  { id: 'profile', label: 'My Profile', icon: ProfileIcon },
  { id: 'logout', label: 'Logout', icon: LogoutIcon, color: '#dc2626' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ═══ BAGIAN BAWAH INI TIDAK PERLU DIUBAH — SUDAH STANDAR UNTUK SEMUA DOMAIN */
/* ═══════════════════════════════════════════════════════════════════════════ */

/* ── Error Boundary ── */
type RemoteRouteBoundaryProps = {
  children: React.ReactNode;
  routeName: string;
  retryToken: number;
  onRetry: () => void;
};

type RemoteRouteBoundaryState = {
  hasError: boolean;
  message: string;
};

class RemoteRouteBoundary extends React.Component<RemoteRouteBoundaryProps, RemoteRouteBoundaryState> {
  constructor(props: RemoteRouteBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): RemoteRouteBoundaryState {
    return { hasError: true, message: error.message || 'Remote module failed to render.' };
  }
  componentDidCatch(error: Error) {
    console.error('Remote route render failure:', error);
  }
  componentDidUpdate(prevProps: RemoteRouteBoundaryProps) {
    if (prevProps.retryToken !== this.props.retryToken && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="remote-shell">
          <div className="remote-error">
            <p className="remote-error__eyebrow">Remote unavailable</p>
            <h3>{this.props.routeName} failed to load</h3>
            <p>Check that this remote app is running on the expected port and exposing the requested module.</p>
            <p>{remoteEntryUrl}</p>
            <p>{this.state.message}</p>
            <button type="button" className="remote-button" onClick={this.props.onRetry}>Retry module load</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Loaders ── */
function RemotePageLoader() {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <div className="app-loader__orbital" aria-hidden="true">
        <div className="app-loader__spinner" />
        <span className="app-loader__pulse app-loader__pulse--one" />
        <span className="app-loader__pulse app-loader__pulse--two" />
      </div>
      <p className="app-loader__title">Preparing ...</p>
      <p className="app-loader__message">Fetching remote module and bootstrapping UI...</p>
      <div className="app-loader__skeleton" aria-hidden="true">
        <span className="app-loader__line app-loader__line--lg" />
        <span className="app-loader__line app-loader__line--md" />
        <span className="app-loader__line app-loader__line--sm" />
      </div>
    </div>
  );
}

/* ── Remote Route Slot ── */
type RemoteRouteSlotProps = Readonly<{
  routeName: string;
  loader: () => Promise<{ default: React.ComponentType<any> }>;
}>;

function RemoteRouteSlot({ routeName, loader }: RemoteRouteSlotProps) {
  const [retryToken, setRetryToken] = useState(0);
  const [LazyPage, setLazyPage] = useState(() => lazy(loader));
  useEffect(() => { setLazyPage(() => lazy(loader)); setRetryToken(0); }, [loader]);
  const handleRetry = () => { setLazyPage(() => lazy(loader)); setRetryToken((v) => v + 1); };
  return (
    <RemoteRouteBoundary routeName={routeName} retryToken={retryToken} onRetry={handleRetry}>
      <Suspense fallback={<RemotePageLoader />}>
        <LazyPage />
      </Suspense>
    </RemoteRouteBoundary>
  );
}

/* ── Dashboard ── */
type HealthStatus = 'checking' | 'healthy' | 'unreachable';

function DashboardPage() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthMessage, setHealthMessage] = useState('Checking remote entry availability...');
  const checkRemoteHealth = async () => {
    setHealthStatus('checking');
    setHealthMessage('Checking remote entry availability...');
    try {
      const response = await fetch(remoteEntryUrl, { method: 'GET', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHealthStatus('healthy');
      setHealthMessage('Remote entry responded successfully and is reachable.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      setHealthStatus('unreachable');
      setHealthMessage(`Remote entry check failed: ${message}`);
    }
  };
  useEffect(() => { void checkRemoteHealth(); }, []);
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h2 className="dashboard__title">Domain Name</h2>
        <p className="dashboard__subtitle">TMFxxx — Federated host consuming domain workflow pages.</p>
      </div>
      <div className="remote-shell">
        <span className="remote-shell__status">
          <span className={`remote-shell__dot${healthStatus === 'unreachable' ? ' remote-shell__dot--error' : ''}`} />
          {healthMessage}
        </span>
        <button type="button" className="remote-button" onClick={() => void checkRemoteHealth()}>Recheck remote entry</button>
      </div>
      <div className="dashboard__section">
        <p className="dashboard__section-title">Apps</p>
        <div className="dashboard__grid">
          {routeCards.map((item) => (
            <NavLink key={item.path} to={item.path} className="dashboard-card">
              <span className="dashboard-card__icon">{item.icon}</span>
              <p className="dashboard-card__title">{item.title}</p>
              <p className="dashboard-card__summary">{item.summary}</p>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="not-found">
      <h2>Route not found</h2>
      <p>Select one of the available routes from the sidebar.</p>
    </div>
  );
}

/* ── App Shell ── */
function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigate = useCallback((path: string) => { navigate(path); }, [navigate]);

  // Sidebar toggle: burger click → mobile vs desktop behavior
  const handleBurgerClick = useCallback(() => {
    if (window.innerWidth <= 767) {
      setMobileOpen(true);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }, []);

  const handleMobileClose = useCallback(() => { setMobileOpen(false); }, []);

  // Responsive resize listener — auto-collapse sidebar
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      if (w <= 767) { setMobileOpen(false); setSidebarCollapsed(false); }
      else if (w <= 1024) { setSidebarCollapsed(true); }
      else { setSidebarCollapsed(false); }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--collapsed' : ''}`}>
      <Suspense fallback={<div className="app-sidebar-placeholder"><div className="sidebar-skeleton sidebar-skeleton--light">{/* skeleton markup */}</div></div>}>
        <SidebarV2
          items={sidebarNavigationGroups}
          brandTitle="Service Name"          // TODO: ganti
          brandSubtitle="TMFxxx Description" // TODO: ganti
          brandColor="#2563eb"               // TODO: ganti dengan brandColor domain
          brandInitials="XX"                 // TODO: ganti
          user={sidebarUser}
          onNavigate={handleNavigate}
          activeItem={location.pathname}
          mobileOpen={mobileOpen}
          onMobileClose={handleMobileClose}
          collapsed={sidebarCollapsed}
        />
      </Suspense>

      <main className="app-content">
        <Suspense fallback={<div className="app-topbar app-topbar--skeleton"><div className="app-topbar__left" /><div className="app-topbar__right" /></div>}>
          <HeaderBarV2
            showSearch
            searchPlaceholder="Search..."   // TODO: ganti
            notificationCount={0}
            user={headerBarUser}
            dropdownItems={headerBarDropdownItems}
            onMobileMenuClick={handleBurgerClick}
            className="app-topbar"
          />
        </Suspense>

        <div className="app-content__inner">
          <div className="app-content__canvas">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              {/* ═══ TODO: CUSTOMIZE — Daftar route sesuai domain ═══════════════ */}
              {/* Semua route HARUS pakai /* wildcard suffix */}
              <Route path="/resource-one/*" element={<RemoteRouteSlot routeName="Resource One" loader={remoteLoaders.PageOne} />} />
              <Route path="/hub/*" element={<RemoteRouteSlot routeName="Event Subscriptions" loader={remoteLoaders.Hub} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
