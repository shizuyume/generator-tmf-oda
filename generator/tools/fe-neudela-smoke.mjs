#!/usr/bin/env node
// tools/fe-neudela-smoke.mjs - Playwright E2E gate minimal app uji NEUDELA (todo 11, M6).
//
// Sama pola fe-smoke.mjs (MUI): mock API via page.route('**/tmf-api/**'), tapi
// selektor DOM = neudela (tabel HTML .neudela-table, pager, modal overlay, NeuronInput).
// Slice minimal per task: list render + form (POST nested payload) + detail (nested
// roundtrip policyCondition.name). Plus: PATCH edit, validasi inline (tanpa request),
// search q, pagination offset/limit. Exit non-0 bila satu step gagal.
//
//   node generator/tools/fe-neudela-smoke.mjs --app <appDir> [--port N] [--fail-proof]
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
const hasFlag = (name) => args.includes(name);

const appDir = path.resolve(argVal('--app', ''));
if (!appDir || !fs.existsSync(path.join(appDir, 'package.json'))) {
  console.error('usage: node tools/fe-neudela-smoke.mjs --app <appDir> [--port N] [--fail-proof]');
  process.exit(2);
}

const PORT = Number(argVal('--port', '5012'));
const BASE = `http://localhost:${PORT}`;
const LIST_URL = `${BASE}/party-rev-sharing-algorithms`;
const failProof = hasFlag('--fail-proof');

const NESTED_CONDITION_NAME = 'The sold price of single handset more than 300$';

const PARTY = 'PartyRevSharingAlgorithm';
const HREF = (id) => `/tmf-api/revenueSharingAlgorithmManagement/v5/partyRevSharingAlgorithm/${id}`;

const ROW_5000 = {
  '@type': PARTY, id: '5000', href: HREF('5000'),
  name: 'Solar Home Split',
  description: 'Revenue share solar home 70/30',
  policy: [{ '@type': 'PolicyRef', id: '5840', href: HREF('5840'), name: 'Solar Policy A', '@referredType': 'PolicySet', version: '1.0' }],
  conditionVariable: [
    {
      '@type': 'PartyRevSharingPolicyConditionVariable', value: '300',
      policyCondition: { '@type': 'PolicyConditionRef', id: '5020', name: NESTED_CONDITION_NAME, '@referredType': 'PolicyCondition' },
      policyConditionVariable: { '@type': 'PolicyVariableRef', id: '5031', name: 'soldPrice', '@referredType': 'PolicyVariable' },
    },
  ],
  actionVariable: [
    {
      '@type': 'PartyRevSharingPolicyActionVariable', value: '5%',
      policyAction: { '@type': 'PolicyActionRef', id: '5021', name: 'Give 5 percent discount', '@referredType': 'PolicyAction' },
      policyActionVariable: { '@type': 'PolicyVariableRef', id: '5041', name: 'discountPercent', '@referredType': 'PolicyVariable' },
    },
  ],
};

const ROW_5001 = {
  '@type': PARTY, id: '5001', href: HREF('5001'),
  name: 'Fixed 10 Bonus', description: 'Flat bonus per handset',
  policy: [], conditionVariable: [], actionVariable: [],
};

const state = {
  db: [ROW_5000, ROW_5001],
  posts: [], patches: [], deletes: [],
  listGets: [], detailUrl: null, createdId: null, paginateTotal: null,
};

async function mockRoute(route) {
  const req = route.request();
  const m = /partyRevSharingAlgorithm(?:\/([^/]+))?$/.exec(new URL(req.url()).pathname);
  if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  const id = m[1];
  const method = req.method();

  if (method === 'GET' && !id) {
    if (failProof) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'mock list 500 (fail-proof)' }) });
    }
    let rows = state.db;
    const q = new URL(req.url()).searchParams.get('q');
    if (q) rows = state.db.filter((r) => String(r.name ?? '').includes(q) || String(r.description ?? '').includes(q));
    const total = state.paginateTotal ?? rows.length;
    state.listGets.push({ url: req.url(), total });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'X-Total-Count': String(total) }, body: JSON.stringify(rows) });
  }
  if (method === 'GET' && id) {
    const rec = state.db.find((r) => String(r.id) === String(id));
    if (!rec) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    state.detailUrl = req.url();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rec) });
  }
  if (method === 'POST') {
    const body = req.postDataJSON();
    const newId = `created-${state.posts.length + 1}`;
    const created = { ...body, id: newId, href: HREF(newId) };
    state.posts.push({ url: req.url(), body });
    state.createdId = newId;
    state.db.push(created);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
  }
  if (method === 'PATCH') {
    const body = req.postDataJSON();
    state.patches.push({ url: req.url(), id: String(id), body });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...(state.db.find((r) => String(r.id) === String(id)) ?? {}), ...body }) });
  }
  if (method === 'DELETE') {
    state.deletes.push({ url: req.url(), id: String(id) });
    state.db = state.db.filter((r) => String(r.id) !== String(id));
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
}

let serverProc = null;
let serverOurs = false;
async function httpOk(u) {
  try { return (await fetch(u)).ok; } catch { return false; }
}
async function startServer() {
  if (await httpOk(`${BASE}/`)) { console.log(`server already up on ${BASE} - reuseExistingServer`); return; }
  console.log(`starting dev server: cmd /c "set PORT=${PORT} && yarn start" (${appDir})`);
  serverProc = spawn('cmd', ['/c', `set PORT=${PORT} && yarn start`], { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT) } });
  serverOurs = true;
  let logs = '';
  serverProc.stdout?.on('data', (d) => { logs += d.toString(); });
  serverProc.stderr?.on('data', (d) => { logs += d.toString(); });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (await httpOk(`${BASE}/`)) return;
    if (serverProc.exitCode !== null) throw new Error(`dev server exited early (${serverProc.exitCode})\n${logs.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server tidak boot dalam 300s\n${logs.slice(-2000)}`);
}
function stopServer() {
  if (serverOurs && serverProc) {
    try { spawn('taskkill', ['/pid', String(serverProc.pid), '/t', '/f'], { stdio: 'ignore' }); } catch { /* best effort */ }
    serverProc = null;
  }
}

const results = [];
function record(step, ok, detail = '') {
  results.push(ok);
  console.log(`[step ${step}] ${ok ? 'PASS' : 'FAIL'}  ${detail}`);
}
async function waitFor(pred, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = pred();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timeout menunggu: ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
function lastListTotal() {
  return state.listGets.length ? state.listGets[state.listGets.length - 1].total : null;
}
const rowLoc = (page, text) => page.locator('.neudela-table tbody tr').filter({ hasText: text });

async function runSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.route('**/tmf-api/**', mockRoute);

  // 1. list render >= 1 baris (fixture 2)
  try {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('.neudela-table tbody tr', { timeout: 180_000 });
    const rows = await page.locator('.neudela-table tbody tr').count();
    const nameVisible = await page.getByText('Solar Home Split').first().isVisible();
    const ok = rows >= 1 && nameVisible && lastListTotal() === 2;
    if (!ok) throw new Error('list tidak render fixture: rows=' + rows + ' name=' + nameVisible + ' total=' + lastListTotal());
    record(1, true, `rows=${rows} name-visible=${nameVisible} X-Total-Count=${lastListTotal()}`);
  } catch (e) { record(1, false, String(e.message ?? e)); }

  // 2. add: modal NeuronInput -> submit -> POST nested payload -> modal tertutup
  try {
    await page.getByRole('button', { name: 'Tambah Algoritma' }).click();
    await page.locator('.neudela-modal').waitFor({ timeout: 15_000 });
    await page.locator('input[name="name"]').fill('Test Alg');
    // policy (min 1): add + id
    await page.getByRole('button', { name: '+ Tambah Policy' }).click();
    await page.locator('input[name="policy.0.id"]').fill('5840');
    // conditionVariable: add + fields flat (nested dibangun di itemPayload)
    await page.getByRole('button', { name: '+ Tambah', exact: true }).first().click();
    await page.locator('input[name="conditionVariable.0.value"]').fill('300');
    await page.locator('input[name="conditionVariable.0.policyConditionId"]').fill('5020');
    await page.locator('input[name="conditionVariable.0.policyConditionName"]').fill(NESTED_CONDITION_NAME);
    await page.locator('input[name="conditionVariable.0.policyConditionVariableId"]').fill('5031');
    await page.locator('input[name="conditionVariable.0.policyConditionVariableName"]').fill('soldPrice');
    // actionVariable
    await page.getByRole('button', { name: '+ Tambah', exact: true }).nth(1).click();
    await page.locator('input[name="actionVariable.0.value"]').fill('5%');
    await page.locator('input[name="actionVariable.0.policyActionId"]').fill('5021');
    await page.locator('input[name="actionVariable.0.policyActionName"]').fill('Give 5 percent discount');
    await page.locator('input[name="actionVariable.0.policyActionVariableId"]').fill('5041');
    await page.locator('input[name="actionVariable.0.policyActionVariableName"]').fill('discountPercent');

    const postBefore = state.posts.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(() => state.posts.length > postBefore, 15_000, 'POST terkirim');
    const b = state.posts[state.posts.length - 1].body;
    const ok =
      b?.policy?.[0]?.['@type'] === 'PolicyRef' &&
      b?.conditionVariable?.[0]?.policyCondition?.id === '5020' &&
      String(b?.conditionVariable?.[0]?.policyCondition?.name ?? '').length > 0 &&
      b?.actionVariable?.[0]?.policyAction?.id === '5021';
    await waitFor(() => page.locator('.neudela-modal').count() === 0, 10_000, 'modal tertutup');
    const snackOk = await page.getByText('Data berhasil dibuat').first().isVisible().catch(() => false);
    if (!(ok && snackOk)) throw new Error('POST/close mismatch: ' + JSON.stringify({ t: b?.policy?.[0]?.['@type'], cvid: b?.conditionVariable?.[0]?.policyCondition?.id, avid: b?.actionVariable?.[0]?.policyAction?.id, snack: snackOk }));
    record(2, true, `policy[0]@type=${b?.policy?.[0]?.['@type']} cv.id=${b?.conditionVariable?.[0]?.policyCondition?.id} cv.name.len=${String(b?.conditionVariable?.[0]?.policyCondition?.name ?? '').length} av.id=${b?.actionVariable?.[0]?.policyAction?.id} modal-closed snackbar=${snackOk}`);
  } catch (e) { record(2, false, String(e.message ?? e)); }

  // 3. validasi inline: submit tanpa policy (nama isi) -> error tampil, TANPA POST
  try {
    await page.getByRole('button', { name: 'Tambah Algoritma' }).click();
    await page.locator('input[name="name"]').fill('No Policy');
    const postBefore = state.posts.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(() => page.locator('[data-testid="form-submit-error"]').isVisible().catch(() => false), 10_000, 'error validasi inline');
    const errText = await page.locator('[data-testid="form-submit-error"]').innerText();
    const touched = errText.toLowerCase().includes('policy') || errText.toLowerCase().includes('min');
    const ok = touched && state.posts.length === postBefore;
    if (!ok) throw new Error('validasi: error tidak tampil / POST tetap terkirim (delta=' + (state.posts.length - postBefore) + ') text=' + errText);
    record(3, true, `error-inline tampil ("${errText.trim()}"), POST delta=0`);
    await page.getByRole('button', { name: 'Batal' }).click();
  } catch (e) { record(3, false, String(e.message ?? e)); }

  // 4. edit: row -> ubah deskripsi -> PATCH tanpa @type/id
  try {
    await rowLoc(page, 'Fixed 10 Bonus').getByRole('button', { name: 'Edit' }).click();
    await page.locator('.neudela-modal').waitFor({ timeout: 15_000 });
    const desc = page.locator('input[name="description"]');
    await desc.fill('Edited by neudela smoke');
    const patchBefore = state.patches.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(() => state.patches.length > patchBefore, 15_000, 'PATCH terkirim');
    const p = state.patches[state.patches.length - 1];
    const keys = Object.keys(p.body);
    const ok = p.url.endsWith('/partyRevSharingAlgorithm/5001') && !keys.includes('@type') && !keys.includes('id') && p.body.description === 'Edited by neudela smoke';
    if (!ok) throw new Error('PATCH mismatch: url=' + p.url + ' keys=' + keys.join(','));
    record(4, true, `url=${p.url} keys=${keys.join(',')} @type-incl=${keys.includes('@type')} id-incl=${keys.includes('id')}`);
  } catch (e) { record(4, false, String(e.message ?? e)); }

  // 5. nested roundtrip detail: tab Condition Variables -> policyCondition.name tampil
  try {
    await rowLoc(page, 'Solar Home Split').getByRole('button', { name: 'Detail' }).click();
    await page.getByRole('button', { name: 'Condition Variables' }).click();
    await page.waitForTimeout(800);
    const nestedVisible = await page.getByText(NESTED_CONDITION_NAME, { exact: true }).first().isVisible().catch(() => false);
    const detailHit = String(state.detailUrl ?? '').includes('/partyRevSharingAlgorithm/5000');
    const ok = nestedVisible && detailHit;
    if (!ok) throw new Error('nested render tidak tampil: visible=' + nestedVisible + ' detail=' + String(state.detailUrl));
    record(5, true, `policyCondition.name visible=${nestedVisible} detailUrl=${state.detailUrl ?? '(none)'}`);
  } catch (e) { record(5, false, String(e.message ?? e)); }

  // 6. search: q masuk URL + response 1 baris
  try {
    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.getByPlaceholder('Cari nama / deskripsi...').fill('Solar');
    await waitFor(() => state.listGets.some((g) => g.url.includes('q=Solar')), 15_000, 'GET list dengan q=Solar');
    const hit = state.listGets.filter((g) => g.url.includes('q=Solar'));
    const ok = hit.length > 0 && hit[hit.length - 1].total === 1;
    if (!ok) throw new Error('search q tidak masuk URL / total!=1: hits=' + hit.length);
    record(6, true, `urls-q=${hit.length} last-total=${hit[hit.length - 1]?.total}`);
    await page.getByPlaceholder('Cari nama / deskripsi...').fill('');
  } catch (e) { record(6, false, String(e.message ?? e)); }

  // 7. pagination offset-limit (pager neudela: Next -> page+1)
  try {
    state.paginateTotal = 40;
    await page.getByRole('button', { name: /Berikutnya/ }).click();
    await waitFor(() => state.listGets.some((g) => g.url.includes('offset=10')), 15_000, 'GET offset=10 (page 1)');
    const last = state.listGets[state.listGets.length - 1];
    const ok = last.url.includes('offset=10') && last.url.includes('limit=10');
    if (!ok) throw new Error('pagination offset/limit tidak sesuai: ' + last.url.replace(BASE, ''));
    record(7, true, `after-next=${last.url.replace(BASE, '')} (page=1) total=${last.total}`);
  } catch (e) { record(7, false, String(e.message ?? e)); }

  await context.close();
}

let browser = null;
(async () => {
  await startServer();
  browser = await chromium.launch();
  await runSmoke(browser);
})().catch((err) => {
  console.error(`\nharness error: ${err?.message ?? err}`);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  stopServer();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
});