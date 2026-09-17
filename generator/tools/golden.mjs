#!/usr/bin/env node
/**
 * Golden-snapshot harness.
 *
 *   node tools/golden.mjs            verify current output against the snapshots
 *   node tools/golden.mjs --update   re-record the snapshots (review the diff!)
 *   node tools/golden.mjs --case tmf736-v5    just one case
 *
 * Why this exists: every milestone so far found real bugs by regenerating and
 * looking (duplicate `id`, colliding tables, a class named `Object`, an event call
 * that did not typecheck). A snapshot turns "looking" into a diff, so a template
 * edit either changes what you expected or fails the run.
 *
 * Ports are pinned per case so output is byte-stable; the generator otherwise
 * allocates the first free port, which depends on what else exists on disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const docs = path.resolve(root, '..', 'documents');
const goldenDir = path.join(root, 'golden');
const workRoot = path.join(root, '.golden-work');
const cli = path.join(root, 'src', 'cli.mjs');

/** Both dialects, a read-only resource, a nested resource, and multi-component. */
const CASES = [
  { name: 'tmf736-v5', port: 3901, service: 'revenue-sharing-algorithm-service', components: ['tmf736/5.0.0'] },
  { name: 'tmf673-v4', port: 3902, service: 'geographic-address-service', components: ['tmf673/4.0.0'] },
  { name: 'geo-multi', port: 3903, service: 'geographic-service', components: ['tmf673/4.0.0', 'tmf674/4.0.0', 'tmf675/4.0.0'] },
];

// artefacts that are not source and would make snapshots noisy
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SKIP_FILES = new Set(['yarn.lock', 'package-lock.json', 'dev.db']);

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), base, out);
    } else {
      if (SKIP_FILES.has(e.name)) continue;
      out.push(path.relative(base, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  }
  return out;
}

function generateCase(c, into) {
  fs.rmSync(into, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); // Windows Defender real-time scan race - retry, jangan crash gate
  fs.mkdirSync(into, { recursive: true });
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });

  const first = path.join(docs, c.components[0]);
  run(['scaffold', '--component', first, '--target-root', into, '--name', c.service, '--port', String(c.port)]);
  for (const comp of c.components) {
    run(['emit', '--component', path.join(docs, comp), '--target-root', into, '--name', c.service]);
  }
  return path.join(into, c.service);
}

/** @returns {{added:string[], removed:string[], changed:{file:string, firstDiff:string}[]}} */
function compare(goldPath, freshPath) {
  const gold = new Set(walk(goldPath));
  const fresh = new Set(walk(freshPath));
  const added = [...fresh].filter(f => !gold.has(f)).sort();
  const removed = [...gold].filter(f => !fresh.has(f)).sort();
  const changed = [];

  for (const f of [...gold].filter(x => fresh.has(x)).sort()) {
    const a = fs.readFileSync(path.join(goldPath, f), 'utf8');
    const b = fs.readFileSync(path.join(freshPath, f), 'utf8');
    if (a === b) continue;
    const al = a.split('\n');
    const bl = b.split('\n');
    let i = 0;
    while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
    changed.push({
      file: f,
      firstDiff: `line ${i + 1}\n        golden: ${JSON.stringify(al[i] ?? '<eof>')}\n        fresh : ${JSON.stringify(bl[i] ?? '<eof>')}`,
    });
  }
  return { added, removed, changed };
}

function copyTree(from, to) {
  fs.rmSync(to, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(to, { recursive: true });
  for (const rel of walk(from)) {
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, rel), dest);
  }
}

const update = process.argv.includes('--update');
const only = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : null;
const cases = only ? CASES.filter(c => c.name === only) : CASES;
if (!cases.length) {
  console.error(`no case named ${only}; known: ${CASES.map(c => c.name).join(', ')}`);
  process.exit(2);
}

let failures = 0;
for (const c of cases) {
  const work = path.join(workRoot, c.name);
  let servicePath;
  try {
    servicePath = generateCase(c, work);
  } catch (err) {
    console.log(`FAIL  ${c.name}  generation threw`);
    console.log(String(err.stdout ?? err.message).split('\n').slice(-6).join('\n'));
    failures++;
    continue;
  }

  const goldPath = path.join(goldenDir, c.name);

  if (update) {
    copyTree(servicePath, goldPath);
    console.log(`recorded  ${c.name}  (${walk(goldPath).length} files)`);
    continue;
  }

  if (!fs.existsSync(goldPath)) {
    console.log(`MISSING   ${c.name}  no snapshot yet - run with --update`);
    failures++;
    continue;
  }

  const { added, removed, changed } = compare(goldPath, servicePath);
  const total = added.length + removed.length + changed.length;
  if (!total) {
    console.log(`PASS  ${c.name}  ${walk(goldPath).length} files identical`);
    continue;
  }
  failures++;
  console.log(`FAIL  ${c.name}  ${changed.length} changed, ${added.length} added, ${removed.length} removed`);
  for (const f of added.slice(0, 8)) console.log(`      + ${f}`);
  for (const f of removed.slice(0, 8)) console.log(`      - ${f}`);
  for (const ch of changed.slice(0, 8)) console.log(`      ~ ${ch.file}  ${ch.firstDiff}`);
  if (total > 24) console.log(`      ... ${total - 24} more differences not shown`);
}

// a second generation of the same case must be byte-identical to the first
if (!update) {
  for (const c of cases) {
    const a = path.join(workRoot, c.name);
    const b = path.join(workRoot, `${c.name}-again`);
    const first = path.join(a, c.service);
    let second;
    try {
      second = generateCase(c, b);
    } catch {
      console.log(`FAIL  ${c.name}  second generation threw`);
      failures++;
      continue;
    }
    const { added, removed, changed } = compare(first, second);
    const total = added.length + removed.length + changed.length;
    if (total) {
      failures++;
      console.log(`FAIL  ${c.name}  NOT deterministic: ${total} difference(s) between two runs`);
      for (const ch of changed.slice(0, 5)) console.log(`      ~ ${ch.file}  ${ch.firstDiff}`);
    } else {
      console.log(`PASS  ${c.name}  two runs byte-identical`);
    }
  }
}

fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
console.log(failures ? `\n${failures} failure(s)` : '\nall golden checks passed');
process.exit(failures ? 1 : 0);
