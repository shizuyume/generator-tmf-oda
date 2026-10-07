#!/usr/bin/env node
/**
 * FE (neudela spec + runtime) ⇄ BE (NestJS hasil generate) contract probe.
 *
 *   node tools/neudela-be-probe.mjs <spec.yaml> <beBaseUrl> [--json]
 *
 * Mengirim persis request yang akan dikirim frontend neudela hasil generate — list, setiap
 * sortOption, setiap filterField (filter= JSONPath), search, create (buildPayload dengan semua
 * field form terisi), baca ulang (round trip valuesFromRecord), edit (buildPatch: ubah, kosongkan,
 * list kosong), delete, nested, hub — ke backend yang sedang jalan, lalu mencatat setiap selisih.
 * Runtime FE diambil dari design-lab/neudela-lab/src (disalin ke folder temp dengan import .ts),
 * jadi probe ini selalu memakai kode FE yang sama dengan app hasil generate.
 * Hasil analisa: docs/neudela-be-gap.md.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const LAB_SRC = path.resolve(here, '..', '..', 'design-lab', 'neudela-lab', 'src');
const RT = fs.mkdtempSync(path.join(os.tmpdir(), 'neudela-be-probe-'));
// the FE runtime, runnable by node (type stripping) once its relative imports carry .ts
for (const [from, to] of [['resource/payload.ts', 'payload.ts'], ['resource/expr.ts', 'expr.ts'], ['components/list-table/format.ts', 'format.ts'], ['components/list-table/filters.ts', 'filters.ts']]) {
  const text = fs.readFileSync(path.join(LAB_SRC, from), 'utf8')
    .replace("from './expr';", "from './expr.ts';")
    .replace("from '../components/list-table/format';", "from './format.ts';")
    .replace("from './format';", "from './format.ts';");
  fs.writeFileSync(path.join(RT, to), text);
}
const rt = (f) => url.pathToFileURL(path.join(RT, f)).href;
const { buildPatch, buildPayload, guardError, valuesFromRecord } = await import(rt('payload.ts'));
const { toJsonPathFilters, toSortParam } = await import(rt('filters.ts'));

const require = createRequire(path.join(here, '..', 'package.json'));
const yaml = require('js-yaml');
const [specFile, BE] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!specFile || !BE) {
  console.error('usage: node tools/neudela-be-probe.mjs <spec.yaml> <beBaseUrl> [--json]');
  process.exit(2);
}
const spec = yaml.load(fs.readFileSync(specFile, 'utf8'));
const app = spec.app;
const API = `${BE}${app.api.basePath}`;
const rows = [];
const note = (area, check, ok, detail = '') => rows.push({ area, check, ok, detail: String(detail).slice(0, 400) });

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

// ── synthetic form values, like a user filling every field ──
function synthScalar(f) {
  switch (f.kind) {
    case 'boolean': return true;
    case 'date': return '2026-09-15T00:00:00.000Z';
    case 'enum': return f.options[0].value;
    case 'number': return f.integer ? '2' : '1.5';
    case 'json': return f.jsonType === 'array' ? '["probe"]' : '{"probe": true}';
    case 'url': return 'https://example.test/hook';
    case 'textarea': return 'Probe description';
    case 'ref': return { id: `probe-${f.name}-1`, name: `Probe ${f.name}` };
    default: return f.manualId ? 'EXT-PROBE-1' : `Probe ${f.name}`;
  }
}
function synthItem(fields) {
  return Object.fromEntries(fields.map((f) => {
    if (f.kind === 'list') return [f.name, [synthItem(f.item.fields)]];
    if (f.kind === 'value') return [f.name, `Probe ${f.name}`];
    return [f.name, synthScalar(f)];
  }));
}
function synthValues(fields) {
  return Object.fromEntries(fields.map((f) => {
    if (f.kind === 'repeatable') return [f.name, [synthItem(f.item.fields)]];
    if (f.kind === 'group') return [f.name, synthItem(f.fields)];
    return [f.name, synthScalar(f)];
  }));
}
function emptyValues(fields) {
  const emptyItem = (fs2) => Object.fromEntries(fs2.map((f) => [f.name, f.kind === 'ref' ? { id: '', name: '' } : f.kind === 'list' ? [] : f.kind === 'boolean' ? false : '']));
  return Object.fromEntries(fields.map((f) => {
    if (f.kind === 'repeatable') return [f.name, []];
    if (f.kind === 'group') return [f.name, emptyItem(f.fields)];
    if (f.kind === 'ref') return [f.name, { id: '', name: '' }];
    return [f.name, f.kind === 'boolean' ? false : ''];
  }));
}

// stable comparison: dates by instant, key order ignored
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return v;
};
function diffKeys(a, b, prefix = '') {
  const out = [];
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = a?.[k];
    const y = b?.[k];
    if (JSON.stringify(norm(x)) === JSON.stringify(norm(y))) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) out.push(...diffKeys(x, y, `${prefix}${k}.`));
    else out.push(`${prefix}${k}: sent ${JSON.stringify(x)?.slice(0, 80)} → back ${JSON.stringify(y)?.slice(0, 80)}`);
  }
  return out;
}
const at = (o, p) => p.split('.').reduce((c, k) => (c && typeof c === 'object' ? c[k] : undefined), o);
const exprPath = (e) => e?.path ?? e?.count ?? e?.dateTime ?? e?.relativeTime ?? null;

async function probeResource(area, path, config, svcName, parentNote = '') {
  const { list, form, detail } = config;
  const url = `${API}${path}`;
  const l = await call('GET', `${url}?offset=0&limit=10`);
  note(area, `GET list${parentNote}`, l.status === 200 && l.headers.get('x-total-count') !== null, `status ${l.status}, X-Total-Count=${l.headers.get('x-total-count')}`);
  for (const s of list.sortOptions) {
    for (const dir of ['asc', 'desc']) {
      const r = await call('GET', `${url}?limit=5&sort=${encodeURIComponent(toSortParam(s.key, dir))}`);
      if (r.status !== 200) note(area, `sort ${toSortParam(s.key, dir)}`, false, `${r.status} ${r.json?.message ?? ''}`);
    }
  }
  note(area, `sort (${list.sortOptions.length} options × 2)`, true);
  const conds = [
    ...list.filterFields.map((f) => (f.type === 'date' ? { field: f.key, type: 'date', from: '2026-01-01', to: '2026-12-31' } : { field: f.key, type: 'text', value: 'a' })),
  ];
  for (const c of conds) {
    const filters = toJsonPathFilters([c], list.filterFields);
    const qs = filters.map((f) => `filter=${encodeURIComponent(f)}`).join('&');
    const r = await call('GET', `${url}?limit=5&${qs}`);
    note(area, `filter field "${c.field}"`, r.status === 200, r.status === 200 ? filters.join(' ') : `${r.status} ${r.json?.message ?? ''} — ${filters.join(' ')}`);
  }
  const search = toJsonPathFilters([{ field: list.card.searchParam, type: 'text', value: 'a' }], list.filterFields);
  const sr = await call('GET', `${url}?limit=5&${search.map((f) => `filter=${encodeURIComponent(f)}`).join('&')}`);
  note(area, `search box (${list.card.searchParam})`, sr.status === 200, `${sr.status} ${sr.json?.message ?? ''}`);

  if (!form) {
    note(area, 'create', true, 'no create operation (read-only page)');
    return l.json?.[0]?.id ?? null;
  }
  const values = { ...emptyValues(form.fields), ...synthValues(form.fields) };
  const guard = guardError(form, values);
  if (guard) note(area, 'FE guard passes with every field filled', false, guard);
  const body = buildPayload(form, values);
  const c = await call('POST', url, body);
  note(area, 'POST create (every form field filled)', c.status === 201, c.status === 201 ? `id ${c.json?.id}` : `${c.status} ${c.json?.message ?? JSON.stringify(c.json)}`);
  if (c.status !== 201) {
    // retry with required-only fields, to separate "BE rejects an optional control" from "create broken"
    const minimal = buildPayload(form, { ...emptyValues(form.fields), ...Object.fromEntries(Object.entries(synthValues(form.fields)).filter(([k]) => form.guard.some((g) => g.required === k || g.anyItem === k) || form.fields.find((f) => f.name === k)?.required)) });
    const c2 = await call('POST', url, minimal);
    note(area, 'POST create (required fields only)', c2.status === 201, c2.status === 201 ? `id ${c2.json?.id}` : `${c2.status} ${c2.json?.message ?? JSON.stringify(c2.json)}`);
    if (c2.status !== 201) return null;
    c.json = c2.json;
  }
  const id = c.json.id;
  const g = await call('GET', `${url}/${id}`);
  note(area, 'GET created record', g.status === 200, g.status);
  const record = g.json ?? {};
  // round trip: what the edit form would hold → the payload it would rebuild
  const reread = buildPayload(form, { ...emptyValues(form.fields), ...valuesFromRecord(form, record) });
  const lost = diffKeys(body, reread).filter((d) => !d.startsWith('@type'));
  note(area, 'round trip: sent payload == payload rebuilt from GET', lost.length === 0, lost.slice(0, 8).join(' | '));
  // what list / detail would show empty
  const shown = Object.entries(list.rowFrom).filter(([, e]) => exprPath(e)).map(([k, e]) => [k, exprPath(e)]);
  const empty = shown.filter(([, p]) => { const v = at(record, p); return v === undefined || v === null || v === ''; }).map(([k, p]) => `${k}←${p}`);
  note(area, 'list columns have a value for the created record', empty.length === 0, empty.join(', '));
  if (detail) {
    const kvPaths = [...detail.overview.main, ...detail.overview.aside].filter((b) => b.block === 'key-value' || b.block === 'timeline').flatMap((b) => b.items.map((i) => i.path));
    const emptyKv = kvPaths.filter((p) => { const v = at(record, p); return v === undefined || v === null || v === ''; });
    note(area, 'record page fields present', emptyKv.length === 0, emptyKv.join(', '));
  }
  // edit
  if (form.edit) {
    const initial = { ...emptyValues(form.fields), ...valuesFromRecord(form, record) };
    const editable = form.fields.find((f) => form.edit.fields.includes(f.name) && ['text', 'textarea'].includes(f.kind));
    if (editable) {
      const changed = { ...initial, [editable.name]: `${initial[editable.name]} edited` };
      const patch = buildPatch(form, initial, changed);
      const p = await call('PATCH', `${url}/${id}`, patch);
      const after = await call('GET', `${url}/${id}`);
      const key = Object.keys(patch)[0];
      note(area, `PATCH ${JSON.stringify(patch).slice(0, 80)}`, p.status === 200 && JSON.stringify(after.json?.[key]) === JSON.stringify(patch[key]), `${p.status} ${p.json?.message ?? ''} → ${JSON.stringify(after.json?.[key])?.slice(0, 80)}`);
      // clearing an optional attribute: null
      const optional = form.fields.find((f) => form.edit.fields.includes(f.name) && ['text', 'textarea'].includes(f.kind) && !f.required && f.name !== editable.name);
      if (optional) {
        const cleared = buildPatch(form, initial, { ...initial, [optional.name]: '' });
        const pc = await call('PATCH', `${url}/${id}`, cleared);
        const afterC = await call('GET', `${url}/${id}`);
        const ckey = Object.keys(cleared)[0];
        note(area, `PATCH clear ${ckey} (null)`, pc.status === 200 && (afterC.json?.[ckey] === undefined || afterC.json?.[ckey] === null), `${pc.status} ${pc.json?.message ?? ''} → ${JSON.stringify(afterC.json?.[ckey])}`);
      }
      // replacing a list: drop its only item
      const listField = form.fields.find((f) => f.kind === 'repeatable' && form.edit.fields.includes(f.name) && !(f.minItems));
      if (listField) {
        const dropped = buildPatch(form, initial, { ...initial, [listField.name]: [] });
        const pl = await call('PATCH', `${url}/${id}`, dropped);
        const afterL = await call('GET', `${url}/${id}`);
        const lkey = Object.keys(dropped)[0];
        note(area, `PATCH empty list ${lkey} ([])`, pl.status === 200 && (afterL.json?.[lkey] ?? []).length === 0, `${pl.status} ${pl.json?.message ?? ''} → ${JSON.stringify(afterL.json?.[lkey])?.slice(0, 80)}`);
      }
    }
  }
  return id;
}

for (const [key, page] of Object.entries(app.pages)) {
  if (page.kind !== 'resource') continue;
  const svc = app.services.find((s) => s.name === page.service);
  const area = key;
  let id = null;
  try {
    id = await probeResource(area, svc.path, page.config, svc.name);
  } catch (e) {
    note(area, 'probe crashed', false, e.message);
  }
  for (const n of page.config.detail?.nested ?? []) {
    const nsvc = app.services.find((s) => s.name === n.service);
    if (!id) { note(`${area} › ${n.tab}`, 'nested: needs a parent record', false, 'no parent id (empty list, no create)'); continue; }
    try {
      await probeResource(`${area} › ${n.tab}`, nsvc.path.replace(/\{[^}]+\}/, id), n, nsvc.name, ` under ${id}`);
    } catch (e) {
      note(`${area} › ${n.tab}`, 'probe crashed', false, e.message);
    }
  }
  if (id && page.config.list.delete) {
    const d = await call('DELETE', `${API}${svc.path}/${id}`);
    note(area, 'DELETE', d.status === 204 || d.status === 202, d.status);
  }
}

fs.rmSync(RT, { recursive: true, force: true });
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows));
} else {
  const byArea = new Map();
  for (const r of rows) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  for (const [area, xs] of byArea) {
    const gaps = xs.filter((x) => !x.ok);
    console.log(`${gaps.length ? 'GAP ' : 'OK  '} ${area}  ${xs.length - gaps.length}/${xs.length}`);
    for (const g of gaps) console.log(`       - ${g.check}: ${g.detail}`);
  }
  const bad = rows.filter((x) => !x.ok).length;
  console.log(`
${rows.length - bad}/${rows.length} checks ok, ${bad} gap(s)`);
}
