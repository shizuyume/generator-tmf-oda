#!/usr/bin/env node
/**
 * Runtime gate for a generated service. Compiling is not working, so this boots
 * the built app and asserts the things the scaffold is supposed to provide.
 *
 *   node tools/smoke.mjs <serviceBackendDir> [--port 3999]
 *
 * Deliberately runs with no RabbitMQ broker and a throwaway sqlite file: the
 * service must boot anyway (connection failure is logged and retried).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const backendDir = path.resolve(process.argv[2] ?? '.');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 3999;
const BASE = `http://127.0.0.1:${PORT}`;

const dbFile = path.join(os.tmpdir(), `tmfgen-smoke-${Date.now()}.db`);
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

async function get(url, tries = 1) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      return { status: res.status, text: await res.text() };
    } catch (err) {
      if (i === tries - 1) return { status: 0, text: String(err?.message ?? err) };
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

const main = path.join(backendDir, 'dist', 'main.js');
if (!fs.existsSync(main)) {
  console.error(`error: ${main} not found - run the build first`);
  process.exit(2);
}

console.log(`booting ${path.basename(backendDir)} on ${PORT} (sqlite, no broker)`);
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

let stdout = '';
let stderr = '';
child.stdout.on('data', d => { stdout += d.toString(); });
child.stderr.on('data', d => { stderr += d.toString(); });

let exitedEarly = null;
child.on('exit', code => { exitedEarly = code; });

try {
  // 1. boots and serves /health
  const health = await get(`${BASE}/health`, 40);
  if (exitedEarly !== null) {
    record('process stays up', false, `exited with code ${exitedEarly}`);
    console.log('\n--- stdout ---\n' + stdout.slice(-3000));
    console.log('\n--- stderr ---\n' + stderr.slice(-3000));
    process.exit(1);
  }
  let healthJson = null;
  try { healthJson = JSON.parse(health.text); } catch { /* handled below */ }
  record('GET /health -> 200 ok', health.status === 200 && healthJson?.status === 'ok',
    healthJson ? `service=${healthJson.service}` : `status=${health.status}`);

  // 2. swagger document renders
  const docs = await get(`${BASE}/api/docs-json`);
  let doc = null;
  try { doc = JSON.parse(docs.text); } catch { /* handled below */ }
  record('swagger document renders', docs.status === 200 && !!doc?.openapi,
    doc ? `openapi=${doc.openapi} title=${doc.info?.title}` : `status=${docs.status}`);

  const paths = Object.keys(doc?.paths ?? {});
  record('hub routes registered', paths.some(p => /\/hub$/.test(p)),
    paths.length ? paths.join(' ') : 'no paths');

  // 3. hub actually works end to end against the DB
  const hubPath = paths.find(p => /\/hub$/.test(p));
  if (hubPath) {
    const post = await fetch(`${BASE}${hubPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback: 'http://example.test/cb' }),
    }).then(async r => ({ status: r.status, body: await r.text() })).catch(e => ({ status: 0, body: String(e) }));
    let sub = null;
    try { sub = JSON.parse(post.body); } catch { /* handled below */ }
    record('POST hub -> 201 persisted', post.status === 201 && !!sub?.id,
      sub?.id ? `id=${sub.id}` : `status=${post.status} ${post.body.slice(0, 120)}`);

    const list = await get(`${BASE}${hubPath}`);
    let listed = null;
    try { listed = JSON.parse(list.text); } catch { /* handled below */ }
    record('GET hub -> lists subscription', list.status === 200 && Array.isArray(listed) && listed.length > 0,
      Array.isArray(listed) ? `count=${listed.length}` : `status=${list.status}`);

    if (sub?.id) {
      const del = await fetch(`${BASE}${hubPath}/${sub.id}`, { method: 'DELETE' })
        .then(r => r.status).catch(() => 0);
      record('DELETE hub/:id -> 204', del === 204, `status=${del}`);
    }
  }

  // 4. survived the whole exercise with no broker configured: a real liveness
  //    re-check, not a log grep that can never fail
  const stillAlive = await get(`${BASE}/health`);
  record('still serving after DB writes, no broker', exitedEarly === null && stillAlive.status === 200,
    exitedEarly !== null ? `process exited ${exitedEarly}` : `status=${stillAlive.status}`);

  const crashed = /UnhandledPromiseRejection|FATAL|Nest application failed/i.test(stdout + stderr);
  record('no fatal errors in logs', !crashed,
    crashed ? 'see stdout tail' : 'clean');
} finally {
  child.kill();
  try { fs.rmSync(dbFile, { force: true }); } catch { /* best effort */ }
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\n--- stdout tail ---\n' + stdout.slice(-2000));
  process.exit(1);
}
