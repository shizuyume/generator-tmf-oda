// neudela.adapter.js — kontrak adapter lib FE kedua (M6): buktikan extensibility generator.
// Kontrak lengkap: generator/libs/README.md. API SAMA dengan mui.adapter.js (resolve/coverage/theme/scaffoldDeps/gateCommand).
// Generator-side config murni: TIDAK meng-import neudela apa pun; emit/consumer yang import dari paket.
//
// Neudela adalah design system minimal. Primitif yg tersedia (src/components): NeuronInput,
// NeuronButton, NeuronBadge, NeuronCard, NeuronToggle, NeuronCheckbox, NeuronRadio,
// NeuronAvatar, NeuronAlert, NeuronBreadcrumb, NeuronButtonGroup, NeuronBadgeGroup,
// NeuronDatePicker, NeuronProgress, NeuronTooltip.
// TIDAK ada NeuronSelect / NeuronTable / NeuronModal / NeuronTabs / data-grid / typeahead /
// timeline primitif. Gap itu = fallback eksplisit (Box + assembling, non-fatal) ATAU
// UNSUPPORTED (throw) + tercatat di coverage() — tidak boleh diam.
import { SCHEMA } from '../src/fe/validateFESpec.mjs';

export const ADAPTER_NAME = 'neudela';
const PKG = 'neudela';

// status tone/status -> NeuronBadge variant (tersedia: gray/brand/error/warning/success/blue/...)
const BADGE_STATUS = {
  success: 'success', active: 'success', ok: 'success',
  error: 'error', failed: 'error', danger: 'error',
  warning: 'warning', info: 'blue', neutral: 'gray', inactive: 'gray',
};
// tone -> NeuronButton variant (tersedia: primary/secondary/outline/text).
const BUTTON_TONE = {
  primary: 'primary',
  secondary: 'outline',
  ghost: 'text',
  link: 'text',
  danger: 'primary',
  warning: 'primary',
  info: 'primary',
};
const mapButtonTone = (props = {}) => {
  const v = BUTTON_TONE[props.tone];
  return v ? { variant: v } : {};
};
// input type semantic -> NeuronInput type prop (NeuronInput menerima `type` string).
const INPUT_TYPE = {
  'text-input': 'text',
  'number-input': 'number',
  'email-input': 'email',
  'password-input': 'password',
};
const mapInputType = (p = {}) => ({ type: INPUT_TYPE[p.semantic] || 'text' });

// Fallback "Box": neudela tak punya primitif layout generik -> pakai div polos + class neuron.
// Emitter merakit konten. Non-fatal (status 'fallback').
const BOX = { module: PKG, export: 'NeuronBox', status: 'fallback', note: 'Neudela tak punya Box primitif — emitter pakai div.neuron-box + assembling runtime (label/value, repeatable, row-actions).' };

const components = {
  'text-input': { module: PKG, export: 'NeuronInput', propsMap: mapInputType },
  textarea: {
    module: PKG, export: 'NeuronInput', status: 'fallback',
    propsMap: (p = {}) => ({ type: 'text' }),
    note: 'NeuronInput tak punya multiline — textarea = fallback input satu baris (NeuronInput). Rows panjang tidak didukung.',
  },
  'number-input': { module: PKG, export: 'NeuronInput', propsMap: mapInputType },
  'email-input': { module: PKG, export: 'NeuronInput', propsMap: mapInputType },
  'password-input': { module: PKG, export: 'NeuronInput', propsMap: mapInputType },
  select: {
    ...BOX,
    note: 'NEUDELA GAP: tak ada NeuronSelect. Fallback input text (NeuronInput) + assembling label. Pilih opsi via data-asli tidak didukung v1.',
  },
  toggle: { module: PKG, export: 'NeuronToggle' },
  'data-grid': {
    module: PKG, export: 'NeuronTable', status: 'unsupported',
    note: 'NEUDELA GAP: data-grid server-mode TIDAK didukung (tak ada DataGrid primitif). Gunakan semantic `table` atau list sederhana.',
  },
  'status-chip': {
    module: PKG, export: 'NeuronBadge',
    propsMap: (p = {}) => ({ variant: BADGE_STATUS[p.status || p.tone] || p.color || 'gray' }),
  },
  tag: { module: PKG, export: 'NeuronBadge', propsMap: () => ({ size: 'sm' }) },
  'row-actions': {
    ...BOX,
    note: 'NEUDELA GAP: tak ada IconButton primitif — fallback NeuronButton iconOnly (ikon + title) via assembling.',
  },
  button: { module: PKG, export: 'NeuronButton', propsMap: mapButtonTone },
  modal: {
    ...BOX,
    note: 'NEUDELA GAP: tak ada NeuronModal — modal = fallback overlay div dasar (non-fatal, minimal).',
  },
  tabs: {
    ...BOX,
    note: 'NEUDELA GAP: tak ada NeuronTabs — fallback tombol segmen (NeuronButton) via assembling.',
  },
  card: { module: PKG, export: 'NeuronCard' },
  'description-list': {
    ...BOX,
    note: 'Neudela tak punya primitif description-list — emitter merakit label/value lewat div.neuron-box.',
  },
  table: {
    ...BOX,
    note: 'NEUDELA GAP: tak ada NeuronTable — fallback HTML <table> polos via assembling runtime.',
  },
  timeline: {
    module: PKG, export: 'NeuronBox', status: 'unsupported',
    note: 'NEUDELA GAP: timeline TIDAK didukung (tak ada primitif). Gunakan description-list/table.',
  },
  'repeatable-group': {
    ...BOX,
    note: 'Neudela tak punya primitif repeatable — emitter pakai useFieldArray (react-hook-form) + div.neuron-box, sama pola mui.',
  },
  // F3: input tipe baru. date/datetime -> NeuronInput type=date (fallback: NeuronInput
  // bukan primitif date-picker khusus, tapi tetap native input yang benar). checkbox ->
  // NeuronCheckbox nyata (covered - props checked/onChange/name kompatibel). radio-group
  // -> UNSUPPORTED: NeuronRadioGroup butuh children NeuronRadio ter-komposisi, bukan
  // options array datar seperti kontrak FieldSpec - assembly-nya BELUM ditulis (bukan
  // sekadar props mapping). Gunakan select sebagai pengganti.
  'date-input': { module: PKG, export: 'NeuronInput', status: 'fallback', propsMap: () => ({ type: 'date' }), note: 'NeuronInput dipakai dengan type="date" - bukan date-picker khusus.' },
  'datetime-input': { module: PKG, export: 'NeuronInput', status: 'fallback', propsMap: () => ({ type: 'datetime-local' }), note: 'NeuronInput dipakai dengan type="datetime-local" - bukan date-picker khusus.' },
  checkbox: { module: PKG, export: 'NeuronCheckbox' },
  'radio-group': { module: PKG, export: 'NeuronBox', status: 'unsupported', note: 'NEUDELA GAP: NeuronRadioGroup butuh children ter-komposisi (NeuronRadio per opsi), bukan options array datar - assembly belum ditulis. Gunakan select.' },
  typeahead: {
    module: PKG, export: 'NeuronBox', status: 'unsupported',
    note: 'NEUDELA GAP: typeahead/autocomplete TIDAK didukung (tak ada primitif). Gunakan select/fallback text.',
  },
  // F7: stat-card fallback via NeuronCard (bukan primitif 1:1 -- emitter merakit label/
  // value). chart: UNSUPPORTED (keputusan user: v1 tanpa dependency chart baru).
  'stat-card': { module: PKG, export: 'NeuronCard', status: 'fallback', note: 'Fallback NeuronCard + assembling label/value/trend/icon (bukan primitif stat-card 1:1).' },
  chart: {
    module: PKG, export: 'NeuronBox', status: 'unsupported',
    note: 'NEUDELA GAP: tak ada primitif chart. emit/dashboard.mjs menulis placeholder + warning.',
  },
};

// tipe yg UNSUPPORTED -> resolve() THROW (kontrak). Tipe fallback -> kembalikan entry non-fatal.
const THROW_SET = new Set(['data-grid', 'timeline', 'typeahead', 'radio-group', 'chart']);

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

// coverage(): iterate schema (SATU-SATUNYA sumber semantic); gap = fallback/unsupported.
export function coverage() {
  return SCHEMA['x-semantic-vocabulary'].map((semantic) => {
    const entry = components[semantic];
    if (!entry) return { semantic, status: 'unsupported' };
    if (entry.status === 'unsupported') return { semantic, status: 'unsupported', module: entry.module };
    return { semantic, status: entry.status || 'covered', module: entry.module };
  });
}

// Semua gap yang terdokumentasi (non-fatal fallback + unsupported) — artifact untuk app uji.
export function libraryWarnings() {
  const list = [];
  for (const [semantic, entry] of Object.entries(components)) {
    if (entry.status === 'unsupported') {
      list.push(`neudela: semantic "${semantic}" UNSUPPORTED (tidak ada primitif). ${entry.note}`);
    } else if (entry.status === 'fallback') {
      list.push(`neudela: semantic "${semantic}" FALLBACK (tanpa primitif 1:1). ${entry.note}`);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// theme: tokens IR netral -> CSS variable object pola neudela tokens.css.
// Bentuk: { ':root': { '--color-primary': ..., ... }, '.dark-theme': { ... } }.
// Scaffold/emit menyuntikkan ini ke stylesheet app (deterministik, scaffold-time).
// ---------------------------------------------------------------------------
export function theme(tokens, darkMode = false) {
  const primary = tokens.primary || '#df7e30';      // brand-500 (terracotta neudela)
  const surface = tokens.surface || '#ffffff';
  const bg = tokens.background || '#ffffff';
  const text = tokens.text || '#334155';            // slate-700
  const textMuted = tokens.textMuted || '#667085';  // slate-500
  const radius = typeof tokens.radius === 'number' ? tokens.radius : Number(tokens.radius || 8);
  const font = tokens.font || "'Inter', system-ui, sans-serif";

  // help func: turunkan hex (gelapkan utk dark) — reuse pendekatan ringan.
  const shade = (hex, factor) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const num = parseInt(h, 16);
    const ch = (i) => Math.max(0, Math.min(255, Math.round(((num >> (16 - 8 * i)) & 255) * factor)))
      .toString(16).padStart(2, '0');
    return `#${ch(0)}${ch(1)}${ch(2)}`;
  };

  const root = {
    '--font-family': font,
    '--color-primary': primary,
    '--color-primary-hover': shade(primary, 0.82),
    '--color-primary-active': shade(primary, 0.7),
    '--color-primary-light': `${primary}22`,
    '--color-bg': bg,
    '--color-bg-canvas': bg,
    '--color-bg-surface': surface,
    '--color-text-primary': text,
    '--color-text-secondary': textMuted,
    '--color-border': shade(textMuted, 2.2),
    '--radius-md': `${radius}px`,
  };

  if (!darkMode) return { ':root': root };

  const dark = {
    '--color-primary': shade(primary, 1.3),
    '--color-primary-hover': shade(primary, 1.05),
    '--color-primary-active': shade(primary, 0.9),
    '--color-primary-light': `${shade(primary, 1.3)}26`,
    '--color-bg': shade(bg, 0.12),
    '--color-bg-canvas': shade(bg, 0.08),
    '--color-bg-surface': shade(surface, 0.22),
    '--color-text-primary': shade(text, 3.2),
    '--color-text-secondary': shade(textMuted, 1.8),
    '--color-border': shade(textMuted, 1.1),
  };
  return { ':root': root, '.dark-theme': dark };
}

// ---------------------------------------------------------------------------
// scaffoldDeps: deps app hasil generate. neudela = local (file: ke folder lib /
// tarball npm pack) karena bukan paket registry publik. react/lucide ikut.
// ---------------------------------------------------------------------------
const NEUDELA_REF = 'file:../../../neudela'; // relatif dari app dir di feTargetRoot
const REACT_VERSION = '19.2.5';
const REACT_DOM_VERSION = '19.2.5';
const RHF_VERSION = '^7.87.0';
const ZOD_VERSION = '^3.25.0';
const ROUTER_VERSION = '6.30.1';
const LUCIDE_VERSION = '^1.38.0';

export function scaffoldDeps() {
  return {
    neudela: NEUDELA_REF,
    react: REACT_VERSION,
    'react-dom': REACT_DOM_VERSION,
    'react-hook-form': RHF_VERSION,
    zod: ZOD_VERSION,
    'react-router-dom': ROUTER_VERSION,
    'lucide-react': LUCIDE_VERSION,
  };
}

export function gateCommand() {
  return 'craco build';
}
