# Frontend — Pre-Execution Checklist

**WAJIB diceklis SEBELUM menulis kode frontend untuk domain baru.**

## Sebelum mulai

- [ ] Load `templates/frontend-host-shell.tsx` — exact code reference
- [ ] Load `templates/frontend-host-shell.css` — exact styles reference
- [ ] Load `checklists/frontend-checklist.md` — checklist ini
- [ ] Load `templates/mfe-remote-app.tsx` — MFE remote App.tsx template
- [ ] Baca `mcs/{existing-service}/src/pages/` untuk referensi pattern detail page & list page

## Workspace & Package Setup

### Root `mcs/package.json`

- [ ] Tambah workspace `"@mcs/{name}"` ke `"workspaces"` array

### MFE Remote `mcs/{name}/package.json`

- [ ] `"name": "@mcs/{name}"` — MUST match workspace name
- [ ] `"proxy"` field: `"http://localhost:{backend-port}"` — proxy ke backend dev server
- [ ] `"dev"` script: `"concurrently \"craco start\" \"yarn --cwd ../../{service_dir}/backend start:dev\""` — jalanin backend+frontend bareng

### `{service_dir}/package.json` (root service)

- [ ] `"workspaces"` mengandung `"backend"` dan `"frontend"`
- [ ] `"scripts.dev"`: `concurrently \"yarn --cwd backend start:dev\" \"yarn --cwd frontend start\""`

## Host Shell App.tsx + App.css

### App.tsx — Host Shell (`{service_dir}/frontend/src/App.tsx`)

- [ ] `BrowserRouter` MUST wrap `AppShell` (bukan langsung return AppShell tanpa router)
- [ ] `SidebarV2` props: `brandColor` MUST match domain brand color
- [ ] `HeaderBarV2` props: `onMobileMenuClick` = `handleBurgerClick` (bukan lambda inline)
- [ ] `DashboardIcon` MUST use **4 filled rects** SVG (NOT stroke-based house icon)
- [ ] Setiap ikon sidebar MUST pakai pattern: `<svg>` + `<defs>` + `<filter>` shadow + `<linearGradient>` + `<g filter>`
- [ ] `sidebarUser.avatarColor` MUST match `brandColor`
- [ ] `headerBarUser.roleColor` MUST match `brandColor`

### App.css — Host Shell (`{service_dir}/frontend/src/App.css`)

- [ ] `.app-content__inner` MUST include `background: #ffffff` — agar semua halaman putih tanpa inline bgcolor di tiap component
- [ ] `font-family` MUST be `'Plus Jakarta Sans', 'Segoe UI', Tahoma, sans-serif`
- [ ] `--brand` CSS variable MUST match domain brand color
- [ ] `--brand-light` CSS variable MUST use brand color with 0.10 opacity
- [ ] Tidak ada inline styles di JSX (semua pake CSS class)

## Dashboard Page (`/`)

- [ ] Dashboard header MUST use CSS class `dashboard__header` (NOT inline styles)
- [ ] Dashboard header gradient: `linear-gradient(135deg, #efe9ff 0%, #fef6ff 100%)`
- [ ] Dashboard header border: `1px solid #dbe6f5`
- [ ] Dashboard header shadow: `0 4px 16px rgba(189, 37, 235, 0.06)`
- [ ] Route cards MUST use `NavLink` (NOT `a` or `div` with onClick)
- [ ] Route cards MUST use CSS classes `dashboard-card`, `dashboard-card__icon`, `dashboard-card__title`, `dashboard-card__summary`

## Sidebar Toggle

- [ ] `handleBurgerClick` MUST check `window.innerWidth <= 767` for mobile vs desktop toggle
- [ ] `useEffect` resize listener MUST collapse sidebar at 1024px, full-width at 767px
- [ ] Zustand untuk sidebar collapsed state? NO — pakai `useState` lokal

## MFE Remote App.tsx (`mcs/{name}/src/App.tsx`)

### Landing Page Styling (WAJIB ikut geographic-address pattern)

- [ ] Import `./App.css` — WAJIB ada CSS styling landing page
- [ ] WAJIB punya data section arrays (isi sesuai domain):
  - `exposedModules` — daftar string `./{ModuleName}` dari exposes/
  - `tmfResources` atau per-TMF resources array — objek dengan `title`, `summary`, `path`
  - `architectureItems` — `{ heading, value, note }`
  - `qualityGuards` — array string (safeguard descriptions)
  - `topKpis` — `{ label, value, note }`, 3-4 items
  - `roadmapCards` — `{ title, detail }`
  - `localDevSteps` — array string
  - `quickLinks` — `{ label, href, note }`

### Landing Page HTML Structure (WAJIB)

JSX structure WAJIB ikut pattern ini:

```tsx
function App() {
  return (
    <div className="landing">
      {/* Hero */}
      <header className="landing__hero">
        <div className="landing__hero-main">
          <p className="landing__eyebrow">TM Forum ODA Remote</p>
          <h1>{Domain} Command Center</h1>
          <p>{description}</p>
          <div className="landing__hero-actions">{links}</div>
        </div>
        <div className="landing__hero-panel">
          <p className="landing__hero-panel-title">Delivery Focus</p>
          <ul>{focusItems}</ul>
        </div>
      </header>

      {/* KPI Section */}
      <section className="landing__section landing__section--kpi">
        <div className="grid grid--four">{kpis}</div>
      </section>

      {/* Federation Contract */}
      <section className="landing__section"><h2>Federation Contract</h2>
        <div className="grid grid--three">{architectureItems}</div>
      </section>

      {/* Exposed Modules */}
      <section className="landing__section"><h2>Exposed Modules</h2>
        <div className="pill-list">{pills}</div>
      </section>

      {/* Experience Direction */}
      <section className="landing__section"><h2>Experience Direction</h2>
        <div className="grid grid--three">{roadmapCards}</div>
      </section>

      {/* Per-TMF Resource Pages — satu section per TMF sub-domain */}
      <section className="landing__section"><h2>TMF-XXX Resource Pages</h2>
        <div className="grid grid--{n}">{resourceCards}</div>
      </section>

      {/* Reliability Safeguards */}
      <section className="landing__section"><h2>Reliability Safeguards</h2>
        <ul className="list">{qualityGuards}</ul>
      </section>

      {/* Split: Local Dev + Important Files */}
      <section className="landing__section landing__section--split">
        <div className="card"><h2>Local Development</h2>
          <ol className="list list--ordered">{steps}</ol>
        </div>
        <div className="card"><h2>Important Files</h2>
          <ul className="list">{files}</ul>
        </div>
      </section>

      {/* Quick Links */}
      <section className="landing__section"><h2>Quick Links</h2>
        <div className="grid grid--three">{links}</div>
      </section>

      <footer className="landing__footer">...</footer>
    </div>
  );
}
```

- [ ] Per-TMF section: `grid--four` untuk card resource pages
- [ ] Quick Links: gunakan `<a>` tag dengan class `quick-link` dan `quick-link__href`
- [ ] Important Files: include `README.md` di daftar
- [ ] `localDevSteps` array digunakan di dua tempat (local dev + important files)
- [ ] App.css WAJIB punya class: `.landing`, `.landing__hero`, `.landing__section`, `.grid`, `.card`, `.kpi`, `.quick-link`, `.pill`, `.list`, `.landing__footer`

### Routing + Error Boundary

- [ ] Export default component (untuk Module Federation remote)
- [ ] Kalau ada routing — wrapper component dengan `ErrorBoundary` di file terpisah
- [ ] Render `<Outlet />` di dalam wrapper

## ErrorBoundary (`mcs/{name}/src/ErrorBoundary.tsx`)

**CRITICAL: TypeScript 5.7 + @types/react 19 break class component generic inference.**

- [ ] File TERPISAH (`ErrorBoundary.tsx`), bukan inline di App.tsx
- [ ] Baris pertama file: `// @ts-nocheck`
- [ ] Implement `componentDidCatch` + `getDerivedStateFromError`
- [ ] Render `children` jika tidak error, fallback UI jika error

## Remote Routes

- [ ] ALL remote route paths MUST end with `/*` wildcard suffix
- [ ] `RemoteRouteSlot` MUST wrap with `<RemoteRouteBoundary>` (error boundary)
- [ ] `Suspense fallback` MUST use `<RemotePageLoader />` (NOT inline text)

## `module-federation.d.ts` (host shell)

- [ ] `declare module 'your_remote/*'` MUST exist
- [ ] `declare module 'common_remote/SidebarV2'` MUST exist with typed export
- [ ] `declare module 'common_remote/HeaderBarV2'` MUST exist with typed export

## Exposes (`mcs/{name}/src/exposes/`)

- [ ] Setiap exposed page MUST wrap dengan `createProtectedPage(() => import('../pages/{page}'), { pageName: '{Page}' })`
- [ ] Bukan langsung `export default MyPage`

## List Pages Pattern

- [ ] Root Box: `<Box sx={{ p: 3 }}>` — NO background color (handle via CSS class host shell)
- [ ] Breadcrumbs dari `common_remote/Breadcrumbs`
- [ ] Header: Title + Subtitle di kiri, `+ Add New` button di kanan (Stack row justify=space-between)
- [ ] `CustomDataGrid` dengan `actionVariant="inline"`
- [ ] Delete confirm dialog: pakai `CustomAlert severity="warning"` (BUKAN raw Box)
- [ ] LifecycleJourneyCard: HANYA jika entity punya `lifecycleStatus` field (cek TMF spec dulu)

### Create/Edit Dialog Form Pattern

Form create/edit HARUS mengacu ke TMF spec dokumen — bukan tebak-tebak:

- [ ] BACA TMF spec PDF/swagger — identifikasi field WAJIB vs optional di request body
- [ ] Field WAJIB: `required` prop + validasi di handleSubmit (jangan cuma di UI)
- [ ] Setiap field dari TMF spec HARUS ada di form (kecuali read-only seperti `id`, `lastUpdate`)
- [ ] `CustomTextField` — pakai `required` prop (BUKAN manual `*` di label string)
- [ ] `CustomSelect` — untuk enum/status fields (BUKAN `CustomTextField`)
- [ ] `AutoComplete` — untuk relasi ke entity lain (specification, relatedParty, dll)
- [ ] Sub-resources (array fields seperti partner, roleSpecification): render sebagai `Box` dengan border + dynamic add/remove buttons
- [ ] `CustomAlert severity="error"` untuk form validation error (BUKAN raw Box atau teks merah inline)
- [ ] Form di dalam `CustomDialog.content` — `Stack spacing={2} sx={{ pt: 1 }}`
- [ ] Reset form state setelah submit sukses (semua state variable di-clear)
- [ ] Payload yang dikirim sesuai TMF spec — mapping field dari form state ke API DTO

## Detail Pages Pattern (follow GeoLocationDetailPage)

- [ ] Import dari `common_remote/DetailComponents`: `DetailPageShell`, `DetailField`, `StatusChipField`, `SectionCard`, `DETAIL_GRID_SX`
- [ ] DetailPageShell: jangan pakai `actions` atau `chips` props — action button (Update) taruh di dalam tab content
- [ ] ViewMode toggle card/table: inline `IconButton` + `toggleSx`, title kiri icon kanan dalam Stack row (bukan komponen GridToggle terpisah)
- [ ] PillTabs: sudah render content internally — jangan render `{tabs[activeTab]?.content}` secara manual
- [ ] Card grid: `gridTemplateColumns: 'repeat(4, 1fr)'`
- [ ] Native HTML `<table>` untuk table view (bukan MUI Table component) dengan styling `#f1f5f9` header
- [ ] Loading state: `<DetailPageShell title="Loading…" onBack={onBack} />`
- [ ] Error state: `<Box sx={{ p: 3 }}><CustomAlert message={error} severity="error" /></Box>`
- [ ] Not found: `<DetailPageShell title="Not Found" onBack={onBack} subtitle="..." />`

## Hub Page (`pages/hub/index.tsx`)

- [ ] Semua component dari `common_remote`: `Alert`, `Button`, `Breadcrumbs`, `DataGrid`, `Dialog`, `Snackbar`, `TextField`, `Typography`
- [ ] `CustomTextField` untuk callback URL: `required` prop, BUKAN manual `*` di label
- [ ] Form error: `CustomAlert severity="error"` (BUKAN raw Box)
- [ ] Delete confirm: `CustomAlert severity="warning"` (BUKAN raw Box)
- [ ] NO `import Box from '@mui/material/Box'` — use `common_remote` components wherever possible

## Backend — SQLite Compatibility

**CRITICAL: SQLite tidak support `type: 'timestamp'`. Gunakan `datetime`.**

- [ ] ENTITY: `@CreateDateColumn({ type: 'datetime' })` — untuk `lastUpdate` / `createdDate`
- [ ] ENTITY: `@UpdateDateColumn({ type: 'datetime' })` — untuk `lastUpdate`
- [ ] ENTITY: `@Column({ type: 'datetime', nullable: true })` — untuk date fields nullable
- [ ] `.env`: `DB_TYPE=sqlite` (default), nanti switch ke `postgres` untuk production
- [ ] `TypeOrmModule.forRoot()`: conditional type — `process.env.DB_TYPE === 'postgres'` untuk PostgreSQL config

## Backend — .env Defaults

- [ ] `SKIP_AUTH=true` — biar gak 401 terus pas development
- [ ] `DB_TYPE=sqlite`
- [ ] `API_KEY=dev-key-123`
- [ ] `PORT=30XX` — port sesuai domain

## Checklist Final

- [ ] Semua "TODO: CUSTOMIZE" di template sudah diganti
- [ ] `yarn build` pass di MFE remote
- [ ] `yarn build` pass di backend
- [ ] `yarn build` pass di host shell
- [ ] Detail page sudah sesuai pattern GeoLocationDetailPage (cek dengan diff visual)
- [ ] Tidak ada `type: 'timestamp'` di entity files — semua `datetime`
- [ ] ErrorBoundary di file terpisah dengan `@ts-nocheck`
- [ ] `.app-content__inner` di CSS host shell punya `background: #ffffff`
- [ ] Hub page pake common_remote components semua
