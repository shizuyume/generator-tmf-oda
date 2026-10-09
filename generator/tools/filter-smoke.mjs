#!/usr/bin/env node
/**
 * Live gate for TMF630 list filtering (common/filter) on a generated TMF736 service.
 * Unit tests prove the parser; only a real database proves the SQL: same-element array
 * semantics, LIKE escaping, NULL handling, bound parameters, and that the response rows
 * keep their full collections when a filter matched one element.
 *
 *   node tools/filter-smoke.mjs <backendDir> [--port 3995]
 *
 * The backend must be built (dist/main.js). Runs against a throwaway sqlite file.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , backendArg] = process.argv;
if (!backendArg) {
  console.error('usage: node tools/filter-smoke.mjs <backendDir> [--port N]');
  process.exit(2);
}
const backendDir = path.resolve(backendArg);
const portIdx = process.argv.indexOf('--port');
const PORT = portIdx > -1 ? Number(process.argv[portIdx + 1]) : 3995;
const ROOT = `http://127.0.0.1:${PORT}/tmf-api/revenueSharingAlgorithmManagement/v5/partyRevSharingAlgorithm`;
const dbFile = path.join(os.tmpdir(), `tmfgen-filter-${Date.now()}.db`);

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
child.stdout.on('data', (d) => { logs += d.toString(); });
child.stderr.on('data', (d) => { logs += d.toString(); });

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

async function waitForBoot() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const SEED = {
  A: {
    name: 'Standard 70/30 split',
    description: 'Partner keeps 70 percent',
    policy: [
      { id: 'pol-1', name: 'Roaming Settlement' },
      { id: 'pol-2', name: 'Content' },
    ],
    conditionVariable: [{ value: '500', policyCondition: { id: 'pcond-001', name: 'Tier 1' } }],
  },
  B: {
    name: 'Premium split',
    description: 'Gold partners',
    policy: [{ id: 'pol-3', name: 'Roaming Settlement' }],
    conditionVariable: [{ value: '100', policyCondition: { id: 'pcond-002', name: 'Tier 2' } }],
  },
  C: {
    name: 'Content 50_50%',
    policy: [{ id: 'pol-4', name: 'Content' }],
  },
};
const ids = {};
const labelOf = (id) => Object.keys(ids).find((k) => ids[k] === id) ?? id;

/** GET with the given query pairs (repeat a key by repeating the pair) → sorted labels. */
async function list(pairs) {
  const qs = new URLSearchParams(pairs).toString();
  const r = await jsonFetch(`${ROOT}?${qs}`);
  const labels = Array.isArray(r.body) ? r.body.map((x) => labelOf(x.id)) : null;
  return { ...r, labels, sorted: labels ? [...labels].sort().join(',') : null };
}

async function expectRows(name, pairs, expected) {
  const r = await list(pairs);
  record(name, r.status === 200 && r.sorted === [...expected].sort().join(','),
    r.status === 200 ? `got [${r.sorted}]` : `status=${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return r;
}

async function expect400(name, pairs, messagePart) {
  const r = await list(pairs);
  const msg = typeof r.body?.message === 'string' ? r.body.message : '';
  record(name, r.status === 400 && r.body?.code === '400' && (!messagePart || msg.includes(messagePart)),
    `status=${r.status} ${msg.slice(0, 140)}`);
}

try {
  if (!await waitForBoot()) {
    console.error('service did not boot');
    console.error(logs.slice(-3000));
    process.exit(1);
  }
  console.log(`filter gate: ${ROOT}\n`);

  for (const [k, body] of Object.entries(SEED)) {
    const r = await jsonFetch(ROOT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ '@type': 'PartyRevSharingAlgorithm', ...body }),
    });
    ids[k] = r.body?.id;
    if (r.status !== 201) throw new Error(`seed ${k}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  await expectRows('no filter -> all rows', [], ['A', 'B', 'C']);

  console.log('\n  JSONPath, top level ($)');
  await expectRows("$[?(@.name=='Premium split')]", [['filter', "$[?(@.name=='Premium split')]"]], ['B']);
  await expectRows("single = is equality too", [['filter', "$[?(@.name='Premium split')]"]], ['B']);
  await expectRows('=~ /split/i (contains, any case)', [['filter', '$[?(@.name=~/SPLIT/i)]']], ['A', 'B']);
  await expectRows('=~ /split/ (contains, exact case)', [['filter', '$[?(@.name=~/split/)]']], ['A', 'B']);
  await expectRows('=~ /SPLIT/ is case-sensitive (also on sqlite)', [['filter', '$[?(@.name=~/SPLIT/)]']], []);
  await expectRows('=~ /_/ matches a literal underscore, not any char', [['filter', '$[?(@.name=~/_/)]']], ['C']);
  await expectRows('=~ /%/ matches a literal percent', [['filter', '$[?(@.name=~/%/i)]']], ['C']);
  await expectRows('=~ /70\\/30/ escaped slash', [['filter', '$[?(@.name=~/70\\/30/)]']], ['A']);
  await expectRows("!= keeps rows without the attribute", [['filter', "$[?(@.description!='Gold partners')]"]], ['A', 'C']);
  await expectRows('== null', [['filter', '$[?(@.description==null)]']], ['C']);
  await expectRows('! ( ) || &&',
    [['filter', "$[?(!(@.name=='Premium split') && (@.description=~/70/ || @.description==null))]"]], ['A', 'C']);
  await expectRows('@type (wire name -> atType column)', [['filter', "$[?(@.@type=='PartyRevSharingAlgorithm')]"]], ['A', 'B', 'C']);
  await expectRows('id', [['filter', `$[?(@.id=='${ids.B}')]`]], ['B']);

  console.log('\n  JSONPath, embedded lists');
  await expectRows("policy[?(@.name=='Content')]", [['filter', "policy[?(@.name=='Content')]"]], ['A', 'C']);
  // A has (pol-1 Roaming) + (pol-2 Content): both conditions must hold for the SAME element
  await expectRows('same element: Roaming Settlement && pol-2 -> not A',
    [['filter', "policy[?(@.name=='Roaming Settlement' && @.id=='pol-2')]"]], []);
  await expectRows('same element: Roaming Settlement && pol-3',
    [['filter', "policy[?(@.name=='Roaming Settlement' && @.id=='pol-3')]"]], ['B']);
  await expectRows('ref inside a list element: policyCondition.id && value',
    [['filter', "conditionVariable[?(@.policyCondition.id=='pcond-002' && @.value=='100')]"]], ['B']);
  await expectRows('same element across a ref: pcond-001 && value 100 -> none',
    [['filter', "conditionVariable[?(@.policyCondition.id=='pcond-001' && @.value=='100')]"]], []);
  const and = await expectRows('two filter= params are ANDed',
    [['filter', '$[?(@.name=~/split/i)]'], ['filter', "policy[?(@.id=='pol-2' || @.id=='pol-4')]"]], ['A']);
  const a = and.body?.find((x) => x.id === ids.A);
  record('a list filter keeps the full collection of each match', a?.policy?.length === 2,
    `A.policy=${JSON.stringify(a?.policy?.map((p) => p.name))}`);

  console.log('\n  attribute style');
  await expectRows('name=premium (house: contains, any case)', [['name', 'premium']], ['B']);
  await expectRows('q=gold (name or description contains)', [['q', 'gold']], ['B']);
  await expectRows('description=Gold partners (exact)', [['description', 'Gold partners']], ['B']);
  await expectRows('id=A,B (comma = any of)', [['id', `${ids.A},${ids.B}`]], ['A', 'B']);
  await expectRows('policy.name=Content&policy.id=pol-4 (same element)',
    [['policy.name', 'Content'], ['policy.id', 'pol-4']], ['C']);
  await expectRows('policy.name=Content&policy.id=pol-1 -> none (pol-1 is Roaming)',
    [['policy.name', 'Content'], ['policy.id', 'pol-1']], []);
  await expectRows('description.ne=Gold partners', [['description.ne', 'Gold partners']], ['A', 'C']);
  await expectRows('attribute + JSONPath together', [['policy.name', 'Content'], ['filter', '$[?(@.name=~/split/i)]']], ['A']);

  console.log('\n  server timestamps (not spec attributes, kept by the generated backend)');
  await expectRows("$[?(@.lastUpdate>='2020-01-01T00:00:00Z')]", [['filter', "$[?(@.lastUpdate>='2020-01-01T00:00:00Z')]"]], ['A', 'B', 'C']);
  await expectRows('createdDate.gte in the future -> none', [['createdDate.gte', '2999-01-01T00:00:00Z']], []);
  await expectRows('lastUpdate.lte a minute from now -> all', [['lastUpdate.lte', new Date(Date.now() + 60_000).toISOString()]], ['A', 'B', 'C']);

  console.log('\n  sort + paging');
  const desc = await list([['sort', '-name']]);
  record('sort=-name', desc.labels?.join(',') === 'A,B,C', `got [${desc.labels}]`);
  const asc = await list([['sort', 'name']]);
  record('sort=name', asc.labels?.join(',') === 'C,B,A', `got [${asc.labels}]`);
  const created = await list([['sort', '-createdDate']]);
  record('sort=-createdDate (server timestamp)', created.status === 200, `status=${created.status}`);
  const page = await list([['filter', '$[?(@.name=~/split/i)]'], ['limit', '1'], ['sort', 'name']]);
  record('X-Total-Count counts the filtered rows, not the page',
    page.headers.get('x-total-count') === '2' && page.labels?.join(',') === 'B',
    `total=${page.headers.get('x-total-count')} page=[${page.labels}]`);

  console.log('\n  refused (400, TMF Error body)');
  await expect400('unknown attribute lists the filterable ones', [['filter', "$[?(@.nope=='x')]"]], 'filterable: id, name');
  // attribute-style keys the resource cannot filter on are ignored (as before), so an extra
  // parameter from a client or a conformance kit never fails the list
  await expectRows('unknown attribute key is ignored', [['nope', 'x'], ['depth', '2']], ['A', 'B', 'C']);
  await expectRows('unknown key ignored, known key still filters', [['nope', 'x'], ['description', 'Gold partners']], ['B']);
  await expect400('server timestamps are top-level only', [['filter', "policy[?(@.createdDate>'2020-01-01')]"]], 'unknown attribute');
  await expect400('unknown list', [['filter', "party[?(@.name=='x')]"]], 'unknown list "party"');
  await expect400('syntax error', [['filter', "$[?(@.name=='x']"]], 'expected');
  await expect400('regex pattern refused (=~ is literal)', [['filter', '$[?(@.name=~/a.*/)]']], 'literal');
  await expect400('unsupported regex flag', [['filter', '$[?(@.name=~/a/g)]']], 'flags');
  await expect400('sort on unknown attribute', [['sort', 'nope']], 'cannot sort by');
  await expect400('sort injection attempt', [['sort', 'name;DROP TABLE party_rev_sharing_algorithm']], 'cannot sort by');
  await expect400('too many conditions',
    [['filter', `$[?(${Array.from({ length: 31 }, (_, i) => `@.name=='${i}'`).join(' || ')})]`]], 'more than 30');

  console.log('\n  injection');
  await expectRows('quote in a value is data, not SQL', [['filter', `$[?(@.name=="x' OR 1=1 --")]`]], []);
  await expectRows('attribute value with SQL is data', [['name', "%' OR '1'='1"]], []);
  await expectRows('table intact after the attempts', [], ['A', 'B', 'C']);
} catch (err) {
  console.error(`\nharness error: ${err?.message ?? err}`);
  console.error(logs.slice(-2000));
  process.exitCode = 1;
} finally {
  child.kill();
  try { fs.rmSync(dbFile, { force: true }); } catch { /* best effort */ }
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exitCode = 1;
