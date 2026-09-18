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

// Ramp brand, 11 stop. Preset dipilih lewat ui.theme.name di FE spec.
//
// `default` memakai HEX terracotta yang selama ini sudah dipakai fe-default, apa
// adanya. Mengonversinya ke OKLCH akan berarti mengarang sebelas angka yang tidak
// pernah diukur - presisi palsu yang mengubah warna yang hari ini sudah benar.
// `crimson` OKLCH karena panduan sumbernya memang menuliskannya begitu, disalin
// verbatim. Dua format dalam satu sistem tidak masalah; CSS menerima keduanya.
//
// PENAMAAN: tanpa awalan `--color-`. Awalan itu adalah namespace tema Tailwind v4,
// dan ramp brand SENGAJA tidak dipetakan menjadi utility - tanpa `bg-brand-600`
// yang bisa dipanggil, aturan "komponen tidak pernah menyentuh primitif brand"
// ditegakkan oleh konstruksi, bukan sekadar oleh review.
export const RAMPS = {
  default: {
    '--brand-50': '#FDF7ED',
    '--brand-100': '#F8E8CD',
    '--brand-200': '#F1CE96',
    '--brand-300': '#EAB05F',
    '--brand-400': '#E5963A',
    '--brand-500': '#DF7E30',
    '--brand-600': '#C3571C',
    '--brand-700': '#A23C1B',
    '--brand-800': '#84301C',
    '--brand-900': '#6D291A',
    '--brand-950': '#3E130A',
  },
  crimson: {
    '--brand-50': 'oklch(0.971 0.013 17.38)',
    '--brand-100': 'oklch(0.936 0.032 17.717)',
    '--brand-200': 'oklch(0.885 0.062 18.334)',
    '--brand-300': 'oklch(0.808 0.114 19.571)',
    '--brand-400': 'oklch(0.704 0.191 22.216)',
    '--brand-500': 'oklch(0.637 0.237 25.331)',
    '--brand-600': 'oklch(0.577 0.245 27.325)',
    '--brand-700': 'oklch(0.505 0.213 27.518)',
    '--brand-800': 'oklch(0.444 0.177 26.899)',
    '--brand-900': 'oklch(0.396 0.141 25.723)',
    '--brand-950': 'oklch(0.258 0.092 26.042)',
  },
};

/**
 * Pilih ramp dari ui.theme.name. Nama tak dikenal TIDAK fatal: ia jatuh ke `default`
 * dan mengembalikan warning. Itu disengaja - ketujuh spec yang ada menulis
 * `name: indigo`, dan menolaknya akan mematahkan semuanya sekaligus.
 */
export function rampFor(name) {
  const key = String(name ?? 'default');
  if (Object.prototype.hasOwnProperty.call(RAMPS, key)) return { ramp: RAMPS[key], warning: null };
  return {
    ramp: RAMPS.default,
    warning: `fe-default: ui.theme.name "${key}" bukan preset yang dikenal (${Object.keys(RAMPS).join(', ')}) - memakai "default"`,
  };
}

// Ramp primitif statis — nilai persis example-component-in-dashboard.html :root.
const STATIC_PRIMITIVES = {
  '--neutral-50': 'oklch(0.984 0.003 247.858)',
  '--neutral-100': 'oklch(0.968 0.007 247.896)',
  '--neutral-200': 'oklch(0.929 0.013 255.508)',
  '--neutral-300': 'oklch(0.869 0.022 252.894)',
  '--neutral-400': 'oklch(0.704 0.04 256.788)',
  '--neutral-500': 'oklch(0.554 0.046 257.417)',
  '--neutral-600': 'oklch(0.446 0.043 257.281)',
  '--neutral-700': 'oklch(0.372 0.044 257.287)',
  '--neutral-800': 'oklch(0.279 0.041 260.031)',
  '--neutral-900': 'oklch(0.208 0.042 265.755)',
  '--neutral-950': 'oklch(0.129 0.042 264.695)',
  '--success-50': 'oklch(0.982 0.018 155.826)',
  '--success-100': 'oklch(0.962 0.044 156.743)',
  '--success-500': 'oklch(0.627 0.194 149.214)',
  '--success-700': 'oklch(0.527 0.154 150.069)',
  '--warning-50': 'oklch(0.98 0.016 73.684)',
  '--warning-100': 'oklch(0.962 0.059 95.617)',
  '--warning-500': 'oklch(0.666 0.179 58.318)',
  '--warning-700': 'oklch(0.555 0.163 48.998)',
  '--info-50': 'oklch(0.977 0.013 236.62)',
  '--info-100': 'oklch(0.951 0.026 236.824)',
  '--info-500': 'oklch(0.546 0.245 262.881)',
  '--info-700': 'oklch(0.488 0.243 264.376)',
  '--elev-1': '0 1px 2px rgb(0 0 0 / 0.05)',
  '--elev-2': '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)',
  '--elev-3': '0 4px 8px rgb(0 0 0 / 0.08), 0 2px 4px rgb(0 0 0 / 0.06)',
  '--elev-4': '0 8px 16px rgb(0 0 0 / 0.1), 0 4px 8px rgb(0 0 0 / 0.06)',
  '--elev-5': '0 16px 32px rgb(0 0 0 / 0.12), 0 8px 16px rgb(0 0 0 / 0.08)',
  '--elev-6': '0 24px 48px rgb(0 0 0 / 0.16), 0 12px 24px rgb(0 0 0 / 0.1)',
};

/**
 * Lapisan semantik: SATU-SATUNYA yang boleh disentuh komponen. Nilai di sini adalah
 * var() polos di :root/.dark; app.css memetakannya ke utility lewat `@theme inline`.
 * Pemetaan itu WAJIB memakai var(), bukan nilai literal - kalau literal masuk ke
 * @theme, Tailwind meresolusinya saat build dan override .dark tidak pernah sampai
 * ke utility: mode gelap gagal diam-diam, build tetap sukses.
 *
 * `tokens` (ui.theme.tokens) adalah OVERRIDE di atas preset, bukan sumber utama.
 */
function semanticAliasesLight(tokens) {
  const radius = typeof tokens.radius === 'number' ? tokens.radius : Number(tokens.radius || 6);
  return {
    '--background': tokens.background || 'oklch(1 0 0)',
    '--foreground': tokens.text || 'var(--neutral-900)',
    '--card': tokens.surface || 'oklch(1 0 0)',
    '--card-foreground': tokens.text || 'var(--neutral-900)',
    '--popover': tokens.surface || 'oklch(1 0 0)',
    '--popover-foreground': tokens.text || 'var(--neutral-900)',
    '--primary': tokens.primary || 'var(--brand-600)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--primary-hover': 'var(--brand-700)',
    '--secondary': 'var(--neutral-100)',
    '--secondary-foreground': tokens.text || 'var(--neutral-900)',
    '--muted': 'var(--neutral-100)',
    '--muted-foreground': tokens.textMuted || 'var(--neutral-500)',
    '--accent': 'var(--neutral-100)',
    '--accent-foreground': tokens.text || 'var(--neutral-900)',
    '--destructive': 'var(--brand-700)',
    '--destructive-foreground': 'oklch(0.985 0 0)',
    '--success': 'var(--success-500)',
    '--success-foreground': 'oklch(0.985 0 0)',
    '--warning': 'var(--warning-500)',
    '--warning-foreground': 'var(--neutral-900)',
    '--info': 'var(--info-500)',
    '--info-foreground': 'oklch(0.985 0 0)',
    '--border': 'var(--neutral-200)',
    '--input': 'var(--neutral-300)',
    '--ring': 'var(--brand-500)',
    '--focus': 'var(--brand-500)',
    // NAMA RUNTIME sengaja `--r-*`, bukan `--radius-*`: `--radius-*` adalah
    // namespace tema Tailwind v4, dan memetakan `--radius-md: var(--radius-md)`
    // di @theme inline akan melingkar ke dirinya sendiri.
    '--r-sm': `${Math.round(radius * 0.667)}px`,
    '--r-md': `${radius}px`,
    '--r-lg': `${Math.round(radius * 1.333)}px`,
    '--r-xl': `${radius * 2}px`,
    '--r-2xl': `${Math.round(radius * 2.667)}px`,
    // Stack LENGKAP, bukan hanya nama keluarga: Task 7 memetakan
    // `--font-sans: var(--font-family)`, jadi apa pun yang hilang di sini hilang
    // dari fallback-nya juga.
    '--font-family': `${tokens.font || 'Instrument Sans'}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  };
}

function semanticAliasesDark(tokens) {
  return {
    '--background': 'oklch(0.145 0.02 255)',
    '--foreground': 'oklch(0.93 0.01 255)',
    '--card': 'oklch(0.185 0.02 255)',
    '--card-foreground': 'oklch(0.93 0.01 255)',
    '--popover': 'oklch(0.22 0.02 255)',
    '--popover-foreground': 'oklch(0.93 0.01 255)',
    '--primary': tokens.primary || 'var(--brand-500)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--primary-hover': 'var(--brand-400)',
    '--secondary': 'oklch(0.22 0.02 255)',
    '--secondary-foreground': 'oklch(0.93 0.01 255)',
    '--muted': 'oklch(0.22 0.02 255)',
    '--muted-foreground': 'oklch(0.65 0.02 255)',
    '--accent': 'oklch(0.22 0.02 255)',
    '--accent-foreground': 'oklch(0.93 0.01 255)',
    '--destructive': 'var(--brand-500)',
    '--destructive-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(0.28 0.02 255)',
    '--input': 'oklch(0.32 0.02 255)',
    '--ring': 'var(--brand-400)',
    '--focus': 'var(--brand-400)',
    // Elevasi rendah ditekan di mode gelap: bayangan tidak terbaca di atas slate
    // gelap, jadi kedalaman dibawa tangga permukaan (card lebih terang dari page).
    '--elev-1': 'none',
    '--elev-2': 'none',
    '--elev-3': 'none',
    '--elev-4': '0 8px 16px rgb(0 0 0 / 0.35)',
    '--elev-5': '0 16px 32px rgb(0 0 0 / 0.4)',
    '--elev-6': '0 24px 48px rgb(0 0 0 / 0.45)',
  };
}

/**
 * @param {object} tokens ui.theme.tokens (override).
 * @param {boolean} darkMode emit blok .dark juga.
 * @param {string} [presetName] ui.theme.name -> pilih ramp brand.
 */
export function theme(tokens = {}, darkMode = false, presetName = undefined) {
  const { ramp } = rampFor(presetName);
  const root = { ...STATIC_PRIMITIVES, ...ramp, ...semanticAliasesLight(tokens) };
  if (!darkMode) return { ':root': root };
  return { ':root': root, '.dark': semanticAliasesDark(tokens) };
}

/**
 * renderTokensCss: objek theme() -> CSS text (`:root{...}\n.dark{...}\n`).
 * Dipanggil scaffold-time (opsional — item 2 rencana: scaffoldApp.mjs bisa menulis
 * src/gen/tokens.css dari fungsi ini bila diwire; belum diwire di M-ini, hanya diexport).
 */
export function renderTokensCss(tokens = {}, darkMode = false, presetName = undefined) {
  const blocks = theme(tokens, darkMode, presetName);
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
const TAILWIND_VERSION = '^4.1.0';
const TAILWIND_POSTCSS_VERSION = '^4.1.0';
const POSTCSS_VERSION = '^8.4.47';

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
    '@tailwindcss/postcss': TAILWIND_POSTCSS_VERSION,
    postcss: POSTCSS_VERSION,
  };
}

export function gateCommand() {
  return 'craco build';
}
