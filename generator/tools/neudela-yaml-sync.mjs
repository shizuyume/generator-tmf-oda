#!/usr/bin/env node
/**
 * neudela-fe/v1 template ⇄ design-lab sync gate.
 *
 *   node tools/neudela-yaml-sync.mjs           # check (default) — exit 1 on any drift
 *   node tools/neudela-yaml-sync.mjs --write   # regenerate `template.styles` from the lab CSS, then check
 *   node tools/neudela-yaml-sync.mjs --lab <dir> --yaml <file>
 *
 * The YAML (design-lab/neudela-lab/neudela-fe-template.yaml) is the frontend source of truth;
 * the lab is its golden. This gate proves they agree:
 *   1. js-yaml parses it (duplicate keys are an error).
 *   2. every {{path}} resolves inside the document.
 *   3. template.styles == the 6 lab stylesheets, rule by rule (after resolving the knobs),
 *      and the declaration total matches an independent count.
 *   4. every `.class` named by a component `css:` / `className:` exists in the lab CSS.
 *   5. theme palette / colors / typography / spacing / radius / shadow == neudela/dist/style.css.
 *   6. generator/templates/fe-neudela/files == the lab's fixed files (generation.output.fixed),
 *      and templates/fe-neudela/template.yaml == the YAML's template part.   (--write copies them)
 *   7. emitApp(the YAML) == the lab's per-app files — the lab is exactly what fe-gen generates.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';
import { parseCss, toYamlRules } from '../src/fe/neudela/cssRules.mjs';
import { emitApp } from '../src/fe/neudela/emitApp.mjs';
import { NEUDELA_TEMPLATE_DIR } from '../src/fe/neudela/loadSpec.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const LAB = path.resolve(opt('--lab', path.join(here, '..', '..', 'design-lab', 'neudela-lab')));
const YAML_FILE = path.resolve(opt('--yaml', path.join(LAB, 'neudela-fe-template.yaml')));
const WRITE = args.includes('--write');

// Which stylesheet feeds which sheet id, in load order.
export const SHEETS = [
  ['base', 'src/index.css', 'Base: font mono, color-scheme, theme switch, scrollbar, body.'],
  ['shell', 'src/App.css', 'Shell (topbar, sidebar, content), page header, utilitas lab-*, modal actions, toast, home.'],
  ['listTable', 'src/components/list-table/ListTable.css', 'List card: header, toolbar, filter panel, chips, tabel, row actions/menu, footer, rows per page, states, kartu mobile.'],
  ['detail', 'src/components/detail/Detail.css', 'Halaman detail: header, tabs, grid overview, card, key-value, entity card, view toggle, skeleton.'],
  ['overview', 'src/components/detail/Overview.css', 'Block overview: stat strip, rule flow (When/Then), entity rows, timeline.'],
  ['form', 'src/components/form/Form.css', 'Form dialog: panel, section, grid, repeatable item, tombol tambah.'],
];

// Literal CSS values that the YAML exposes as knobs: [media, selector, property] → expression.
const T = '{{template.layout.shell.topbar.height}}';
const KNOBS = new Map([
  [[null, ':root', '--lab-font-mono'], '{{template.theme.fonts.mono.stack}}'],
  [[null, '.lab-topbar', 'height'], T],
  [[null, '.lab-sidebar', 'top'], T],
  [[null, '.lab-sidebar', 'height'], `calc(100vh - ${T})`],
  [[null, '.lab-sidebar', 'width'], '{{template.layout.shell.sidebar.width}}'],
  [[null, '.lab-content', 'padding'], '{{template.layout.shell.content.padding}}'],
  [['shellCollapse', '.lab-content', 'padding'], '{{template.layout.shell.content.paddingMobile}}'],
  [[null, '.lab-page', 'gap'], '{{template.layout.page.gap}}'],
  [[null, '.fm-dialog--wide', 'max-width'], '{{template.components.formDialog.widths.wide}}'],
  [[null, '.fm-dialog--narrow', 'max-width'], '{{template.components.formDialog.widths.narrow}}'],
  [[null, '.lt-table .neuron-table', 'min-width'], 'var(--lt-min-width, {{template.components.listTable.defaults.minTableWidth}})'],
  [[null, '::view-transition-old(root), ::view-transition-new(root)', 'animation-duration'], '{{template.theme.darkMode.switch.crossfade.duration}}'],
  [[null, '::view-transition-old(root), ::view-transition-new(root)', 'animation-timing-function'], '{{template.theme.darkMode.switch.crossfade.easing}}'],
].map(([k, v]) => [k.join('|'), v]));
const MEDIA = {
  '(max-width: 767px)': ['mobile', '(max-width: {{template.layout.breakpoints.mobile}})'],
  '(max-width: 768px)': ['shellCollapse', '(max-width: {{template.layout.breakpoints.shellCollapse}})'],
  '(max-width: 1024px)': ['tablet', '(max-width: {{template.layout.breakpoints.tablet}})'],
  '(max-width: 640px)': ['formStack', '(max-width: {{template.layout.breakpoints.formStack}})'],
};
const knob = (media, select, prop, value) => KNOBS.get([media, select, prop].join('|')) ?? value;
const mediaName = (q) => MEDIA[q] ?? [null, q];

const fails = [];
const read = (rel) => fs.readFileSync(path.join(LAB, rel), 'utf8');

// ── --write: regenerate the styles block (text-level, so comments elsewhere survive) ──
const q = (s) => JSON.stringify(s);
const key = (k) => (/^[a-z][a-z0-9-]*$/.test(k) ? k : q(k));

function emitRules(rules, ind, lines) {
  const p = ' '.repeat(ind);
  for (const r of rules) {
    if (r.media !== undefined) {
      lines.push(`${p}- media: ${q(r.media)}`);
      if (r.note) lines.push(`${p}  note: ${q(r.note)}`);
      lines.push(`${p}  rules:`);
      emitRules(r.rules, ind + 4, lines);
    } else if (r.keyframes !== undefined) {
      lines.push(`${p}- keyframes: ${r.keyframes}`);
      if (r.note) lines.push(`${p}  note: ${q(r.note)}`);
      lines.push(`${p}  frames:`);
      for (const f of r.frames) {
        lines.push(`${p}    - select: ${q(f.select)}`);
        lines.push(`${p}      decl:`);
        for (const [k, v] of Object.entries(f.decl)) lines.push(`${p}        ${key(k)}: ${q(v)}`);
      }
    } else {
      lines.push(`${p}- select: ${q(r.select)}`);
      if (r.note) lines.push(`${p}  note: ${q(r.note)}`);
      lines.push(`${p}  decl:`);
      for (const [k, v] of Object.entries(r.decl)) lines.push(`${p}    ${key(k)}: ${q(v)}`);
    }
  }
}

function importers(rel) {
  const name = path.basename(rel);
  const out = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(f.name) && new RegExp(`import\\s+'[^']*${name.replace('.', '\\.')}'`).test(fs.readFileSync(full, 'utf8'))) {
        out.push(path.relative(LAB, full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(LAB, 'src'));
  return out.sort();
}

function stylesBlock() {
  const lines = [
    '',
    '  # ── Styles ────────────────────────────────────────────────────────────────────────',
    '  # Semua rule CSS template, per stylesheet, URUTAN = urutan cascade (jangan diurutkan ulang).',
    '  # decl = properti → nilai CSS literal. {{template.*}} = knob dari template.layout /',
    '  # template.theme / template.components (ubah di sana, bukan di sini).',
    '  # Warna selalu lewat token var(--color-*) → otomatis ikut light/dark (.dark-theme).',
    '  # Dibangkitkan oleh generator/tools/neudela-yaml-sync.mjs --write; jangan diedit manual.',
    '  styles:',
    '    emit: rules-in-order',
    '    loadOrder: [neudela/style.css, src/index.css, src/App.css, "stylesheet komponen (diimport oleh komponennya)"]',
    '    sheets:',
  ];
  for (const [id, rel, note] of SHEETS) {
    lines.push(`      - id: ${id}`, `        file: ${rel}`, `        importedBy: [${importers(rel).join(', ')}]`, `        note: ${q(note)}`, '        rules:');
    emitRules(toYamlRules(parseCss(read(rel)), knob, mediaName), 10, lines);
  }
  return `${lines.join('\n')}\n`;
}

const APP_HEADER = '\n# -------------------------------------------------------------------------------------\n# APP';
const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');

function templatePart(text) {
  const end = text.indexOf(APP_HEADER);
  if (end === -1) throw new Error('APP header not found in YAML');
  return `${text.slice(0, end).trimEnd()}\n`;
}

if (WRITE) {
  const text = fs.readFileSync(YAML_FILE, 'utf8');
  const start = text.indexOf('\n  # ── Styles ──');
  const end = text.indexOf('\n# -------------------------------------------------------------------------------------\n# APP');
  if (start === -1 || end === -1) throw new Error('styles block / APP header not found in YAML');
  fs.writeFileSync(YAML_FILE, `${text.slice(0, start + 1)}${stylesBlock().slice(1)}${text.slice(end)}`);
  console.log(`wrote styles → ${path.relative(process.cwd(), YAML_FILE)}`);

  // the generator's template package = the lab's fixed files + the YAML's template part
  const fixed = yaml.load(fs.readFileSync(YAML_FILE, 'utf8')).generation.output.fixed;
  const filesDir = path.join(NEUDELA_TEMPLATE_DIR, 'files');
  fs.rmSync(filesDir, { recursive: true, force: true });
  for (const rel of fixed) {
    const dst = path.join(filesDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(LAB, rel), dst);
  }
  fs.writeFileSync(path.join(NEUDELA_TEMPLATE_DIR, 'template.yaml'), templatePart(fs.readFileSync(YAML_FILE, 'utf8')));
  console.log(`wrote ${fixed.length} fixed files + template.yaml → ${path.relative(process.cwd(), NEUDELA_TEMPLATE_DIR)}`);
}

// ── checks ──
let doc;
try {
  doc = yaml.load(fs.readFileSync(YAML_FILE, 'utf8'));
} catch (e) {
  console.log(`FAIL  yaml: ${e.message}`);
  process.exit(1);
}

const get = (p) => p.split('.').reduce((cur, k) => (cur && typeof cur === 'object' && k in cur ? cur[k] : undefined), doc);
const resolve = (s) => String(s).replace(/\{\{([^}]+)\}\}/g, (m, p) => {
  const v = get(p);
  return v === undefined ? m : String(v);
});

// 2. placeholders (comments excluded)
const body = fs.readFileSync(YAML_FILE, 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
for (const [, p] of body.matchAll(/\{\{([^}]+)\}\}/g)) {
  if (get(p) === undefined) fails.push(`unresolved {{${p}}}`);
}

// 3. styles vs CSS
const norm = (rules) => rules.map((r) => {
  if (r.media !== undefined) return ['media', resolve(r.media), norm(r.rules)];
  if (r.keyframes !== undefined) return ['kf', r.keyframes, r.frames.map((f) => [f.select, Object.entries(f.decl).map(([k, v]) => [k, resolve(v)])])];
  return ['rule', r.select, Object.entries(r.decl).map(([k, v]) => [k, resolve(v)])];
});
const normCss = (nodes) => nodes.map((nd) => {
  if (nd.kind === 'media') return ['media', nd.query, normCss(nd.rules)];
  if (nd.kind === 'keyframes') return ['kf', nd.name, nd.frames];
  return ['rule', nd.select, nd.decl];
});
const sheets = doc.template?.styles?.sheets ?? [];
let rulesTotal = 0;
let yamlDecls = 0;
let cssDecls = 0;
const countDecls = (rules) => rules.reduce((n, r) => n + (r.media !== undefined ? countDecls(r.rules)
  : r.keyframes !== undefined ? r.frames.reduce((m, f) => m + Object.keys(f.decl).length, 0)
    : Object.keys(r.decl).length), 0);
for (const [id, rel] of SHEETS) {
  const sheet = sheets.find((s) => s.id === id);
  if (!sheet) {
    fails.push(`styles: sheet ${id} missing`);
    continue;
  }
  const css = read(rel);
  const a = JSON.stringify(normCss(parseCss(css)));
  const b = JSON.stringify(norm(sheet.rules));
  if (a !== b) {
    const ca = normCss(parseCss(css));
    const cb = norm(sheet.rules);
    const i = ca.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(cb[k]));
    fails.push(`styles ${id}: drift at rule ${i} (css ${JSON.stringify(ca[i])?.slice(0, 160)} | yaml ${JSON.stringify(cb[i])?.slice(0, 160)}) — run with --write`);
  }
  rulesTotal += sheet.rules.length;
  yamlDecls += countDecls(sheet.rules);
  const raw = css.replace(/\/\*[\s\S]*?\*\//g, '');
  cssDecls += (raw.match(/[a-z-]+\s*:[^;{}]+;/g) ?? []).length + (raw.match(/[a-z-]+\s*:[^;{}]+\s*}/g) ?? []).length;
}
if (yamlDecls !== cssDecls) fails.push(`declarations: yaml ${yamlDecls} != css ${cssDecls}`);

// 4. component css references
const allCss = SHEETS.map(([, rel]) => read(rel)).join('\n');
const classes = new Set([...allCss.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1]));
const refs = [];
const walkRefs = (o) => {
  if (Array.isArray(o)) o.forEach(walkRefs);
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'css' && typeof v === 'string') refs.push(v);
      else if (k === 'className' && typeof v === 'string') refs.push(...(v.split('(')[0].match(/[a-z][a-z0-9_-]*/g) ?? []).filter((c) => c.includes('-')).map((c) => `.${c}`));
      else walkRefs(v);
    }
  }
};
walkRefs(doc.template?.components);
for (const sel of refs) {
  for (const [, c] of sel.matchAll(/\.([a-z][a-z0-9_-]*)/g)) {
    if (!c.endsWith('--') && !classes.has(c)) fails.push(`component css ${sel}: .${c} not in lab CSS`);
  }
}

// 5. theme tokens vs the installed neudela package
const pkgCss = fs.readFileSync(path.join(LAB, 'node_modules', 'neudela', 'dist', 'style.css'), 'utf8');
const tokens = (sel) => Object.fromEntries([...pkgCss.match(new RegExp(`${sel}\\{([^}]*)\\}`))[1].matchAll(/(--[a-z0-9-]+):([^;}]+)/g)].map((m) => [m[1], m[2]]));
const root = tokens(':root');
const dark = tokens('\\.dark-theme');
const theme = doc.template?.theme ?? {};
for (const [scale, steps] of Object.entries(theme.palette ?? {})) {
  for (const [step, hex] of Object.entries(steps)) if (root[`--${scale}-${step}`] !== hex) fails.push(`palette ${scale}-${step}`);
}
for (const [tok, [light, dk]] of Object.entries(theme.colors ?? {})) {
  if (root[tok] !== light) fails.push(`color ${tok} light: yaml ${light} pkg ${root[tok]}`);
  if (dark[tok] !== dk) fails.push(`color ${tok} dark: yaml ${dk} pkg ${dark[tok]}`);
}
const pkgColors = Object.keys(root).filter((k) => k.startsWith('--color-')).sort();
if (JSON.stringify(pkgColors) !== JSON.stringify(Object.keys(theme.colors ?? {}).sort())) fails.push('color token set differs from neudela');
for (const [name, [fs_, lh]] of Object.entries(theme.typography?.scale ?? {})) {
  if (root[`--fs-${name}`] !== fs_ || root[`--lh-${name}`] !== lh) fails.push(`typography ${name}`);
}
for (const [k, v] of Object.entries(theme.spacing ?? {})) if (root[`--space-${k}`] !== v) fails.push(`spacing ${k}`);
for (const [k, v] of Object.entries(theme.radius ?? {})) if (root[`--radius-${k}`] !== v) fails.push(`radius ${k}`);
for (const [k, v] of Object.entries(theme.shadow ?? {})) if (k !== 'popover' && root[`--shadow-${k}`] !== v) fails.push(`shadow ${k}`);
if (root['--font-family'] !== theme.fonts?.sans?.stack) fails.push('font-family');

// 6. template package == lab
const fixedList = doc.generation?.output?.fixed ?? [];
const filesDir = path.join(NEUDELA_TEMPLATE_DIR, 'files');
const walkRel = (dir, base = dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walkRel(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
};
const inTemplate = new Set(walkRel(filesDir));
for (const rel of fixedList) {
  if (!fs.existsSync(path.join(LAB, rel))) fails.push(`fixed file missing in lab: ${rel}`);
  else if (!inTemplate.has(rel)) fails.push(`fixed file missing in templates/fe-neudela/files: ${rel} — run with --write`);
  else if (lf(fs.readFileSync(path.join(LAB, rel))) !== lf(fs.readFileSync(path.join(filesDir, rel)))) fails.push(`fixed file differs from the lab: ${rel} — run with --write`);
  inTemplate.delete(rel);
}
for (const rel of inTemplate) fails.push(`templates/fe-neudela/files/${rel} is not a fixed file of the YAML`);
const tplYaml = path.join(NEUDELA_TEMPLATE_DIR, 'template.yaml');
if (!fs.existsSync(tplYaml) || lf(fs.readFileSync(tplYaml)) !== templatePart(lf(fs.readFileSync(YAML_FILE)))) {
  fails.push('templates/fe-neudela/template.yaml differs from the YAML template part — run with --write');
}

// 7. emitApp(YAML) == lab per-app files
const emitted = emitApp(doc);
for (const [rel, content] of emitted) {
  const labFile = path.join(LAB, rel);
  if (!fs.existsSync(labFile)) fails.push(`per-app file missing in lab: ${rel}`);
  else if (lf(fs.readFileSync(labFile)) !== content) fails.push(`per-app file differs from emitApp(YAML): ${rel}`);
}

console.log(`template: ${fixedList.length} fixed files; emitApp: ${emitted.size} per-app files`);
console.log(`styles: ${rulesTotal} top-level rules, ${yamlDecls} declarations (css ${cssDecls}); ${refs.length} component css refs`);
if (fails.length) {
  for (const f of fails) console.log(`FAIL  ${f}`);
  process.exit(1);
}
console.log('OK  neudela-fe template in sync with the lab');
