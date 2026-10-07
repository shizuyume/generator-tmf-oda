// validate.mjs — neudela-fe/v1 spec validator: ajv (src/schema/neudela-fe.schema.json) plus the
// design rules ajv cannot express (cross references, LOV-only relations, lucide icon names).
// API: validateSpec(spec) → { ok, errors: [{ path, message }] }
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'schema', 'neudela-fe.schema.json'), 'utf8'));
const ICONS = new Set(JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'schema', 'lucide-icons.json'), 'utf8')));

let validateSchema;

function walk(value, pointer, visit) {
  visit(value, pointer);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${pointer}[${i}]`, visit));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, `${pointer}.${k}`, visit);
  }
}

/** Relations are picked from a LOV: a typed field must never be an id / UUID / href. */
const RAW_REF_FIELD = /^(id|uuid|href)$|(Id|ID|Uuid|UUID|Href)$/;
/** The resource's own identity: never typed, even with manualId. */
const OWN_ID = /^(id|uuid|href)$/;
const typedIdError = (f) => (OWN_ID.test(f.name)
  ? `"${f.name}" is set by the backend and never typed`
  : RAW_REF_FIELD.test(f.name) && !f.manualId
    ? `"${f.name}" is typed by the user — ids, UUIDs and hrefs come from a LOV or the backend (an id with no lookup needs manualId: true, granted by the field policy)`
    : null);

export function validateSpec(spec) {
  validateSchema ??= new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);
  const errors = [];
  const err = (p, message) => errors.push({ path: p, message });

  if (!validateSchema(spec)) {
    for (const e of validateSchema.errors) {
      err(e.instancePath.replace(/\//g, '.').replace(/^\./, '') || '(root)', `${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(' | ')})` : ''}`);
    }
    return { ok: false, errors };
  }

  const { app } = spec;
  const services = new Set(app.services.map((s) => s.name));
  const lookupKeys = new Set(Object.keys(app.lookups.items));
  const pages = app.pages;

  // icons: every `icon` the app names is a real lucide-react export
  walk(app, 'app', (v, p) => {
    if (p.endsWith('.icon') && typeof v === 'string' && !ICONS.has(v)) err(p, `icon "${v}" is not a lucide-react icon`);
  });

  // navigation → pages
  for (const [i, n] of app.navigation.entries()) {
    if (!pages[n.page]) err(`app.navigation[${i}].page`, `unknown page "${n.page}"`);
  }
  const overviews = Object.entries(pages).filter(([, p]) => p.kind === 'overview');
  if (overviews.length !== 1) err('app.pages', 'exactly one page of kind overview (the home page) is required');
  for (const [key, p] of overviews) {
    if (!services.has(p.summary.countService)) err(`app.pages.${key}.summary.countService`, `unknown service "${p.summary.countService}"`);
  }

  // lookups → apis
  for (const [k, it] of Object.entries(app.lookups.items)) {
    if (!app.lookups.apis[it.api]) err(`app.lookups.items.${k}.api`, `unknown lookup api "${it.api}"`);
  }

  for (const [key, page] of Object.entries(pages)) {
    if (page.kind !== 'resource') continue;
    const base = `app.pages.${key}`;
    const { list, form, detail } = page.config;
    if (!services.has(page.service)) err(`${base}.service`, `unknown service "${page.service}"`);

    // list
    const columnKeys = new Set(list.columns.map((c) => c.key));
    const flexible = list.columns.filter((c) => c.width === undefined);
    if (flexible.length !== 1) err(`${base}.config.list.columns`, `exactly one column without a width (the flexible text column), found ${flexible.length}`);
    for (const [i, c] of list.columns.entries()) {
      if (c.render === 'count-badge' && !c.badge) err(`${base}.config.list.columns[${i}]`, 'count-badge needs badge { icon, one, many }');
    }
    if (list.mobileCard.badge && !columnKeys.has(list.mobileCard.badge)) err(`${base}.config.list.mobileCard.badge`, `unknown column "${list.mobileCard.badge}"`);
    if (list.card.rowClick === 'open-detail' && !detail) err(`${base}.config.list.card.rowClick`, 'open-detail needs a detail config');
    for (const [i, a] of list.rowActions.entries()) {
      if (a.action === 'open-detail' && !detail) err(`${base}.config.list.rowActions[${i}]`, 'open-detail needs a detail config');
      if (a.action === 'open-edit' && !form?.edit) err(`${base}.config.list.rowActions[${i}]`, 'open-edit needs form.edit');
    }
    // edit: a subset of the create form, PATCHing attributes the form writes (never @type)
    if (form?.edit) {
      const ep = `${base}.config.form.edit`;
      const svc = app.services.find((s) => s.name === page.service);
      if (svc && !svc.update) err(ep, `service "${svc.name}" has no update type: the API has no PATCH for this resource`);
      const names = new Set(form.fields.map((f) => f.name));
      for (const f of form.edit.fields) if (!names.has(f)) err(`${ep}.fields`, `"${f}" is not a field of the form`);
      for (const k of form.edit.payload) {
        if (!(k in form.payload)) err(`${ep}.payload`, `"${k}" is not an attribute of form.payload`);
        if (k === '@type') err(`${ep}.payload`, '@type is immutable: a PATCH never sends it');
      }
    }

    // form: relations only from a LOV; no typed id / uuid / href
    const refNames = new Set();
    if (list.rowActions.some((a) => a.action === 'confirm-delete') && !list.delete) err(`${base}.config.list.rowActions`, 'a confirm-delete action needs list.delete');
    if (list.card.primaryAction && !form) err(`${base}.config.list.card.primaryAction`, 'the create button needs a form');
    const SCALAR = new Set(['text', 'url', 'textarea', 'boolean', 'date', 'enum', 'number', 'json']);
    // one field anywhere in the form: relations from a LOV, enum options, JSON shape, no typed ids
    const checkField = (f, fp, where) => {
      if (f.kind === 'enum' && !(f.options?.length)) err(`${fp}.options`, 'an enum field needs its options (the OAS enum values)');
      if (f.kind === 'enum' && new Set(f.options.map((o) => o.value)).size !== f.options.length) err(`${fp}.options`, 'duplicate enum values');
      if (f.kind === 'json' && !['object', 'array'].includes(f.jsonType)) err(`${fp}.jsonType`, 'a JSON field parses to an object or an array');
      if (f.manualId && !['text', 'url', 'value'].includes(f.kind)) err(`${fp}.manualId`, 'manualId only applies to a text field');
      if (f.kind === 'ref') {
        refNames.add(f.name);
        if (!page.lookups) err(`${fp}.lookup`, 'the page uses lookups: set lookups: true');
        if (!lookupKeys.has(f.lookup)) err(`${fp}.lookup`, `unknown lookup "${f.lookup}"`);
      } else if (!['repeatable', 'group', 'list'].includes(f.kind) && typedIdError(f)) {
        err(`${fp}.name`, typedIdError(f));
      }
      if (where === 'group' && !SCALAR.has(f.kind)) err(`${fp}.kind`, `a group holds one-value controls, not "${f.kind}"`);
      if (where === 'list' && f.kind === 'list') err(`${fp}.kind`, 'lists nest one level only');
    };
    for (const [i, f] of (form?.fields ?? []).entries()) {
      const fp = `${base}.config.form.fields[${i}]`;
      checkField(f, fp, 'top');
      if (f.kind === 'group') f.fields.forEach((g, j) => checkField(g, `${fp}.fields[${j}]`, 'group'));
      if (f.kind !== 'repeatable') continue;
      for (const [j, it] of f.item.fields.entries()) {
        const ip = `${fp}.item.fields[${j}]`;
        checkField(it, ip, 'item');
        if (it.kind === 'list') it.item.fields.forEach((x, k) => checkField(x, `${ip}.item.fields[${k}]`, 'list'));
      }
    }
    walk(form?.payload ?? {}, `${base}.config.form.payload`, (v, p) => {
      if (v && typeof v === 'object' && 'lovRef' in v && !refNames.has(v.lovRef)) err(p, `lovRef "${v.lovRef}" is not a ref field of the form`);
    });
    walk(form?.payload ?? {}, `${base}.config.form.payload`, (_v, p) => {
      if (/\.href$/.test(p)) err(p, 'href is set by the backend, never sent');
    });

    // detail: tab references
    if (detail) {
      const tabs = new Set(detail.tabs.map((t) => t.key));
      // nested resources: a bound (nested) service, a tab, and lookups for their relation pickers
      for (const [i, n] of (detail.nested ?? []).entries()) {
        const np = `${base}.config.detail.nested[${i}]`;
        const svc = app.services.find((s) => s.name === n.service);
        if (!svc) err(`${np}.service`, `unknown service "${n.service}"`);
        else if (!svc.nested || !svc.path.includes('{')) err(`${np}.service`, `"${n.service}" is not a nested service (path with the parent id)`);
        if (!tabs.has(n.tab)) err(`${np}.tab`, `unknown tab "${n.tab}"`);
        if (detail.collections.some((c) => c.tab === n.tab)) err(`${np}.tab`, `tab "${n.tab}" also shows an embedded collection`);
        const refs = JSON.stringify(n.form?.fields ?? []).match(/"lookup":"([^"]+)"/g) ?? [];
        for (const r of refs) {
          const key = r.slice(10, -1);
          if (!lookupKeys.has(key)) err(`${np}.form`, `unknown lookup "${key}"`);
        }
        if (refs.length && !n.lookups) err(`${np}.lookups`, 'the nested form uses lookups: set lookups: true');
        if (n.list.rowActions.some((a) => a.action === 'open-detail') && !n.detail) err(`${np}.list.rowActions`, 'open-detail needs a detail config');
      }
      for (const [i, c] of detail.collections.entries()) {
        if (!tabs.has(c.tab)) err(`${base}.config.detail.collections[${i}].tab`, `unknown tab "${c.tab}"`);
      }
      walk(detail.overview, `${base}.config.detail.overview`, (v, p) => {
        if ((p.endsWith('.goTo')) && typeof v === 'string' && !tabs.has(v)) err(p, `unknown tab "${v}"`);
      });
    }
  }

  // mock resources ↔ services, mock lookups ↔ lookups
  const servicePaths = new Set(app.services.map((s) => s.path));
  for (const [i, r] of app.mock.resources.entries()) {
    if (!servicePaths.has(r.path)) err(`app.mock.resources[${i}].path`, `no service with path ${r.path}`);
  }
  for (const k of Object.keys(app.mock.lookups)) {
    if (!lookupKeys.has(k)) err(`app.mock.lookups.${k}`, `unknown lookup "${k}"`);
  }

  return { ok: errors.length === 0, errors };
}

export function formatValidation(name, result) {
  if (result.ok) return `${name}: OK`;
  return [`${name}: ${result.errors.length} error(s)`, ...result.errors.map((e) => `  - ${e.path}: ${e.message}`)].join('\n');
}
