// validateFESpec.mjs — M0 FE-spec validator (ajv draft 2020-12 + js-yaml + custom gate checks)
// API: validateFile(path) / validateString(src) -> { ok, name, errors: [{pointer, message, line?}] }
// CLI: node validateFESpec.mjs <file...>  (exit 1 bila ada file invalid)
// cross-checked by todo 4 (buildFEIR) — keep exports stable.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'fe-spec.schema.json');
const ICONS_PATH = path.join(__dirname, '..', 'schema', 'lucide-icons.json');

// Fallback minimal bila capture lucide gagal / snapshot hilang.
const FALLBACK_ICONS = [
  'LayoutDashboard', 'Users', 'Eye', 'Pencil', 'Trash2', 'Plus', 'Percent',
  'ShoppingCart', 'FilePlus', 'Settings', 'LogOut', 'Search', 'Bell', 'ChevronLeft',
];

const SECRET_KEY_RE = /x-api-key|api[_-]?key|authorization|token|secret/i;

let _schemaPromise;
let _iconsPromise;

function compileSchema() {
  if (!_schemaPromise) {
    _schemaPromise = (async () => {
      const raw = await readFile(SCHEMA_PATH, 'utf8');
      const schema = JSON.parse(raw);
      // verbose: true -> ajv menyertakan err.data (nilai yang salah) di setiap error, bukan
// hanya di error root. Tanpa ini "Unknown field type: ..." tak bisa menyebut nilai yang
// salah (F2, requirement doc §20).
const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true });
      addFormats(ajv);
      return ajv.compile(schema);
    })();
  }
  return _schemaPromise;
}

async function loadIcons() {
  if (!_iconsPromise) {
    _iconsPromise = (async () => {
      try {
        const list = JSON.parse(await readFile(ICONS_PATH, 'utf8'));
        return Array.isArray(list) && list.length ? new Set(list) : new Set(FALLBACK_ICONS);
      } catch {
        return new Set(FALLBACK_ICONS);
      }
    })();
  }
  return _iconsPromise;
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** JSON Pointer -> path bergaya dotted (F2, doc §20): '/pages/0/form/fields/2/type'
 * -> 'pages[0].form.fields[2].type'. Dipakai formatErrors() dan (via pushError) setiap
 * error hand-gate, supaya SATU bentuk path dipakai di semua error, ajv maupun custom. */
export function dottedPath(pointer) {
  if (!pointer || pointer === '/') return '(root)';
  return pointer
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, seg) => (/^\d+$/.test(seg) ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');
}

// Nama ramah per bentuk pointer 'type'/'render'/dst — dipakai formatErrors() untuk pesan
// "Unknown <label>: ...". Daftar mencakup bentuk yang BELUM ada (chart/transform/shape
// kind) supaya milestone berikutnya (F3/F5/F7) tidak perlu menyentuh fungsi ini lagi.
function labelFor(pointer) {
  const seg = (pointer || '').split('/').filter(Boolean);
  const last = seg[seg.length - 1] ?? '';
  if (last === 'type') {
    const container = /^\d+$/.test(seg[seg.length - 2]) ? seg[seg.length - 3] : seg[seg.length - 2];
    if (container === 'charts') return 'chart type';
    if (container === 'columns') return 'column type';
    if (container === 'blocks') return 'block type';
    if (container === 'sections') return 'section type';
    return 'field type';
  }
  if (last === 'view') return 'page view';
  if (last === 'render') return 'render kind';
  if (last === 'transform') return 'transform verb';
  if (last === 'kind') return 'shape kind';
  if (last === 'library') return 'ui library';
  return last || 'value';
}

// Keyword kombinator ajv ('must match one/all/if/then/else schema') tidak pernah
// menjelaskan APA yang salah - hanya membungkus error yang lebih spesifik. Dibuang
// HANYA bila ada error leaf (enum/pattern/dst) lain yang lebih informatif; bila
// kombinator satu-satunya error, dipertahankan (jangan sampai 0 error tersisa).
const COMBINATOR_KEYWORDS = new Set(['oneOf', 'anyOf', 'allOf', 'if', 'then', 'else']);
const LEAF_KEYWORDS = new Set([
  'enum', 'pattern', 'type', 'required', 'minLength', 'maxLength',
  'minimum', 'maximum', 'additionalProperties', 'format', 'const',
]);

export function pruneAjvErrors(errors) {
  const hasLeaf = errors.some((e) => LEAF_KEYWORDS.has(e.keyword));
  if (!hasLeaf) return errors;
  return errors.filter((e) => !COMBINATOR_KEYWORDS.has(e.keyword));
}

/** Satu renderer dipakai SEMUA call-site (validator CLI, `fe-ir`, `fe-gen scaffold/emit`)
 * supaya format doc §20 tidak bisa drift antar tempat. */
export function formatErrors(errors, { name } = {}) {
  const L = [];
  L.push(`Invalid FE Spec${name ? `: ${name}` : ''}:`);
  for (const e of errors) {
    L.push('');
    L.push(`${e.path ?? dottedPath(e.pointer)}${e.line ? `   (line ${e.line})` : ''}`);
    L.push('');
    L.push(e.message);
    if (e.allowed?.length) {
      L.push('');
      L.push('Supported:');
      for (const v of e.allowed) L.push(`- ${v}`);
    }
  }
  return L.join('\n') + '\n';
}

// Best-effort: petakan JSON pointer ke nomor baris YAML (cari leaf key setelah parent key).
function lineForPointer(pointer, lines) {
  if (!pointer) return null;
  const parts = pointer.split('/').filter(Boolean);
  const keys = parts.filter(p => !/^\d+$/.test(p));
  if (!keys.length) return null;
  const leaf = keys[keys.length - 1];
  const parent = keys.length > 1 ? keys[keys.length - 2] : null;
  const leafLines = [];
  const parentLines = [];
  lines.forEach((ln, i) => {
    if (/^\s*#/.test(ln)) return;
    if (new RegExp(`^\\s*${esc(leaf)}\\s*:`).test(ln)) leafLines.push(i + 1);
    if (parent && new RegExp(`^\\s*${esc(parent)}\\s*:`).test(ln)) parentLines.push(i + 1);
  });
  if (!leafLines.length) return null;
  if (parentLines.length) {
    for (const pl of parentLines) {
      const after = leafLines.find(l => l >= pl);
      if (after) return after;
    }
  }
  return leafLines[leafLines.length - 1];
}

function pushError(errors, lines, pointer, message) {
  errors.push({
    pointer: pointer || '/',
    path: dottedPath(pointer),
    message,
    line: lineForPointer(pointer, lines),
  });
}

// Gate 1 — normalisasi ui.version: library mui wajib ^9.x (tolak ^6).
async function checkUiVersion(doc, errors, lines) {
  const ui = doc.ui || {};
  if (ui.library === 'mui' && typeof ui.version === 'string' && !/^\^9(\.|$)/.test(ui.version.trim())) {
    pushError(errors, lines, '/ui/version',
      `ui.library=mui menuntut version ^9.x (normalisasi v1), dapat "${ui.version}"`);
  }
}

// Gate 2 — secret header (x-api-key/token/...) wajib {{config.*}}, TIDAK {{env.*}}.
async function checkHeaders(doc, errors, lines) {
  const headers = (doc.api && doc.api.headers) || {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') continue;
    if (SECRET_KEY_RE.test(key) && /\{\{env\./.test(value)) {
      pushError(errors, lines, `/api/headers/${key}`,
        `header "${key}" adalah secret; DILARANG {{env.*}} — wajib {{config.*}} (runtime)`);
    }
  }
}

// Gate 3 — icon harus PascalCase SAH dari snapshot lucide-icons.json.
async function checkIcons(doc, errors, lines) {
  const iconSet = await loadIcons();
  const seen = new Set();
  const visit = (value, pointer) => {
    if (seen.has(pointer) || value == null) return;
    seen.add(pointer);
    if (typeof value !== 'string') return;
    if (!/^[A-Z][A-Za-z0-9]+$/.test(value)) {
      pushError(errors, lines, pointer, `icon "${value}" harus PascalCase ^[A-Z][A-Za-z0-9]+$`);
      return;
    }
    if (!iconSet.has(value)) {
      pushError(errors, lines, pointer, `icon "${value}" bukan nama lucide-react yang sah (snapshot lucide-icons.json)`);
    }
  };

  const pages = doc.pages || [];
  pages.forEach((p, pi) => {
    const base = `/pages/${pi}`;
    visit(p.icon, `${base}/icon`);
    (p.dashboard?.stats || []).forEach((s, si) => visit(s.icon, `${base}/dashboard/stats/${si}/icon`));
    (p.list?.columns || []).forEach((c, ci) => {
      (c.items || []).forEach((it, ii) => visit(it.icon, `${base}/list/columns/${ci}/items/${ii}/icon`));
    });
    (p.actions || []).forEach((a, ai) => visit(a.icon, `${base}/actions/${ai}/icon`));
    (p.detail?.header?.actions || []).forEach((a, ai) => visit(a.icon, `${base}/detail/header/actions/${ai}/icon`));
  });

  const walkNav = (items, pointer) => {
    (items || []).forEach((it, i) => {
      const p = `${pointer}/${i}`;
      visit(it.icon, `${p}/icon`);
      walkNav(it.children, `${p}/children`);
    });
  };
  walkNav(doc.layout?.sidebar?.items, '/layout/sidebar/items');
}

// Gate 4 (F5) -- registry API bertipe: nama unik, tiap apiRef resolve, tiap kind:"ref"
// resolve ke models tanpa siklus. ajv TIDAK BISA menyatakan cross-reference semacam ini
// (nama di satu array harus cocok ke array lain) -- makanya gate tangan, bukan schema.
// Gate 5 (F7) -- dashboardSource harus merujuk apis[].name yang ADA. Berbeda dari
// checkApiRegistry (apiRef): dashboardSource format "<apiName>.<path>" (bukan nama field
// terpisah), jadi diperiksa terpisah. charts[] TIDAK fetch (v1), tapi source-nya tetap
// diperiksa supaya spec tidak diam-diam menunjuk api yang tak pernah ada.
function checkDashboardSources(doc, errors, lines) {
  const apiNames = new Set((doc.apis ?? []).map((a) => a.name));
  const checkSource = (source, pointer) => {
    if (!source) return;
    const apiName = String(source).split('.')[0];
    if (!apiNames.has(apiName)) {
      pushError(errors, lines, pointer, `dashboardSource "${source}" merujuk api "${apiName}" yang tidak ada di apis[] (nama terdaftar: ${[...apiNames].join(', ') || '-'})`);
    }
  };
  (doc.pages ?? []).forEach((p, pi) => {
    if (p.view !== 'dashboard' || !p.dashboard) return;
    const base = `/pages/${pi}/dashboard`;
    (p.dashboard.stats ?? []).forEach((s, si) => checkSource(s.value?.source, `${base}/stats/${si}/value/source`));
    (p.dashboard.charts ?? []).forEach((c, ci) => checkSource(c.source, `${base}/charts/${ci}/source`));
    (p.dashboard.tables ?? []).forEach((tb, ti) => checkSource(tb.source, `${base}/tables/${ti}/source`));
  });
}

function checkApiRegistry(doc, errors, lines) {
  const apis = doc.apis ?? [];
  const models = doc.models ?? {};
  const seen = new Map();
  for (const [i, a] of apis.entries()) {
    const ptr = `/apis/${i}/name`;
    if (seen.has(a.name)) {
      pushError(errors, lines, ptr, `apis[].name "${a.name}" duplikat (juga di index ${seen.get(a.name)})`);
    } else {
      seen.set(a.name, i);
    }
  }
  const apiNames = new Set(apis.map((a) => a.name));

  const visitedModels = new Set();
  function checkShapeRefs(node, pointer, chain) {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'ref') {
      visitedModels.add(node.ref);
      if (!(node.ref in models)) {
        pushError(errors, lines, `${pointer}/ref`, `models tidak punya entry "${node.ref}" (dirujuk shapeNode kind:ref)`);
        return;
      }
      if (chain.includes(node.ref)) {
        pushError(errors, lines, `${pointer}/ref`, `models memiliki siklus: ${[...chain, node.ref].join(' -> ')}`);
        return;
      }
      checkShapeRefs(models[node.ref], `/models/${node.ref}`, [...chain, node.ref]);
      return;
    }
    if (node.kind === 'object') {
      for (const [k, v] of Object.entries(node.properties ?? {})) checkShapeRefs(v, `${pointer}/properties/${k}`, chain);
    }
    if (node.kind === 'array') checkShapeRefs(node.items, `${pointer}/items`, chain);
  }
  for (const [i, a] of apis.entries()) {
    if (a.response?.shape) checkShapeRefs(a.response.shape, `/apis/${i}/response/shape`, []);
  }
  // models yang SUDAH tercapai lewat traversal apis[] di atas tidak diperiksa ulang di sini
  // (chain sudah menyertakan nama model itu) - hanya model yang TIDAK dirujuk apapun yang
  // butuh pemeriksaan berdiri sendiri, supaya siklus/ref rusak tidak lolos diam-diam hanya
  // karena tak ada api yang memakainya.
  for (const name of Object.keys(models)) {
    if (visitedModels.has(name)) continue;
    checkShapeRefs(models[name], `/models/${name}`, [name]);
  }

  const checkApiRef = (value, pointer) => {
    if (value !== undefined && !apiNames.has(value)) {
      pushError(errors, lines, pointer, `apiRef "${value}" tidak ada di apis[] (nama terdaftar: ${[...apiNames].join(', ') || '-'})`);
    }
  };
  (doc.pages ?? []).forEach((p, pi) => {
    checkApiRef(p.list?.apiRef, `/pages/${pi}/list/apiRef`);
    checkApiRef(p.form?.api?.ref, `/pages/${pi}/form/api/ref`);
    checkApiRef(p.detail?.apiRef, `/pages/${pi}/detail/apiRef`);
    for (const [key, form] of Object.entries(p.forms ?? {})) {
      checkApiRef(form?.api?.ref, `/pages/${pi}/forms/${key}/api/ref`);
    }
  });
}

export async function validateString(source, { name = '<string>' } = {}) {
  const lines = source.split(/\r?\n/);
  let doc;
  try {
    doc = yaml.load(source);
  } catch (e) {
    return {
      ok: false, name,
      errors: [{ pointer: '/', message: `YAML parse error: ${e.message}`, line: e.mark ? e.mark.line + 1 : null }],
    };
  }
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, name, errors: [{ pointer: '/', message: 'Root dokumen harus mapping (object)' }] };
  }

  const errors = [];
  const validate = await compileSchema();
  if (!validate(doc)) {
    // pruneAjvErrors dulu (buang derau oneOf/anyOf/if/then/else) SEBELUM dipetakan ke
    // bentuk errors[] - supaya nomor baris/pointer yang tersisa persis error yang berarti.
    for (const err of pruneAjvErrors(validate.errors || [])) {
      const pointer = err.instancePath || '/';
      const entry = {
        pointer,
        path: dottedPath(pointer),
        message: err.keyword === 'enum'
          ? `Unknown ${labelFor(pointer)}: ${JSON.stringify(err.data)}`
          : (err.message || 'invalid'),
        line: lineForPointer(pointer, lines),
      };
      if (err.keyword === 'enum') entry.allowed = err.params?.allowedValues;
      errors.push(entry);
    }
  }

  await checkUiVersion(doc, errors, lines);
  await checkHeaders(doc, errors, lines);
  await checkIcons(doc, errors, lines);
  checkApiRegistry(doc, errors, lines);
  checkDashboardSources(doc, errors, lines);

  return { ok: errors.length === 0, name, errors };
}

export async function validateFile(filePath) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (e) {
    return { ok: false, name: filePath, errors: [{ pointer: '/', message: `Tidak dapat membaca file: ${e.message}` }] };
  }
  return validateString(source, { name: filePath });
}

export const SCHEMA = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));

// CLI entry (hanya saat dijalankan langsung)
const __main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (__main) {
  const targets = process.argv.slice(2);
  let failed = false;
  for (const t of targets) {
    const r = await validateFile(t);
    if (r.ok) {
      console.log(`OK ${t}`);
    } else {
      failed = true;
      console.error(formatErrors(r.errors, { name: t }));
    }
  }
  process.exit(failed ? 1 : 0);
}