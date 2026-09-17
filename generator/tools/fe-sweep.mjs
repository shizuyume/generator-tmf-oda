#!/usr/bin/env node
/**
 * fe-spec corpus sweep (todo 3, M1 gates).
 *
 *   node tools/fe-sweep.mjs
 *
 * Loop every documents/<tmfNNN>/<ver> component and run the real `fe-spec`
 * command (output to a temp dir — no stray files in the workspace). Every
 * emitted YAML must pass the todo-1 validator (`validateFESpec.validateFile`);
 * a crash or an invalid file counts as a failure and exits non-0.
 *
 * EXCLUDE — tmf685/3.0.0 only: the vendor spec ships an unresolvable $ref
 * (the `fe-spec` command fails there with a spec-blame exit-3 message, NOT a
 * generator fault). Excluded explicitly so the count stays honest: 131 version
 * folders on disk -> 130 components swept.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateFile } from '../src/fe/validateFESpec.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const docs = path.resolve(root, '..', 'documents');
const cli = path.join(root, 'src', 'cli.mjs');
const workRoot = path.join(root, '.fe-sweep-work');

/** component -> reason it is excluded (keep the exclusion EXPLICIT and visible). */
const EXCLUDE = new Map([
  ['tmf685/3.0.0', 'spec rusak: $ref unresolvable (MissingPointer) — fe-spec exit 3 spec-blame, bukan fault generator'],
]);

// discover version folders documents/<tmfNNN>/<ver>
const components = [];
for (const c of fs.readdirSync(docs)) {
  const cd = path.join(docs, c);
  if (!fs.statSync(cd).isDirectory()) continue;
  for (const v of fs.readdirSync(cd)) {
    if (fs.statSync(path.join(cd, v)).isDirectory()) components.push(`${c}/${v}`);
  }
}
components.sort();
console.log(`corpus: ${components.length} version folders under documents/`);
for (const [name, why] of EXCLUDE) console.log(`  EXCLUDED ${name}  — ${why}`);

fs.rmSync(workRoot, { recursive: true, force: true });
fs.mkdirSync(workRoot, { recursive: true });

let ok = 0;
let withForm = 0;
let failed = 0;
let crashed = 0;
const fails = [];

for (const comp of components) {
  if (EXCLUDE.has(comp)) continue;

  const outDir = path.join(workRoot, comp.replace('/', '__'));
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'frontend-spec.yaml');

  let status;
  try {
    const r = spawnSync(process.execPath, [cli, 'fe-spec', '--component', path.join(docs, comp), '--out', out], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    status = r;
  } catch (e) {
    fails.push(`${comp}: spawn failed: ${String(e.message).split('\n')[0]}`);
    crashed++;
    failed++;
    continue;
  }

  const lastLine = String(status.stderr || status.stdout).trim().split('\n').pop() || '';
  if (status.status !== 0) {
    const detail = String(status.stderr || status.stdout).trim().split('\n').find(l => l.includes('error:')) || lastLine;
    fails.push(`${comp}: exit ${status.status} — ${detail.slice(0, 120)}`);
    crashed++;
    failed++;
    continue;
  }

  const v = await validateFile(out);
  if (!v.ok) {
    const e = v.errors[0];
    fails.push(`${comp}: INVALID — ${e.pointer}: ${e.message}${e.line ? ` (line ${e.line})` : ''}`);
    failed++;
    continue;
  }

  // % output with >=1 form (read-only resources legitimately have 0)
  const src = fs.readFileSync(out, 'utf8');
  if (/\n\s*forms:/m.test(src)) withForm++;
  ok++;
}

fs.rmSync(workRoot, { recursive: true, force: true });

console.log(`\n${components.length - EXCLUDE.size} components swept, ${ok} OK, ${failed} fail, ${crashed} crash, ${components.length - ok - failed - EXCLUDE.size} excluded`);
console.log(`outputs with >=1 form: ${withForm} (${Math.round((withForm / ok) * 100)}% of OK)`);
for (const f of fails.slice(0, 12)) console.log('  ! ' + f);

const unexpected = failed; // everything that failed is unexpected (EXCLUDE already removed)
console.log(unexpected ? `\n${unexpected} unexpected failure(s)` : '\nall fe-spec corpus outputs valid'); 
process.exit(unexpected ? 1 : 0);