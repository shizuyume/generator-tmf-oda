#!/usr/bin/env node
/**
 * Real build verifier (F0) — gate AKHIR milestone, BUKAN bagian check-all.
 *
 *   node tools/fe-build-verify.mjs                          # spec fe-default default
 *   node tools/fe-build-verify.mjs --spec <yaml>
 *   node tools/fe-build-verify.mjs --app <dir>              # pakai app terinstal (skip scaffold+install)
 *   node tools/fe-build-verify.mjs --keep                   # jangan hapus workdir
 *
 * check-all sengaja statis (hitungan detik): golden + grep membuktikan BENTUK output.
 * Yang TIDAK dibuktikannya: apakah app-nya benar-benar bisa dipasang dan di-build.
 * Itu tugas file ini — rantai requirement doc §21:
 *
 *     install -> typecheck -> lint -> build
 *
 * Catatan jujur soal "lint": app hasil generate tidak membawa eslint sebagai dependency
 * langsung; CRA5 menjalankan eslint (eslint-webpack-plugin, preset `react-app` dari
 * package.json eslintConfig) DI DALAM build. Jadi langkah lint tidak berdiri sendiri —
 * ia dilaporkan sebagai bagian build, dan warning eslint yang muncul di output build
 * ikut ditampilkan. Kami tidak mengklaim lint terpisah yang sebenarnya tidak dijalankan.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { loadAdapter } from '../libs/adapter.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ws = path.resolve(root, '..');
const cli = path.join(root, 'src', 'cli.mjs');

const argv = process.argv.slice(2);
const argOf = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
const keep = argv.includes('--keep');
const appArg = argOf('--app');
const specArg = argOf('--spec') ?? path.join(ws, 'frontend-spec-tmf736-fe-default.yaml');
const port = Number(argOf('--port') ?? 5015);

const workRoot = path.join(root, '.fe-build-work');
const steps = [];
let failed = false;

function step(name, fn) {
  if (failed) { steps.push({ name, status: 'SKIP', detail: 'langkah sebelumnya gagal' }); return null; }
  const t0 = Date.now();
  try {
    const out = fn();
    steps.push({ name, status: 'PASS', detail: `${((Date.now() - t0) / 1000).toFixed(1)}s` });
    return out;
  } catch (err) {
    failed = true;
    const raw = String(err.stdout ?? '') + String(err.stderr ?? '') + String(err.message ?? '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim()).slice(-25);
    steps.push({ name, status: 'FAIL', detail: `${((Date.now() - t0) / 1000).toFixed(1)}s`, log: lines });
    return null;
  }
}

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });

let appDir = appArg ? path.resolve(appArg) : null;
let library = 'fe-default';

if (!appDir) {
  const specAbs = path.resolve(specArg);
  if (!fs.existsSync(specAbs)) {
    console.error(`error: spec tidak ada: ${specAbs}`);
    process.exit(2);
  }
  const doc = yaml.load(fs.readFileSync(specAbs, 'utf8'));
  library = doc?.ui?.library ?? 'fe-default';
  const appName = doc?.meta?.name;
  if (!appName) { console.error('error: spec tanpa meta.name'); process.exit(2); }

  fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(workRoot, { recursive: true });
  appDir = path.join(workRoot, appName);

  step('scaffold', () => run(process.execPath, [cli, 'fe-gen', 'scaffold', '--spec', specAbs, '--out', workRoot, '--port', String(port)], root));
  step('emit', () => run(process.execPath, [cli, 'fe-gen', 'emit', '--spec', specAbs, '--out', appDir], root));
  step('install (npm install --no-audit --no-fund)', () => run('npm', ['install', '--no-audit', '--no-fund'], appDir));
} else {
  const pkg = path.join(appDir, 'package.json');
  if (!fs.existsSync(pkg)) { console.error(`error: ${appDir} bukan app (tanpa package.json)`); process.exit(2); }
  steps.push({ name: 'scaffold+emit+install', status: 'SKIP', detail: `--app ${path.relative(ws, appDir)} (dipakai apa adanya)` });
}

step('typecheck (tsc --noEmit)', () => run('npx', ['tsc', '--noEmit'], appDir));

const gate = loadAdapter(library).gateCommand(); // 'craco build'
const buildOut = step(`build + lint (${gate}, eslint react-app di dalam CRA)`, () =>
  run('npx', [...gate.split(/\s+/)], appDir));

if (buildOut) {
  const warnings = buildOut.split(/\r?\n/).filter((l) => /warning/i.test(l));
  if (warnings.length) {
    console.log(`\n${warnings.length} eslint/build warning:`);
    for (const w of warnings.slice(0, 15)) console.log('  ' + w.trim());
  }
  const buildDir = path.join(appDir, 'build');
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    failed = true;
    steps.push({ name: 'artefak build/index.html', status: 'FAIL', detail: 'build sukses tapi tidak menghasilkan index.html' });
  } else {
    steps.push({ name: 'artefak build/index.html', status: 'PASS', detail: `${fs.readdirSync(buildDir).length} entri di build/` });
  }
}

console.log(`\nfe-build-verify  app=${path.relative(ws, appDir)}  lib=${library}`);
for (const s of steps) {
  console.log(`  ${s.status.padEnd(5)} ${s.name}${s.detail ? '  (' + s.detail + ')' : ''}`);
  if (s.log) for (const l of s.log) console.log('        ' + l);
}

if (!keep && !appArg && !failed) fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
else if (failed && !appArg) console.log(`\nworkdir disimpan untuk diperiksa: ${path.relative(ws, workRoot)}`);

console.log(failed ? '\nfe-build-verify FAILED' : '\nfe-build-verify passed (install -> typecheck -> build/lint)');
process.exit(failed ? 1 : 0);
