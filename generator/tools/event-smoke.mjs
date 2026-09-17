#!/usr/bin/env node
/**
 * Event pipeline gate: hub subscription -> CRUD -> webhook delivery -> event_log.
 *
 *   node tools/event-smoke.mjs <backendDir> <basePath> <resourceSegment> [--port N]
 *
 * The generated service emits through EventEmitterService, which fans out four ways
 * (EventEmitter2, event_log, RabbitMQ, webhook delivery). RabbitMQ is deliberately
 * left unconfigured: the point is that the other three still work, and that a missing
 * broker never breaks a request.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const [, , backendArg, basePath, segment] = process.argv;
if (!backendArg || !basePath || !segment) {
  console.error('usage: node tools/event-smoke.mjs <backendDir> <basePath> <resourceSegment> [--port N]');
  process.exit(2);
}
const backendDir = path.resolve(backendArg);
const pIdx = process.argv.indexOf('--port');
const PORT = pIdx > -1 ? Number(process.argv[pIdx + 1]) : 3980;
const HOOK_PORT = PORT + 1;
const base = `http://127.0.0.1:${PORT}/${basePath.replace(/^\/+|\/+$/g, '')}`;
const RES = `${base}/${segment}`;
const HUB = `${base}/hub`;
const dbFile = path.join(os.tmpdir(), `tmfgen-events-${Date.now()}.db`);

const received = [];
const hook = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    try { received.push(JSON.parse(body)); } catch { received.push({ raw: body }); }
    res.writeHead(204).end();
  });
});
await new Promise(r => hook.listen(HOOK_PORT, '127.0.0.1', r));

const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

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

const jf = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
};

const settle = (ms = 900) => new Promise(r => setTimeout(r, ms));

function dbQuery(sql) {
  const require = createRequire(path.join(backendDir, 'package.json'));
  const sqlite3 = require('sqlite3');
  return new Promise((resolve, reject) => {
    new sqlite3.Database(dbFile).all(sql, (e, rows) => (e ? reject(e) : resolve(rows)));
  });
}

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/health`)).ok; } catch { await settle(500); }
  }
  if (!up) { console.error('service did not boot'); console.error(logs.slice(-2000)); process.exit(1); }
  console.log(`event gate: ${RES}\n  callback sink on :${HOOK_PORT}\n`);

  // ── subscribe ──
  const sub = await jf(HUB, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback: `http://127.0.0.1:${HOOK_PORT}/events` }),
  });
  record('POST /hub -> 201 subscription', sub.status === 201 && !!sub.body?.id, sub.body?.id ?? `status=${sub.status}`);

  // ── create fires an event ──
  received.length = 0;
  const created = await jf(RES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ '@type': 'PartyRevSharingAlgorithm', name: 'Event probe' }),
  });
  const id = created.body?.id;
  await settle();
  const createEvt = received.find(e => /CreateEvent$/.test(e?.eventType ?? ''));
  record('create -> webhook delivered', !!createEvt,
    createEvt ? `eventType=${createEvt.eventType}` : `received=${JSON.stringify(received).slice(0, 160)}`);
  record('event carries resourceId + resourceType',
    createEvt?.resourceId === id && createEvt?.resourceType === 'PartyRevSharingAlgorithm',
    `resourceId=${createEvt?.resourceId} resourceType=${createEvt?.resourceType}`);
  record('event payload is the mapped resource',
    createEvt?.payload?.name === 'Event probe' && !!createEvt?.payload?.href,
    `payload.name=${createEvt?.payload?.name}`);
  record('event name matches the spec listener route',
    createEvt?.eventType === `${segment}CreateEvent`,
    `${createEvt?.eventType} vs ${segment}CreateEvent`);

  // ── update fires the change event ──
  received.length = 0;
  await jf(`${RES}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'changed' }),
  });
  await settle();
  const changeEvt = received.find(e => /AttributeValueChangeEvent$|ChangeEvent$/.test(e?.eventType ?? ''));
  record('update -> change event delivered', !!changeEvt, changeEvt?.eventType ?? 'none');

  // ── delete fires the delete event with a minimal payload ──
  received.length = 0;
  await fetch(`${RES}/${id}`, { method: 'DELETE' });
  await settle();
  const delEvt = received.find(e => /DeleteEvent$/.test(e?.eventType ?? ''));
  record('delete -> delete event delivered', !!delEvt, delEvt?.eventType ?? 'none');
  record('delete event payload is {id, href} only',
    !!delEvt && Object.keys(delEvt.payload ?? {}).sort().join(',') === 'href,id',
    Object.keys(delEvt?.payload ?? {}).join(','));

  // ── event_log persistence ──
  const rows = await dbQuery('SELECT eventType, resourceId, resourceType FROM event_log ORDER BY timestamp');
  const kinds = rows.map(r => r.eventType);
  record('every event persisted to event_log', rows.length >= 3, `${rows.length} rows: ${[...new Set(kinds)].join(', ')}`);

  // ── query filter: a subscription scoped to another event gets nothing ──
  const scoped = await jf(HUB, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callback: `http://127.0.0.1:${HOOK_PORT}/scoped`,
      query: `eventType=${segment}DeleteEvent`,
    }),
  });
  record('POST /hub with query -> 201', scoped.status === 201, `status=${scoped.status}`);
  received.length = 0;
  const second = await jf(RES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ '@type': 'PartyRevSharingAlgorithm', name: 'Filter probe' }),
  });
  await settle();
  // the scoped subscription asked for Delete only, so only the unscoped one fires
  const createDeliveries = received.filter(e => /CreateEvent$/.test(e?.eventType ?? ''));
  record('scoped subscription does not receive unrelated events',
    createDeliveries.length === 1, `create deliveries=${createDeliveries.length} (expected 1)`);

  // ── inbound listener stub ──
  const listener = await jf(`${base}/listener/${segment}CreateEvent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventType: `${segment}CreateEvent` }),
  });
  record('inbound listener route accepts POST -> 201', listener.status === 201, `status=${listener.status}`);

  // ── unsubscribe ──
  const del = await fetch(`${HUB}/${sub.body.id}`, { method: 'DELETE' });
  record('DELETE /hub/:id -> 204', del.status === 204, `status=${del.status}`);
  received.length = 0;
  await jf(RES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ '@type': 'PartyRevSharingAlgorithm', name: 'After unsubscribe' }),
  });
  await settle();
  record('unsubscribed callback receives nothing',
    !received.some(e => /CreateEvent$/.test(e?.eventType ?? '')),
    `received=${received.length}`);

  // ── broker absence is tolerated ──
  record('no broker configured, requests still succeed',
    second.status === 201 && !/Nest application failed|UnhandledPromiseRejection/i.test(logs),
    /RabbitMQ/i.test(logs) ? 'broker failure logged and tolerated' : 'no broker chatter');
} catch (err) {
  console.error(`\nharness error: ${err?.message ?? err}`);
  console.error(logs.slice(-2000));
  process.exitCode = 1;
} finally {
  child.kill();
  hook.close();
  try { fs.rmSync(dbFile, { force: true }); } catch { /* best effort */ }
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
  console.log('\n--- service log tail ---\n' + logs.slice(-2500));
  process.exit(1);
}
