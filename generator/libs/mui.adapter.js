// mui.adapter.js — kontrak adapter lib FE untuk semantic vocabulary M0 (M2 skeleton).
// Kontrak lengkap: generator/libs/README.md. M6 akan menulis neudela.adapter.js dgn API yang SAMA.
// Generator-side config murni: TIDAK meng-import @mui apa pun (objek theme dikembalikan,
// createTheme di-instansiasi oleh consumer/emitter di runtime app).
import { SCHEMA } from '../src/fe/validateFESpec.mjs';

export const ADAPTER_NAME = 'mui';

// ---------------------------------------------------------------------------
// components: semantic -> { module, export, propsMap?, companions?, status?, note? }
//  - module/export : import path + named export hasil generate.
//  - propsMap      : object literal function (props) => object-props-tambahan —
//                    SATU bentuk resmi kontrak (fungsi), dipakai emitter utk tone/type mapping.
//  - companions    : import tambahan wajib (opsional).
//  - status        : 'fallback' bila bukan primitif 1:1 (Box + assembling runtime). Absen = 'covered'.
//  - note          : catatan assembling/fallback utk emitter.
// Semua semantic type di SCHEMA['x-semantic-vocabulary'] WAJIB hadir (coverage() membuktikan; tidak boleh diam).
// ---------------------------------------------------------------------------
const STATUS_COLOR = {
  success: 'success', active: 'success', ok: 'success',
  error: 'error', failed: 'error', danger: 'error',
  warning: 'warning', info: 'info', neutral: 'default', inactive: 'default',
};

// tone (schema $defs.tone) -> mapping SEMANTIK ke Button props MUI (bukan vocab MUI di YAML).
const BUTTON_TONE = {
  primary: { variant: 'contained' },
  secondary: { variant: 'outlined' },
  ghost: { variant: 'text' },
  danger: { color: 'error' },
  warning: { color: 'warning' },
  info: { color: 'info' },
  link: { variant: 'text', color: 'primary' },
};
const mapButtonTone = (props = {}) => ({ ...(BUTTON_TONE[props.tone] || {}) });

const components = {
  'text-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'text' }) },
  'textarea': {
    module: '@mui/material/TextField', export: 'TextField',
    propsMap: (p = {}) => ({ multiline: true, rows: p.rows || 4 }),
  },
  'number-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'number' }) },
  'email-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'email' }) },
  'password-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'password' }) },
  select: {
    module: '@mui/material/Select', export: 'Select',
    companions: [{ module: '@mui/material/MenuItem', export: 'MenuItem' }],
    note: 'options jadi child <MenuItem> (emitter loop options)',
  },
  toggle: { module: '@mui/material/Switch', export: 'Switch' },
  'data-grid': {
    module: '@mui/x-data-grid/DataGrid', export: 'DataGrid', status: 'covered',
    note: 'COMMUNITY v7.29.13 (M3 verified) — server-mode pagination/sort/filter GRATIS; Pro/Enterprise DIPALU',
  },
  'status-chip': {
    module: '@mui/material/Chip', export: 'Chip',
    propsMap: (p = {}) => ({ color: STATUS_COLOR[p.status || p.tone] || p.color || 'default' }),
  },
  tag: { module: '@mui/material/Chip', export: 'Chip', propsMap: () => ({ size: 'small' }) },
  'row-actions': { module: '@mui/material/IconButton', export: 'IconButton' },
  button: { module: '@mui/material/Button', export: 'Button', propsMap: mapButtonTone },
  modal: { module: '@mui/material/Dialog', export: 'Dialog' },
  tabs: {
    module: '@mui/material/Tabs', export: 'Tabs',
    companions: [{ module: '@mui/material/Tab', export: 'Tab' }],
  },
  card: { module: '@mui/material/Card', export: 'Card' },
  'description-list': {
    module: '@mui/material/Box', export: 'Box', status: 'fallback',
    note: 'Bukan primitif MUI — emitter merakit list dari Box + Typography (dl semantics: label/value pairs)',
  },
  table: {
    module: '@mui/material/Table', export: 'Table',
    companions: [
      { module: '@mui/material/TableHead', export: 'TableHead' },
      { module: '@mui/material/TableBody', export: 'TableBody' },
      { module: '@mui/material/TableRow', export: 'TableRow' },
      { module: '@mui/material/TableCell', export: 'TableCell' },
    ],
  },
  timeline: {
    module: '@mui/material/Timeline', export: 'Timeline',
    companions: [
      { module: '@mui/material/TimelineItem', export: 'TimelineItem' },
      { module: '@mui/material/TimelineSeparator', export: 'TimelineSeparator' },
      { module: '@mui/material/TimelineDot', export: 'TimelineDot' },
      { module: '@mui/material/TimelineContent', export: 'TimelineContent' },
    ],
  },
  'repeatable-group': {
    module: '@mui/material/Box', export: 'Box', status: 'fallback',
    note: 'Bukan primitif 1:1 — emitter pakai useFieldArray (react-hook-form) di runtime, Box sbg wrapper',
  },
  typeahead: {
    module: '@mui/material/Autocomplete', export: 'Autocomplete',
    propsMap: () => ({ freeSolo: true }),
  },
  // F3: input tipe baru. date/datetime TETAP TextField (bukan @mui/x-date-pickers —
  // dependency baru, kelas @mui/x-* yang sudah dilarang guardrail check-all).
  'date-input': {
    module: '@mui/material/TextField', export: 'TextField',
    propsMap: () => ({ type: 'date', InputLabelProps: { shrink: true } }),
  },
  'datetime-input': {
    module: '@mui/material/TextField', export: 'TextField',
    propsMap: () => ({ type: 'datetime-local', InputLabelProps: { shrink: true } }),
  },
  checkbox: { module: '@mui/material/Checkbox', export: 'Checkbox' },
  'radio-group': {
    module: '@mui/material/RadioGroup', export: 'RadioGroup',
    companions: [
      { module: '@mui/material/Radio', export: 'Radio' },
      { module: '@mui/material/FormControlLabel', export: 'FormControlLabel' },
    ],
  },
  // F7: stat-card bukan primitif MUI 1:1 -- emitter merakit Card+Typography (label/value/
  // trend/icon), sama pola description-list/repeatable-group. chart: UNSUPPORTED (keputusan
  // user: v1 tanpa @mui/x-charts -- kelas @mui/x-* sudah dilarang guardrail check-all).
  'stat-card': {
    module: '@mui/material/Card', export: 'Card', status: 'fallback',
    note: "Bukan primitif MUI -- emitter merakit Card + Typography (label/value/trend/icon)",
  },
  chart: {
    module: '@mui/material/Box', export: 'Box', status: 'unsupported',
    note: "v1 GAP: @mui/x-charts DILARANG guardrail (tak ada page consumer). emit/dashboard.mjs menulis placeholder + warning.",
  },
};

// tipe UNSUPPORTED -> resolve() THROW (kontrak libs/README.md §5). MUI v1 belum punya
// anggota; konstanta ini ada agar ketiga adapter berbentuk SAMA — menambah entri
// unsupported nanti (mis. `chart`) tinggal mendaftarkannya di sini.
const THROW_SET = new Set(['chart']);

export function resolve(semantic, props = {}) {
  const entry = components[semantic];
  if (!entry) {
    throw new Error(`adapter ${ADAPTER_NAME}: UNSUPPORTED semantic "${semantic}"`);
  }
  if (entry.status === 'unsupported' && THROW_SET.has(semantic)) {
    throw new Error(`adapter ${ADAPTER_NAME}: UNSUPPORTED semantic "${semantic}"`);
  }
  const out = { module: entry.module, export: entry.export };
  if (entry.propsMap) out.propsMap = entry.propsMap;
  if (entry.companions) out.companions = entry.companions;
  if (entry.status) out.status = entry.status;
  if (entry.note) out.note = entry.note;
  return out;
}

// coverage(): iterate schema (SATU-SATUNYA sumber semantic), bukan hardcode duplikat.
// status: 'covered' | 'fallback' | 'unsupported' — SEMUA tipe dilaporkan; 0 'unlisted'.
export function coverage() {
  return SCHEMA['x-semantic-vocabulary'].map((semantic) => {
    const entry = components[semantic];
    if (!entry) return { semantic, status: 'unsupported' };
    return { semantic, status: entry.status || 'covered', module: entry.module };
  });
}

// Semua gap terdokumentasi (fallback non-fatal + unsupported) — pola SAMA dengan
// neudela/fe-default. Sebelumnya MUI tidak punya fungsi ini, jadi gate coverage tak
// bisa menuntut "tiap gap dilaporkan tertulis" untuk ketiga adapter.
export function libraryWarnings() {
  const list = [];
  for (const [semantic, entry] of Object.entries(components)) {
    if (entry.status === 'unsupported') {
      list.push(`mui: semantic "${semantic}" UNSUPPORTED. ${entry.note ?? ''}`.trim());
    } else if (entry.status === 'fallback') {
      list.push(`mui: semantic "${semantic}" FALLBACK (tanpa primitif 1:1). ${entry.note ?? ''}`.trim());
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// theme: tokens IR netral -> objek tema lib (BUKAN createTheme ter-instansiasi).
// dark = turunan shade dari nilai token yang sama (background di-gelapkan, teks dicerahkan).
// ---------------------------------------------------------------------------
function shade(hex, factor) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const ch = (i) => Math.max(0, Math.min(255, Math.round(((num >> (16 - 8 * i)) & 255) * factor)))
    .toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

export function theme(tokens, darkMode = false) {
  const radius = typeof tokens.radius === 'number' ? tokens.radius : Number(tokens.radius || 4);
  const base = {
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: tokens.primary },
      background: { default: tokens.background, paper: tokens.surface },
      text: { primary: tokens.text, secondary: tokens.textMuted },
    },
    shape: { borderRadius: radius },
    typography: { fontFamily: tokens.font },
  };
  if (!darkMode) return base;
  return {
    ...base,
    colorSchemes: {
      dark: {
        palette: {
          mode: 'dark',
          primary: { main: tokens.primary },
          background: { default: shade(tokens.background, 0.2), paper: shade(tokens.surface, 0.25) },
          text: { primary: shade(tokens.text, 3), secondary: shade(tokens.textMuted, 1.5) },
        },
        shape: { borderRadius: radius },
        typography: { fontFamily: tokens.font },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// scaffoldDeps: deps app hasil generate. Versi terpisah di konstanta (pin mudah).
// PINS TERVERIFIKASI EMPIRIS M3 (todo 6): npm view = @mui/material 9.4.0,
// @mui/x-data-grid 9.12.0 (COMMUNITY, MIT, server-mode gratis). v9 membutuhkan
// override webpack `optimization.sideEffects=false` di template craco (barrel
// ESM re-export @mui di-prune sideEffects optimization → "does not contain a
// default export" — verified build exit 0 + boot 200, lihat task-6 evidence).
// @mui/core@alpha BUKAN core (nama legacy pre-material); core = @mui/material.
// ---------------------------------------------------------------------------
const MUI_VERSION = '^9.4.0';        // @mui/material core — v9 terverifikasi registry (M3)
const X_GRID_VERSION = '^9.12.0';    // @mui/x-data-grid COMMUNITY — server-mode gratis (pagination/sort/filter)
const RHF_VERSION = '^7.87.0';       // react-hook-form
const RESOLVERS_VERSION = '^5.9.1';  // @hookform/resolvers (zodResolver)
const ZOD_VERSION = '^3.25.0';       // zod (^3 per keputusan plan; latest 3.x = 3.25.x)
const ROUTER_VERSION = '6.30.1';     // react-router-dom (konvensi tim)
const REACT_VERSION = '19.2.5';      // pin eksak (react-scripts 5.0.1 + react 19.2.5 = stack capacity-management)
const REACT_DOM_VERSION = '19.2.5';  // pin EKSAK (drift T7: caret ^19.2.5 me-resolve 19.2.8 -> peer conflict react ^19.2.8)
const LUCIDE_VERSION = '^1.38.0';    // icon — v1 terverifikasi registry (M3)
const EMOTION_REACT_VERSION = '^11.14.0';   // peer @mui/material v7 (M3: npm view peerDependencies)
const EMOTION_STYLED_VERSION = '^11.14.1';

export function scaffoldDeps() {
  // v1: zustand TIDAK (state context|none di schema) & @mui/x-charts TIDAK (tak ada consumer stats).
  // Fitur MUI berbayar (x-data-grid-pro, x-charts-pro, dst) DILARANG — komunitas only.
  return {
    react: REACT_VERSION,
    'react-dom': REACT_DOM_VERSION,
    '@mui/material': MUI_VERSION,
    '@mui/x-data-grid': X_GRID_VERSION,
    'react-hook-form': RHF_VERSION,
    '@hookform/resolvers': RESOLVERS_VERSION,
    zod: ZOD_VERSION,
    'react-router-dom': ROUTER_VERSION,
    'lucide-react': LUCIDE_VERSION,
    '@emotion/react': EMOTION_REACT_VERSION,
    '@emotion/styled': EMOTION_STYLED_VERSION,
  };
}

// ---------------------------------------------------------------------------
// gateCommand: perintah build konvensi tim (CRA5 + Craco).
// ---------------------------------------------------------------------------
export function gateCommand() {
  return 'craco build';
}