#!/usr/bin/env node
/**
 * fe-spec golden + determinism harness (todo 3, M1 gates) PLUS fe-gen app golden
 * matrix (todo 12, M6/M6-cross gates).
 *
 *   node tools/fe-golden.mjs            verify determinism (2x byte-identical)
 *                                       + golden match for every case
 *   node tools/fe-golden.mjs --update   re-record the snapshots (review the diff!)
 *   node tools/fe-golden.mjs --diff     print the full first-diff hunk on failure
 *
 * Snapshot layout:
 *   generator/golden/fe-spec/<case>.yaml   (fe-spec dialect cases, todo 3)
 *   generator/golden/fe/<case>/            (generated CRA app tree, todo 12)
 *
 * The emitters are invoked through the real CLI (`fe-spec --component ...`,
 * `fe-gen scaffold|emit --spec ... --out <tmp>`) so the snapshot covers the exact
 * code path a user runs; generated files go to a temp dir, so no stray output
 * lands in the workspace. Emitters are pure functions of the IR/spec (no
 * clock/random/cwd) and ports are PINNED per case below — so the same case must
 * reproduce byte-identical output every run. That determinism is a GATE.
 *
 * Golden matrix (M6 plan, explicit): mode = deployment (full-repo|mfe), not a
 * light/dark toggle — darkMode is a runtime toggle and is NOT a separate case.
 * Ports are pinned per case (pattern: TMFGEN-PLAN §18 / tools/golden.mjs), so
 * `set PORT=` / craco remote / devServer stay byte-stable.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const docs = path.resolve(root, '..', 'documents');
const ws = path.resolve(root, '..'); // workspace root, specs live here
const goldenDir = path.join(root, 'golden');
const appGoldenDir = path.join(goldenDir, 'fe');
const feSpecGoldenDir = path.join(goldenDir, 'fe-spec');
const workRoot = path.join(root, '.fe-golden-work');
const cli = path.join(root, 'src', 'cli.mjs');

/** One golden case per dialect: tmf736 is OAS3/v5, tmf673 is Swagger2/v4. */
const CASES = [
  { name: 'fe-spec-tmf736', component: 'tmf736/5.0.0' },
  { name: 'fe-spec-tmf673', component: 'tmf673/4.0.0' },
];

/**
 * fe-gen app golden matrix (explicit, M6): mode = deployment full|mfe.
 * Port PINNED per case; darkMode is a runtime toggle, not a case.
 * neudela spec is produced by todo 11 — when absent we report BLOCKED (a
 * prerequisite gate, not a false pass) instead of failing determinism.
 */
const APP_CASES = [
  { name: 'mui-indigo-full',   spec: 'frontend-spec-tmf736-full.yaml',       port: 5012, library: 'mui' },
  { name: 'mui-indigo-mfe',    spec: 'frontend-spec-tmf736-mfe.yaml',        port: 5013, library: 'mui' },
  { name: 'neudela-warn-full', spec: 'frontend-spec-tmf736-neudela.yaml',    port: 5014, library: 'neudela' },
  { name: 'fe-default-full',   spec: 'frontend-spec-tmf736-fe-default.yaml', port: 5015, library: 'fe-default' },
  { name: 'fe-default-dashboard', spec: 'frontend-spec-fe-default-dashboard-demo.yaml', port: 5016, library: 'fe-default' },
  { name: 'fe-default-mfe', spec: 'frontend-spec-fe-default-mfe-demo.yaml', port: 5017, library: 'fe-default' },
];

// artefacts that are not source and would make snapshots noisy (pattern golden.mjs)
const SKIP_DIRS = new Set(['node_modules', '.yarn', 'dist', '.git', 'build']);
const SKIP_FILES = new Set(['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml', 'package.json.bak']);

/* ── fe-spec (todo 3) helpers ─────────────────────────────────────────── */

/** Run the real fe-spec command into `into/<name>.yaml`; returns that path. */
function generateCase(c, into) {
  fs.mkdirSync(into, { recursive: true });
  const out = path.join(into, `${c.name}.yaml`);
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  run(['fe-spec', '--component', path.join(docs, c.component), '--out', out]);
  return out;
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/** First differing line between two sources; null when identical. */
function firstDiffLine(a, b) {
  if (a === b) return null;
  const al = a.split('\n');
  const bl = b.split('\n');
  let i = 0;
  while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
  return {
    line: i + 1,
    golden: al[i] ?? '<eof>',
    fresh: bl[i] ?? '<eof>',
  };
}

/* ── fe-gen app (todo 12) helpers ─────────────────────────────────────── */

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), base, out);
    } else {
      if (SKIP_FILES.has(e.name)) continue;
      out.push(path.relative(base, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  }
  return out;
}

/** meta.name from the spec YAML (the app dir scaffold/emit target). */
function specAppName(specAbsPath) {
  const doc = yaml.load(fs.readFileSync(specAbsPath, 'utf8'));
  if (!doc?.meta?.name) throw new Error(`spec ${specAbsPath} missing meta.name`);
  return doc.meta.name;
}

/** scaffold + emit one app case into `into` (an feTargetRoot); returns app dir. */
function generateAppCase(c, into) {
  fs.rmSync(into, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(into, { recursive: true });
  const specAbs = path.join(ws, c.spec);
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  run(['fe-gen', 'scaffold', '--spec', specAbs, '--out', into, '--port', String(c.port)]);
  const appDir = path.join(into, specAppName(specAbs));
  if (!fs.existsSync(path.join(appDir, 'package.json'))) {
    throw new Error(`scaffold did not produce app at ${appDir}`);
  }
  run(['fe-gen', 'emit', '--spec', specAbs, '--out', appDir]);
  return appDir;
}

/** @returns {{added:string[], removed:string[], changed:{file:string, firstDiff:string}[]}} */
function compare(goldPath, freshPath) {
  const gold = new Set(walk(goldPath));
  const fresh = new Set(walk(freshPath));
  const added = [...fresh].filter(f => !gold.has(f)).sort();
  const removed = [...gold].filter(f => !fresh.has(f)).sort();
  const changed = [];
  for (const f of [...gold].filter(x => fresh.has(x)).sort()) {
    const a = fs.readFileSync(path.join(goldPath, f), 'utf8');
    const b = fs.readFileSync(path.join(freshPath, f), 'utf8');
    if (a === b) continue;
    const al = a.split('\n');
    const bl = b.split('\n');
    let i = 0;
    while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
    changed.push({
      file: f,
      firstDiff: `line ${i + 1}\n        golden: ${JSON.stringify(al[i] ?? '<eof>')}\n        fresh : ${JSON.stringify(bl[i] ?? '<eof>')}`,
    });
  }
  return { added, removed, changed };
}

function copyTree(from, to) {
  fs.rmSync(to, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(to, { recursive: true });
  for (const rel of walk(from)) {
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, rel), dest);
  }
}

/* ── main ─────────────────────────────────────────────────────────────── */

const update = process.argv.includes('--update');
const wantDiff = process.argv.includes('--diff');
const onlyCase = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : null;

// --case <name> filters both sections (fe-spec case or app case name).
const specCases = onlyCase ? CASES.filter(c => c.name === onlyCase) : CASES;
const appCases = onlyCase ? APP_CASES.filter(c => c.name === onlyCase) : APP_CASES;
if (onlyCase && !specCases.length && !appCases.length) {
  console.error(`no case named ${onlyCase}; known: ${[...CASES.map(c => c.name), ...APP_CASES.map(c => c.name)].join(', ')}`);
  process.exit(2);
}

fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); // Windows EBUSY race (antivirus/indexer) - retry, jangan crash gate
let failures = 0;
let blocked = 0;

/* ── section 1: fe-spec dialect cases (todo 3) ────────────────────────── */
for (const c of specCases) {
  const work = path.join(workRoot, c.name);
  const goldPath = path.join(feSpecGoldenDir, `${c.name}.yaml`);

  let first, second;
  try {
    first = generateCase(c, work);
    second = generateCase(c, path.join(workRoot, `${c.name}-again`));
  } catch (err) {
    failures++;
    console.log(`FAIL  ${c.name}  generation threw`);
    console.log(String(err.stdout ?? err.message).split('\n').slice(-6).join('\n'));
    continue;
  }
  const d = firstDiffLine(read(first), read(second));
  if (d) {
    failures++;
    console.log(`FAIL  ${c.name}  NOT deterministic — two runs differ at line ${d.line}`);
    console.log(`      first : ${JSON.stringify(d.fresh)}`);
    console.log(`      second: ${JSON.stringify(d.golden)}`);
  } else {
    console.log(`PASS  ${c.name}  determinism: two runs byte-identical (${read(first).length} bytes)`);
  }

  if (update) {
    fs.mkdirSync(feSpecGoldenDir, { recursive: true });
    fs.copyFileSync(first, goldPath);
    console.log(`recorded ${c.name}  -> ${path.relative(root, goldPath)}`);
    continue;
  }
  if (!fs.existsSync(goldPath)) {
    failures++;
    console.log(`MISSING ${c.name}  no snapshot yet — run with --update`);
    continue;
  }
  const g = firstDiffLine(read(goldPath), read(first));
  if (g) {
    failures++;
    console.log(`FAIL  ${c.name}  golden differs at line ${g.line}`);
    console.log(`      golden : ${JSON.stringify(g.golden)}`);
    console.log(`      fresh  : ${JSON.stringify(g.fresh)}`);
    if (wantDiff) {
      const gl = read(goldPath).split('\n');
      const fl = read(first).split('\n');
      const from = Math.max(0, g.line - 4);
      for (let i = from; i < Math.min(g.line + 3, Math.max(gl.length, fl.length)); i++) {
        const ga = gl[i] ?? '';
        const fa = fl[i] ?? '';
        const mark = i === g.line - 1 ? '~' : ' ';
        console.log(`   ${mark} L${String(i + 1).padEnd(4)} G: ${JSON.stringify(ga)}`);
        if (ga !== fa) console.log(`   ${mark} L${String(i + 1).padEnd(4)} F: ${JSON.stringify(fa)}`);
      }
    }
  } else {
    console.log(`PASS  ${c.name}  golden match (${read(first).length} bytes)`);
  }
}

/* ── section 2: fe-gen app matrix (todo 12, M6) ───────────────────────── */
for (const c of appCases) {
  const specAbs = path.join(ws, c.spec);
  const work = path.join(workRoot, `app-${c.name}`);
  const goldPath = path.join(appGoldenDir, c.name);

  if (!fs.existsSync(specAbs)) {
    // Dulu ini hanya `blocked++` dan harness tetap mencetak "all fe golden checks
    // passed" -> seluruh app matrix pernah BLOCKED berbulan-bulan sambil gate hijau.
    // Spec yang hilang adalah KEGAGALAN, bukan pengecualian.
    failures++;
    blocked++;
    console.log(`FAIL  ${c.name}  spec ${c.spec} tidak ada di root workspace — case ini tidak menguji apa pun`);
    continue;
  }

  let appDir;
  try {
    appDir = generateAppCase(c, work);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${c.name}  generation threw`);
    console.log(String(err.stdout ?? err.message).split('\n').slice(-8).join('\n'));
    continue;
  }

  // determinism: a second independent run must be byte-identical.
  const again = path.join(workRoot, `app-${c.name}-again`);
  let second;
  try {
    second = generateAppCase(c, again);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${c.name}  second generation threw`);
    console.log(String(err.stdout ?? err.message).split('\n').slice(-6).join('\n'));
    continue;
  }
  const det = compare(appDir, second);
  const detTotal = det.added.length + det.removed.length + det.changed.length;
  if (detTotal) {
    failures++;
    console.log(`FAIL  ${c.name}  NOT deterministic: ${detTotal} difference(s) between two runs (port pinned ${c.port})`);
    for (const ch of det.changed.slice(0, 5)) console.log(`      ~ ${ch.file}  ${ch.firstDiff}`);
    for (const f of det.added.slice(0, 3)) console.log(`      + ${f}`);
    for (const f of det.removed.slice(0, 3)) console.log(`      - ${f}`);
  } else {
    console.log(`PASS  ${c.name}  determinism: two runs byte-identical (port pinned ${c.port}, ${walk(appDir).length} files)`);
  }

  if (update) {
    copyTree(appDir, goldPath);
    console.log(`recorded ${c.name}  -> ${path.relative(root, goldPath)} (${walk(goldPath).length} files)`);
    continue;
  }
  if (!fs.existsSync(goldPath)) {
    failures++;
    console.log(`MISSING ${c.name}  no snapshot yet — run with --update`);
    continue;
  }
  const cmp = compare(goldPath, appDir);
  const total = cmp.added.length + cmp.removed.length + cmp.changed.length;
  if (total) {
    failures++;
    console.log(`FAIL  ${c.name}  golden differs: ${cmp.changed.length} changed, ${cmp.added.length} added, ${cmp.removed.length} removed`);
    for (const ch of cmp.changed.slice(0, 6)) console.log(`      ~ ${ch.file}  ${ch.firstDiff}`);
    for (const f of cmp.added.slice(0, 4)) console.log(`      + ${f}`);
    for (const f of cmp.removed.slice(0, 4)) console.log(`      - ${f}`);
    if (total > 20) console.log(`      ... ${total - 20} more not shown`);
  } else {
    console.log(`PASS  ${c.name}  golden match (${walk(goldPath).length} files)`);
  }
}

fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); // Windows EBUSY race (antivirus/indexer) - retry, jangan crash gate
console.log(failures ? `\n${failures} failure(s)` : '\nall fe golden checks passed');
if (blocked) console.log(`${blocked} case(s) tanpa spec — pulihkan spec YAML-nya di root workspace`);
process.exit(failures ? 1 : 0);
