#!/usr/bin/env node
/**
 * Run every gate the generator has, in one command.
 *
 *   node tools/check-all.mjs            static gates only (fast, no install needed)
 *   node tools/check-all.mjs --runtime  also build and exercise the live service
 *
 * The runtime gates need a built service with dependencies installed, so they are
 * opt-in: `--runtime <serviceBackendDir>` points at one.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ws = path.resolve(root, '..');

/**
 * FE guardrails (todo 12, static — no install needed). We grep the PERSISTED
 * golden app trees (generator/golden/fe/<case>/), so guardrails run without
 * a live scaffold; they must all be zero hits. Patterns mirror MUST-NOT gates:
 *   - common_remote         (self-contained MFE, no shared remote)
 *   - @mui/x-data-grid-pro  (community only, no paid)
 *   - @mui/x-charts         (no page consumer in v1)
 *   - zustand               (state: context|none only)
 *   - extension .tsx import (CRA5 convention = extensionless, not neudela's .tsx)
 *   - secret value in REACT_APP_ (secrets only via runtime gen.config, never build-env)
 */
const FE_FORBID = [
  { label: 'common_remote', re: /common_remote/ },
  { label: '@mui/x-data-grid-pro', re: /@mui\/x-data-grid-pro/ },
  { label: '@mui/x-charts', re: /@mui\/x-charts/ },
  { label: 'zustand', re: /\bzustand\b/i },
  { label: 'extension .tsx import', re: /from\s+['"][^'"]+\.(tsx)['"]/ },
  { label: 'secret value in REACT_APP_', re: /REACT_APP_[A-Z0-9_]+\s*[=:]\s*['"]?(sk-|key|token|secret|AKIA[0-9A-Z])/i },
];
const SKIP_DIRS = new Set(['node_modules', '.yarn', 'dist', '.git', 'build']);

// mcs-common golden case(s) DELIBERATELY contain common_remote (they federate it on
// purpose, see emit/mcs-common/*) — excluded from the negative FE_FORBID walk below and
// checked by the separate POSITIVE assertion gate instead (must contain it, not must not).
const MCS_COMMON_GOLDEN_DIRS = new Set(['mcs-common-tmf736']);

function feWalk(dir, base = dir, out = [], skipDirNames = SKIP_DIRS) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (skipDirNames.has(e.name)) continue;
      feWalk(path.join(dir, e.name), base, out, skipDirNames);
    } else {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Walk a set of roots (golden app trees + current spec yamls) and report guardrail hits. */
function guardrailReport(roots, { skipDirNames = SKIP_DIRS, forbid = FE_FORBID } = {}) {
  const files = [];
  for (const r of roots) {
    if (fs.existsSync(r) && fs.statSync(r).isDirectory()) files.push(...feWalk(r, r, [], skipDirNames));
    else if (fs.existsSync(r)) files.push(r);
  }
  const hits = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const { label, re } of forbid) {
      const m = text.match(re);
      if (m) hits.push(`${label} : ${path.relative(root, f)} : ${JSON.stringify(m[0].split(/\s/)[0])}`);
    }
  }
  return hits;
}

const runtimeIdx = process.argv.indexOf('--runtime');
const runtimeBackend = runtimeIdx > -1 ? process.argv[runtimeIdx + 1] : null;

const gates = [
  {
    name: 'corpus sweep (every component emits without crashing)',
    cmd: ['tools/sweep-emit.mjs'],
    // the 3 over-limit table names are known and reported, not a regression
    ok: out => /emit crashes\s*:\s*0/.test(out) && /components emitted OK\s*:\s*130/.test(out),
    summary: out => (out.match(/components emitted OK.*|entities rendered.*|table collisions.*|emit crashes.*/g) ?? []).join(' | '),
  },
  {
    name: 'golden snapshots + double-run determinism',
    cmd: ['tools/golden.mjs'],
    ok: out => /all golden checks passed/.test(out),
    summary: out => (out.match(/^(PASS|FAIL).*$/gm) ?? []).length + ' checks',
  },
  /* ---- FE section (todo 12, static — no install) ---- */
  {
    name: 'FE fe-gen golden matrix + determinism (7 cases: mui full/mfe + neudela full + fe-default full/dashboard/mfe + mcs-common)',
    cmd: ['tools/fe-golden.mjs'],
    ok: out => /all fe golden checks passed/.test(out) && !/failure\(s\)$/.test(out),
    summary: out => (out.match(/^(PASS|FAIL).*$/gm) ?? []).length + ' checks',
  },
  {
    name: 'FE schema validate (current spec yamls + golden fe-spec)',
    run: () => {
      const checkDir = path.join(root, '.feir-check');
      fs.rmSync(checkDir, { recursive: true, force: true });
      const specs = [
        path.join(ws, 'frontend-spec-tmf736.yaml'),
        path.join(ws, 'frontend-spec-tmf736-mfe.yaml'),
        path.join(ws, 'frontend-spec-tmf736-full.yaml'),
        path.join(ws, 'frontend-spec-tmf736-neudela.yaml'),
        path.join(ws, 'frontend-spec-tmf736-fe-default.yaml'),
        path.join(ws, 'frontend-spec-fe-default-dashboard-demo.yaml'),
        path.join(ws, 'frontend-spec-fe-default-mfe-demo.yaml'),
        path.join(ws, 'examples', 'fe-spec-inventory.yaml'),
        path.join(ws, 'examples', 'fe-spec-retail-admin-console.yaml'),
        path.join(root, 'golden', 'fe-spec', 'fe-spec-tmf736.yaml'),
        path.join(root, 'golden', 'fe-spec', 'fe-spec-tmf673.yaml'),
      ];
      const out = [];
      for (const s of specs) {
        if (!fs.existsSync(s)) { out.push(`MISSING ${path.relative(ws, s)}`); continue; }
        try {
          const r = execFileSync(process.execPath, [path.join(root, 'src', 'cli.mjs'), 'fe-ir', '--spec', s, '--out', path.join(checkDir, path.basename(s, '.yaml') + '.feir.json')], {
            cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 32 * 1024 * 1024,
          });
          out.push(`OK ${path.basename(s)}: ` + (r.match(/FE IR.*/)?.[0] ?? 'valid').split('\n')[0]);
        } catch (err) {
          out.push(`FAIL ${path.basename(s)}: ${String(err.stdout ?? err.message).split('\n').filter(l => /error|pointer|line/i.test(l)).slice(-4).join(' | ') || 'validation failed'}`);
        }
      }
      fs.rmSync(checkDir, { recursive: true, force: true });
      return out.join('\n');
    },
    ok: out => /^FAIL/m.test(out) === false && /^MISSING/m.test(out) === false,
    summary: out => (out.match(/^OK/gm) ?? []).length + ' specs valid' + ((out.match(/^FAIL|^MISSING/gm) ?? []).length ? ' + ' + (out.match(/^FAIL|^MISSING/gm) ?? []).length + ' bad' : ''),
  },
  {
    name: 'FE adapter coverage vs x-semantic-vocabulary (0 gap diam, tiap gap tertulis)',
    cmd: ['tools/fe-coverage.mjs'],
    ok: out => /all adapter coverage checks passed/.test(out),
    summary: out => (out.match(/^(PASS|FAIL).*$/gm) ?? []).length + ' adapters',
  },
  {
    name: 'FE negative-fixture (error pipeline format, F2)',
    cmd: ['tools/fe-negative.mjs'],
    ok: out => /all negative-fixture checks passed/.test(out),
    summary: out => (out.match(/^(PASS|FAIL|MISSING).*$/gm) ?? []).length + ' fixtures',
  },
  {
    name: 'FE guardrails grep (golden app trees: common_remote, pro, x-charts, zustand, .tsx import, secret in REACT_APP_)',
    run: () => {
      const roots = [path.join(root, 'golden', 'fe')];
      // mcs-common case(s) deliberately federate common_remote - excluded here, checked
      // by the positive-assertion gate below instead.
      const hits = guardrailReport(roots, { skipDirNames: new Set([...SKIP_DIRS, ...MCS_COMMON_GOLDEN_DIRS]) });
      return hits.length ? hits.join('\n') : 'no guardrail hits';
    },
    ok: out => /no guardrail hits/.test(out),
    summary: out => /no guardrail hits/.test(out) ? '0 hits' : out.split('\n').length + ' hit(s)',
  },
  {
    name: 'FE mcs-common golden: common_remote federation REQUIRED (inverse guardrail)',
    run: () => {
      const missing = [];
      for (const name of MCS_COMMON_GOLDEN_DIRS) {
        const dir = path.join(root, 'golden', 'fe', name);
        if (!fs.existsSync(dir)) { missing.push(`${name}: golden case not present yet`); continue; }
        const cracoPath = path.join(dir, 'craco.config.js');
        if (!fs.existsSync(cracoPath)) { missing.push(`${name}: craco.config.js not found`); continue; }
        // Strip `//` comment lines first - the file's own explanatory comment mentions
        // the OLD self-contained `remotes:{}` shape by name, which would otherwise
        // false-positive both checks below.
        const code = fs.readFileSync(cracoPath, 'utf8')
          .split('\n')
          .filter((line) => !line.trim().startsWith('//'))
          .join('\n');
        if (!/common_remote/.test(code)) missing.push(`${name}: craco.config.js has no common_remote reference (outside comments)`);
        if (/remotes:\s*\{\s*\}/.test(code)) missing.push(`${name}: remotes is empty {} - not actually federated`);
      }
      return missing.length ? missing.join('\n') : 'common_remote present in all mcs-common golden cases';
    },
    ok: out => /^common_remote present/.test(out),
    summary: out => /^common_remote present/.test(out) ? `${MCS_COMMON_GOLDEN_DIRS.size} case(s) OK` : out.split('\n').length + ' problem(s)',
  },
];

if (runtimeBackend) {
  gates.push(
    {
      // Runtime gates exercise dist/, so a stale build silently tests old code -
      // which is how a green suite once hid a controller that no longer compiled.
      // Building here makes staleness impossible.
      name: 'build (tsc) — runtime gates test dist/, so it must be current',
      cmd: null,
      run: () => {
        // `npx nest build` from the backend dir fails on yarn's workspace hoisting
        // (it looks for @nestjs/cli under a scoped path that does not exist), so the
        // build runs through the service-root workspace script, which is how the
        // repo's other services are built too.
        const serviceRoot = path.dirname(path.resolve(runtimeBackend));
        const tsc = execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.build.json'], {
          cwd: runtimeBackend, encoding: 'utf8', stdio: 'pipe', shell: true,
        });
        const build = execFileSync('corepack', ['yarn', 'build'], {
          cwd: serviceRoot, encoding: 'utf8', stdio: 'pipe', shell: true,
        });
        return tsc + build;
      },
      ok: out => /Done in|Successfully compiled/.test(out),
      summary: () => 'typecheck clean, dist rebuilt',
    },
    {
      name: 'boot + hub smoke',
      cmd: ['tools/smoke.mjs', runtimeBackend, '--port', '3941'],
      ok: out => /(\d+)\/\1 checks passed/.test(out),
      summary: out => out.match(/\d+\/\d+ checks passed/)?.[0] ?? '',
    },
    {
      name: 'CRUD round trip',
      cmd: ['tools/crud-smoke.mjs', runtimeBackend,
        'tmf-api/revenueSharingAlgorithmManagement/v5', 'partyRevSharingAlgorithm', '--port', '3942'],
      ok: out => /(\d+)\/\1 checks passed/.test(out),
      summary: out => out.match(/\d+\/\d+ checks passed/)?.[0] ?? '',
    },
    {
      name: 'event pipeline',
      cmd: ['tools/event-smoke.mjs', runtimeBackend,
        'tmf-api/revenueSharingAlgorithmManagement/v5', 'partyRevSharingAlgorithm', '--port', '3943'],
      ok: out => /(\d+)\/\1 checks passed/.test(out),
      summary: out => out.match(/\d+\/\d+ checks passed/)?.[0] ?? '',
    },
    {
      name: 'DTO validators',
      cmd: ['tools/validate-dto.mjs', runtimeBackend, 'party-rev-sharing-algorithm', 'create'],
      ok: out => /(\d+)\/\1 expectations met/.test(out),
      summary: out => out.match(/\d+\/\d+ expectations met/)?.[0] ?? '',
    },
  );
}

let failed = 0;
for (const g of gates) {
  process.stdout.write(`\n── ${g.name}\n`);
  let out = '';
  let threw = false;
  try {
    out = g.run
      ? g.run()
      : execFileSync(process.execPath, g.cmd.map((a, i) => (i === 0 ? path.join(here, '..', a) : a)), {
        cwd: path.join(here, '..'), encoding: 'utf8', stdio: 'pipe', maxBuffer: 32 * 1024 * 1024,
      });
  } catch (err) {
    out = String(err.stdout ?? '') + String(err.stderr ?? '');
    threw = true;
  }
  const pass = !threw && g.ok(out);
  if (!pass) failed++;
  console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${g.summary(out) || (threw ? 'command failed' : 'assertion failed')}`);
  if (!pass) console.log(out.split('\n').slice(-14).map(l => `      ${l}`).join('\n'));
}

console.log(failed ? `\n${failed} gate(s) failed` : '\nall gates passed');
process.exit(failed ? 1 : 0);
