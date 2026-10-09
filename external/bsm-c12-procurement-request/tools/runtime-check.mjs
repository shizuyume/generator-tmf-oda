// Uji runtime menyeluruh C12: CRUD semua resource + hub, dengan timeout per request dan
// heap dibatasi, supaya infinite loop / rekursi tidak menggantung tetapi gagal cepat.
//
// node runtime-all.mjs <backendDir> <port> [KEY=VAL ...]
//   KEY=VAL diteruskan sebagai env servis (DATABASE_TYPE, DATABASE_HOST, ...).
//   Untuk Postgres, password diambil dari env DATABASE_PASSWORD atau PGPASSWORD milik
//   shell pemanggil, atau dari pgpass.conf (driver pg membacanya otomatis).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('file:///D:/oh-my-tmf-agent-workspace/generator/package.json');
const yaml = require('js-yaml');
const [backend, portArg, ...extra] = process.argv.slice(2);
const port = Number(portArg);
const env = { ...process.env, PORT: String(port), SKIP_AUTH: 'true', DATABASE_SYNCHRONIZE: 'true', NODE_ENV: 'development' };
if (!env.DATABASE_PASSWORD && env.PGPASSWORD) env.DATABASE_PASSWORD = env.PGPASSWORD;
for (const kv of extra) { const i = kv.indexOf('='); env[kv.slice(0, i)] = kv.slice(i + 1); }

const HEAP_MB = 512;
const REQUEST_TIMEOUT_MS = 15000;
const proc = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, path.join(backend, 'dist', 'main.js')], { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
let exited = null;
proc.stdout.on('data', d => { log += d; });
proc.stderr.on('data', d => { log += d; });
proc.on('exit', code => { exited = code; });

const contract = yaml.load(fs.readFileSync('D:/oh-my-tmf-agent-workspace/external/bsm-c12-procurement-request/1.0.0/contract/BSM-C12-Procurement_Request_Management-v1.0.0-contract.oas.yaml', 'utf8'));
const example = name => structuredClone(contract.components.examples[`Create${name}_request`].value);
const base = `http://127.0.0.1:${port}/tmf-api/procurementRequestManagement/v1`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const slow = [];

async function req(method, p, body) {
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(base + p, { method, signal: ctrl.signal, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    const ms = Date.now() - t0;
    if (ms > 2000) slow.push(`${method} ${p} ${ms}ms`);
    let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, ms };
  } catch (e) {
    const why = e.name === 'AbortError' ? `TIMEOUT >${REQUEST_TIMEOUT_MS}ms (kemungkinan loop)` : (exited !== null ? `servis mati (exit ${exited})` : e.message);
    return { status: 0, json: why, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
function check(name, cond, detail = '') { results.push({ name, ok: !!cond, detail }); return !!cond; }
const short = j => (typeof j === 'string' ? j : JSON.stringify(j)).slice(0, 220);

try {
  let up = false;
  for (let i = 0; i < 120 && !up && exited === null; i++) {
    try { await fetch(`http://127.0.0.1:${port}/`); up = true; } catch { await wait(500); }
  }
  if (!up) throw new Error('servis tidak menyala');

  const ids = {};
  const ref = (type, id) => ({ '@type': type, id });
  const order = [
    ['Currency', '/currency', b => b],
    ['ExchangeRate', '/exchangeRate', b => ({ ...b, currency: ref('CurrencyRef', ids.Currency), quoteCurrency: ref('CurrencyRef', ids.Currency) })],
    ['ProcurementCategory', '/procurementCategory', b => b],
    ['ProcurementRequest', '/procurementRequest', b => ({ ...b, procurementCategory: ref('ProcurementCategoryRef', ids.ProcurementCategory) })],
    ['Sow', '/sow', b => ({ ...b, procurementRequest: ref('ProcurementRequestRef', ids.ProcurementRequest), currency: ref('CurrencyRef', ids.Currency), exchangeRateSource: ref('ExchangeRateRef', ids.ExchangeRate) })],
    ['RequestToCheck', '/requestToCheck', b => ({ ...b, procurementRequest: ref('ProcurementRequestRef', ids.ProcurementRequest), sow: ref('SowRef', ids.Sow) })],
    ['RequestDocumentCheck', '/requestDocumentCheck', b => ({ ...b, procurementRequest: ref('ProcurementRequestRef', ids.ProcurementRequest), sow: ref('SowRef', ids.Sow), requestToCheck: ref('RequestToCheckRef', ids.RequestToCheck) })],
    ['ExternalOrderCandidate', '/externalOrderCandidate', b => ({ ...b, procurementRequest: ref('ProcurementRequestRef', ids.ProcurementRequest) })],
    ['IncidentQuestion', '/incidentQuestion', b => b],
    ['IncidentQuestionnaire', '/incidentQuestionnaire', b => ({ ...b, sow: ref('SowRef', ids.Sow), procurementRequest: ref('ProcurementRequestRef', ids.ProcurementRequest) })],
  ];

  for (const [name, p, fix] of order) {
    const c = await req('POST', p, fix(example(name)));
    if (!check(`${name}: POST`, c.status === 201, `${c.status} ${c.status === 201 ? c.ms + 'ms' : short(c.json)}`)) continue;
    ids[name] = c.json.id;
    const g = await req('GET', `${p}/${ids[name]}`);
    check(`${name}: GET by id`, g.status === 200 && g.json?.id === ids[name], `${g.status} ${g.ms}ms`);
    const l = await req('GET', `${p}?limit=5`);
    check(`${name}: GET list`, l.status === 200 && Array.isArray(l.json), `${l.status} ${l.ms}ms`);
    const pt = await req('PATCH', `${p}/${ids[name]}`, { '@type': name, ...(name === 'Currency' ? { symbol: 'X' } : name === 'ExchangeRate' ? { source: 'SAP' } : { description: undefined }) });
    check(`${name}: PATCH`, pt.status === 200, `${pt.status} ${pt.status === 200 ? pt.ms + 'ms' : short(pt.json)}`);
  }

  // relasi eager dibaca dari kedua arah setelah semua anak ada
  const pr = await req('GET', `/procurementRequest/${ids.ProcurementRequest}`);
  check('ProcurementRequest: GET setelah semua relasi terisi', pr.status === 200, `${pr.status} ${pr.ms}ms`);
  const eoc = await req('GET', `/externalOrderCandidate/${ids.ExternalOrderCandidate}`);
  check('ExternalOrderCandidate -> ProcurementRequest terbaca', eoc.status === 200 && eoc.json?.procurementRequest?.id === ids.ProcurementRequest, `${eoc.status} ${short(eoc.json?.procurementRequest)}`);
  const rdc = await req('GET', `/requestDocumentCheck/${ids.RequestDocumentCheck}`);
  check('RequestDocumentCheck -> RequestToCheck -> Sow -> ProcurementRequest terbaca', rdc.status === 200 && rdc.json?.requestToCheck?.id === ids.RequestToCheck, `${rdc.status} ${rdc.ms}ms`);

  // nilai desimal
  const prVal = pr.json?.projectValue?.value;
  check('projectValue numeric(18,2) kembali persis sebagai number', prVal === 1500000000, `${typeof prVal} ${prVal}`);
  const er = await req('GET', `/exchangeRate/${ids.ExchangeRate}`);
  check('ExchangeRate.rate numeric(18,6) number', er.json?.rate === 16250, `${typeof er.json?.rate} ${er.json?.rate}`);

  // hub
  const hub = await req('POST', '/hub', { callback: 'http://127.0.0.1:9/listener' });
  check('hub: POST', hub.status === 201, `${hub.status} ${short(hub.json)}`);
  check('hub: GET list', (await req('GET', '/hub')).status === 200);
  if (hub.json?.id) {
    check('hub: GET by id', (await req('GET', `/hub/${hub.json.id}`)).status === 200);
    check('hub: DELETE', [200, 204].includes((await req('DELETE', `/hub/${hub.json.id}`)).status));
  }

  // hapus SOW (satu-satunya resource dengan DELETE)
  const del = await req('DELETE', `/sow/${ids.Sow}`);
  check('Sow: DELETE', [200, 202, 204].includes(del.status), `${del.status} ${short(del.json)}`);

  // beban kecil berulang: 20 create + read berturut-turut, memori tidak boleh meledak
  let loopOk = true;
  for (let i = 0; i < 20 && loopOk; i++) {
    const c = await req('POST', '/procurementRequest', { ...example('ProcurementRequest'), name: `Beban ${i}`, procurementCategory: ref('ProcurementCategoryRef', ids.ProcurementCategory) });
    loopOk = c.status === 201 && (await req('GET', `/procurementRequest/${c.json.id}`)).status === 200;
  }
  check('20x create+read berturut-turut tanpa loop/crash', loopOk && exited === null);
} catch (e) {
  check('runtime', false, e.message);
} finally {
  check(`servis tetap hidup sampai akhir (heap dibatasi ${HEAP_MB} MB)`, exited === null, exited === null ? '' : `exit ${exited}`);
  proc.kill();
}

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  -> ' + r.detail : ''}`);
if (slow.length) console.log('\nrequest lambat (>2s):\n  ' + slow.join('\n  '));
console.log(`\n${results.length - failed.length}/${results.length} lulus`);
if (failed.length && /heap|FATAL|Error/i.test(log)) console.log('\n--- log servis (akhir) ---\n' + log.slice(-2500));
process.exit(failed.length ? 1 : 0);
