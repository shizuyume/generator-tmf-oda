// fe-default.adapter.js — adapter lib FE ketiga: Tailwind + komponen lokal (src/components/*),
// desain 1:1 port dari example-component-in-dashboard.html (DOOR HRIS dashboard, CSS variables).
// Kontrak lengkap: generator/libs/README.md. API SAMA dengan mui.adapter.js / neudela.adapter.js
// (resolve/coverage/theme/scaffoldDeps/gateCommand) + libraryWarnings() (pola neudela).
//
// fe-default BUKAN paket npm — komponen adalah file lokal di template app
// (generator/templates/fe-default/src/components/*.tsx). module di bawah adalah PATH SIMBOLIK
// (dipakai coverage()/resolve() sesuai kontrak) — TIDAK dipakai literal sebagai import path oleh
// emitter, karena emit/page.mjs merutekan fe-default lewat barrel src/gen/uiwrappers.tsx (pola
// yang SAMA dengan neudela: lihat generalisasi barrelSource() di emit/page.mjs).
import { SCHEMA } from '../src/fe/validateFESpec.mjs';

export const ADAPTER_NAME = 'fe-default';
const SRC = 'src/components';

// tone ($defs.tone schema) -> Button.tsx tone prop (tersedia: default/primary/tertiary/danger).
const BUTTON_TONE = {
  primary: 'primary',
  secondary: 'default',
  ghost: 'tertiary',
  link: 'tertiary',
  danger: 'danger',
  warning: 'danger',
  info: 'default',
};
const mapButtonTone = (props = {}) => ({ tone: BUTTON_TONE[props.tone] || 'default' });

// status/tone -> Badge.tsx tone prop (tersedia: success/warning/danger/neutral).
const BADGE_STATUS = {
  success: 'success', active: 'success', ok: 'success',
  error: 'danger', failed: 'danger', danger: 'danger',
  warning: 'warning',
  info: 'neutral', neutral: 'neutral', inactive: 'neutral',
};
const mapBadgeStatus = (p = {}) => ({ tone: BADGE_STATUS[p.status || p.tone] || 'neutral' });

// input semantic -> TextInput.tsx type prop.
const INPUT_TYPE = {
  'text-input': 'text',
  'number-input': 'number',
  'email-input': 'email',
  'password-input': 'password',
};
const mapInputType = (p = {}) => ({ type: INPUT_TYPE[p.semantic] || 'text' });

// Fallback "Box": fe-default punya banyak primitif nyata, tapi beberapa semantic (tabs sbg
// segmented control, description-list, repeatable-group) bukan primitif 1:1 — emitter merakit
// via div (UiBox) + assembling runtime (label/value, item repeatable, tab buttons). Non-fatal.
const BOX = { module: `${SRC}/Box`, export: 'Box', status: 'fallback' };

const components = {
  'text-input': { module: `${SRC}/TextInput`, export: 'TextInput', propsMap: mapInputType },
  textarea: { module: `${SRC}/TextInput`, export: 'TextInput', propsMap: () => ({ multiline: true }) },
  'number-input': { module: `${SRC}/TextInput`, export: 'TextInput', propsMap: mapInputType },
  'email-input': { module: `${SRC}/TextInput`, export: 'TextInput', propsMap: mapInputType },
  'password-input': { module: `${SRC}/TextInput`, export: 'TextInput', propsMap: mapInputType },
  select: { module: `${SRC}/Select`, export: 'Select' },
  toggle: { module: `${SRC}/Toggle`, export: 'Toggle' },
  'data-grid': {
    module: `${SRC}/DataTable`, export: 'DataTable',
    note: 'fe-default punya DataTable (Table + toolbar search/filter + Pagination) client-side — bukan server DataGrid MUI-grade (sort/filter server-mode terbatas ke useCrudPage).',
  },
  'status-chip': { module: `${SRC}/Badge`, export: 'Badge', propsMap: mapBadgeStatus },
  tag: { module: `${SRC}/Badge`, export: 'Badge', propsMap: () => ({ size: 'sm' }) },
  'row-actions': { module: `${SRC}/IconButton`, export: 'IconButton' },
  button: { module: `${SRC}/Button`, export: 'Button', propsMap: mapButtonTone },
  modal: { module: `${SRC}/Modal`, export: 'Modal' },
  tabs: {
    ...BOX,
    note: 'fe-default tak punya primitif Tabs khusus — fallback tombol segmen (Button) + Box assembling runtime, sama pola neudela.',
  },
  card: { module: `${SRC}/Card`, export: 'Card' },
  'description-list': {
    ...BOX,
    note: 'Bukan primitif 1:1 — emitter merakit label/value lewat Box (div) + Typography (span), sama pola mui/neudela.',
  },
  table: { module: `${SRC}/Table`, export: 'Table' },
  timeline: {
    module: `${SRC}/Box`, export: 'Box', status: 'unsupported',
    note: 'fe-default GAP: timeline TIDAK didukung (tak ada primitif timeline di plan komponen). Gunakan description-list/table.',
  },
  'repeatable-group': {
    ...BOX,
    note: 'Bukan primitif 1:1 — emitter pakai useFieldArray (react-hook-form) + Box (div) wrapper di runtime, sama pola mui/neudela.',
  },
  typeahead: {
    module: `${SRC}/Box`, export: 'Box', status: 'unsupported',
    note: 'fe-default GAP: typeahead/autocomplete TIDAK didukung (tak ada primitif di plan komponen). Gunakan select/fallback text.',
  },
  // F3: input tipe baru — primitif nyata (native HTML), nol dependency.
  'date-input': { module: `${SRC}/DateInput`, export: 'DateInput', propsMap: () => ({ datetime: false }) },
  'datetime-input': { module: `${SRC}/DateInput`, export: 'DateInput', propsMap: () => ({ datetime: true }) },
  checkbox: { module: `${SRC}/Checkbox`, export: 'Checkbox' },
  'radio-group': { module: `${SRC}/RadioGroup`, export: 'RadioGroup' },
  // F7: stat-card primitif NYATA (StatCard.tsx sudah ada sejak template awal) -- fe-default
  // satu-satunya adapter yang covered untuk stat-card. chart: UNSUPPORTED di KETIGA adapter
  // secara sengaja (keputusan user: v1 tanpa dependency chart baru).
  'stat-card': { module: `${SRC}/StatCard`, export: 'StatCard' },
  chart: {
    module: `${SRC}/Box`, export: 'Box', status: 'unsupported',
    note: "fe-default GAP: chart TIDAK dirender (v1 tanpa dependency @mui/x-charts/sejenis). emit/dashboard.mjs menulis placeholder + warning, tidak memanggil resolve('chart').",
  },
};

// tipe UNSUPPORTED -> resolve() THROW (kontrak). Tipe fallback -> entry non-fatal.
const THROW_SET = new Set(['timeline', 'typeahead']);

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
      list.push(`fe-default: semantic "${semantic}" UNSUPPORTED (tidak ada primitif). ${entry.note}`);
    } else if (entry.status === 'fallback') {
      list.push(`fe-default: semantic "${semantic}" FALLBACK (tanpa primitif 1:1). ${entry.note}`);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// theme: tokens IR netral -> CSS variable object, pola example-component-in-dashboard.html.
// Primitif (--color-primary-25..950, --color-gray-25..950, --success/warning/danger/info-*,
// --shadow-*) TETAP STATIS (nilai dari HTML) karena YAML tokens hanya bawa 1 warna/radius —
// bukan ramp 11-step. HANYA lapisan alias semantik (--bg-*, --text-*, --border-*, --focus-ring,
// --radius-*) yang mengikuti tokens IR (primary/surface/background/text/textMuted/radius/font).
// Bentuk: { ':root': {...}, '[data-theme="dark"]': {...} } — scaffoldApp menulis ini ke
// src/gen/theme.generated.ts (genThemeLight/genThemeDark); template committed src/gen/tokens.css
// menyimpan salinan statis penuh (termasuk [data-accent=blue|green], TIDAK token-driven).
// ---------------------------------------------------------------------------

// help func: turunkan hex (gelapkan/cerahkan) — reuse pendekatan ringan mui/neudela.adapter.js.
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

// Ramp primitif statis — nilai persis example-component-in-dashboard.html :root.
const STATIC_PRIMITIVES = {
  '--color-primary-25': '#FFFCF7', '--color-primary-50': '#FDF7ED', '--color-primary-100': '#F8E8CD',
  '--color-primary-200': '#F1CE96', '--color-primary-300': '#EAB05F', '--color-primary-400': '#E5963A',
  '--color-primary-500': '#DF7E30', '--color-primary-600': '#C3571C', '--color-primary-700': '#A23C1B',
  '--color-primary-800': '#84301C', '--color-primary-900': '#6D291A', '--color-primary-950': '#3E130A',
  '--color-gray-25': '#FCFCFD', '--color-gray-50': '#F9FAFB', '--color-gray-100': '#F2F4F7',
  '--color-gray-200': '#E4E7EC', '--color-gray-300': '#D0D5DD', '--color-gray-400': '#98A2B3',
  '--color-gray-500': '#4F596E', '--color-gray-600': '#475467', '--color-gray-700': '#344054',
  '--color-gray-800': '#182230', '--color-gray-900': '#101828', '--color-gray-950': '#0C111D',
  '--success-50': '#ECFDF3', '--success-500': '#12B76A', '--success-700': '#027A48',
  '--warning-50': '#FFFAEB', '--warning-500': '#F79009', '--warning-700': '#B54708',
  '--danger-50': '#FEF3F2', '--danger-500': '#D92D20', '--danger-700': '#B42318',
  '--info-50': '#EFF8FF', '--info-500': '#2E90FA', '--info-700': '#175CD3',
  '--shadow-xs': '0 1px 2px rgba(16,24,40,.05)',
  '--shadow-sm': '0 1px 3px rgba(16,24,40,.10),0 1px 2px rgba(16,24,40,.06)',
  '--shadow-md': '0 4px 8px rgba(16,24,40,.10)',
  '--shadow-lg': '0 12px 24px rgba(16,24,40,.12)',
};

function semanticAliasesLight(tokens) {
  const primary = tokens.primary || '#DF7E30';
  const surface = tokens.surface || '#FFFFFF';
  const background = tokens.background || '#FCFCFD';
  const text = tokens.text || '#101828';
  const textMuted = tokens.textMuted || '#4F596E';
  const radius = typeof tokens.radius === 'number' ? tokens.radius : Number(tokens.radius || 8);
  return {
    '--bg-app': background,
    '--bg-surface': surface,
    '--bg-surface-secondary': shade(surface, 0.97),
    '--bg-brand': primary,
    '--bg-brand-subtle': `${primary}19`,
    '--bg-brand-strong': shade(primary, 0.55),
    '--text-primary': text,
    '--text-secondary': textMuted,
    '--text-disabled': shade(textMuted, 1.5),
    '--text-brand': primary,
    '--text-on-brand': '#FFFFFF',
    '--border-default': shade(textMuted, 2.2),
    '--border-strong': shade(textMuted, 1.8),
    '--focus-ring': `color-mix(in srgb, ${primary} 40%, transparent)`,
    '--radius-sm': `${Math.round(radius * 0.75)}px`,
    '--radius-md': `${radius}px`,
    '--radius-lg': `${Math.round(radius * 1.5)}px`,
    '--radius-xl': `${radius * 2}px`,
    '--radius-full': '9999px',
    '--font-family': tokens.font || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };
}

function semanticAliasesDark(tokens) {
  const primary = tokens.primary || '#DF7E30';
  const surface = tokens.surface || '#FFFFFF';
  const background = tokens.background || '#FCFCFD';
  const text = tokens.text || '#101828';
  const textMuted = tokens.textMuted || '#4F596E';
  const primaryLight = shade(primary, 1.15);
  return {
    '--bg-app': shade(background, 0.08),
    '--bg-surface': shade(surface, 0.15),
    '--bg-surface-secondary': shade(surface, 0.25),
    '--bg-brand': primaryLight,
    '--bg-brand-subtle': `color-mix(in srgb, ${shade(primary, 0.5)} 40%, transparent)`,
    '--bg-brand-strong': shade(primary, 0.55),
    '--text-primary': shade(text, 3.5),
    '--text-secondary': shade(textMuted, 1.8),
    '--text-disabled': shade(textMuted, 1.1),
    '--text-brand': primaryLight,
    '--text-on-brand': '#FFFFFF',
    '--border-default': shade(textMuted, 1.1),
    '--border-strong': shade(textMuted, 0.9),
    '--focus-ring': `color-mix(in srgb, ${primaryLight} 50%, transparent)`,
  };
}

export function theme(tokens = {}, darkMode = false) {
  const root = { ...STATIC_PRIMITIVES, ...semanticAliasesLight(tokens) };
  if (!darkMode) return { ':root': root };
  return { ':root': root, '[data-theme="dark"]': semanticAliasesDark(tokens) };
}

/**
 * renderTokensCss: objek theme() -> CSS text (`:root{...}\n[data-theme="dark"]{...}\n`).
 * Dipanggil scaffold-time (opsional — item 2 rencana: scaffoldApp.mjs bisa menulis
 * src/gen/tokens.css dari fungsi ini bila diwire; belum diwire di M-ini, hanya diexport).
 */
export function renderTokensCss(tokens = {}, darkMode = false) {
  const blocks = theme(tokens, darkMode);
  return Object.entries(blocks)
    .map(([sel, vars]) => `${sel}{\n${Object.entries(vars).map(([k, v]) => `  ${k}:${v};`).join('\n')}\n}\n`)
    .join('');
}

// ---------------------------------------------------------------------------
// scaffoldDeps: deps app hasil generate. fe-default = Tailwind + local components — TIDAK ada
// paket UI eksternal (bukan @mui/*, bukan neudela). react/lucide/rhf/zod pins sama konvensi tim.
// ---------------------------------------------------------------------------
const REACT_VERSION = '19.2.5';
const REACT_DOM_VERSION = '19.2.5';
const RHF_VERSION = '^7.87.0';
const RESOLVERS_VERSION = '^5.9.1';
const ZOD_VERSION = '^3.25.0';
const ROUTER_VERSION = '6.30.1';
const LUCIDE_VERSION = '^1.38.0';
const TAILWIND_VERSION = '^3.4.0';
const POSTCSS_VERSION = '^8.4.0';
const AUTOPREFIXER_VERSION = '^10.4.0';

export function scaffoldDeps() {
  return {
    react: REACT_VERSION,
    'react-dom': REACT_DOM_VERSION,
    'react-router-dom': ROUTER_VERSION,
    'react-hook-form': RHF_VERSION,
    '@hookform/resolvers': RESOLVERS_VERSION,
    zod: ZOD_VERSION,
    'lucide-react': LUCIDE_VERSION,
    tailwindcss: TAILWIND_VERSION,
    postcss: POSTCSS_VERSION,
    autoprefixer: AUTOPREFIXER_VERSION,
  };
}

export function gateCommand() {
  return 'craco build';
}
