// Menulis ulang lampiran "Kamus field & endpoint" di BRD dari kontrak C12, supaya BRD dan YAML tidak berbeda.
// Pemakaian: node sync-brd.mjs [path BRD]
// Default BRD: D:/Neuronworks/project/tm-forum/tif-bsm/docs/brd/BRD-1.2-permintaan-pengadaan.md
// Hanya blok di antara penanda <!-- BEGIN:C12-SPEC --> dan <!-- END:C12-SPEC --> yang diganti.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../generator/package.json', import.meta.url));
const yaml = require('js-yaml');

const here = path.dirname(url.fileURLToPath(import.meta.url));
const brdPath = process.argv[2] || 'D:/Neuronworks/project/tm-forum/tif-bsm/docs/brd/BRD-1.2-permintaan-pengadaan.md';
const contract = yaml.load(fs.readFileSync(path.join(here, '1.0.0', 'contract', 'BSM-C12-Procurement_Request_Management-v1.0.0-contract.oas.yaml'), 'utf8'));
const S = contract.components.schemas;
const RES = ['ProcurementRequest', 'Sow', 'RequestToCheck', 'RequestDocumentCheck', 'ExternalOrderCandidate', 'ProcurementCategory', 'Currency', 'ExchangeRate', 'IncidentQuestion', 'IncidentQuestionnaire'];
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const refName = r => r.split('/').pop();

function typeOf(p) {
  if (p.$ref) {
    const t = S[refName(p.$ref)];
    if (t?.enum) return `enum: ${t.enum.join(' / ')}`;
    return refName(p.$ref);
  }
  if (p.type === 'array') return `${p.items?.$ref ? refName(p.items.$ref) : p.items?.type}[]`;
  if (p.enum) return `enum: ${p.enum.join(' / ')}`;
  return p.format ? `${p.type} (${p.format})` : (p.type || 'object');
}
function descOf(p) {
  if (p.description) return p.description;
  if (p.$ref) { const t = S[refName(p.$ref)]; return t?.description || ''; }
  if (p.items?.$ref) return S[refName(p.items.$ref)]?.description || '';
  return '';
}

const out = ['<!-- BEGIN:C12-SPEC -->', '', '> Dibuat otomatis dari kontrak C12 oleh `sync-brd.mjs` — jangan diedit tangan; ubah `build-spec.mjs` lalu jalankan `node build-spec.mjs && node sync-brd.mjs`.', ''];
out.push('### 12.1 Endpoint (kontrak lengkap)', '', '| Method | Path | Ringkasan | Implementasi |', '|---|---|---|---|');
for (const [p, ops] of Object.entries(contract.paths)) {
  if (p.startsWith('/listener/')) continue;
  for (const [m, op] of Object.entries(ops)) {
    out.push(`| ${m.toUpperCase()} | \`${p}\` | ${cell(op.summary)} | ${op['x-bsm-implementation'] ? `ditulis tangan: \`${op['x-bsm-implementation']}\`` : 'di-generate'} |`);
  }
}
const listeners = Object.keys(contract.paths).filter(p => p.startsWith('/listener/')).map(p => p.slice('/listener/'.length));
out.push('', `Listener TMF688 (POST, ${listeners.length}): ${listeners.map(l => `\`${l}\``).join(', ')}.`, '');

out.push('### 12.2 Field per resource', '', 'Kolom **Wajib (create)** = wajib di body POST (`_FVO`). **Sistem** = tidak boleh dikirim saat create (diisi sistem).', '');
for (const r of RES) {
  const props = S[r].allOf[1].properties;
  const fvo = S[`${r}_FVO`].allOf[1];
  const req = new Set(fvo.required || []);
  const fvoProps = new Set(Object.keys(fvo.properties));
  out.push(`#### ${r}`, '', cell(S[r].allOf[1].description), '', '| Field | Tipe | Wajib (create) | Keterangan |', '|---|---|---|---|');
  for (const [k, p] of Object.entries(props)) {
    const w = req.has(k) ? 'ya' : (fvoProps.has(k) ? '' : 'sistem');
    out.push(`| \`${k}\` | ${cell(typeOf(p))} | ${w} | ${cell(descOf(p))} |`);
  }
  out.push('');
}
out.push('<!-- END:C12-SPEC -->');
const block = out.join('\n');

let brd = fs.readFileSync(brdPath, 'utf8');
const re = /<!-- BEGIN:C12-SPEC -->[\s\S]*<!-- END:C12-SPEC -->/;
if (re.test(brd)) brd = brd.replace(re, block);
else brd = brd.trimEnd() + '\n\n---\n\n## 12. Lampiran · Kamus endpoint & field spec C12\n\n' + block + '\n';
fs.writeFileSync(brdPath, brd, 'utf8');
console.log('BRD synced:', brdPath);
