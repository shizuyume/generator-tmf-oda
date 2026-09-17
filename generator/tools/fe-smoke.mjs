#!/usr/bin/env node
// tools/fe-smoke.mjs - Playwright E2E gate horizontal slice M4 (todo 9).
//
// Menjalankan app FE hasil fe-gen (CRA5 dev server) dengan MOCK API via
// page.route('**/tmf-api/**') - deterministik, tanpa server BE terpisah,
// tanpa CORS. Fixture MENGIKUTI kontrak BE TMF736 nyata:
//   GET list -> array + X-Total-Count; q non-empty -> filter 1 baris
//   GET {id} -> objek NESTED (conditionVariable[0].policyCondition.name)
//   POST -> 201 (tangkap body), PATCH -> 200 (tanpa @type/id), DELETE -> 204
//
//   node tools/fe-smoke.mjs --app <appDir> [--trace] [--fail-proof] [--port N]
//
// Setiap step assert DOM/network NYATA + menulis log `[step N] PASS/FAIL reason`.
// Exit non-0 bila satu step gagal. Trace Playwright disimpan (trace-fe-smoke.zip).
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
  console.error('usage: node tools/fe-smoke.mjs --app <appDir> [--trace] [--fail-proof] [--port N]');
  process.exit(2);
}

const PORT = Number(argVal('--port', '5012'));
const BASE = `http://localhost:${PORT}`;
const LIST_PATH = '/party-rev-sharing-algorithms';
const LIST_URL = `${BASE}${LIST_PATH}`;
const failProof = hasFlag('--fail-proof');
const withTrace = hasFlag('--trace');
const TRACE_PATH = path.join(appDir, 'trace-fe-smoke.zip');

const NESTED_CONDITION_NAME = 'The sold price of single handset more than 300$';

/* ---------- fixtures (kontrak BE TMF736: list array + X-Total-Count, detail nested) ---------- */

const PARTY = 'PartyRevSharingAlgorithm';
const HREF = (id) => `/tmf-api/revenueSharingAlgorithmManagement/v5/partyRevSharingAlgorithm/${id}`;

const ROW_5000 = {
  '@type': PARTY, id: '5000', href: HREF('5000'),
  name: 'Solar Home Split',
  description: 'Revenue share solar home 70/30',
  policy: [
    { '@type': 'PolicyRef', id: '5840', href: HREF('5840'), name: 'Solar Policy A', '@referredType': 'PolicySet', version: '1.0' },
  ],
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
  name: 'Fixed 10 Bonus',
  description: 'Flat bonus per handset',
  policy: [
    { '@type': 'PolicyRef', id: '5841', href: HREF('5841'), name: 'Bonus Policy', '@referredType': 'PolicySet', version: '2.0' },
  ],
  conditionVariable: [],
  actionVariable: [],
};

/* ---------- state + route interception ---------- */

const state = {
  db: [ROW_5000, ROW_5001],
  posts: [],      // { url, body }
  patches: [],    // { url, id, body }
  deletes: [],    // { url, id }
  listGets: [],   // { url, total }  (setelah response fixture)
  detailUrl: null,
  createdId: null,
  // set by step 8 (pagination) untuk mensimulasikan dataset besar (>pageSize)
  // sehingga Next page -> offset=25 benar-benar tercapai. null = pakai rows.length.
  paginateTotal: null,
};

async function mockRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  const m = /partyRevSharingAlgorithm(?:\/([^/]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  const id = m[1];

  if (method === 'GET' && !id) {
    if (failProof) {
      return route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ message: 'mock list 500 (fail-proof scenario)' }),
      });
    }
    let rows = state.db;
    const q = url.searchParams.get('q');
    if (q) {
      rows = state.db.filter((r) => String(r.name ?? '').includes(q) || String(r.description ?? '').includes(q));
    }
    const total = state.paginateTotal ?? rows.length;
    state.listGets.push({ url: url.toString(), total });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'X-Total-Count': String(total), 'X-Result-Count': String(rows.length) },
      body: JSON.stringify(rows),
    });
  }
  if (method === 'GET' && id) {
    const rec = state.db.find((r) => String(r.id) === String(id));
    if (!rec) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
    }
    state.detailUrl = url.toString();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rec) });
  }
  if (method === 'POST') {
    const body = req.postDataJSON();
    const newId = `created-${state.posts.length + 1}`;
    const created = { ...body, id: newId, href: HREF(newId) };
    state.posts.push({ url: url.toString(), body });
    state.createdId = newId;
    state.db.push(created);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
  }
  if (method === 'PATCH') {
    const body = req.postDataJSON();
    state.patches.push({ url: url.toString(), id: String(id), body });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...(state.db.find((r) => String(r.id) === String(id)) ?? {}), ...body }),
    });
  }
  if (method === 'DELETE') {
    state.deletes.push({ url: url.toString(), id: String(id) });
    state.db = state.db.filter((r) => String(r.id) !== String(id));
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ message: 'Method Not Allowed' }) });
}

/* ---------- server lifecycle (reuseExistingServer) ---------- */

let serverProc = null;
let serverOurs = false;

async function httpOk(u) {
  try {
    const r = await fetch(u, { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await httpOk(`${BASE}/`)) {
    console.log(`server already up on ${BASE} - reuseExistingServer (tidak di-start)`);
    return;
  }
  console.log(`starting dev server: cmd /c "set PORT=${PORT} && yarn start" (${appDir})`);
  serverProc = spawn('cmd', ['/c', `set PORT=${PORT} && yarn start`], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
  });
  serverOurs = true;
  let logs = '';
  serverProc.stdout?.on('data', (d) => { logs += d.toString(); });
  serverProc.stderr?.on('data', (d) => { logs += d.toString(); });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (await httpOk(`${BASE}/`)) return;
    if (serverProc.exitCode !== null) {
      throw new Error(`dev server exited early (code ${serverProc.exitCode})\n${logs.slice(-2000)}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server tidak boot dalam 300s\n${logs.slice(-2000)}`);
}

function stopServer() {
  if (serverOurs && serverProc) {
    // cmd /c -> craco -> node: kill ONLY the parent cmd leaves the CRA grandchild
    // holding the piped stdout open -> harness process never exits (shell hang).
    // taskkill /t kills the whole tree, closing the pipe so node can terminate.
    try {
      spawn('taskkill', ['/pid', String(serverProc.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch { /* best effort */ }
    serverProc = null;
  }
}

/* ---------- helpers ---------- */

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

/* ---------- 8 step E2E ---------- */

async function runSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (withTrace) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.route('**/tmf-api/**', mockRoute);

  // 1. boot + list render >= 1 baris (fixture 2)
  try {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('.MuiDataGrid-row', { timeout: 180_000 });
    const rows = await page.locator('.MuiDataGrid-row').count();
    const nameVisible = await page.getByText('Solar Home Split').first().isVisible();
    const total = lastListTotal();
    const ok = rows >= 1 && nameVisible && total === 2;
    if (!ok) throw new Error('list tidak render fixture: rows='+rows+' name-visible='+nameVisible+' X-Total-Count='+total);
    record(1, true, `rows=${rows} name-visible=${nameVisible} X-Total-Count=${total} url=${state.listGets[0]?.url ?? '(none)'}`);
  } catch (e) {
    record(1, false, String(e.message ?? e));
  }

  // 2. add: modal -> field -> submit -> POST body nested
  try {
    await page.getByRole('button', { name: 'Tambah Algoritma' }).click();
    await page.getByLabel('Nama Algoritma', { exact: false }).fill('Test Alg');

    // policy (min 1): add + id
    await page.getByRole('button', { name: '+ Tambah Policy' }).click();
    await page.getByLabel('Policy ID', { exact: false }).fill('5840');

    // conditionVariable: add + fields (nested ref dibangun dari flat fields)
    // Scope by input[name=...] (StandardFormModal renders name=<path> on each TextField)
    // karena label "Policy Variable ID/Name" ambigu (muncul di cv DAN av block).
    await page.getByRole('button', { name: '+ Tambah', exact: true }).first().click();
    await page.locator('input[name="conditionVariable.0.value"]').fill('300');
    await page.locator('input[name="conditionVariable.0.policyConditionId"]').fill('5020');
    await page.locator('input[name="conditionVariable.0.policyConditionName"]').fill(NESTED_CONDITION_NAME);
    await page.locator('input[name="conditionVariable.0.policyConditionVariableId"]').fill('5031');
    await page.locator('input[name="conditionVariable.0.policyConditionVariableName"]').fill('soldPrice');

    // actionVariable: add + fields (name-scoped; label "Policy Action Variable ID/Name" TIDAK ADA)
    await page.getByRole('button', { name: '+ Tambah', exact: true }).nth(1).click();
    await page.locator('input[name="actionVariable.0.value"]').fill('5%');
    await page.locator('input[name="actionVariable.0.policyActionId"]').fill('5021');
    await page.locator('input[name="actionVariable.0.policyActionName"]').fill('Give 5 percent discount');
    await page.locator('input[name="actionVariable.0.policyActionVariableId"]').fill('5041');
    await page.locator('input[name="actionVariable.0.policyActionVariableName"]').fill('discountPercent');

    const postCountBefore = state.posts.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(() => state.posts.length > postCountBefore, 15_000, 'POST terkirim');
    const b = state.posts[state.posts.length - 1].body;
    const ok =
      b?.policy?.[0]?.['@type'] === 'PolicyRef' &&
      b?.conditionVariable?.[0]?.policyCondition?.id === '5020' &&
      String(b?.conditionVariable?.[0]?.policyCondition?.name ?? '').length > 0 &&
      b?.actionVariable?.[0]?.policyAction?.id === '5021';
    await page.waitForTimeout(500);
    const modalOpen = await page.getByRole('dialog').count();
    const snackOk = await page.getByText('Data berhasil dibuat').first().isVisible().catch(() => false);
    if (!(ok && modalOpen === 0 && snackOk)) throw new Error('POST body/close/snackbar mismatch: @type='+b?.policy?.[0]?.['@type']+' cv.id='+b?.conditionVariable?.[0]?.policyCondition?.id+' cv.name.len='+String(b?.conditionVariable?.[0]?.policyCondition?.name ?? '').length+' av.id='+b?.actionVariable?.[0]?.policyAction?.id+' dialog='+modalOpen+' snackbar='+snackOk);
    record(2, true, `policy[0]@type=${b?.policy?.[0]?.['@type']} cv.policyCondition.id=${b?.conditionVariable?.[0]?.policyCondition?.id} cv.policyCondition.name.len=${String(b?.conditionVariable?.[0]?.policyCondition?.name ?? '').length} av.policyAction.id=${b?.actionVariable?.[0]?.policyAction?.id} dialog=${modalOpen} snackbar=${snackOk}`);
  } catch (e) {
    record(2, false, String(e.message ?? e));
  }

  // 3. edit: row edit -> ubah description -> PATCH tanpa @type/id
  try {
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByLabel('Deskripsi', { exact: false }).waitFor({ timeout: 15_000 });
    await page.getByLabel('Deskripsi', { exact: false }).fill('Edited by smoke test');
    const patchBefore = state.patches.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(() => state.patches.length > patchBefore, 15_000, 'PATCH terkirim');
    const p = state.patches[state.patches.length - 1];
    const bodyKeys = Object.keys(p.body);
    const ok =
      p.url.endsWith('/partyRevSharingAlgorithm/5000') &&
      !bodyKeys.includes('@type') &&
      !bodyKeys.includes('id') &&
      p.body.description === 'Edited by smoke test';
    if (!ok) throw new Error('PATCH url/keys/description mismatch: url='+p.url+' keys='+bodyKeys.join(','));
    record(3, true, `url=${p.url} keys=${bodyKeys.join(',')} @type=${bodyKeys.includes('@type')} id=${bodyKeys.includes('id')} description=${p.body.description}`);
  } catch (e) {
    record(3, false, String(e.message ?? e));
  }

  // 4. delete: hapus ROW YANG BARU DI-CREATE (step 2: 'Test Alg', id=state.createdId).
  //    Deterministik: target by name (bukan .nth positional). Stateful mock DELETE benar-benar
  //    menghapus item dari state.db -> GET list berikutnya tanpa item itu (list 3 -> 2).
  //    Anti-race: tunggu baris DETACH dari DOM (bukan hanya network total) - cegah baca DOM
  //    stale saat `reload()` masih loading (DataGrid overlay / setRows belum commit).
  try {
    const totalBefore = lastListTotal();
    page.once('dialog', (d) => d.accept());
    const delBefore = state.deletes.length;
    await page.locator('.MuiDataGrid-row').filter({ hasText: 'Test Alg' }).getByRole('button', { name: 'Hapus' }).click();
    await waitFor(() => state.deletes.length > delBefore, 10_000, 'DELETE terkirim');
    const d = state.deletes[state.deletes.length - 1];
    // ROBUST DOM sync: tunggu ROW yang dihapus ter-detach dari DOM (bukan hanya network).
    const algRow = page.locator('.MuiDataGrid-row').filter({ hasText: 'Test Alg' });
    await algRow.waitFor({ state: 'detached', timeout: 15_000 });
    const rows = await page.locator('.MuiDataGrid-row').count();
    const gone = (await page.getByText('Test Alg', { exact: true }).count()) === 0;
    const ok = d.id === String(state.createdId) && gone && lastListTotal() === totalBefore - 1 && rows >= 1;
    if (!ok) throw new Error('DELETE target/reload mismatch: id='+d.id+' expect='+state.createdId+' gone='+gone+' rows='+rows+' total='+lastListTotal()+' expectTotal='+(totalBefore-1));
    record(4, true, `delete id=${d.id} total=${totalBefore}->${lastListTotal()} rows=${rows} row-gone=${gone}`);
  } catch (e) {
    record(4, false, String(e.message ?? e));
  }

  // 5. nested roundtrip: detail row -> tab Condition Variables -> policyCondition.name tampil
  try {
    await page.locator('.MuiDataGrid-row').first().getByRole('button', { name: 'Detail' }).click();
    await page.getByRole('tab', { name: 'Condition Variables' }).click();
    await page.waitForTimeout(800);
    const nestedVisible = await page.getByText(NESTED_CONDITION_NAME, { exact: true }).first().isVisible().catch(() => false);
    const detailHit = String(state.detailUrl ?? '').includes('/partyRevSharingAlgorithm/5000');
    const ok = nestedVisible && detailHit;
    if (!ok) throw new Error('nested render policyCondition.name tidak tampil: visible='+nestedVisible+' detail='+String(state.detailUrl));
    record(5, true, `policyCondition.name visible=${nestedVisible} detailUrl=${state.detailUrl ?? '(none)'}`);
  } catch (e) {
    record(5, false, String(e.message ?? e));
  }

  // 6. zod error: submit kosong -> error "Wajib diisi"/"Minimal 3 karakter", TANPA POST
  try {
    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.getByRole('button', { name: 'Tambah Algoritma' }).click();
    await page.getByLabel('Nama Algoritma', { exact: false }).fill('x'); // 1 char -> minLength 3
    const postBefore = state.posts.length;
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(
      () => page.getByText('Minimal 3 karakter').first().isVisible().catch(() => false),
      10_000, 'zod error Minimal 3 karakter',
    );
    await page.getByLabel('Nama Algoritma', { exact: false }).fill('');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await waitFor(
      () => page.getByText('Wajib diisi').first().isVisible().catch(() => false),
      10_000, 'zod error Wajib diisi',
    );
    await page.waitForTimeout(600);
    const ok = state.posts.length === postBefore;
    if (!ok) throw new Error('zod gate: request POST tetap terkirim (delta='+(state.posts.length - postBefore)+')');
    record(6, true, `zod name errors tampil, POST delta=${state.posts.length - postBefore} (harus 0)`);
    await page.getByRole('button', { name: 'Batal' }).click();
  } catch (e) {
    record(6, false, String(e.message ?? e));
  }

  // 7. search: q masuk URL + response 1 baris
  try {
    await page.getByPlaceholder('Cari nama / deskripsi...').fill('Solar');
    await waitFor(() => state.listGets.some((g) => g.url.includes('q=Solar')), 15_000, 'GET list dengan q=Solar');
    const hit = state.listGets.filter((g) => g.url.includes('q=Solar'));
    const ok = hit.length > 0 && hit[hit.length - 1].total === 1;
    if (!ok) throw new Error('search q tidak masuk URL / total!=1: hits='+hit.length+' lastTotal='+hit[hit.length-1]?.total);
    record(7, true, `urls-q=${hit.length} last-total=${hit[hit.length - 1]?.total} contoh=${hit[hit.length - 1]?.url ?? '(none)'}`);
    await page.getByPlaceholder('Cari nama / deskripsi...').fill('');
    await waitFor(() => state.listGets.some((g) => !g.url.includes('q=')), 15_000, 'search cleared (GET tanpa q)');
  } catch (e) {
    record(7, false, String(e.message ?? e));
  }

  // 8. pagination offset-limit: pageSize 25 (limit=25) lalu next (offset=25)
  try {
    // Simulasikan dataset besar agar Next page -> offset=25 benar-benar ada
    // (offset=0&limit=25 saja tidak cukup membuktikan navigasi halaman nyata).
    state.paginateTotal = 40;
    // scope ke pagination select DataGrid via accessible name 'Rows per page:' -
    // unik vs combobox lain; hindari strict-mode violation.
    const pageSizeSel = page.getByLabel('Rows per page:');
    await pageSizeSel.click();
    await page.getByRole('option', { name: '25' }).click();
    await waitFor(() => state.listGets.some((g) => g.url.includes('limit=25') && g.url.includes('offset=0')), 15_000, 'GET limit=25&offset=0');
    const got25 = state.listGets[state.listGets.length - 1];
    const ok1 = got25.url.includes('limit=25') && got25.url.includes('offset=0');
    await page.getByRole('button', { name: 'Next page' }).click();
    await waitFor(() => state.listGets.some((g) => g.url.includes('limit=25') && g.url.includes('offset=25')), 15_000, 'GET limit=25&offset=25');
    const gotNext = state.listGets[state.listGets.length - 1];
    const ok = ok1 && gotNext.url.includes('limit=25') && gotNext.url.includes('offset=25');
    if (!ok) throw new Error('pagination offset/limit tidak sesuai scheme: '+got25.url+' | '+gotNext.url);
    record(8, true, `after-pageSize=${got25.url.replace(BASE, '')} after-next=${gotNext.url.replace(BASE, '')}`);
  } catch (e) {
    record(8, false, String(e.message ?? e));
  }

  if (withTrace) await context.tracing.stop({ path: TRACE_PATH });
  await context.close();
}

/* ---------- main ---------- */

let browser = null;
(async () => {
  await startServer();
  browser = await chromium.launch();
  await runSmoke(browser);
  await browser.close();
  browser = null;
})().catch((err) => {
  console.error(`\nharness error: ${err?.message ?? err}`);
  process.exitCode = 1;
}).finally(() => {
  stopServer();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  console.log(`trace: ${TRACE_PATH}`);
  if (failed) process.exitCode = 1;
});