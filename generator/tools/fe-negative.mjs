#!/usr/bin/env node
/**
 * Negative-fixture gate (F2): each YAML under golden/fe-spec/invalid/<name>.yaml MUST fail
 * with EXACTLY the recorded `.expected.txt` — byte-compared. Without this, the error
 * pipeline (verbose ajv + pruneAjvErrors + dotted path + formatErrors, F2) can regress
 * silently: noisier output, a wrong pointer, or a missing "Supported:" list would not be
 * caught by any other gate (golden/coverage only look at VALID specs).
 *
 *   node tools/fe-negative.mjs            verify all fixtures
 *   node tools/fe-negative.mjs --update   re-record .expected.txt (review the diff!)
 *
 * Two failure modes are exercised on purpose:
 *   - schema-level (ajv + hand gates)  -> validateFile() -> formatErrors()
 *   - build-level (buildFEIR/zodRules) -> fe-ir CLI       -> formatErrors() via cli.mjs
 * The 5th fixture (unknown-validation-rule) is build-level; the CLI is invoked as a real
 * subprocess so the gate covers the exact path a user hits, same rationale as fe-golden.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateFile, formatErrors } from '../src/fe/validateFESpec.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dir = path.join(root, 'golden', 'fe-spec', 'invalid');
const cli = path.join(root, 'src', 'cli.mjs');

const SCHEMA_LEVEL = ['unknown-field-type', 'unknown-page-view', 'secret-header-env-var', 'unknown-icon'];
const BUILD_LEVEL = ['unknown-validation-rule'];

const update = process.argv.includes('--update');
let failures = 0;

async function schemaLevelOutput(name) {
  const specPath = path.join(dir, `${name}.yaml`);
  const r = await validateFile(specPath);
  if (r.ok) throw new Error(`fixture ${name} VALID — seharusnya invalid (fixture rusak?)`);
  return formatErrors(r.errors, { name: `${name}.yaml` });
}

function buildLevelOutput(name) {
  const specPath = path.join(dir, `${name}.yaml`);
  try {
    execFileSync(process.execPath, [cli, 'fe-ir', '--spec', specPath, '--out', path.join(root, '.fe-negative-tmp.json')], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    throw new Error(`fixture ${name} sukses fe-ir — seharusnya gagal (fixture rusak?)`);
  } catch (err) {
    if (err.status === undefined) throw err; // bukan exit-code failure — lempar ulang
    return String(err.stderr ?? '').trimEnd() + '\n';
  }
}

for (const name of SCHEMA_LEVEL) {
  const expectedPath = path.join(dir, `${name}.expected.txt`);
  const out = await schemaLevelOutput(name);
  if (update) {
    fs.writeFileSync(expectedPath, out, 'utf8');
    console.log(`recorded ${name}`);
    continue;
  }
  if (!fs.existsSync(expectedPath)) { failures++; console.log(`MISSING ${name}  jalankan --update`); continue; }
  const expected = fs.readFileSync(expectedPath, 'utf8');
  if (expected === out) {
    console.log(`PASS  ${name}  (${out.length} bytes)`);
  } else {
    failures++;
    console.log(`FAIL  ${name}  output ajv/formatErrors berubah`);
    console.log('--- expected ---');
    console.log(expected);
    console.log('--- fresh ---');
    console.log(out);
  }
}

for (const name of BUILD_LEVEL) {
  const expectedPath = path.join(dir, `${name}.expected.txt`);
  const out = buildLevelOutput(name);
  if (update) {
    fs.writeFileSync(expectedPath, out, 'utf8');
    console.log(`recorded ${name}`);
    continue;
  }
  if (!fs.existsSync(expectedPath)) { failures++; console.log(`MISSING ${name}  jalankan --update`); continue; }
  const expected = fs.readFileSync(expectedPath, 'utf8');
  if (expected === out) {
    console.log(`PASS  ${name}  (${out.length} bytes)`);
  } else {
    failures++;
    console.log(`FAIL  ${name}  output buildFEIR/CLI berubah`);
    console.log('--- expected ---');
    console.log(expected);
    console.log('--- fresh ---');
    console.log(out);
  }
}

fs.rmSync(path.join(root, '.fe-negative-tmp.json'), { force: true });
console.log(failures ? `\n${failures} failure(s)` : `\nall negative-fixture checks passed (${SCHEMA_LEVEL.length + BUILD_LEVEL.length} fixtures)`);
process.exit(failures ? 1 : 0);
