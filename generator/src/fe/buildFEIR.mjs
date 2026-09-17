// buildFEIR.mjs — M2 FE IR builder (todo 4): parse YAML → validate (todo 1, reuse, never
// duplicate) → normalize → FE IR JSON. Zod codegen is NOT here (that's todo 8).
//
// API: buildFEIR(yamlSource|specPath) -> Promise<{ ir, summary }>
//   | throws FEIRError (exit code handled by the caller — cli.mjs `fe-ir` exits 2).
//
// Determinism contract: pure function of the document (+ validator schema). No clock,
// no random, no absolute paths — `source` is stored as a bare basename. Two runs on
// the same file produce byte-identical JSON.
//
// Binding resolution contract (documented in the IR under `bindingSources`):
//   namespaces resmi: env (non-secret), config (secret/runtime), query, pagination
//   (offset|limit|page|perPage), perPage, search.q, filter.X, index, item, api.basePath.
//   Var dgn prefix tak dikenal → THROW (pola BE "rendering throws on any placeholder").
//   {{env.*}} pada key secret (x-api-key/token/...) → THROW (wajib {{config.*}}).
//   Prefix bebas di luar namespace = pageContext, SAH hanya bila muncul DI DALAM halaman
//   (pages[]) — di luar halaman dianggap var tak dikenal. Resolusi {{api.basePath}}:
//   special-case → meta.api.basePath (konfigurasi global), bukan runtime registry
//   (keputusan didokumentasikan di bindingSources.api).
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateString, SCHEMA } from './validateFESpec.mjs';

export class FEIRError extends Error {
  constructor(message, { pointer = null, line = null, errors = null } = {}) {
    super(message);
    this.name = 'FEIRError';
    this.code = 'FEIRError';
    this.pointer = pointer;
    this.line = line;
    this.errors = errors; // [{ pointer, message, line }] — bentuk sama dgn validator todo 1
  }
}

const VOCAB = new Set(SCHEMA['x-semantic-vocabulary'] || []);
const FIELD_TYPE_SEMANTIC = {
  text: 'text-input',
  textarea: 'textarea',
  number: 'number-input',
  email: 'email-input',
  password: 'password-input',
  select: 'select',
  toggle: 'toggle',
  repeatable: 'repeatable-group',
  // F3
  date: 'date-input',
  datetime: 'datetime-input',
  checkbox: 'checkbox',
  radio: 'radio-group',
  autocomplete: 'typeahead', // vocabulary LAMA (M0) - bukan entri baru
};
const BLOCK_SEMANTIC = { card: 'card', 'description-list': 'description-list', table: 'table', timeline: 'timeline', tabs: 'tabs' };
const VALIDATION_RULES = new Set(['required', 'minLength', 'maxLength', 'email', 'min', 'max', 'pattern']);
const RESERVED = new Set(['env', 'config', 'query', 'pagination', 'perPage', 'search', 'filter', 'index', 'item', 'api']);
const PAGINATION_KEYS = new Set(['offset', 'limit', 'page', 'perPage']);
const SECRET_KEY_RE = /x-api-key|api[_-]?key|authorization|token|secret/i;

const BINDING_SOURCES = {
  env: 'nilai NON-secret dari build-env. DILARANG untuk header secret (x-api-key/token/...) — wajib {{config.*}}.',
  config: 'nilai secret/runtime dari gen.config (host injection / login runtime). Tidak pernah di-bundle.',
  query: 'query param lain dari halaman list.',
  pagination: 'state pagination server-side: offset|limit|page|perPage.',
  perPage: 'ukuran halaman (bare {{perPage}}).',
  search: 'q — debounced server-side search.',
  filter: 'X — filter toolbar list.',
  index: 'indeks item repeatable (dipakai itemLabel).',
  item: 'X — data item repeatable (rekonstruksi itemPayload).',
  api: 'KEPUTUSAN: {{api.basePath}} di-resolve ke meta.api.basePath (konfigurasi global dokumen), BUKAN runtime registry — path endpoint list/form/detail memakainya.',
  pageContext: '<prefix>.* — konteks entitas halaman detail (mis. {{algo.name}}, {{user.email}}). Prefix bebas; SAH hanya di dalam halaman (outside pages → var tak dikenal). Terdaftar per halaman di page.bindingRefs.',
};

/* ── JSON pointer helpers (RFC 6901) + line lookup ─────────────────── */

const escapePtr = s => s.replace(/~/g, '~0').replace(/\//g, '~1');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/* ── binding + semantic scan (recursive walk of the parsed document) ─ */

// T1 (plan v1 §5 F2): scan() dulu mengklasifikasikan SETIAP key bernama `type` di
// seluruh dokumen sebagai semantic FE dan FAIL bila tak dikenal — itu membuat penambahan
// key `type` non-semantic manapun (mis. dashboardChart.type: 'line') mustahil tanpa
// membongkar classifier ini. Diganti allow-list pointer: hanya bentuk yang MEMANG berarti
// semantic FE yang diperiksa; di luar itu `type` adalah data biasa milik schema lain,
// divalidasi enum-nya sendiri oleh ajv, bukan oleh classifier ini. Tetap fail-closed DI
// DALAM tiap bentuk yang terdaftar (nilai tak dikenal pada pointer yang cocok tetap FAIL).
const SEMANTIC_TYPE_PTR = [
  /\/fields\/\d+\/type$/,      // form.fields[].type (top-level maupun itemFields[].itemFields[])
  /\/itemFields\/\d+\/type$/,  // field repeatable: itemFields[].type
  /\/columns\/\d+\/type$/,     // list.columns[].type (row-actions)
  /\/blocks\/\d+\/type$/,      // detail.sections[].tabs[].blocks[].type
  /\/sections\/\d+\/type$/,    // detail.sections[].type (tabs)
];

function scan(doc, lines) {
  const bindings = new Map(); // var -> { var, source, ref, paths[], pageId? }
  const semantic = new Set();
  const renders = new Set();
  const fail = (pointer, message) => {
    throw new FEIRError(message, { pointer, line: lineForPointer(pointer, lines) });
  };

  function classifyType(pointer, v) {
    const mapped = FIELD_TYPE_SEMANTIC[v];
    if (mapped) {
      if (!VOCAB.has(mapped)) fail(pointer, `semantic type "${mapped}" bukan bagian enum M0 (x-semantic-vocabulary)`);
      semantic.add(mapped);
      return;
    }
    if (v === 'row-actions') { semantic.add('row-actions'); return; }
    if (BLOCK_SEMANTIC[v]) { semantic.add(v); return; }
    if (v === 'summary') return; // blockType schema-mandated layout alias — bukan semantic vocab
    fail(pointer, `semantic type "${v}" bukan bagian enum M0 (x-semantic-vocabulary)`);
  }

  function resolveVar(token, pointer) {
    const dot = token.indexOf('.');
    const first = dot === -1 ? null : token.slice(0, dot);
    const rest = dot === -1 ? null : token.slice(dot + 1);
    if (!first) {
      if (token === 'index') return { source: 'index', ref: 'index' };
      if (token === 'perPage') return { source: 'perPage', ref: 'perPage' };
      fail(pointer, `var "${token}" tak dikenal: bukan namespace resmi dan bukan bentuk X.Y`);
    }
    if (RESERVED.has(first)) {
      switch (first) {
        case 'env': case 'config': case 'query': case 'item': return { source: first, ref: rest };
        case 'pagination':
          if (!PAGINATION_KEYS.has(rest)) fail(pointer, `pagination key "${rest}" tak dikenal (resmi: offset|limit|page|perPage)`);
          return { source: 'pagination', ref: rest };
        case 'search':
          if (rest !== 'q') fail(pointer, `search key "${rest}" tak dikenal (resmi: q)`);
          return { source: 'search', ref: rest };
        case 'filter': return { source: 'filter', ref: rest };
        case 'api':
          if (rest !== 'basePath') fail(pointer, `api key "${rest}" tak dikenal (resmi: basePath)`);
          return { source: 'api', ref: 'basePath' };
        /* perPage/index never reach here (bare form handled above) */
      }
    }
    // prefix bebas → pageContext; WAJIB di dalam cakupan halaman.
    const m = pointer.match(/^\/pages\/(\d+)/);
    if (!m) {
      fail(pointer, `var "${token}" tak dikenal: prefix "${first}" bukan namespace resmi (env|config|query|pagination|perPage|search|filter|index|item|api) dan berada di luar cakupan halaman (pageContext hanya sah di dalam pages[])`);
    }
    const pageId = doc.pages?.[Number(m[1])]?.id ?? first;
    return { source: 'pageContext', ref: first, pageId };
  }

  function scanValue(v, pointer, key) {
    if (typeof v === 'string') {
      // TEGASKAN ulang aturan secret (todo 1 sudah gate; defense-in-depth di sini):
      if (SECRET_KEY_RE.test(key || '') && /\{\{env\./.test(v)) {
        fail(pointer, `key "${key}" adalah secret; DILARANG {{env.*}} — wajib {{config.*}} (runtime)`);
      }
      for (const m of v.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const token = m[1].trim();
        const r = resolveVar(token, pointer);
        let e = bindings.get(token);
        if (!e) {
          e = { var: token, source: r.source, ref: r.ref, paths: [], pageId: r.pageId ?? null };
          bindings.set(token, e);
        }
        if (!e.paths.includes(pointer)) e.paths.push(pointer);
        if (r.pageId && !e.pageId) e.pageId = r.pageId;
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => scanValue(item, `${pointer}/${i}`, key));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const p = `${pointer}/${escapePtr(k)}`;
        if (k === 'type' && typeof val === 'string' && SEMANTIC_TYPE_PTR.some((re) => re.test(p))) classifyType(p, val);
        if (k === 'render' && typeof val === 'string') {
          renders.add(val);
          if (VOCAB.has(val)) semantic.add(val);
        }
        scanValue(val, p, k);
      }
    }
  }

  scanValue(doc, '', null);
  return { bindings, semantic, renders };
}

/* ── normalization ─────────────────────────────────────────────────── */

/** Hapus field kosong (nil) / string kosong / objek-array kosong — untuk blok pass-through. */
function stripEmpty(x) {
  if (Array.isArray(x)) {
    const m = x.map(stripEmpty).filter(v => v !== undefined);
    return m.length ? m : undefined;
  }
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      const s = stripEmpty(v);
      if (s !== undefined) o[k] = s;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return x === undefined || x === null || x === '' ? undefined : x;
}

// F4: pesan default DIPATOK konstanta - migrasi validation:[{rule:minLength,value:3,
// message:'Minimal 3 karakter'}] -> minLength: 3 harus byte-identik dengan golden yang
// sudah ada (golden memakai persis string ini via validation[] eksplisit).
const DEFAULT_MESSAGES = {
  required: 'Wajib diisi',
  minLength: (n) => `Minimal ${n} karakter`,
  maxLength: (n) => `Maksimal ${n} karakter`,
  min: (n) => `Minimal ${n}`,
  max: (n) => `Maksimal ${n}`,
  pattern: 'Format tidak sesuai',
  email: 'Format email tidak valid',
};

/** zodRules: urutan output ADALAH kontrak byte (dipakai zodFieldExpr/zodField apa adanya).
 * required -> turunan key deklaratif (minLength, maxLength, min, max, pattern, email dari
 * type) -> validation[] (document order) -> minItems repeatable. Dedup: bila rule yang SAMA
 * juga muncul di validation[], entry validation[] MENANG (pesan kustom dipertahankan) dan
 * versi turunan DIBUANG - ini yang menjamin 3 golden (semuanya memakai validation[], tak
 * satu pun key deklaratif) tetap byte-identik. Catatan jujur: min/max pada field date/
 * datetime hanya jadi atribut HTML native (lihat komponen DateInput) - zodFieldExpr/zodField
 * TIDAK menegakkannya sebagai batas zod (cabang string generik tidak membaca rule min/max),
 * beda dengan field number yang menegakkannya penuh. */
function zodRules(f, pointer) {
  const rules = [];
  if (f.required) rules.push({ rule: 'required', message: DEFAULT_MESSAGES.required });

  const legacyRules = new Set((f.validation ?? []).map((rv) => rv.rule));
  const pushDerived = (rule, value, msg) => {
    if (value === undefined || legacyRules.has(rule)) return;
    rules.push({ rule, value, message: msg(value) });
  };
  pushDerived('minLength', f.minLength, DEFAULT_MESSAGES.minLength);
  pushDerived('maxLength', f.maxLength, DEFAULT_MESSAGES.maxLength);
  pushDerived('min', f.min, DEFAULT_MESSAGES.min);
  pushDerived('max', f.max, DEFAULT_MESSAGES.max);
  if (f.pattern !== undefined && !legacyRules.has('pattern')) {
    rules.push({ rule: 'pattern', value: f.pattern, message: DEFAULT_MESSAGES.pattern });
  }
  if (f.type === 'email' && !legacyRules.has('email')) {
    rules.push({ rule: 'email', message: DEFAULT_MESSAGES.email });
  }

  for (const rv of f.validation ?? []) {
    if (!VALIDATION_RULES.has(rv.rule)) {
      throw new FEIRError(
        `validation rule "${rv.rule}" tak dikenal (canonical: ${[...VALIDATION_RULES].join('|')})`,
        { pointer },
      );
    }
    rules.push({ rule: rv.rule, ...(rv.value !== undefined ? { value: rv.value } : {}), message: rv.message });
  }
  if (f.type === 'repeatable' && f.minItems != null) {
    rules.push({ rule: 'minItems', value: f.minItems, message: `Minimal ${f.minItems} item` });
  }
  return rules;
}

function normalizeField(f, pointer) {
  if (f && typeof f === 'object' && 'reuse' in f) return { reuse: f.reuse };
  const out = { name: f.name };
  if (f.label !== undefined) out.label = f.label;
  out.type = FIELD_TYPE_SEMANTIC[f.type] ?? f.type; // schema sudah menjamin f.type ∈ enum
  for (const k of ['required', 'defaultValue', 'placeholder', 'readOnly', 'computedFrom', 'rows', 'options', 'optionsSource', 'minItems', 'itemLabel', 'addButton', 'itemPayload', 'min', 'max', 'step', 'multiple', 'layout', 'minLength', 'maxLength', 'pattern']) {
    if (f[k] !== undefined) out[k] = f[k];
  }
  out.zodRules = zodRules(f, pointer);
  if (Array.isArray(f.itemFields)) {
    out.itemFields = f.itemFields.map((ff, i) => normalizeField(ff, `${pointer}/itemFields/${i}`));
  }
  return out;
}

const TRANSFORM_VERBS = new Set([
  'id', 'name', 'value', 'string', 'number', 'boolean', 'trim', 'iso-date', 'array-ids', 'json',
]);

/** payloadValue (F3) -> bentuk runtime. String token lama lolos apa adanya KECUALI alias
 * 'form.X' -> 'fields.X' (sinonim per schema payloadSourceRef; runtime toPayload hanya
 * mengenal fields/item, jadi alias dilakukan di sini, bukan di 3 template runtime).
 * Node {source, transform} -> {$src, $tx}: tag yang TIDAK BISA bentrok dengan objek nested
 * biasa (kontrak runtime StandardFormModal.toPayload). page.X/const.X TIDAK didukung
 * runtime hari ini - fail loud di sini, bukan diam-diam salah di browser. */
function normalizePayload(node, pointer) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map((v, i) => normalizePayload(v, `${pointer}/${i}`));
  if (node && typeof node === 'object') {
    if ('source' in node) {
      const src = String(node.source).replace(/^form\./, 'fields.');
      if (!/^(fields|item)\./.test(src)) {
        throw new FEIRError(
          `payload transform: source "${node.source}" belum didukung runtime (hanya form./fields./item.)`,
          { pointer },
        );
      }
      if (node.transform !== undefined && !TRANSFORM_VERBS.has(node.transform)) {
        throw new FEIRError(
          `transform verb "${node.transform}" tak dikenal (canonical: ${[...TRANSFORM_VERBS].join('|')})`,
          { pointer },
        );
      }
      const out = { $src: src };
      if (node.transform !== undefined) out.$tx = node.transform;
      return out;
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = normalizePayload(v, `${pointer}/${escapePtr(k)}`);
    return out;
  }
  return node;
}

function normalizeForm(f, pointer) {
  const o = { mode: f.mode, title: f.title };
  for (const k of ['width', 'prefillFrom', 'controller', 'buttons']) {
    if (f[k] !== undefined) o[k] = f[k];
  }
  o.api = { method: f.api.method, path: f.api.path, payload: normalizePayload(f.api.payload, `${pointer}/api/payload`), ...(f.api.ref !== undefined && { ref: f.api.ref }) };
  o.fields = (f.fields || []).map((ff, i) => normalizeField(ff, `${pointer}/fields/${i}`));
  return o;
}

function normalizePage(p, i, bindings, semantic) {
  const ptr = `/pages/${i}`;
  const o = { id: p.id, path: p.path, title: p.title, icon: p.icon };
  if (p.nav) o.nav = p.nav;
  if (p.permission !== undefined) o.permission = p.permission;
  if (p.view === 'list') {
    const l = p.list || {};
    o.view = 'list';
    o.list = {
      api: l.api,
      method: l.method,
      ...(l.apiRef !== undefined && { apiRef: l.apiRef }),
      ...(l.queryParams !== undefined && { queryParams: l.queryParams }),
      ...(l.search && { search: l.search }),
      ...(l.filters && { filters: l.filters }),
      ...(l.columns && { columns: l.columns }),
      ...(l.pagination && { pagination: l.pagination }),
      ...(l.emptyState && { emptyState: l.emptyState }),
      paginationScheme: l.pagination?.scheme ?? null,
    };
    if (p.forms) {
      o.forms = {};
      for (const [k, f] of Object.entries(p.forms)) o.forms[k] = normalizeForm(f, `${ptr}/forms/${k}`);
    }
    if (p.detail) o.detail = cleanCopy(p.detail);
  } else if (p.view === 'form') {
    o.view = 'form';
    o.form = normalizeForm(p.form, `${ptr}/form`);
  } else if (p.view === 'detail') {
    o.view = 'detail';
    o.detail = cleanCopy(p.detail);
  } else if (p.view === 'dashboard') {
    // F7: dashboardChart.type (line/bar/...) BUKAN semantic FE - sengaja tak masuk
    // SEMANTIC_TYPE_PTR (T1), jadi diteruskan apa adanya via cleanCopy, semantic
    // vocabulary-nya didaftarkan manual di sini alih-alih lewat classifyType().
    o.view = 'dashboard';
    o.dashboard = cleanCopy(p.dashboard);
    if (o.dashboard.stats?.length) semantic.add('stat-card');
    if (o.dashboard.charts?.length) semantic.add('chart');
    if (o.dashboard.tables?.length) semantic.add('table');
  }
  if (p.actions) o.actions = p.actions;
  o.bindingRefs = [...bindings.values()]
    .filter(b => b.paths.some(pp => pp.startsWith(`${ptr}/`)))
    .map(b => ({ var: b.var, source: b.source, ref: b.ref }))
    .sort((a, b) => a.var.localeCompare(b.var));
  return o;
}

/** Detail pass-through (struktur detail dijamin schema; tidak ada normalisasi tambahan di M2). */
function cleanCopy(x) {
  return JSON.parse(JSON.stringify(x));
}

/* ── public API ────────────────────────────────────────────────────── */

/**
 * @param {string} input YAML source text, ATAU path ke file .yaml
 * @param {{name?: string}} [opts]
 * @returns {Promise<{ir: object, summary: object}>}
 */
export async function buildFEIR(input, opts = {}) {
  const hasNewline = /[\r\n]/.test(input);
  const isPath = !hasNewline && (fs.existsSync(path.resolve(input)) || /\.[a-z0-9]+$/i.test(input));
  const name = opts.name ?? (isPath ? path.basename(input, path.extname(input)) : '<string>');
  const source = isPath ? await readFile(path.resolve(input), 'utf8') : input;
  const lines = source.split(/\r?\n/);

  // (1)+(2) parse + VALIDASI — reuse validator todo 1, jangan duplikasi.
  const v = await validateString(source, { name });
  if (!v.ok) throw new FEIRError(`FE spec tidak valid (${name}): ${v.errors.length} error`, { errors: v.errors });

  let doc;
  try {
    doc = yaml.load(source);
  } catch (e) {
    // Unreachable (validator sudah parse), guard untuk keamanan.
    throw new FEIRError(`YAML parse error: ${e.message}`);
  }

  // (3) scan binding + semantic types.
  const { bindings, semantic, renders } = scan(doc, lines);

  const renderKinds = [...renders].sort();
  const resolvedBindings = [...bindings.values()]
    .map(b => ({ var: b.var, source: b.source, ref: b.ref, ...(b.pageId ? { pageId: b.pageId } : {}), path: b.paths[0], occurrences: b.paths.length }))
    .sort((a, b) => a.var.localeCompare(b.var));

  // (3) theme normalized: ui.theme.tokens + darkMode.
  const ui = doc.ui || {};
  const theme = {
    ...(ui.theme?.name ? { name: ui.theme.name } : {}),
    darkMode: ui.theme?.darkMode ?? ui.darkMode ?? false,
    tokens: ui.theme?.tokens ?? {},
  };

  // (3) pages tree dinormalisasi dengan paginationScheme + bindingRefs.
  const pages = doc.pages.map((p, i) => normalizePage(p, i, bindings, semantic));
  // semanticTypes dihitung SETELAH pages - dashboard (F7) menambah stat-card/chart/table
  // ke `semantic` langsung dari normalizePage (bukan lewat classifyType/scan(), lihat T1).
  const semanticTypes = [...semantic].sort();

  const ir = {
    schemaVersion: '1.0',
    source: name,
    meta: stripEmpty(doc.meta),
    api: stripEmpty(doc.api),
    output: stripEmpty(doc.output),
    ui: stripEmpty(doc.ui),
    theme,
    formEngine: stripEmpty(doc.formEngine),
    layout: stripEmpty(doc.layout),
    auth: stripEmpty(doc.auth),
    bindingSources: BINDING_SOURCES,
    semanticTypes,
    renderKinds,
    pages,
    resolvedBindings,
    // F5: hanya disertakan bila spec MEMANG mendeklarasikan apis[]/models{} - spec lama
    // (tanpa keduanya) menghasilkan .feir bytes yang PERSIS sama seperti sebelum F5.
    ...(doc.apis !== undefined && { apis: cleanCopy(doc.apis) }),
    ...(doc.models !== undefined && { models: cleanCopy(doc.models) }),
  };

  const summary = {
    resources: pages.length,
    semanticTypes,
    bindings: resolvedBindings.length,
    schemes: [...new Set(pages.map(p => p.list?.pagination?.scheme).filter(Boolean))].sort(),
    theme: { name: theme.name ?? null, darkMode: theme.darkMode },
  };

  return { ir, summary };
}