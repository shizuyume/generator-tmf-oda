// mcs-common.adapter.js — semantic vocabulary resolver for the mcs-common template
// (MFE that federates `common_remote` from mcs/general/common at runtime, per
// design-lab/revenue-sharing-algorithm — hand-verified against the real component,
// see generator/tools/check-all.mjs's positive-assertion gate).
//
// NOT registered in libs/adapter.mjs's REGISTRY (that registry is keyed by ui.library,
// which stays 'mui' for this template per decision — federationTemplate is the separate
// axis that selects this adapter). emit/mcs-common/*.mjs imports this module directly.
//
// Unlike mui.adapter.js, most `module` values here point at 'common_remote/<X>' (a
// runtime Module Federation import, resolved by webpack at build/boot time, NOT a real
// npm package on disk) rather than '@mui/material/<X>'. A handful of semantics resolve
// to LOCAL template components (RefAutocompleteField, DetailComponents) instead, exactly
// mirroring which pieces are common_remote-exposed vs. copied-per-MFE boilerplate (see
// mcs/general/common/craco.config.js's real `exposes` map — verified, not guessed).
import { SCHEMA } from '../src/fe/validateFESpec.mjs';

export const ADAPTER_NAME = 'mcs-common';

const components = {
  'text-input': { module: 'common_remote/TextField', export: 'default' },
  textarea: { module: 'common_remote/TextField', export: 'default', propsMap: (p = {}) => ({ multiline: true, rows: p.rows || 3 }) },
  'number-input': { module: 'common_remote/TextField', export: 'default', propsMap: () => ({ type: 'number' }) },
  'email-input': { module: 'common_remote/TextField', export: 'default', propsMap: () => ({ type: 'email' }) },
  'password-input': { module: 'common_remote/TextField', export: 'default', propsMap: () => ({ type: 'password' }) },
  select: { module: 'common_remote/Select', export: 'default', note: 'options via prop array, bukan child <MenuItem> (beda kontrak dari raw MUI Select)' },
  toggle: { module: 'common_remote/Switch', export: 'default' },
  'data-grid': { module: 'common_remote/DataGrid', export: 'default', status: 'covered', note: 'mode="server" - pagination/sort/filter/search via callback props (lihat product-qualification)' },
  'status-chip': { module: 'common_remote/Chip', export: 'default' },
  tag: { module: 'common_remote/Chip', export: 'default' },
  'row-actions': {
    module: 'common_remote/DataGrid', export: 'default', status: 'fallback',
    note: 'Bukan komponen terpisah - onView/onDelete/actionVariant props pada CustomDataGrid yang sama, bukan kolom/tombol tersendiri.',
  },
  button: { module: 'common_remote/Button', export: 'default' },
  modal: { module: 'common_remote/Dialog', export: 'default' },
  tabs: { module: 'common_remote/PillTabs', export: 'default', note: 'PillTabs, bukan raw MUI Tabs - konvensi detail page product-qualification.' },
  card: { module: 'common_remote/Card', export: 'default' },
  'description-list': {
    module: '../components/DetailComponents', export: 'SectionCard', status: 'fallback',
    note: 'Lokal (bukan common_remote) - SectionCard+DetailField dari components/DetailComponents.tsx (file boilerplate template, sama utk semua resource).',
  },
  table: { module: '@mui/material/Table', export: 'Table', note: 'Raw MUI Table (bukan common_remote/Table) - dipakai jga utk mode Table pada card/table toggle (DetailComponents ViewToggle).' },
  timeline: { module: 'common_remote/Timeline', export: 'default' },
  'repeatable-group': {
    module: '@mui/material/Box', export: 'Box', status: 'fallback',
    note: 'Bukan primitif 1:1 - emitter pakai useFieldArray (react-hook-form), Box sbg wrapper row.',
  },
  typeahead: {
    module: '../components/RefAutocompleteField', export: 'RefAutocompleteField', status: 'fallback',
    note: 'Komponen lokal (wraps raw MUI Autocomplete + useDebouncedSearch) - bukan common_remote/AutoComplete, supaya kontrak search/loading/onSearch persis product-qualification.',
  },
  'date-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'date', slotProps: { inputLabel: { shrink: true } } }) },
  'datetime-input': { module: '@mui/material/TextField', export: 'TextField', propsMap: () => ({ type: 'datetime-local', slotProps: { inputLabel: { shrink: true } } }) },
  checkbox: { module: 'common_remote/Checkbox', export: 'default' },
  'radio-group': { module: 'common_remote/RadioGroup', export: 'default' },
  'stat-card': {
    module: 'common_remote/Card', export: 'default', status: 'fallback',
    note: 'Bukan primitif 1:1 - emitter merakit Card + Typography (label/value/trend/icon), sama pola mui.adapter.js.',
  },
  chart: {
    module: '@mui/material/Box', export: 'Box', status: 'unsupported',
    note: 'v1 GAP: sama seperti mui/neudela/fe-default - tak ada page consumer, @mui/x-charts dilarang guardrail.',
  },
};

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

export function coverage() {
  return SCHEMA['x-semantic-vocabulary'].map((semantic) => {
    const entry = components[semantic];
    if (!entry) return { semantic, status: 'unsupported' };
    return { semantic, status: entry.status || 'covered', module: entry.module };
  });
}

export function libraryWarnings() {
  const list = [];
  for (const [semantic, entry] of Object.entries(components)) {
    if (entry.status === 'unsupported') {
      list.push(`mcs-common: semantic "${semantic}" UNSUPPORTED. ${entry.note ?? ''}`.trim());
    } else if (entry.status === 'fallback') {
      list.push(`mcs-common: semantic "${semantic}" FALLBACK (tanpa primitif 1:1). ${entry.note ?? ''}`.trim());
    }
  }
  return list;
}

// theme(): mcs-common template TIDAK punya ThemeProvider sendiri (common_remote's
// components membawa styling sendiri - verified, tidak ada consumer-supplied theme di
// product-qualification). Fungsi ini tetap ada demi kontrak adapter yang seragam
// (scaffoldApp.mjs TIDAK memanggilnya untuk template ini - lihat cabang isMcsCommon).
export function theme() {
  return {};
}

// scaffoldDeps(): SELALU termasuk @mui/material/@mui/icons-material/@emotion penuh
// (BUKAN dihilangkan) - product-qualification punya keduanya: common_remote-exposed
// components DAN raw MUI primitives (Box/Stack/Autocomplete/Table/dst) diimpor langsung
// di banyak file. Versi persis sama dgn package.json.template (single source pin).
export function scaffoldDeps() {
  return {
    react: '^19.2.5',
    'react-dom': '^19.2.5',
    '@mui/material': '^9.0.0',
    '@mui/icons-material': '^9.0.0',
    '@emotion/react': '^11.14.0',
    '@emotion/styled': '^11.14.0',
    'react-hook-form': '7.53.2',
    'react-router-dom': '^6.30.1',
  };
}

export function gateCommand() {
  return 'craco build';
}
