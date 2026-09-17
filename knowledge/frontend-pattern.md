# TM Forum MFE — Design System & Frontend Pattern

> **Dokumen ini adalah PATOKAN RESMI (single source of truth)** untuk semua service frontend di project TM Forum.
> Setiap service baru atau yang sudah ada WAJIB sesuai dengan pattern yang didefinisikan di sini.
> Gunakan dokumen ini untuk audit konsistensi UI antar service.

---

## 1. Technology Stack

- **Framework**: React 19, TypeScript (strict mode)
- **Bundler**: CRACO (CRA override) with Webpack 5 Module Federation
- **UI Library**: MUI v9 — **dikonsumsi HANYA lewat `common_remote`** (port 4000)
- **Routing**: react-router-dom v6 (host shells only)
- **Styling**: @emotion/react + styled (CSS-in-JS), CSS variables untuk host shell
- **Testing**: Jest + React Testing Library
- **State Management**: React useState/useEffect (TIDAK pakai Redux/Zustand/React Query)
- **Form Library**: react-hook-form (WAJIB untuk semua form create/edit)

---

## 2. Design Tokens (dari `mcs/common/src/config/styleConfig.ts`)

Design tokens ini adalah satu-satunya referensi visual:

```typescript
// Spacing
SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

// Border Radius
RADIUS = { sm: '4px', md: '8px', lg: '12px', xl: '16px' }

// Shadows
SHADOWS = {
  card: '0 1px 3px rgba(15,23,42,0.07), 0 4px 16px rgba(15,23,42,0.06)',
  popover: '0 8px 32px rgba(15,23,42,0.14)',
  topbar: '0 1px 0 #e2e8f0',
  sidebar: '1px 0 0 #e2e8f0',
}

// Palette
PALETTE = {
  brand: '#2563eb',
  brandLight: 'rgba(37,99,235,0.10)',
  surface: '#ffffff',
  background: '#f8fafc',
  border: '#e2e8f0',
  borderHover: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
}
```

---

## 3. App Shell Pattern (Host Service)

Host app menggunakan `SidebarV2` + `HeaderBarV2` dari `common_remote`.

### 3.1 Layout CSS Variables

```css
:root {
  --sidebar-w: 260px;
  --sidebar-collapsed: 72px;
  --topbar-h: 64px;
  --brand: #7c3aed;           /* per-service brand color */
  --border: #e8ecf1;
  --surface: #ffffff;
  --bg: #f8fafc;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --transition: 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 3.2 SidebarV2 — Props Contract

```typescript
import SidebarV2 from 'common_remote/SidebarV2';

<SidebarV2
  items={sidebarNavigationGroups}     // SidebarV2NavigationGroup[]
  brandTitle="Service Name"
  brandSubtitle="Short Description"
  brandColor="#7c3aed"
  brandInitials="SN"
  user={sidebarUser}                  // { name, role, initials, roleColor, avatarColor }
  onNavigate={handleNavigate}         // (path: string) => void
  activeItem={location.pathname}
  mobileOpen={mobileOpen}
  onMobileClose={handleMobileClose}
  collapsed={sidebarCollapsed}
/>
```

**Navigation Group Structure:**
```typescript
const sidebarNavigationGroups: SidebarV2NavigationGroup[] = [
  {
    title: 'GROUP TITLE',        // uppercase label
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: 'unique-id', label: 'Menu Label', path: '/route', icon: <SvgIcon />, iconColor: '#hex' },
    ],
  },
];
```

**Icon Pattern (SVG 3D with gradient + shadow):**
```tsx
const MenuIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <filter id="shadow-id" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
      <linearGradient id="grad-id" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor: '#color1', stopOpacity: 1}} />
        <stop offset="100%" style={{stopColor: '#color2', stopOpacity: 1}} />
      </linearGradient>
    </defs>
    <g filter="url(#shadow-id)">
      {/* paths */}
    </g>
  </svg>
);
```

### 3.3 HeaderBarV2 — Props Contract

```typescript
import HeaderBarV2 from 'common_remote/HeaderBarV2';

<HeaderBarV2
  showSearch
  searchPlaceholder="Search..."
  notificationCount={5}
  user={headerBarUser}            // { name, email, role, roleColor, initials, avatarColor }
  dropdownItems={dropdownItems}   // { id, label, icon, color?, onClick? }[]
  onMobileMenuClick={handleBurgerClick}
  className="app-topbar"
/>
```

### 3.4 Shell Grid Layout (CSS)

```css
.app-shell { height: 100vh; overflow: hidden; }
.app-content {
  margin-left: var(--sidebar-w);
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-shell--collapsed .app-content { margin-left: var(--sidebar-collapsed); }
@media (max-width: 767px) { .app-content { margin-left: 0; } }
```

### 3.5 Remote Route Loading Pattern

```typescript
const remoteLoaders = {
  Page: () => import('page_remote/Page'),
};

function RemoteRouteSlot({ routeName, loader }) {
  const [LazyPage, setLazyPage] = useState(() => lazy(loader));
  return (
    <RemoteRouteBoundary routeName={routeName}>
      <Suspense fallback={<RemotePageLoader />}>
        <LazyPage />
      </Suspense>
    </RemoteRouteBoundary>
  );
}
```

---

## 4. Entry Point Pattern

```typescript
// index.tsx — deferred rendering for Module Federation
import('./bootstrap').catch(console.error);

// bootstrap.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
```

---

## 5. Module Federation Exposure Pattern

```typescript
// exposes/Lead.tsx
import { createProtectedPage } from '../federation/createProtectedPage';
export default createProtectedPage(() => import('../pages/lead'), {
  pageName: 'Lead',
});
```

---

## 6. Page Component Pattern (List + Detail)

**PENTING:** Semua CRUD page menggunakan dual-view (list & detail) via internal state:

```typescript
export default function ResourcePage() {
  const [viewId, setViewId] = useState<string | null>(null);

  if (viewId) {
    return <DetailPage id={viewId} onBack={() => setViewId(null)} />;
  }
  return <ListPage onViewDetail={(id) => setViewId(id)} />;
}
```

---

## 7. List Page — Standard Structure

### 7.1 Standard State

```typescript
const [items, setItems] = useState<T[]>([]);
const [totalCount, setTotalCount] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [page, setPage] = useState(1);              // 1-based!
const [rowsPerPage, setRowsPerPage] = useState(10);
const [searchText, setSearchText] = useState('');
const [statusFilter, setStatusFilter] = useState('');
const [gridFilterModel, setGridFilterModel] = useState<GridFilterModel>({...});
const [gridSortModels, setGridSortModels] = useState<GridSortModel[]>([]);
const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
const [createOpen, setCreateOpen] = useState(false);
const [deleteOpen, setDeleteOpen] = useState(false);
const [selected, setSelected] = useState<T | null>(null);
```

### 7.2 Standard Layout

```tsx
<Box sx={{ p: 3 }}>
  {/* Breadcrumbs */}
  <CustomBreadcrumbs items={[{ label: 'Home' }, { label: 'Service Name' }]} />

  {/* Title Section */}
  <Box sx={{ mt: 2, mb: 1 }}>
    <CustomTypography variant="h5">Page Title</CustomTypography>
    <CustomTypography variant="body2" sx={{ color: '#64748b' }}>Subtitle description</CustomTypography>
  </Box>

  {/* Action Bar — tombol "Add" di kanan */}
  <Stack direction="row" sx={{ mb: 2, justifyContent: 'flex-end' }}>
    <CustomButton label="+ Add New" variant="contained" onClick={() => setCreateOpen(true)} />
  </Stack>

  {/* Error Alert */}
  {error && <CustomAlert message={error} severity="error" sx={{ mb: 2 }} />}

  {/* Lifecycle Journey Card (filter) */}
  <Box sx={{ mb: 2 }}>
    <LifecycleJourneyCard
      phases={LIFECYCLE_PHASES}
      activeFilter={statusFilter}
      onFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
    />
  </Box>

  {/* Data Grid */}
  <CustomDataGrid
    title={tmfOda service Title}
    subtitle={subtitle tmfOda service Description}
    mode="server"
    density="compact"
    actionVariant="inline"
    rows={items}
    columns={columns}
    page={page}
    rowsPerPage={rowsPerPage}
    totalRows={totalCount}
    onPageChange={setPage}
    onRowsPerPageChange={(v) => { setRowsPerPage(v); setPage(1); }}
    searchText={searchText}
    onSearchTextChange={setSearchText}
    filterModel={gridFilterModel}
    onFilterModelChange={setGridFilterModel}
    sortModels={gridSortModels}
    onSortModelsChange={setGridSortModels}
    onView={(row) => onViewDetail(String(row.id))}
    onEdit={(row) => { setSelected(find(row.id)); setEditOpen(true); }}
    onDelete={(row) => { setSelected(find(row.id)); setDeleteOpen(true); }}
  />

  {/* Snackbar */}
  <CustomSnackbar open={snack.open} message={snack.message} severity={snack.severity}
    onClose={() => setSnack(s => ({ ...s, open: false }))} />
</Box>
```

---

## 8. Button — Standard Variants & Usage

**KRITIS: Jangan pernah membuat gaya tombol custom di MFE. Selalu gunakan `CustomButton`.**

### 8.1 Props API

```typescript
interface CustomButtonProps {
  label?: string;              // Teks button
  onClick?: () => void;
  variant?: 'text' | 'outlined' | 'contained' | 'ghost' | 'subtle';
  color?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  sx?: SxProps<Theme>;
}
```

### 8.2 Standard Button Usage per Context

| Context | Variant | Color | Label Pattern |
|---------|---------|-------|---------------|
| Create (di action bar) | `contained` | `primary` | `"+ Add New"` |
| Update/Edit (di detail header) | `contained` | `primary` | `"Update {Entity}"` |
| Back navigation | `outlined` | `primary` | `"← Back to List"` |
| Section Add (di tab) | `outlined` | `primary` | `"Add {Section} Info"` |
| Section Update (di tab) | `contained` | `primary` | `"Update {Section} Info"` |
| Delete | `outlined` | `error` | `"Delete {Entity}"` |
| Convert/Special action | `contained` | `success` | `"Convert to {Target}"` |
| Cancel/Close dialog | `outlined` | `primary` | `"Cancel"` |
| Submit dialog | `contained` | `primary` | `"Save"` / `"Create"` / `"Update"` |
| Inline Edit (di card) | `text` | `primary` | `"Edit"` |
| Add item (repeatable field) | `text` | `primary` | `"+ Add Item"` |
| Remove item (repeatable field) | `text` | `error`* | `"✕ Remove"` |

**Aturan:**
- Ukuran default: `medium`
- Semua tombol memiliki `textTransform: 'none'`, `borderRadius: '8px'`
- Hover effect: `translateY(-1px)` dengan `boxShadow`
- JANGAN pernah gunakan style inline untuk tombol — sx dari `STYLE_CONFIG` sudah cukup

### 8.3 Action Bar di Detail Page

```tsx
{/* Selalu Stack horizontal dengan spacing 1.25 */}
<Stack direction="row" spacing={1.25}>
  <CustomButton label="← Back to List" onClick={onBack} variant="outlined" />
  <CustomButton label="Update Lead" onClick={openEdit} variant="contained" />
  {canConvert && (
    <CustomButton label="Convert to Opportunity" onClick={handleConvert} variant="contained" color="success" />
  )}
</Stack>
```

### 8.4 Section Action Buttons (Tab Content)

```tsx
const SECTION_ACTION_BUTTON_WRAP_SX = {
  minWidth: 168,
  '& .MuiButton-root': { height: 38 },
};

<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
  <Box sx={SECTION_ACTION_BUTTON_WRAP_SX}>
    <CustomButton label="Add Note Info" variant="outlined" onClick={...} fullWidth />
  </Box>
  <Box sx={SECTION_ACTION_BUTTON_WRAP_SX}>
    <CustomButton label="Update Note Info" variant="contained" onClick={...} fullWidth />
  </Box>
</Stack>
```

---

## 9. Detail Page — Standard Structure

### 9.1 Layout Hierarchy

```
Box (p: 3)
├── CustomBreadcrumbs
├── Box (mt: 2, mb: 3) — Page Header
│   ├── Stack direction="row" — Action buttons
│   ├── Box — Title (fontSize: 1.65rem, fontWeight: 800)
│   ├── HeaderChips — Status + Priority + Rating
│   └── Stack — Metadata (Created, Updated dates)
├── PillTabs — Content tabs
└── CustomDialog(s) — Edit/Add modals
```

### 9.2 Breadcrumbs Pattern

```tsx
<CustomBreadcrumbs
  items={[
    { label: 'Home', href: '#' },
    { label: 'Entity List', onClick: onBack },
    { label: currentItem.name },           // current page (no link)
  ]}
/>
```

### 9.3 Header Section

```tsx
<Box sx={{ mt: 2, mb: 3 }}>
  {/* Action buttons */}
  <Stack direction="row" spacing={1.25}>
    <CustomButton label="← Back to List" onClick={onBack} variant="outlined" />
    <CustomButton label="Update Entity" onClick={openEdit} variant="contained" />
  </Stack>

  {/* Title */}
  <Box sx={{ mt: 2.5 }}>
    <Box sx={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25, mb: 1.5 }}>
      {entity.name}
    </Box>

    {/* Status chips */}
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1.5, gap: 0.75, alignItems: 'center' }}>
      {entity.status && <CustomChip label={entity.status} color={statusColor(entity.status)} />}
      {entity.priority && <CustomChip label={`Priority: ${entity.priority}`} color={priorityColor(entity.priority)} variant="outlined" />}
    </Stack>

    {/* Dates metadata */}
    <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', color: '#64748b', gap: 1.5 }}>
      <Box sx={{ fontSize: '0.8rem' }}>
        <Box component="span" sx={{ fontWeight: 700, color: '#475569', mr: 0.75 }}>Created</Box>
        {fmtDate(entity.creationDate)}
      </Box>
      <Box sx={{ fontSize: '0.8rem' }}>
        <Box component="span" sx={{ fontWeight: 700, color: '#475569', mr: 0.75 }}>Updated</Box>
        {fmtDate(entity.lastUpdate)}
      </Box>
    </Stack>
  </Box>
</Box>
```

### 9.4 Loading / Error State (Standard)

```tsx
// Loading state
if (loading) return (
  <Box sx={{ p: 3 }}>
    <CustomBreadcrumbs items={[...breadcrumbs, { label: 'Loading...' }]} />
    <Box sx={{ mt: 3 }}>
      <CustomSkeleton variant="text" height={44} width="45%" />
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <CustomSkeleton variant="rectangular" height={30} width={100} />
        <CustomSkeleton variant="rectangular" height={30} width={90} />
      </Stack>
    </Box>
    <Box sx={{ mt: 3 }}><CustomSkeleton variant="rectangular" height={52} /></Box>
    <Box sx={{ mt: 2 }}><CustomSkeleton variant="rectangular" height={240} /></Box>
  </Box>
);

// Error state
if (error) return (
  <Box sx={{ p: 3 }}>
    <CustomBreadcrumbs items={[...breadcrumbs, { label: 'Error' }]} />
    <Box sx={{ mt: 3 }}><CustomAlert message={error} severity="error" /></Box>
    <Box sx={{ mt: 2 }}><CustomButton label="← Back to List" onClick={onBack} variant="outlined" /></Box>
  </Box>
);
```

---

## 10. PillTabs — Tab Navigation di Detail

### 10.1 Props Contract

```typescript
interface PillTab {
  label: string;
  icon?: string;     // emoji
  content: React.ReactNode;
}

<PillTabs
  tabs={[
    { label: 'Overview', icon: '📋', content: <OverviewTab /> },
    { label: 'Parties',  icon: '🤝', content: <PartiesTab /> },
    { label: 'Notes',    icon: '📝', content: <NotesTab /> },
  ]}
  value={activeTab}
  onChange={(index: number) => setActiveTab(index)}
/>
```

### 10.2 Bagaimana Data API Menentukan Tab

**ATURAN PENTING:** Tab di halaman detail DITENTUKAN oleh struktur data entity dari API response.

**Penentuan tab berdasarkan field API:**

| API Field Pattern | Tab Label | Isi Tab |
|---|---|---|
| Fields scalar utama (name, status, description, dates, priority) | `Overview` | SectionCard "General Info" + SectionCard "Dates/Financial" |
| `relatedParty[]` | `Parties & Channel` / `Related Parties` | List party cards + channel/market info |
| `note[]` | `Notes` | Clickable note cards dengan Add/Update button |
| `serviceOrderItem[]` / item arrays | `Order Items` / `Items` | Nested cards per item |
| `externalReference[]` + `orderRelationship[]` | `Relationships` | MiniTable references |
| `milestone[]` | `Milestones` | CustomTimeline |
| `errorMessage[]` + `jeopardyAlert[]` | `Errors & Alerts` | MiniTable errors + alerts |
| `prospectContact[]` | `Contacts` | Clickable contact cards |
| Entity references (category, product, productOffering) | `Product` | RefEntityCard per reference |

**Logika:**
1. Tab `Overview` SELALU ada — berisi semua field scalar utama
2. Setiap **array of objects** di API response = 1 tab terpisah
3. Jika ada beberapa array kecil yang related (misal `externalReference` + `orderRelationship`), bisa digabung dalam 1 tab
4. Entity references (singular object) bisa dikelompokkan di 1 tab (misal "Product")
5. Tab ditentukan SAAT build, bukan dinamis — menggunakan fungsi `buildTabs(entity)`

**Contoh `buildTabs` (ServiceOrder):**

```typescript
function buildTabs(item: ServiceOrder) {
  const items = item.serviceOrderItem ?? [];
  const notes = item.note ?? [];
  const parties = item.relatedParty ?? [];
  const extRefs = item.externalReference ?? [];
  const relations = item.orderRelationship ?? [];
  const milestones = item.milestone ?? [];

  return [
    { label: 'Overview', icon: '📋', content: <OverviewContent item={item} /> },
    { label: 'Order Items', icon: '📦', content: <ItemsSection items={items} /> },
    { label: 'Notes', icon: '📝', content: <NotesSection notes={notes} /> },
    { label: 'Related Parties', icon: '👥', content: <PartiesSection parties={parties} /> },
    { label: 'Relationships', icon: '🔗', content: <RelationsSection extRefs={extRefs} relations={relations} /> },
    { label: 'Milestones', icon: '🏁', content: <MilestonesSection milestones={milestones} /> },
  ];
}
```

---

## 11. Detail Components (Shared)

**File:** `pages/components/DetailComponents.tsx` — WAJIB dipakai untuk semua detail page.

### 11.1 Style Constants

```typescript
export const LABEL_SX = {
  fontSize: '0.7rem', color: '#3949ab', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.8, mb: 0.5
};
export const VALUE_SX = {
  fontSize: '1rem', color: 'text.primary', fontWeight: 500, lineHeight: 1.5
};
```

### 11.2 DetailField

```tsx
// Menampilkan label-value pair. TIDAK render jika value kosong.
<DetailField label="Status" value={entity.status} />
<DetailField label="ID" value={entity.id} mono />
```

### 11.3 StatusChipField

```tsx
// Menampilkan label + CustomChip dengan warna otomatis via statusKey
<StatusChipField label="State" value={entity.state} statusKey={entity.state} />
```

### 11.4 SectionCard

```tsx
// Container untuk grouping fields — Paper dengan title dan optional divider
<SectionCard title="General Information" action={<CustomButton ... />}>
  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1 }}>
    <DetailField label="Name" value={entity.name} />
    <DetailField label="Status" value={entity.status} />
  </Box>
</SectionCard>
```

### 11.5 RefEntityCard

```tsx
// Menampilkan referenced entity (object reference) dalam bordered box
<RefEntityCard label="Product Offering" entity={lead.productOffering} />
// entity: { id, href, name, role, version, '@type', '@referredType' }
```

### 11.6 EmptyState

```tsx
<EmptyState message="No related parties assigned." />
```

### 11.7 DetailListSection

Komponen yang menampilkan array items dalam dua mode: card view atau table view.

```tsx
<DetailListSection
  items={relatedParties}
  columns={[{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }]}
  emptyMessage="No parties found."
  title="Related Parties"
  onItemClick={(item) => handleSelect(item)}
/>
```

---

## 12. LifecycleJourneyCard — Filter Status

### 12.1 Props Contract

```typescript
interface LifecyclePhase {
  label: string;
  emoji: string;
  value?: string;   // optional — jika tidak ada, pakai label sebagai identifier
}

<LifecycleJourneyCard
  phases={LIFECYCLE_PHASES}
  activeFilter={statusFilter}          // string — matching phase.value ?? phase.label
  onFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
/>
```

### 12.2 Lifecycle Phases Definition

```typescript
// WAJIB: value field dipakai jika API value berbeda dari display label
const LIFECYCLE_PHASES = [
  { label: 'New', emoji: '🆕', value: 'new' },
  { label: 'In Progress', emoji: '🔄', value: 'inProgress' },
  { label: 'Completed', emoji: '✅', value: 'completed' },
  { label: 'Cancelled', emoji: '🚫', value: 'cancelled' },
];
```

**Aturan:**
- `activeFilter` dan `onFilterChange` — bukan `activePhase`/`onClick`
- Toggle behavior: klik ulang = clear filter (empty string)
- Reset page ke 1 saat filter berubah

---

## 13. CustomDataGrid — Server Mode

### 13.1 Props Contract (yang WAJIB dipakai)

```typescript
interface CustomDataGridProps {
  rows: DataGridRow[];
  columns: DataGridColumn[];
  mode?: 'client' | 'server';           // WAJIB 'server' untuk page API
  density?: 'comfortable' | 'compact';  // default 'compact'
  actionVariant?: 'menu' | 'inline';    // default 'inline'
  page?: number;                        // 1-based
  rowsPerPage?: number;                 // default 10
  totalRows?: number;                   // dari X-Total-Count header
  onPageChange?: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  filterModel?: DataGridFilterModel;
  onFilterModelChange?: (model: DataGridFilterModel) => void;
  sortModels?: DataGridSortModel[];
  onSortModelsChange?: (models: DataGridSortModel[]) => void;
  onView?: (row: DataGridRow) => void;
  onEdit?: (row: DataGridRow) => void;
  onDelete?: (row: DataGridRow) => void;
  headerAction?: React.ReactNode;
}
```

**PENTING — Prop names yang BENAR:**
- ✅ `rowsPerPage` / `onRowsPerPageChange` — BUKAN `pageSize` / `onPageSizeChange`
- ✅ `totalRows` — BUKAN `totalCount`
- ✅ `page` (1-based) — BUKAN 0-based
- ✅ `mode="server"` — WAJIB untuk API pagination

### 13.2 Column Definition

```typescript
const columns: DataGridColumn[] = [
  { key: 'name', label: 'Name', searchable: true, sortable: true },
  { key: 'status', label: 'Status', filterable: true, render: (row) => <CustomChip label={row.status} statusKey={row.status} size="small" /> },
  { key: 'creationDate', label: 'Created', sortable: true, render: (row) => formatDate(row.creationDate as string) },
];
```

---

## 14. PartyRelationshipManager — Wajib untuk relatedParty

### 14.1 Kapan Digunakan

**WAJIB** digunakan setiap kali form memiliki field `relatedParty[]` dari TMF API.
Jangan pernah membuat custom autocomplete untuk party — gunakan `PartyRelationshipManager`.

### 14.2 Props Contract

```typescript
import PartyRelationshipManager from 'common_remote/PartyRelationshipManager';

<PartyRelationshipManager
  items={relatedParties}              // RelatedPartyItem[]  ← BUKAN "value"!
  onChange={setRelatedParties}        // (items: RelatedPartyItem[]) => void
  roleOptions={['Owner', 'Contributor', 'Customer']}   // optional
/>
```

**KRITIS:** Prop nama adalah `items` — BUKAN `value`. Ini penyebab error paling umum.

### 14.3 RelatedPartyItem Type

```typescript
interface RelatedPartyItem {
  id?: string;
  href?: string;
  name?: string;
  role?: string;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
  '@referredType'?: string;       // 'Individual' | 'Organization'
}
```

### 14.4 Fitur Internal

PartyRelationshipManager secara internal:
- Menyediakan ToggleButtonGroup `Individual` / `Organization`
- Autocomplete dengan debounced search ke Party API (`fetchIndividuals`, `fetchOrganizations`)
- Fallback manual mode jika API unavailable
- Role selection per party item
- Add/Remove multiple parties

### 14.5 Integration di react-hook-form

```tsx
<Controller
  name="relatedParty"
  control={control}
  render={({ field }) => (
    <PartyRelationshipManager
      items={field.value}
      onChange={field.onChange}
    />
  )}
/>
```

---

## 15. CustomDialog — Modal Form

### 15.1 Props Contract

```typescript
<CustomDialog
  open={dialogOpen}
  onClose={() => setDialogOpen(false)}
  title="Create Service Order"
  maxWidth="md"                    // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  fullWidth
  content={<FormContent />}        // JSX form body
  actions={
    <Stack direction="row" spacing={1}>
      <CustomButton label="Cancel" variant="outlined" onClick={onClose} />
      <CustomButton label="Save" variant="contained" onClick={handleSave} disabled={submitting} />
    </Stack>
  }
/>
```

### 15.2 Dialog Style (otomatis dari STYLE_CONFIG)

- `borderRadius: '16px'`
- backdrop blur
- title: `fontWeight: 700`, `fontSize: '1.1rem'`
- padding content: `24px`

---

## 16. Form Pattern (react-hook-form)

### 16.1 WAJIB react-hook-form

Semua form create/edit WAJIB menggunakan `react-hook-form`:
- `useForm<FormValues>({ defaultValues, mode: 'onChange' })`
- `Controller` untuk setiap `common_remote` component
- `useFieldArray` untuk repeatable fields

### 16.2 Standard Form Layout

```tsx
const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
  defaultValues: initialForm,
  mode: 'onChange',
});

// Reset saat dialog open
useEffect(() => {
  if (open) reset(initialForm);
}, [open, initialForm, reset]);
```

### 16.3 Field Binding

```tsx
{/* TextField */}
<Controller name="name" control={control} render={({ field }) => (
  <CustomTextField label="Name" value={field.value} onChange={field.onChange} fullWidth />
)} />

{/* Select */}
<Controller name="priority" control={control} render={({ field }) => (
  <CustomSelect label="Priority" value={field.value} onChange={field.onChange} options={PRIORITY_OPTIONS} fullWidth />
)} />

{/* Date (TANPA datetime — waktu auto set current time) */}
<Controller name="startDate" control={control} render={({ field }) => (
  <CustomTextField
    label="Start Date"
    type="date"
    value={toDatePart(field.value)}
    onChange={(v: string) => field.onChange(dateWithCurrentTime(v))}
    fullWidth
  />
)} />
```

### 16.4 Date Handling

**ATURAN:** Date field SELALU `type="date"` (bukan `datetime-local`). Waktu di-set otomatis:

```typescript
/** Combine date YYYY-MM-DD + current time → ISO string */
function dateWithCurrentTime(datePart: string): string {
  if (!datePart) return '';
  const now = new Date();
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

/** Extract YYYY-MM-DD from ISO string */
function toDatePart(isoString: string): string {
  if (!isoString) return '';
  return isoString.slice(0, 10);
}
```

---

## 17. Repeatable Fields (useFieldArray)

### 17.1 Bagaimana Menentukan Field Repeatable

**ATURAN dari TMF YAML/OpenAPI:**
1. Jika field bertipe `array of objects` → **repeatable field** (user bisa add >1)
2. Contoh: `serviceOrderItem[]`, `note[]`, `externalReference[]`, `relatedParty[]`, `serviceCharacteristic[]`, `place[]`

### 17.2 Standard Implementation

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'serviceOrderItem' });
```

### 17.3 UI Pattern — Repeatable Section

```tsx
{/* Section Container */}
<Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, p: 2 }}>
  {/* Header: Title + Add Button */}
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
    <CustomTypography variant="subtitle2" sx={{ fontWeight: 700 }}>
      Service Order Items *
    </CustomTypography>
    <CustomButton
      label="+ Add Item"
      variant="text"
      onClick={() => append(EMPTY_ITEM)}
    />
  </Box>

  {/* Repeatable Items */}
  {fields.map((item, idx) => (
    <Box key={item.id} sx={{ border: '1px solid #f1f5f9', borderRadius: 1, p: 1.5, mb: 1.5, bgcolor: '#fafbfc' }}>
      {/* Item Header: Number + Remove */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <CustomTypography variant="body2" sx={{ fontWeight: 600 }}>
          Item #{idx + 1}
        </CustomTypography>
        <CustomButton
          label="✕ Remove"
          variant="text"
          onClick={() => remove(idx)}
          disabled={fields.length <= 1}   // minimal 1 item required
        />
      </Box>

      {/* Item Fields */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Controller name={`serviceOrderItem.${idx}.action`} control={control} render={({ field }) => (
          <CustomSelect label="Action" value={field.value} onChange={field.onChange} options={ACTION_OPTIONS} fullWidth />
        )} />
      </Box>
    </Box>
  ))}
</Box>
```

### 17.4 Visual Cues

- Container: `border: '1px solid #e2e8f0'`, `borderRadius: 1.5`, `p: 2`
- Per-item: `border: '1px solid #f1f5f9'`, `borderRadius: 1`, `p: 1.5`, `bgcolor: '#fafbfc'`
- Add button: `variant="text"`, label `"+ Add Item"`
- Remove button: `variant="text"`, label `"✕ Remove"`, disabled jika hanya 1 item

### 17.5 Nested Repeatable (Sub-arrays)

Untuk array di dalam array (misal `serviceCharacteristic[]` di dalam `serviceOrderItem[]`):

```tsx
function ServiceCharacteristicsSection({ nestIndex, control }: { nestIndex: number; control: Control }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `serviceOrderItem.${nestIndex}.service.serviceCharacteristic`,
  });

  return (
    <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 1.5, mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <CustomTypography variant="caption" sx={{ fontWeight: 600 }}>Characteristics</CustomTypography>
        <CustomButton label="+ Add" variant="text" size="small" onClick={() => append({ name: '', value: '', valueType: 'string' })} />
      </Box>
      {fields.map((char, cIdx) => (
        <Box key={char.id} sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <Controller name={`serviceOrderItem.${nestIndex}.service.serviceCharacteristic.${cIdx}.name`} ... />
          <Controller name={`serviceOrderItem.${nestIndex}.service.serviceCharacteristic.${cIdx}.value`} ... />
          <CustomButton label="✕" variant="text" onClick={() => remove(cIdx)} />
        </Box>
      ))}
    </Box>
  );
}
```

**Visual:** Sub-array pakai `border: '1px dashed #cbd5e1'` (dashed, bukan solid) untuk membedakan nesting level.

---

## 18. Common Remote Components — Complete Catalog

### 18.1 ATURAN IMPORT

**MFE HANYA boleh import langsung dari `@mui/material` untuk layout primitives:**
- `Box`, `Stack`, `IconButton`, `Tooltip`, `SvgIcon`, `Autocomplete`, `TextField` (untuk custom autocomplete saja)

**SEMUA komponen UI lain WAJIB dari `common_remote`:**

```typescript
// ─── Form Controls ───
import CustomTextField from 'common_remote/TextField';
import CustomSelect from 'common_remote/Select';
import CustomSwitch from 'common_remote/Switch';
import CustomCheckbox from 'common_remote/Checkbox';
import AutoComplete from 'common_remote/AutoComplete';

// ─── Buttons & Actions ───
import CustomButton from 'common_remote/Button';
import CustomToggleButton from 'common_remote/ToggleButton';
import CustomSpeedDial from 'common_remote/SpeedDial';

// ─── Data Display ───
import CustomDataGrid from 'common_remote/DataGrid';
import CustomTable from 'common_remote/Table';
import CustomChip from 'common_remote/Chip';
import CustomTypography from 'common_remote/Typography';
import CustomAvatar from 'common_remote/Avatar';
import CustomBadge from 'common_remote/Badge';
import CustomRating from 'common_remote/Rating';
import CustomSkeleton from 'common_remote/Skeleton';

// ─── Feedback ───
import CustomAlert from 'common_remote/Alert';
import CustomSnackbar from 'common_remote/Snackbar';
import CustomProgress from 'common_remote/Progress';
import CustomDialog from 'common_remote/Dialog';

// ─── Navigation ───
import CustomBreadcrumbs from 'common_remote/Breadcrumbs';
import CustomTabs from 'common_remote/Tabs';
import PillTabs from 'common_remote/PillTabs';
import CustomPagination from 'common_remote/Pagination';
import CustomStepper from 'common_remote/Stepper';
import CustomLink from 'common_remote/Link';
import CustomBottomNavigation from 'common_remote/BottomNavigation';

// ─── Layout ───
import CustomCard from 'common_remote/Card';
import CustomPaper from 'common_remote/Paper';
import CustomDivider from 'common_remote/Divider';
import CustomAccordion from 'common_remote/Accordion';
import CustomDrawer from 'common_remote/Drawer';
import CustomModal from 'common_remote/Modal';
import CustomAppBar from 'common_remote/AppBar';
import CustomList from 'common_remote/List';
import CustomImageList from 'common_remote/ImageList';

// ─── Specialized ───
import CustomTimeline from 'common_remote/Timeline';
import CustomKanban from 'common_remote/Kanban';
import CustomTransferList from 'common_remote/TransferList';
import LifecycleJourneyCard from 'common_remote/LifecycleJourneyCard';
import PartyRelationshipManager from 'common_remote/PartyRelationshipManager';

// ─── Overlay ───
import CustomTooltip from 'common_remote/Tooltip';
import CustomPopover from 'common_remote/Popover';
import CustomMenu from 'common_remote/Menu';

// ─── Shell (Host App ONLY) ───
import SidebarV2 from 'common_remote/SidebarV2';       // ← GUNAKAN V2
import HeaderBarV2 from 'common_remote/HeaderBarV2';   // ← GUNAKAN V2
import NotificationPanelPreview from 'common_remote/NotificationPanelPreview';
import MyProfile from 'common_remote/MyProfile';

// ─── DEPRECATED (jangan pakai untuk service baru) ───
// import Sidebar from 'common_remote/Sidebar';       // ← GUNAKAN SidebarV2
// import Topbar from 'common_remote/Topbar';         // ← GUNAKAN HeaderBarV2
```

### 18.2 Kapan Gunakan Apa

| Kebutuhan | Component | Catatan |
|---|---|---|
| Tombol aksi | `CustomButton` | SELALU — tidak pernah `<Button>` langsung |
| Input text | `CustomTextField` | `fullWidth`, `type="date"` untuk date |
| Dropdown | `CustomSelect` | options: `{label, value}[]` |
| Toggle on/off | `CustomSwitch` | — |
| Status badge | `CustomChip` | `statusKey` untuk auto color |
| Dialog/Modal | `CustomDialog` | content + actions props |
| Notifikasi | `CustomSnackbar` | open, message, severity, onClose |
| Error message | `CustomAlert` | severity: 'error'/'warning'/'info' |
| Tabel data | `CustomDataGrid` | mode="server" untuk pagination API |
| Navigasi crumb | `CustomBreadcrumbs` | items: `{label, onClick?, href?}[]` |
| Tab detail | `PillTabs` | tabs: `{label, icon, content}[]` |
| Filter lifecycle | `LifecycleJourneyCard` | phases, activeFilter, onFilterChange |
| Party/relasi | `PartyRelationshipManager` | items + onChange |
| Timeline | `CustomTimeline` | events: `{title, subtitle, description, time}[]` |
| Progress step | `CustomStepper` | — |
| Kanban board | `CustomKanban` | — |

---

## 19. Service Layer Pattern

```typescript
// api.ts — setiap remote punya sendiri
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const mergedHeaders = { 'Content-Type': 'application/json', ...options?.headers };
  const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers: mergedHeaders });
  if (!res.ok) { const body = await res.text(); throw new Error(`API ${res.status}: ${body}`); }
  if (res.status === 204) return { data: undefined as unknown as T, headers: res.headers };
  return { data: await res.json(), headers: res.headers };
}
```

**List API Response Pattern:**
```typescript
export async function listResource(params: ListParams): Promise<{ data: T[]; totalCount: number }> {
  const query = buildQueryString(params);
  const { data, headers } = await apiFetch<T[]>(`/tmf-api/...${query}`);
  return { data, totalCount: Number(headers.get('X-Total-Count') || data.length) };
}
```

**Barrel Export (`service/index.ts`):**
```typescript
export { listX, getX, createX, updateX, deleteX } from './xService';
export { buildCreatePayload, buildUpdatePayload } from './xFormMapper';
export type { X, ListXParams, CreateXDto } from './types';
```

---

## 20. Notification/Snackbar Pattern

```typescript
// Standard snack state
const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as SnackSeverity });

// Helper
const notify = (message: string, severity: SnackSeverity) =>
  setSnack({ open: true, message, severity });

// Render
<CustomSnackbar
  open={snack.open}
  message={snack.message}
  severity={snack.severity}
  onClose={() => setSnack(s => ({ ...s, open: false }))}
/>
```

---

## 21. Error Handling

```typescript
// Shared utility
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

// Usage
try {
  await apiCall();
  notify('Success', 'success');
} catch (err: unknown) {
  notify(getErrorMessage(err), 'error');
}
```

---

## 22. TMF YAML → Form Field Mapping Rules

### 22.1 Rules

| YAML Pattern | UI Form Type | Notes |
|---|---|---|
| type: `array` of `object` | Repeatable field (useFieldArray) | User bisa add >1 |
| field includes `href` | LOV dari API / external service | Gunakan Autocomplete/Select |
| field includes `href` + `id` | Field `id` = hidden | User TIDAK input ID manual |
| field type `date-time` | `type="date"` + auto-set time | `dateWithCurrentTime()` |
| field type `string` (enum) | `CustomSelect` | options hardcoded |
| field type `string` (free) | `CustomTextField` | — |
| field type `integer`/`number` | `CustomTextField` type="number" | — |
| field `relatedParty[]` | `PartyRelationshipManager` | SELALU |

### 22.2 Mapping Example

```yaml
# TMF641 ServiceOrder YAML
serviceOrderItem:
  type: array
  items:
    $ref: '#/definitions/ServiceOrderItem'
```
→ `useFieldArray({ name: 'serviceOrderItem' })` + repeatable UI box

```yaml
relatedParty:
  type: array
  items:
    $ref: '#/definitions/RelatedParty'
```
→ `<PartyRelationshipManager items={...} onChange={...} />`

---

## 23. Import Pattern — Standard Order

```typescript
// 1. React
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Controller, useForm, useFieldArray } from 'react-hook-form';

// 2. Common Remote Components (UI)
import CustomButton from 'common_remote/Button';
import CustomDataGrid from 'common_remote/DataGrid';
import CustomDialog from 'common_remote/Dialog';
// ...

// 3. MUI Layout Only
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

// 4. Service Layer
import { listResource, createResource } from '../../service';
import type { ResourceType } from '../../service';

// 5. Shared Utilities
import { getErrorMessage, formatDate } from '../shared';

// 6. Local Components
import DetailComponents from '../components/DetailComponents';
```

---

## 24. Status Chip Color System

Warna chip otomatis dari `STYLE_CONFIG.getStatusChipSx(statusKey)`:

```typescript
// Normalized (lowercase, no space/hyphen) → { bgcolor, color }
new:          { bgcolor: '#dbeafe', color: '#1d4ed8' }   // Blue
inprogress:   { bgcolor: '#fef3c7', color: '#b45309' }   // Amber
pending:      { bgcolor: '#ffedd5', color: '#c2410c' }   // Orange
qualified:    { bgcolor: '#dcfce7', color: '#15803d' }   // Green
completed:    { bgcolor: '#dcfce7', color: '#15803d' }   // Green
rejected:     { bgcolor: '#fee2e2', color: '#b91c1c' }   // Red
cancelled:    { bgcolor: '#f1f5f9', color: '#475569' }   // Gray
active:       { bgcolor: '#dcfce7', color: '#15803d' }   // Green
draft:        { bgcolor: '#fef3c7', color: '#b45309' }   // Amber
```

**Usage di DataGrid column:**
```tsx
{ key: 'state', label: 'State', render: (row) => <CustomChip label={row.state} statusKey={row.state} size="small" /> }
```

---

## 25. Compliance Checklist

Gunakan checklist ini untuk audit setiap service frontend:

- [ ] **Shell:** Menggunakan `SidebarV2` + `HeaderBarV2` (bukan Sidebar/Topbar lama)
- [ ] **Entry:** Deferred rendering via `index.tsx` → `bootstrap.tsx`
- [ ] **Exposure:** `createProtectedPage()` wrapper di `exposes/`
- [ ] **Components:** Semua UI dari `common_remote`, BUKAN import MUI langsung
- [ ] **Button:** Konsisten pakai `CustomButton` dengan variant/label sesuai context table
- [ ] **Form:** Pakai `react-hook-form` + `Controller` + `useFieldArray`
- [ ] **Date:** `type="date"` + `dateWithCurrentTime()`, BUKAN `datetime-local`
- [ ] **PartyRelationship:** Pakai `PartyRelationshipManager` dengan prop `items` (bukan `value`)
- [ ] **DataGrid:** `mode="server"`, `page` (1-based), `rowsPerPage`, `totalRows`, `onRowsPerPageChange`
- [ ] **LifecycleCard:** `activeFilter` + `onFilterChange` (bukan activePhase/onClick)
- [ ] **Detail Page:** Breadcrumbs → Header (title+chips+dates) → PillTabs → Dialogs
- [ ] **Tab Mapping:** Setiap array di API = 1 tab; scalar fields = Overview tab
- [ ] **Detail Components:** Menggunakan `DetailField`, `SectionCard`, `StatusChipField`, `RefEntityCard`, `EmptyState`
- [ ] **Repeatable:** Solid border container + dashed sub-container untuk nested
- [ ] **Snackbar:** Pattern `{ open, message, severity }` dengan `CustomSnackbar`
- [ ] **Error:** `getErrorMessage(err)` + `CustomAlert`
- [ ] **Service Layer:** apiFetch → X-Total-Count → barrel export
- [ ] **Kanban/Timeline:** Gunakan `CustomKanban` / `CustomTimeline` dari common

---

## 26. Anti-Patterns (DILARANG)

| ❌ Jangan | ✅ Gunakan |
|---|---|
| `import Button from '@mui/material/Button'` | `import CustomButton from 'common_remote/Button'` |
| `<Button variant="contained">Text</Button>` | `<CustomButton label="Text" variant="contained" />` |
| `import Sidebar from 'common_remote/Sidebar'` | `import SidebarV2 from 'common_remote/SidebarV2'` |
| `import Topbar from 'common_remote/Topbar'` | `import HeaderBarV2 from 'common_remote/HeaderBarV2'` |
| Custom inline button styles | Gunakan variant + color props |
| `<PartyRelationshipManager value={...}` | `<PartyRelationshipManager items={...}` |
| `<LifecycleJourneyCard activePhase={...}` | `<LifecycleJourneyCard activeFilter={...}` |
| `<CustomDataGrid pageSize={10}` | `<CustomDataGrid rowsPerPage={10}` |
| `type="datetime-local"` | `type="date"` + `dateWithCurrentTime()` |
| useState untuk setiap field | `react-hook-form` + `Controller` |
| Redux / React Query / Zustand | useState + useEffect |
| Custom autocomplete untuk party | `PartyRelationshipManager` |
| Manual `.map()` untuk repeatable form | `useFieldArray` + `append`/`remove` |

---

## 27. File Structure Standard per Remote

```
src/
├── App.tsx                      # Host shell (SidebarV2 + HeaderBarV2 + Routes)
├── App.css                      # Shell CSS variables + layout
├── bootstrap.tsx                # Deferred mount
├── index.tsx                    # MF entry
├── react-app-env.d.ts          # Module declarations
├── module-federation.d.ts
├── exposes/
│   └── Page.tsx                 # createProtectedPage wrapper
├── federation/
│   └── createProtectedPage.tsx
├── pages/
│   ├── shared.ts               # Constants, helpers, formatters
│   ├── components/
│   │   ├── DetailComponents.tsx # DetailField, SectionCard, etc.
│   │   └── DetailListSection.tsx
│   └── entity/
│       ├── index.tsx            # List + dual-view controller
│       └── EntityDetailPage.tsx # Detail page with PillTabs
├── service/
│   ├── index.ts                # Barrel export
│   ├── api.ts                  # apiFetch base
│   ├── types.ts                # TMF types + form values
│   ├── entityService.ts        # CRUD operations
│   └── entityFormMapper.ts     # form ↔ API payload mapping
└── tests/
    └── (mirrors src/ structure)
```
