#!/usr/bin/env node
// fe-mui-verify.mjs — M3 self-check (stdlib only, tanpa dep generator):
//   (a) assert package.json.template deps benar + guardrails template
//       (no zustand / x-charts / common_remote / -pro / import berekstensi);
//   (b) bila argv[2] = appDir hasil scaffold+install+build: parse build/index.html,
//       assert bundle JS benar-benar ada di disk;
//   (c) cek versi MUI terinstall = community (bukan -pro/-enterprise).
// Exit 0 semua pass, 1 ada fail. Usage:
//   node generator/tools/fe-mui-verify.mjs
//   node generator/tools/fe-mui-verify.mjs <appDir>
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(root, 'templates', 'fe-mui');
const failures = [];
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures.push(label);
};

/* (a) package.json.template deps + guardrails */
const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, 'package.json.template'), 'utf8'));
const rd = pkg.dependencies ?? {};
const dd = pkg.devDependencies ?? {};
check(rd.react === '19.2.5', 'template: react 19.2.5 (pin eksak, stack capacity-management)');
check(rd['react-dom'] === '^19.2.5', 'template: react-dom ^19.2.5');
check(rd['react-router-dom'] === '6.30.1', 'template: react-router-dom 6.30.1');
check(/^\^7\./.test(rd['react-hook-form'] ?? ''), 'template: react-hook-form ^7');
check(/^\^3\./.test(rd['zod'] ?? ''), 'template: zod ^3');
check(rd['@hookform/resolvers'] !== undefined, 'template: @hookform/resolvers (zodResolver)');
check(rd['@mui/material'] !== undefined && rd['@mui/x-data-grid'] !== undefined, 'template: @mui/material + @mui/x-data-grid');
check(dd['react-scripts'] === '5.0.1', 'template: react-scripts 5.0.1');
check(dd['@craco/craco'] === '^7.1.0', 'template: @craco/craco ^7.1.0');
check(dd.typescript === '^4.9.5', 'template: typescript ^4.9.5');
const allDeps = { ...rd, ...dd };
check(!('zustand' in allDeps) && !('@mui/x-charts' in allDeps), 'template: zustand & @mui/x-charts TIDAK ada');
check(
  !Object.keys(allDeps).some((d) => /-pro$|-enterprise|-advanced/.test(d)),
  'template: tidak ada paket MUI berbayar (-pro/-enterprise/-advanced)',
);

/* guardrails teks di seluruh tree template */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}
const allFiles = walk(templateDir);
const forbidden = ['zustand', '@mui/x-charts', 'common_remote', 'x-data-grid-pro', 'REACT_APP_COMMON_REMOTE_URL'];
for (const term of forbidden) {
  const hits = allFiles.filter((f) => fs.readFileSync(f, 'utf8').includes(term));
  check(hits.length === 0, `template grep: tidak ada "${term}"${hits.length ? ` (${hits.map((h) => path.relative(templateDir, h)).join(', ')})` : ''}`);
}
const extImport = /(?:from|import\()\s*['"][^'"]+\.(?:tsx|ts)['"]/;
const extHits = allFiles.filter((f) => extImport.test(fs.readFileSync(f, 'utf8')));
check(extHits.length === 0, `template: import tanpa ekstensi .tsx/.ts${extHits.length ? ` (${extHits.map((h) => path.relative(templateDir, h)).join(', ')})` : ''}`);
const secretInEnv = /(TOKEN|API_KEY|SECRET)\s*=\s*\S+/i.test(fs.readFileSync(path.join(templateDir, '.env.example'), 'utf8'));
check(!secretInEnv, 'template: .env.example tidak memuat nilai secret');

/* (b)+(c) app hasil scaffold+install+build — argv[2] */
const appDir = process.argv[2];
if (appDir) {
  const indexHtml = path.join(appDir, 'build', 'index.html');
  const htmlExists = fs.existsSync(indexHtml);
  check(htmlExists, 'app: build/index.html exists');
  if (htmlExists) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    const jsRefs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
    check(jsRefs.length > 0, `app: index.html me-refer ${jsRefs.length} bundle JS`);
    check(
      jsRefs.every((ref) => fs.existsSync(path.join(appDir, 'build', ref.replace(/^\/+/, '')))),
      'app: bundle JS yang direfer benar-benar ada di disk',
    );
  }
  const gridPkgPath = path.join(appDir, 'node_modules', '@mui', 'x-data-grid', 'package.json');
  const matPkgPath = path.join(appDir, 'node_modules', '@mui', 'material', 'package.json');
  if (fs.existsSync(gridPkgPath) && fs.existsSync(matPkgPath)) {
    const grid = JSON.parse(fs.readFileSync(gridPkgPath, 'utf8'));
    const mat = JSON.parse(fs.readFileSync(matPkgPath, 'utf8'));
    check(!/-pro|-enterprise|-advanced/.test(grid.name + mat.name), `app: paket MUI terinstall = community (${grid.name}@${grid.version}, ${mat.name}@${mat.version})`);
    // M3 verified: v9 ada di registry (mainline); fix CRA5 = craco sideEffects:false
    check(/^9\./.test(grid.version), `app: @mui/x-data-grid community v9 terinstall (${grid.version})`);
    check(typeof grid.license === 'string' && /mit/i.test(grid.license), `app: lisensi grid = ${grid.license ?? '(tanpa field license)'} (server-mode community gratis)`);
  } else {
    check(false, 'app: @mui/x-data-grid + @mui/material terinstall');
  }
} else {
  console.log('SKIP  app checks (argv[2] = appDir tidak diberikan)');
}

if (failures.length) {
  console.error(`\nfe-mui-verify: ${failures.length} FAILED\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\nfe-mui-verify: ALL PASS');