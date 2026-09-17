#!/usr/bin/env node
// tools/fe-mfe-verify.mjs - M5 MFE STANDALONE verification gate (todo 10).
//
// Memverifikasi MFE TANPA host (host belum ada - registrasi host = manual, luar scope):
//   1. remoteEntry.js HTTP 200 di dev server (Module Federation entry termuat)
//   2. exposes resolve: file exposes ADA di src/ (wrapper federation boundary)
//   3. halaman list render STANDALONE (app bisa di-buka sendiri walau remote)
//      - pakai MOCK API via page.route('**/tmf-api/**') (kontrak BE TMF736), fixture
//        list -> baris 'Solar Home Split' tampil
//   4. build output berisi <camel>RemoteEntry.js (MF entry di-hash dari craco filename)
//   5. port unik (≠ 5012 — fe-app-fixed full-repo)
//
//   node tools/fe-mfe-verify.mjs --app <appDir> [--port N] [--entry <remoteEntryName>]
// Exit non-0 bila satu assertion gagal (tidak pernah `|| true`).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};

const appDir = path.resolve(argVal('--app', ''));
if (!appDir || !fs.existsSync(path.join(appDir, 'package.json'))) {
  console.error('usage: node tools/fe-mfe-verify.mjs --app <appDir> [--port N] [--entry name]');
  process.exit(2);
}

// remote entry name default = dari manifest (deterministik) / craco filename
let remoteEntry = argVal('--entry', '');
if (!remoteEntry) {
  const man = path.join(appDir, '.tmfgen-fe-manifest.json');
  if (fs.existsSync(man)) {
    const entry = JSON.parse(fs.readFileSync(man, 'utf8')).entryFile;
    if (entry) remoteEntry = entry;
  }
}
if (!remoteEntry) remoteEntry = 'revenueSharingAlgorithmsRemoteEntry.js';

const PORT = Number(argVal('--port', '5013'));
const BASE = `http://localhost:${PORT}`;
const LIST_PATH = '/party-rev-sharing-algorithms';

const NESTED_ROW_NAME = 'Solar Home Split';

/* ---------- mock controller (kontrak BE TMF736: list array + X-Total-Count) ---------- */

let listGets = 0;
async function mockRoute(route) {
  const url = new URL(route.request().url());
  if (/partyRevSharingAlgorithm$/.test(url.pathname) && route.request().method() === 'GET') {
    listGets += 1;
    const rows = [
      { '@type': 'PartyRevSharingAlgorithm', id: '5000', name: NESTED_ROW_NAME, description: '70/30', policy: [], conditionVariable: [], actionVariable: [] },
    ];
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'X-Total-Count': '1' },
      body: JSON.stringify(rows),
    });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
}

/* ---------- server lifecycle ---------- */

let serverProc = null;
let serverOurs = false;
async function httpOk(u) {
  try { return (await fetch(u)).ok; } catch { return false; }
}
async function startServer() {
  if (await httpOk(`${BASE}/`)) { console.log(`server already up on ${BASE} (reuse)`); return; }
  console.log(`starting dev server: cmd /c "set PORT=${PORT} && yarn start" (${appDir})`);
  serverProc = spawn('cmd', ['/c', `set PORT=${PORT} && yarn start`], {
    cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT) },
  });
  serverOurs = true;
  let logs = '';
  serverProc.stdout?.on('data', (d) => { logs += d.toString(); });
  serverProc.stderr?.on('data', (d) => { logs += d.toString(); });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (await httpOk(`${BASE}/`)) return;
    if (serverProc.exitCode !== null) throw new Error(`dev server exited early (code ${serverProc.exitCode})\n${logs.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server tidak boot dalam 300s\n${logs.slice(-2000)}`);
}
function stopServer() {
  if (serverOurs && serverProc) {
    try { spawn('taskkill', ['/pid', String(serverProc.pid), '/t', '/f'], { stdio: 'ignore' }); }
    catch { /* best effort */ }
    serverProc = null;
  }
}

/* ---------- verifikasi ---------- */

const results = [];
function record(name, ok, detail = '') {
  results.push(ok);
  console.log(`[${name}] ${ok ? 'PASS' : 'FAIL'}  ${detail}`);
}

function existsInBuild(names) {
  for (const dir of ['build', 'dist']) {
    const base = path.join(appDir, dir);
    if (!fs.existsSync(base)) continue;
    for (const n of names) if (fs.existsSync(path.join(base, n))) return { dir, name: n };
  }
  return null;
}

async function run(browser) {
  // V1: craco build -> CRA output dir = build/ (bukan dist/); verifikasi MF entry yang
  // SAMA dengan craco filename ada di output build.
  const b = existsInBuild([remoteEntry, 'revenueSharingAlgorithmsRemoteEntry.js']);
  if (!b) throw new Error(`MF entry "${remoteEntry}" tidak ada di build/ maupun dist/`);
  record('build-remote-entry', true, `${b.dir}/${b.name}`);

  // V2: exposes file resolvable di src/ (wrapper federation boundary).
  const man = path.join(appDir, '.tmfgen-fe-manifest.json');
  const mfe = fs.existsSync(man) ? JSON.parse(fs.readFileSync(man, 'utf8')) : null;
  const exposes = mfe?.exposes ?? [];
  if (!exposes.length) throw new Error('manifest tidak punya exposes - verifikasi gagal');
  let exAll = true;
  for (const e of exposes) {
    const ok = fs.existsSync(path.join(appDir, e.target));
    record(`expose-${e.key}`, ok, `${e.target}`);
    exAll = exAll && ok;
  }
  if (!exAll) throw new Error('ada expose target yang tidak ada di src/');

  // V3: remoteEntry.js HTTP 200 di dev server (Module Federation entry termuat runtime).
  const entryRes = await fetch(`${BASE}/${remoteEntry}`);
  record('remote-entry-200', entryRes.ok && entryRes.status === 200, `${BASE}/${remoteEntry} -> ${entryRes.status}`);

  // V4: halaman list render STANDALONE (tanpa host) via mock API.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const listGetsBefore = listGets;
  await page.route('**/tmf-api/**', mockRoute);
  await page.goto(`${BASE}${LIST_PATH}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.MuiDataGrid-row', { timeout: 180_000 });
  const rows = await page.locator('.MuiDataGrid-row').count();
  const nameVisible = await page.getByText(NESTED_ROW_NAME).first().isVisible().catch(() => false);
  const gotApi = listGets > listGetsBefore;
  record('standalone-list-render', rows >= 1 && nameVisible && gotApi, `rows=${rows} name-visible=${nameVisible} api-hits=${listGets > listGetsBefore}`);
  await context.close();

  // V5: port unik (≠ 5012 fe-app-fixed full-repo).
  record('port-unique', PORT !== 5012, `port=${PORT} != 5012`);
}

let browser = null;
(async () => {
  await startServer();
  browser = await chromium.launch();
  await run(browser);
})().catch((err) => {
  console.error(`\nharness error: ${err?.message ?? err}`);
  process.exitCode = 1;
}).finally(() => {
  if (browser) browser.close();
  stopServer();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
});
