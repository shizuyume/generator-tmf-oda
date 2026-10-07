#!/usr/bin/env node
/**
 * neudela adapter runtime gate: generated apps build (tsc + vite), and the TMF736 one behaves
 * and looks exactly like design-lab/neudela-lab.
 *
 *   node tools/fe-neudela-build.mjs                 build TMF736 (golden spec) + sweep tmf673, tmf620, tmf642
 *   node tools/fe-neudela-build.mjs --e2e           … and run the lab's E2E against the generated TMF736 app
 *   node tools/fe-neudela-build.mjs --only tmf736   one case
 *
 * Dependencies: the generated apps reuse design-lab/neudela-lab/node_modules (directory junction)
 * when it exists — same package.json, so the same tree — otherwise `npm install` runs per app.
 * The E2E step starts `vite --mode mock` on port 4910, runs e2e/lab-full.mjs and
 * e2e/overview-lookups.mjs (then e2e/edit-form.mjs, which PATCHes) from the lab, and byte-compares the screenshots with the lab's
 * baseline (e2e/screenshots/before) when that baseline exists. For TMF642 it runs
 * tools/neudela-controls-e2e.mjs (date / enum / boolean) and, for TMF620, tools/neudela-controls2-e2e.mjs
 * (number / JSON / single ref / value object / nested list + edit) on port 4913.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ws = path.resolve(root, '..');
const LAB = path.join(ws, 'design-lab', 'neudela-lab');
const args = process.argv.slice(2);
const E2E = args.includes('--e2e');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const E2E_PORT = 4910;
const CONTROLS_PORT = 4913;

const CASES = [
  { name: 'tmf736', spec: path.join(root, 'golden', 'fe-spec', 'neudela-tmf736.yaml'), e2e: true },
  { name: 'tmf673', ir: 'tmf673-4.0.0', controls: { script: 'neudela-nested-e2e.mjs', what: 'nested resource: tab, live list, record page, breadcrumbs' } },
  { name: 'tmf620', ir: 'tmf620-5.0.0', controls: { script: 'neudela-controls2-e2e.mjs', what: 'number / JSON / single ref / value object / nested list + edit' } },
  { name: 'tmf642', ir: 'tmf642-5.0.0', controls: { script: 'neudela-controls-e2e.mjs', what: 'date / enum / boolean' } },
].filter((c) => !only || c.name === only);

let failures = 0;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failures += 1; console.log(`FAIL  ${m}`); };
const cli = (...a) => execFileSync(process.execPath, [path.join(root, 'src', 'cli.mjs'), ...a], { cwd: root, encoding: 'utf8' });
const npm = (cwd, ...a) => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', a, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });

const links = [];

function linkModules(appDir) {
  const shared = path.join(LAB, 'node_modules');
  if (fs.existsSync(shared)) {
    fs.symlinkSync(shared, path.join(appDir, 'node_modules'), 'junction');
    links.push(path.join(appDir, 'node_modules'));
    return 'linked lab node_modules';
  }
  const r = npm(appDir, 'install', '--no-audit', '--no-fund');
  if (r.status !== 0) throw new Error(`npm install failed:\n${r.stdout}\n${r.stderr}`);
  return 'npm install';
}

async function waitFor(urlStr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(urlStr);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGTERM');
}

const startVite = (appDir, port) => spawn(process.execPath, [path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'mock', '--port', String(port), '--strictPort'], { cwd: appDir, stdio: 'ignore' });

async function controlsE2e(appDir, c) {
  const vite = startVite(appDir, CONTROLS_PORT);
  try {
    if (!(await waitFor(`http://localhost:${CONTROLS_PORT}/`, 60000))) {
      fail('controls e2e: vite dev:mock did not start');
      return;
    }
    const r = spawnSync(process.execPath, [path.join(here, c.controls.script), `http://localhost:${CONTROLS_PORT}`], { encoding: 'utf8' });
    const last = r.stdout.trim().split('\n').pop();
    const app = c.name.toUpperCase();
    if (r.status === 0) pass(`controls e2e (${c.controls.what}) on the generated ${app} app: ${last}`);
    else fail(`controls e2e on the generated ${app} app:\n${r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}${r.stderr}`);
  } finally {
    killTree(vite);
  }
}

async function e2e(appDir) {
  const vite = startVite(appDir, E2E_PORT);
  try {
    if (!(await waitFor(`http://localhost:${E2E_PORT}/`, 60000))) {
      fail('e2e: vite dev:mock did not start');
      return;
    }
    const shots = path.join(os.tmpdir(), `fe-neudela-shots-${process.pid}`);
    fs.rmSync(shots, { recursive: true, force: true });
    const env = { ...process.env, LAB_URL: `http://localhost:${E2E_PORT}` };
    const full = spawnSync(process.execPath, [path.join(LAB, 'e2e', 'lab-full.mjs'), '--shots', shots], { cwd: LAB, env, encoding: 'utf8' });
    const last = (out) => out.trim().split('\n').pop();
    if (full.status === 0) pass(`e2e lab-full on the generated app: ${last(full.stdout)}`);
    else fail(`e2e lab-full on the generated app:\n${full.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}${full.stderr}`);
    const ov = spawnSync(process.execPath, [path.join(LAB, 'e2e', 'overview-lookups.mjs')], { cwd: LAB, env, encoding: 'utf8' });
    if (ov.status === 0) pass(`e2e overview-lookups on the generated app: ${last(ov.stdout)}`);
    else fail(`e2e overview-lookups on the generated app:\n${ov.stdout}${ov.stderr}`);
    const baseline = path.join(LAB, 'e2e', 'screenshots', 'before');
    if (fs.existsSync(baseline)) {
      const cmp = spawnSync(process.execPath, [path.join(LAB, 'e2e', 'lab-full.mjs'), '--compare', baseline, shots], { encoding: 'utf8' });
      if (cmp.status === 0) pass(`screenshots of the generated app == lab baseline: ${last(cmp.stdout)}`);
      else fail(`screenshots differ from the lab baseline:\n${cmp.stdout.split('\n').filter((l) => l.startsWith('DIFF')).join('\n')}`);
    } else {
      console.log('SKIP  no lab screenshot baseline (design-lab/neudela-lab/e2e/screenshots/before)');
    }
    // a separate host app mounts every exposed page from this app's remoteEntry.js
    const host = spawnSync(process.execPath, [path.join(LAB, 'e2e', 'mfe-host.mjs'), '--port', String(E2E_PORT + 1)], { cwd: LAB, env, encoding: 'utf8' });
    if (host.status === 0) pass(`e2e mfe-host (federation host mounts the exposes) on the generated app: ${last(host.stdout)}`);
    else fail(`e2e mfe-host on the generated app:\n${host.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}${host.stderr.slice(-800)}`);
    for (const script of ['lookup-search.mjs', 'hub-detail.mjs']) {
      const run = spawnSync(process.execPath, [path.join(LAB, 'e2e', script)], { cwd: LAB, env, encoding: 'utf8' });
      if (run.status === 0) pass(`e2e ${script.replace('.mjs', '')} on the generated app: ${last(run.stdout)}`);
      else fail(`e2e ${script} on the generated app:\n${run.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}${run.stderr}`);
    }
    // last: it PATCHes the seeded records, which the screenshot runs above rely on
    const editShots = `${shots}-edit`;
    const editRun = spawnSync(process.execPath, [path.join(LAB, 'e2e', 'edit-form.mjs'), '--shots', editShots], { cwd: LAB, env, encoding: 'utf8' });
    if (editRun.status === 0) pass(`e2e edit-form (PATCH) on the generated app: ${last(editRun.stdout)}`);
    else fail(`e2e edit-form on the generated app:\n${editRun.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}${editRun.stderr}`);
    fs.rmSync(shots, { recursive: true, force: true });
    fs.rmSync(editShots, { recursive: true, force: true });
  } finally {
    killTree(vite);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-neudela-build-'));
try {
  for (const c of CASES) {
    let spec = c.spec;
    if (c.ir) {
      spec = path.join(tmp, `${c.name}.yaml`);
      const out = cli('fe-spec', '--component', path.join(ws, 'documents', ...c.ir.replace(/^tmf/, 'tmf').split('-')), '--ui', 'neudela', '--out', spec);
      const warnings = out.split('\n').filter((l) => l.trim().startsWith('!')).length;
      console.log(`      ${c.name}: spec generated (${warnings} warning(s) — fields without a template control)`);
    }
    const outDir = path.join(tmp, c.name);
    const port = E2E && c.e2e ? E2E_PORT : E2E && c.controls ? CONTROLS_PORT : null;
    cli('fe-gen', 'scaffold', '--spec', spec, '--out', outDir, ...(port ? ['--port', String(port)] : []));
    const [name] = fs.readdirSync(outDir);
    const appDir = path.join(outDir, name);
    const how = linkModules(appDir);
    const build = npm(appDir, 'run', 'build');
    if (build.status === 0 && fs.existsSync(path.join(appDir, 'dist', 'index.html'))) pass(`${c.name}: npm run build (tsc + vite) → dist/index.html  [${how}]`);
    else fail(`${c.name}: npm run build failed\n${(build.stdout + build.stderr).split('\n').filter((l) => /error/i.test(l)).slice(0, 15).join('\n')}`);
    // the build is also a Module Federation remote: remoteEntry.js + a manifest exposing every page
    const manifestFile = path.join(appDir, 'dist', 'mf-manifest.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
    const pages = (fs.readdirSync(path.join(appDir, 'src', 'exposes'))).length;
    // react / react-dom also share their subpaths (react/jsx-runtime, react-dom/client)
    const sharedNames = new Set((manifest?.shared ?? []).map((s) => s.name));
    const shared = ['neudela', 'react', 'react-dom'].filter((p) => sharedNames.has(p)).join(',');
    if (fs.existsSync(path.join(appDir, 'dist', 'remoteEntry.js')) && manifest?.exposes?.length === pages && shared === 'neudela,react,react-dom') {
      pass(`${c.name}: federation remote ${manifest.name} → remoteEntry.js, ${pages} exposes, shared ${shared}`);
    } else {
      fail(`${c.name}: no federation remote in dist (remoteEntry.js / mf-manifest.json: ${manifest ? `${manifest.exposes?.length} exposes of ${pages}, shared ${shared}` : 'missing'})`);
    }
    if (c.e2e && E2E) await e2e(appDir);
    if (c.controls && E2E) await controlsE2e(appDir, c);
  }
} finally {
  // unlink the junctions first: never let a recursive delete walk into the lab's node_modules
  for (const l of links) {
    try { fs.unlinkSync(l); } catch { try { fs.rmdirSync(l); } catch { /* already gone */ } }
  }
  if (links.every((l) => !fs.existsSync(l))) fs.rmSync(tmp, { recursive: true, force: true });
  else console.log(`WARN  could not unlink a node_modules junction — left ${tmp} in place`);
}

console.log(failures ? `${failures} failure(s)` : 'all neudela build checks passed');
process.exit(failures ? 1 : 0);
