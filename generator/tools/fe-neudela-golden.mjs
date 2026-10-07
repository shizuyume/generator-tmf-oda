#!/usr/bin/env node
/**
 * neudela adapter golden gate (static, no install).
 *
 *   node tools/fe-neudela-golden.mjs            check
 *   node tools/fe-neudela-golden.mjs --update   re-record golden/fe-spec/neudela-tmf736.yaml + golden/fe/neudela-tmf736/
 *
 * Proves, through the real CLI:
 *   1. `fe-spec --ui neudela --overrides …` on the TMF736 IR is deterministic (two runs, same bytes)
 *      and equals golden/fe-spec/neudela-tmf736.yaml.
 *   2. `fe-gen scaffold` of that spec is deterministic and equals golden/fe/neudela-tmf736/.
 *   3. the golden app == design-lab/neudela-lab, file for file (the lab is the design reference;
 *      only lab-only files — README, the template YAML, e2e scripts, the lockfile — may differ).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ws = path.resolve(root, '..');
const LAB = path.join(ws, 'design-lab', 'neudela-lab');
const UPDATE = process.argv.includes('--update');
const GOLDEN_SPEC = path.join(root, 'golden', 'fe-spec', 'neudela-tmf736.yaml');
const OVERRIDES = path.join(root, 'golden', 'fe-spec', 'neudela-tmf736.overrides.yaml');
const GOLDEN_APP = path.join(root, 'golden', 'fe', 'neudela-tmf736');
const LAB_ONLY = [/^README\.md$/, /^neudela-fe-template\.yaml$/, /^package-lock\.json$/, /^e2e\//, /^node_modules\//, /^dist\//];
const SKIP = new Set(['node_modules', 'dist', '.git']);

let failures = 0;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failures += 1; console.log(`FAIL  ${m}`); };

const cli = (...args) => execFileSync(process.execPath, [path.join(root, 'src', 'cli.mjs'), ...args], { cwd: root, encoding: 'utf8' });
const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');

function tree(dir, base = dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) tree(abs, base, out);
    else out.set(path.relative(base, abs).split(path.sep).join('/'), lf(fs.readFileSync(abs)));
  }
  return out;
}

function compare(label, a, b, { ignoreA = [], ignoreB = [] } = {}) {
  const diffs = [];
  for (const [f, c] of a) {
    if (ignoreA.some((re) => re.test(f))) continue;
    if (!b.has(f)) diffs.push(`only in first: ${f}`);
    else if (b.get(f) !== c) diffs.push(`differs: ${f}`);
  }
  for (const f of b.keys()) if (!a.has(f) && !ignoreB.some((re) => re.test(f))) diffs.push(`only in second: ${f}`);
  if (diffs.length) fail(`${label}\n        ${diffs.slice(0, 12).join('\n        ')}${diffs.length > 12 ? `\n        … ${diffs.length - 12} more` : ''}`);
  else pass(`${label} (${a.size} files)`);
  return diffs.length === 0;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-neudela-golden-'));
try {
  // 1. spec
  const spec1 = path.join(tmp, 'spec1.yaml');
  const spec2 = path.join(tmp, 'spec2.yaml');
  for (const out of [spec1, spec2]) cli('fe-spec', '--component', path.join(ws, 'documents', 'tmf736', '5.0.0'), '--ui', 'neudela', '--overrides', OVERRIDES, '--out', out);
  const s1 = lf(fs.readFileSync(spec1));
  if (s1 === lf(fs.readFileSync(spec2))) pass('fe-spec --ui neudela: two runs byte-identical');
  else fail('fe-spec --ui neudela: two runs differ');
  if (UPDATE) fs.writeFileSync(GOLDEN_SPEC, s1);
  if (fs.existsSync(GOLDEN_SPEC) && lf(fs.readFileSync(GOLDEN_SPEC)) === s1) pass('fe-spec --ui neudela == golden/fe-spec/neudela-tmf736.yaml');
  else fail('fe-spec --ui neudela differs from golden/fe-spec/neudela-tmf736.yaml (run --update after reviewing)');

  // 2. app
  const apps = ['a', 'b'].map((k) => {
    const out = path.join(tmp, k);
    cli('fe-gen', 'scaffold', '--spec', GOLDEN_SPEC, '--out', out);
    const [name] = fs.readdirSync(out);
    return tree(path.join(out, name));
  });
  compare('fe-gen scaffold: two runs byte-identical', apps[0], apps[1]);
  if (UPDATE) {
    fs.rmSync(GOLDEN_APP, { recursive: true, force: true });
    for (const [f, c] of apps[0]) {
      fs.mkdirSync(path.dirname(path.join(GOLDEN_APP, f)), { recursive: true });
      fs.writeFileSync(path.join(GOLDEN_APP, f), c);
    }
    console.log(`      recorded golden/fe/neudela-tmf736 (${apps[0].size} files)`);
  }
  compare('fe-gen scaffold == golden/fe/neudela-tmf736', apps[0], tree(GOLDEN_APP));

  // 3. golden == lab
  if (fs.existsSync(LAB)) compare('golden/fe/neudela-tmf736 == design-lab/neudela-lab', tree(GOLDEN_APP), tree(LAB), { ignoreB: LAB_ONLY });
  else console.log('SKIP  design-lab/neudela-lab not present — golden vs lab not checked');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `${failures} failure(s)` : 'all neudela golden checks passed');
process.exit(failures ? 1 : 0);
