#!/usr/bin/env node
/**
 * End-to-end CRUD gate for a generated resource. Compiling proves nothing about
 * behaviour, so this exercises the real routes against a real database.
 *
 *   node tools/crud-smoke.mjs <backendDir> <basePath> <resourceSegment> [--port 3994]
 *
 * The load-bearing assertion is the ROUND TRIP: a nested ref sent on create must
 * come back from GET as a nested object. That is what proves the normalised
 * flatten/un-flatten pair is a true inverse, which is the whole premise of the
 * single nesting rule.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const [, , backendArg, basePath, segment] = process.argv;
if (!backendArg || !basePath || !segment) {
  console.error('usage: node tools/crud-smoke.mjs <backendDir> <basePath> <resourceSegment> [--port N]');
  process.exit(2);
}
const backendDir = path.resolve(backendArg);
const portIdx = process.argv.indexOf('--port');
const PORT = portIdx > -1 ? Number(process.argv[portIdx + 1]) : 3994;
const ROOT = `http://127.0.0.1:${PORT}/${basePath.replace(/^\/+|\/+$/g, '')}/${segment}`;
const dbFile = path.join(os.tmpdir(), `tmfgen-crud-${Date.now()}.db`);

const results = [];
function record(name, ok, detail = '') {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_TYPE: 'sqlite',
    DATABASE_PATH: dbFile,
    DATABASE_SYNCHRONIZE: 'true',
    DATABASE_LOGGING: 'false',
    SKIP_AUTH: 'true',
    RABBITMQ_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', d => { logs += d.toString(); });
child.stderr.on('data', d => { logs += d.toString(); });

const jsonFetch = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
};

async function waitForBoot() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function dbQuery(sql) {
  const require = createRequire(path.join(backendDir, 'package.json'));
  const sqlite3 = require('sqlite3');
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile);
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

try {
  if (!await waitForBoot()) {
    console.error('service did not boot');
    console.error(logs.slice(-3000));
    process.exit(1);
  }
  console.log(`CRUD gate: ${ROOT}\n`);

  // ── create ──
  const payload = {
    '@type': 'PartyRevSharingAlgorithm',
    name: 'Standard 70/30 split',
    description: 'Partner keeps 70 percent',
    policy: [{ id: 'pol-1', name: 'Revenue Policy A', version: '1.0' }],
    conditionVariable: [{
      value: '70',
      policyCondition: { id: 'cond-1', name: 'Tier 1', '@referredType': 'PolicyCondition' },
      policyConditionVariable: { id: 'var-1', name: 'Threshold' },
    }],
  };
  const created = await jsonFetch(ROOT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const id = created.body?.id;
  record('POST -> 201 with id', created.status === 201 && !!id,
    id ? `id=${id}` : `status=${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
  record('POST sets Location header', !!created.headers.get('location'),
    created.headers.get('location') ?? 'absent');
  record('POST echoes @type and href',
    created.body?.['@type'] === 'PartyRevSharingAlgorithm' && !!created.body?.href,
    created.body?.href ?? '');

  // ── minItems enforcement ──
  const badPolicy = await jsonFetch(ROOT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, policy: [] }),
  });
  record('POST with empty policy -> 400 (spec minItems: 1)', badPolicy.status === 400,
    `status=${badPolicy.status}`);

  // ── list ──
  const list = await jsonFetch(`${ROOT}?limit=10`);
  record('GET list -> 200 + X-Total-Count', list.status === 200 && !!list.headers.get('x-total-count'),
    `total=${list.headers.get('x-total-count')} items=${Array.isArray(list.body) ? list.body.length : 'n/a'}`);

  // ── THE ROUND TRIP: nested ref must come back as an object ──
  const one = await jsonFetch(`${ROOT}/${id}`);
  const cv = one.body?.conditionVariable?.[0];
  const pc = cv?.policyCondition;
  record('GET by id -> nested ref rebuilt as an OBJECT (inverse holds)',
    !!pc && typeof pc === 'object' && pc.id === 'cond-1' && pc.name === 'Tier 1',
    pc ? JSON.stringify(pc) : `conditionVariable=${JSON.stringify(cv)}`);
  record('GET by id -> @referredType preserved through the round trip',
    pc?.['@referredType'] === 'PolicyCondition', pc?.['@referredType'] ?? 'missing');
  record('GET by id -> sub-collection preserved',
    one.body?.policy?.[0]?.name === 'Revenue Policy A',
    JSON.stringify(one.body?.policy ?? null).slice(0, 120));
  record('GET by id -> audit/soft-delete columns NOT leaked',
    one.body && !('deletedAt' in one.body) && !('createdDate' in one.body),
    Object.keys(one.body ?? {}).join(','));

  // ── field projection ──
  const projected = await jsonFetch(`${ROOT}/${id}?fields=id,name`);
  const keys = Object.keys(projected.body ?? {}).sort().join(',');
  record('GET ?fields=id,name -> projected', projected.status === 200 && !keys.includes('description'), keys);

  // ── update ──
  const patched = await jsonFetch(`${ROOT}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description: 'Updated split',
      conditionVariable: [{
        value: '80',
        policyCondition: { id: 'cond-2', name: 'Tier 2' },
      }],
    }),
  });
  record('PATCH -> scalar updated', patched.body?.description === 'Updated split',
    patched.body?.description ?? `status=${patched.status}`);
  record('PATCH -> collection replaced, not appended',
    patched.body?.conditionVariable?.length === 1 &&
    patched.body?.conditionVariable?.[0]?.value === '80',
    `count=${patched.body?.conditionVariable?.length} value=${patched.body?.conditionVariable?.[0]?.value}`);
  record('PATCH -> replaced nested ref rebuilt',
    patched.body?.conditionVariable?.[0]?.policyCondition?.id === 'cond-2',
    JSON.stringify(patched.body?.conditionVariable?.[0]?.policyCondition ?? null));

  // ── orphan cleanup for normalised refs ──
  const condRows = await dbQuery('SELECT refId FROM policy_condition_ref');
  record('orphaned ref rows cleaned up after PATCH',
    !condRows.some(r => r.refId === 'cond-1'),
    `policy_condition_ref refIds=[${condRows.map(r => r.refId).join(', ')}]`);

  // ── soft delete ──
  const del = await fetch(`${ROOT}/${id}`, { method: 'DELETE' });
  record('DELETE -> 204', del.status === 204, `status=${del.status}`);
  const afterDelete = await jsonFetch(`${ROOT}/${id}`);
  record('GET after DELETE -> 404', afterDelete.status === 404, `status=${afterDelete.status}`);
  const rows = await dbQuery(`SELECT id, deletedAt, deletedBy, deletedReason FROM party_rev_sharing_algorithm WHERE id = '${id}'`);
  record('row still present with deletedAt set (soft, not hard, delete)',
    rows.length === 1 && !!rows[0].deletedAt,
    rows.length ? `deletedAt=${rows[0].deletedAt} by=${rows[0].deletedBy} reason=${rows[0].deletedReason}` : 'row gone');
  const listAfter = await jsonFetch(`${ROOT}?limit=10`);
  record('soft-deleted row excluded from list',
    Array.isArray(listAfter.body) && !listAfter.body.some(r => r.id === id),
    `total=${listAfter.headers.get('x-total-count')}`);
} catch (err) {
  console.error(`\nharness error: ${err?.message ?? err}`);
  console.error(logs.slice(-2000));
  process.exitCode = 1;
} finally {
  child.kill();
  try { fs.rmSync(dbFile, { force: true }); } catch { /* best effort */ }
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
  console.log('\n--- service log tail ---\n' + logs.slice(-2500));
  process.exit(1);
}
