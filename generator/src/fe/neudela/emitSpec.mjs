// emitSpec.mjs — `tmfgen fe-spec --ui neudela`: TMF IR → neudela-fe/v1 spec (the `app` block).
//
// Derives every page from the IR with the patterns the neudela template already has (list card,
// LOV-only relations, create + edit dialog, record page with one tab per embedded list, event hub,
// Overview). Form controls: text / textarea, checkbox, date, enum, number, JSON, a LOV picker per
// relation (lists and single refs), a group per small value object (TimePeriod, Money…), and one
// level of nested list inside a list item. Anything else (deeper lists, large single objects) is
// NOT given an invented input: it is left out of the form and reported as a warning; lists and
// record pages still show it as text. Domain copy that needs a human
// (hero text, special overview blocks, seed data) comes from an overrides file, deep-merged on
// top: objects merge key by key, arrays and scalars replace, `null` deletes.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { yamlLiteral } from './yamlLiteral.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY = yaml.load(fs.readFileSync(path.join(here, '..', '..', '..', 'libs', 'neudela', 'ref-registry.yaml'), 'utf8'));
export const DEFAULT_FIELD_POLICY = path.join(here, '..', '..', '..', 'libs', 'neudela', 'field-policy.yaml');
/** The field policy of the current emitNeudelaSpec() call (libs/neudela/field-policy.yaml or --field-policy). */
let POLICY = null;

// ── naming ──
const words = (s) => s.replace(/^@/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean).map((w) => w.toLowerCase());
const lowerWords = (s) => words(s).join(' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s) => s.split(' ').map(cap).join(' ');
const pluralWord = (w) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
const pluralPhrase = (p) => { const ws = p.split(' '); ws[ws.length - 1] = pluralWord(ws[ws.length - 1]); return ws.join(' '); };
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const kebab = (s) => words(s).join('-');
const refKey = (cls) => lowerFirst(cls.replace(/Ref$/, ''));
const lastWord = (s) => words(s).slice(-1)[0];
const HUMAN_EVENT = { AttributeValueChange: 'Attribute value change', Create: 'Create', Delete: 'Delete', StateChange: 'State change' };
const GENERIC_DESC = /^Base entity schema/i;

const STRING = (f) => f.kind === 'scalar' && f.tsType === 'string' && !f.enumValues;
/** Same rule as the validator: a typed field is never an id / UUID / href. */
const RAW_ID = /^(id|uuid|href)$|(Id|ID|Uuid|UUID|Href)$/;
const OWN_ID = /^(id|uuid|href)$/;

/**
 * May the user type this id-looking string attribute? Only an identifier with no *Ref schema
 * (no LOV possible), and only as the field policy says: allow / deny per "Owner.attribute",
 * else the default (required → when the OAS requires it, all, none). Never the own id / href.
 */
function typedId(owner, f, required) {
  if (!STRING(f) || OWN_ID.test(f.name)) return false;
  const key = `${owner}.${f.name}`;
  const ext = POLICY?.externalIds ?? {};
  if ((ext.deny ?? []).includes(key)) return false;
  if ((ext.allow ?? []).includes(key)) return true;
  if (ext.default === 'all') return true;
  if (ext.default === 'none') return false;
  return required;
}

/** A string attribute the form may show as a text input (ids only through the field policy). */
const EDITABLE = (f, owner, required) => STRING(f) && (!RAW_ID.test(f.name) || typedId(owner, f, required));
const DATE = (f) => f.kind === 'scalar' && f.tsType === 'Date';
const BOOL = (f) => f.kind === 'scalar' && f.tsType === 'boolean';
const ENUM = (f) => f.kind === 'scalar' && Array.isArray(f.enumValues) && f.enumValues.length > 0;
/** Attributes the template has a form control for: text/textarea, date picker, checkbox, enum dropdown, number, JSON. */
const NUMBER = (f) => f.kind === 'scalar' && f.tsType === 'number';
/** A free-form object / array attribute (no scalar props in the OAS): JSON text in the form. */
const JSONF = (f) => f.kind === 'json';
const FORMABLE = (f, owner, required) => (RAW_ID.test(f.name) ? EDITABLE(f, owner, required) : STRING(f) || DATE(f) || BOOL(f) || ENUM(f) || NUMBER(f) || JSONF(f));
/** "Source system id" → "Source system ID" */
const labelOf = (name) => cap(lowerWords(name).replace(/\b(id|url|uri|uuid)\b/g, (w) => w.toUpperCase()));
const enumLabel = (v) => cap(lowerWords(String(v)));
/** "a policy", "an alarm type" */
const an = (phrase) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
// dialog layout: short fields first (they pair up in two columns), then checkboxes, then text areas;
// repeatable lists stay last. The payload keeps the OAS order.
const FIELD_RANK = { text: 0, url: 0, enum: 0, date: 0, number: 0, ref: 0, boolean: 1, textarea: 2, json: 2, group: 2, repeatable: 3 };
const REF_COLS = (fr) => fr.columns.map((c) => c.sourceProp);

/** Stable UUID-shaped id (same as the template's mock). */
function seedId(kind, index) {
  const h = crypto.createHash('sha1').update(`${kind}-${index}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deep merge: objects key by key, arrays/scalars replace, null deletes. */
export function mergeOverrides(base, over) {
  if (over === undefined) return base;
  if (over === null) return undefined;
  if (Array.isArray(over) || typeof over !== 'object' || base === null || typeof base !== 'object' || Array.isArray(base)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const m = mergeOverrides(base[k], v);
    if (m === undefined) delete out[k];
    else out[k] = m;
  }
  return out;
}

/** The overrides that turn `base` into `target` (inverse of mergeOverrides). */
export function diffOverrides(base, target) {
  if (JSON.stringify(base) === JSON.stringify(target)) return undefined;
  if (Array.isArray(target) || typeof target !== 'object' || target === null || typeof base !== 'object' || base === null || Array.isArray(base)) return target;
  const out = {};
  for (const k of Object.keys(base)) if (!(k in target)) out[k] = null;
  for (const [k, v] of Object.entries(target)) {
    const d = diffOverrides(base[k], v);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

// ── resource model ──

function resourceModel(ir, r, warnings) {
  const label = lowerWords(r.name);
  const plural = pluralPhrase(label);
  const scalars = r.fields.filter((f) => f.kind === 'scalar');
  const has = (n) => scalars.some((f) => f.name === n);
  const subs = r.subResources ?? [];
  const createProps = new Set(r.createShape?.properties ?? []);
  const required = new Set(r.createShape?.required ?? []);
  for (const f of r.fields) {
    if (f.kind === 'scalar' && createProps.has(f.name) && RAW_ID.test(f.name)) {
      if (typedId(r.name, f, required.has(f.name))) {
        warnings.push(`${r.name}.${f.name}: an id without a *Ref schema (no LOV possible) — typed by hand, per the field policy`);
      } else {
        warnings.push(`${r.name}.${f.name}: an id without a *Ref schema — no LOV can back it, and the field policy keeps it out of the create form${required.has(f.name) ? ' (REQUIRED by the OAS: allow it in the field policy or creating will fail)' : ''}`);
      }
    } else if (!FORMABLE(f, r.name, required.has(f.name)) && createProps.has(f.name)) {
      warnings.push(`${r.name}.${f.name}: ${f.enumValues ? 'enum' : f.tsType ?? f.kind} field has no form control in the neudela template yet — left out of the create form${required.has(f.name) ? ' (REQUIRED by the OAS: creating will fail until it is designed)' : ''}`);
    }
  }
  for (const fr of r.flattenedRefs ?? []) {
    if (createProps.has(fr.name) && !REF_TARGET(fr.targetRef) && !valueObjectColumns(fr)) {
      warnings.push(`${r.name}.${fr.name}: single ${fr.targetRef} is not a reference nor a small value object — no form control yet, left out of the create form`);
    }
  }
  return { r, label, plural, scalars, has, subs, required, createProps };
}

function refTarget(fr) {
  return fr.targetRef;
}

function entryRefs(sub) {
  return (sub.flattenedRefs ?? []).filter((fr) => /Ref$|RefOrValue$/.test(fr.targetRef));
}

const entryScalars = (sub) => sub.fields.filter((f) => EDITABLE(f, sub.className, (sub.requiredFields ?? []).includes(f.name)));

// ── page configs ──

function listConfig(ir, m, opts) {
  const { r, label, plural } = m;
  const Title = titleCase(label);
  const Plural = titleCase(plural);
  const columns = [{ key: 'id', label: 'ID', width: 170, sortable: true, render: 'id-link' }];
  const rowFrom = { id: { path: 'id' } };
  if (m.has('name')) {
    columns.push({ key: 'name', label: 'Name', width: 200, sortable: true, render: 'primary' });
    rowFrom.name = { path: 'name' };
  }
  const flexible = m.has('description') ? 'description' : m.scalars.find((f) => STRING(f) && f.name !== 'name')?.name;
  if (flexible) {
    columns.push({ key: flexible, label: cap(lowerWords(flexible)), sortable: true, render: 'ellipsis' });
    rowFrom[flexible] = { path: flexible };
  }
  const badgeSub = m.subs.find((s) => s.refLike) ?? m.subs[0];
  let badgeKey;
  if (badgeSub) {
    badgeKey = `${badgeSub.propertyName}Count`;
    const noun = lowerWords(badgeSub.propertyName);
    columns.push({ key: badgeKey, label: titleCase(pluralPhrase(noun)), width: 120, render: 'count-badge', badge: { icon: 'ScrollText', one: noun, many: pluralPhrase(noun) } });
    rowFrom[badgeKey] = { count: badgeSub.propertyName };
  }
  if (opts.timestamps) {
    columns.push({ key: 'lastUpdate', label: 'Last Update', width: 190, sortable: true, render: 'datetime-stack' });
    rowFrom.lastUpdate = { path: 'lastUpdate' };
  }
  // fixed table layout needs exactly one flexible column: the name, else the id
  if (!flexible) delete (columns.find((c) => c.key === 'name') ?? columns[0]).width;

  const sortOptions = columns.filter((c) => c.sortable && c.key !== 'id').map((c) => ({ key: c.key, label: c.label }));
  sortOptions.push({ key: 'id', label: 'ID' });
  const filterFields = [{ key: 'id', label: 'ID', type: 'text' }];
  for (const f of m.scalars.filter(STRING)) filterFields.push({ key: f.name, label: labelOf(f.name), type: 'text' });
  if (badgeSub?.refLike) filterFields.push({ key: badgeSub.propertyName, label: titleCase(pluralPhrase(lowerWords(badgeSub.propertyName))), type: 'text', list: badgeSub.propertyName, param: 'name', placeholder: `${cap(lowerWords(badgeSub.propertyName))} name` });
  for (const f of m.scalars.filter(DATE)) filterFields.push({ key: f.name, label: titleCase(lowerWords(f.name)), type: 'date' });
  if (opts.timestamps) filterFields.push({ key: 'lastUpdate', label: 'Last Update', type: 'date' });

  const nameKey = m.has('name') ? 'name' : 'id';
  return {
    breadcrumb: [ir.meta.specTitle],
    title: Plural,
    subtitle: `TMF${ir.meta.tmfNumber} ${ir.meta.specTitle}`,
    card: {
      title: Plural,
      description: GENERIC_DESC.test(r.description ?? '') || !r.description ? `${Plural} of the ${ir.meta.specTitle} API.` : r.description,
      noun: [label, plural],
      minTableWidth: columns.length >= 5 ? 1000 : 860,
      buttonActionVariant: 'menu',
      rowLabel: nameKey,
      searchPlaceholder: `Search ${plural} by ${nameKey === 'name' ? 'name' : 'ID'}`,
      searchParam: nameKey === 'name' ? 'name' : 'id',
      emptyTitle: `No ${plural} yet`,
      emptyBody: r.operations.create ? `Create the first one with “New ${Title}”.` : `${cap(plural)} appear here once the API returns them.`,
      ...(r.operations.create ? { primaryAction: { label: `New ${Title}`, icon: { icon: 'Plus', size: 16 } } } : {}),
      refresh: true,
      rowClick: 'open-detail',
    },
    rowFrom,
    columns,
    sortOptions,
    filterFields,
    rowActions: [
      { key: 'view', label: 'View details', ariaLabel: `View {${nameKey}}`, icon: { icon: 'Eye', size: 16 }, tone: 'brand', action: 'open-detail' },
      ...(editable(r) ? [{ key: 'edit', label: 'Edit', ariaLabel: `Edit {${nameKey}}`, icon: { icon: 'Pencil', size: 16 }, tone: 'neutral', action: 'open-edit' }] : []),
      ...(r.operations.delete ? [{ key: 'delete', label: 'Delete', ariaLabel: `Delete {${nameKey}}`, icon: { icon: 'Trash2', size: 16 }, tone: 'danger', action: 'confirm-delete' }] : []),
    ],
    mobileCard: {
      id: 'id',
      title: nameKey,
      ...(badgeKey ? { badge: badgeKey } : {}),
      ...(flexible ? { subtitle: { path: flexible } } : {}),
      ...(opts.timestamps ? { meta: { format: 'Updated {0}', args: [{ dateTime: 'lastUpdate', empty: '—' }] } } : {}),
    },
    ...(r.operations.delete ? {
      delete: {
        title: `Delete ${label}?`,
        strong: nameKey,
        text: 'will be permanently removed. This action cannot be undone.',
        confirmLabel: 'Delete',
        toast: 'Deleted successfully',
      },
    } : {}),
  };
}

/** PATCH is offered when the API has an update operation with an _MVO request schema. */
const editable = (r) => !!(r.operations.update && r.createShape && r.updateShape);

/** The form fields an edit shows: those read by the payload attributes a PATCH may carry. */
function editFields(form) {
  const reads = (node) => node.from ?? node.array ?? node.lovRef ?? node.object;
  const owned = new Set(form.edit.payload.map((k) => reads(form.payload[k] ?? {})));
  return form.fields.map((f) => f.name).filter((n) => owned.has(n));
}

/** The edit block: the create form's payload attributes that the _MVO allows. */
function editConfig(m, fields, payload) {
  const { r, label } = m;
  const mvo = new Set(r.updateShape.properties);
  const attrs = Object.keys(payload).filter((k) => k !== '@type' && mvo.has(k));
  const nameKey = m.has('name') ? 'name' : 'id';
  return {
    formId: `edit-${kebab(r.name)}-form`,
    title: `Edit {${nameKey}}`,
    description: `Fields follow ${r.updateShape.schemaName}. Only the attributes you change are sent; ids and links stay as they are.`,
    submitLabel: 'Save changes',
    fields: editFields({ fields, payload, edit: { payload: attrs } }),
    payload: attrs,
    toast: `${cap(label)} updated successfully`,
    noChanges: 'No changes to save.',
  };
}

/** OAS integer (the IR's column type), else any number. */
const INTEGER = (f) => /^(int|integer|bigint|smallint)$/.test(f.column?.type ?? '');
const jsonTypeOf = (f) => (/\[\]$/.test(f.tsType ?? '') ? 'array' : 'object');

/**
 * The control + payload node of one scalar attribute (top level, group or list item):
 * checkbox, date, enum, number, JSON or text. `label` and `placeholder` default from the name.
 * Returns { field, node, guard? } — guard only for required ones a dialog checks before sending.
 */
function scalarControl(f, { req, label = labelOf(f.name), owner, text = 'text', textareaHint }) {
  const opt = req ? {} : { omitEmpty: true };
  if (BOOL(f)) {
    // the OAS description under the checkbox at the top level only: in a list item's grid it crowds the row
    return { field: { kind: 'boolean', name: f.name, label, ...(f.description && owner ? { description: f.description } : {}) }, node: { from: f.name, ...opt } };
  }
  const select = req ? { required: { message: `Select ${an(lowerWords(f.name))}.` } } : {};
  if (DATE(f)) return { field: { kind: 'date', name: f.name, label, placeholder: 'Select a date', ...select }, node: { from: f.name, ...opt }, required: req };
  if (ENUM(f)) {
    return {
      field: { kind: 'enum', name: f.name, label, placeholder: `Select ${an(lowerWords(f.name))}`, options: f.enumValues.map((v) => ({ value: String(v), label: enumLabel(v) })), ...select },
      node: { from: f.name, ...opt },
      required: req,
    };
  }
  const enter = req ? { required: { message: `Enter ${an(lowerFirst(label))}.` } } : {};
  if (NUMBER(f)) {
    return { field: { kind: 'number', name: f.name, label, placeholder: INTEGER(f) ? 'e.g. 1' : 'e.g. 1.5', ...(INTEGER(f) ? { integer: true } : {}), ...enter }, node: { from: f.name, as: 'number', ...opt }, required: req };
  }
  if (JSONF(f)) {
    const jsonType = jsonTypeOf(f);
    return {
      field: { kind: 'json', name: f.name, label, placeholder: jsonType === 'array' ? '["…"]' : '{ "key": "value" }', jsonType, ...enter, helperText: `JSON ${jsonType === 'array' ? 'list' : 'object'}${f.description ? ` — ${f.description}` : ''}` },
      node: { from: f.name, as: 'json', ...opt },
      required: req,
    };
  }
  if (text === 'textarea' && (f.name === 'description' || f.column?.type === 'text')) {
    return { field: { kind: 'textarea', name: f.name, label, placeholder: textareaHint ?? label, autoResize: true, minRows: 2, maxRows: 6 }, node: { from: f.name, ...opt } };
  }
  const manual = RAW_ID.test(f.name) ? { helperText: (POLICY?.externalIds?.helperText ?? '').replace('{label}', label), manualId: true } : {};
  return { field: { kind: 'text', name: f.name, label, ariaLabel: label, placeholder: label, ...enter, ...manual }, node: { from: f.name, ...opt }, required: req && !!owner };
}

/** A single relation (top level or in an entry): *Ref / *RefOrValue → LOV over the Ref. */
const REF_TARGET = (t) => /Ref$|RefOrValue$/.test(t ?? '');
const refClassOf = (t) => t.replace(/OrValue$/, '');
const META = new Set(['@type', '@baseType', '@schemaLocation']);
/** Value attributes of a small value object (TimePeriod, Money, Quantity…), or null when it is not one. */
function valueObjectColumns(fr) {
  if (REF_TARGET(fr.targetRef)) return null;
  const cols = (fr.columns ?? []).filter((c) => !META.has(c.sourceProp) && c.sourceProp !== 'id' && c.sourceProp !== 'href');
  const plain = cols.every((c) => ['string', 'number', 'boolean', 'Date'].includes(c.tsType));
  return plain && cols.length >= 1 && cols.length <= 6 ? cols : null;
}

function refField(fr, req, lookups) {
  const cls = refClassOf(fr.targetRef);
  lookups.add(cls);
  return {
    field: { kind: 'ref', name: fr.name, lookup: refKey(cls), label: cap(lowerWords(fr.name)), placeholder: `Select ${an(lastWord(fr.name))}`, ...(req ? { required: { message: `Select ${an(lowerWords(fr.name))}.` } } : {}) },
    node: { lovRef: fr.name, type: cls, referredType: cls.replace(/Ref$/, '') },
  };
}

/** The item fields + payload item of one embedded entry (list element), one list level deep. */
function entryItem(s, lookups, warnings, owner, depth) {
  const noun = lowerWords(s.propertyName);
  const Noun = cap(noun);
  const req = new Set(s.requiredFields ?? []);
  const refs = entryRefs(s);
  const strings = entryScalars(s);
  const typed = s.fields.filter((f) => !STRING(f) && FORMABLE(f, s.className, req.has(f.name)));
  const fields = [];
  const item = { '@type': { const: s.className } };
  const keep = [];
  // payload item order: @type, scalars (OAS order), refs, lists — matches the OAS entry shape
  for (const f of s.fields) {
    if (strings.includes(f)) {
      keep.push(f.name);
      item[f.name] = { from: f.name, omitEmpty: true };
    } else if (typed.includes(f)) {
      const c = scalarControl(f, { req: false });
      keep.push(f.name);
      item[f.name] = c.node;
    }
  }
  for (const fr of refs) {
    const c = refField(fr, false, lookups);
    fields.push({ ...c.field, required: { message: `Select ${an(lowerWords(fr.name))}.` } });
    keep.push(`${fr.name}.id`);
    item[fr.name] = c.node;
  }
  // a lone text attribute is the entry's value (required); with several, only the OAS-required ones
  const mustFill = new Set((strings.length === 1 ? strings : strings.filter((f) => req.has(f.name))).map((f) => f.name));
  for (const sc of strings) {
    if (mustFill.has(sc.name)) {
      fields.push({ kind: 'value', name: sc.name, ...(sc.name === 'value' ? {} : { label: labelOf(sc.name) }), ariaLabel: `${Noun} {n} ${lowerFirst(labelOf(sc.name))}`, placeholder: labelOf(sc.name), required: { message: `Enter ${an(lowerFirst(labelOf(sc.name)))}.` }, ...(RAW_ID.test(sc.name) ? { manualId: true } : {}) });
    } else {
      fields.push(scalarControl(sc, { req: false }).field);
    }
  }
  for (const f of typed) fields.push(scalarControl(f, { req: false }).field);
  for (const c of s.children ?? []) {
    if (depth >= 2) {
      warnings.push(`${owner}.${s.propertyName}.${c.propertyName}: a list nested more than one level is not shown or edited yet`);
      continue;
    }
    const childNoun = lowerWords(c.propertyName);
    const listName = `${c.propertyName}Items`;
    let sub;
    if (c.refLike) {
      const cls = c.itemRef;
      lookups.add(cls);
      sub = {
        fields: [{ kind: 'ref', name: c.propertyName, lookup: refKey(cls), label: cap(childNoun), placeholder: `Select ${an(childNoun)}`, required: { message: `Select ${an(childNoun)}.` } }],
        node: { array: listName, keepWhen: [`${c.propertyName}.id`], omitEmpty: true, each: { lovRef: c.propertyName, type: cls, referredType: cls.replace(/Ref$/, '') } },
      };
    } else {
      const inner = entryItem(c, lookups, warnings, `${owner}.${s.propertyName}`, depth + 1);
      if (!inner) continue;
      sub = { fields: inner.fields, node: { array: listName, keepWhen: inner.keep, omitEmpty: true, item: inner.item } };
    }
    const flat = sub.fields.length;
    fields.push({
      kind: 'list',
      name: listName,
      title: titleCase(pluralPhrase(childNoun)),
      emptyText: `No ${pluralPhrase(childNoun)}.`,
      addLabel: `Add ${childNoun}`,
      item: { title: `${cap(childNoun)} {n}`, removeLabel: `Remove ${childNoun} {n}`, ...(flat >= 3 ? { grid: 3 } : flat === 2 ? { grid: 2 } : {}), fields: sub.fields },
    });
    keep.push(listName);
    item[c.propertyName] = sub.node;
  }
  if (!fields.length) return null;
  return { fields, item, keep };
}

function formConfig(ir, m, lookups, warnings) {
  const { r, label } = m;
  const fields = [];
  const payload = { '@type': { const: r.name } };
  const guard = [];
  const singles = new Map((r.flattenedRefs ?? []).map((fr) => [fr.name, fr]));
  // attributes in OAS order: scalars, JSON values, single refs and value objects
  for (const f of r.fields) {
    if (!m.createProps.has(f.name) || !FORMABLE(f, r.name, m.required.has(f.name))) continue;
    const req = m.required.has(f.name);
    const c = scalarControl(f, { req, owner: r.name, text: 'textarea', textareaHint: `What this ${label} is for` });
    fields.push(c.field);
    payload[f.name] = c.node;
    if (c.required) guard.push({ required: f.name, message: `${labelOf(f.name)} is required` });
  }
  for (const [name, fr] of singles) {
    if (!m.createProps.has(name)) continue;
    const req = m.required.has(name);
    if (REF_TARGET(fr.targetRef)) {
      const c = refField(fr, req, lookups);
      fields.push(c.field);
      payload[name] = c.node;
      if (req) guard.push({ required: `${name}.id`, message: `${cap(lowerWords(name))} is required` });
      continue;
    }
    const cols = valueObjectColumns(fr);
    if (!cols) continue; // reported by resourceModel
    const groupLabel = labelOf(name);
    const item = (fr.columns ?? []).some((c) => c.sourceProp === '@type') ? { '@type': { const: fr.targetRef } } : {};
    const sub = cols.map((c) => {
      const col = { kind: 'scalar', name: c.sourceProp, tsType: c.tsType, column: c.column };
      const sc = scalarControl(col, { req: false, label: labelOf(c.sourceProp) });
      item[c.sourceProp] = sc.node;
      return sc.field;
    });
    fields.push({ kind: 'group', name, label: groupLabel, hint: req ? 'Required' : 'Optional', fields: sub });
    payload[name] = { object: name, omitEmpty: true, item };
  }
  for (const s of m.subs.filter((x) => m.createProps.has(x.propertyName))) {
    const noun = lowerWords(s.propertyName);
    const Noun = cap(noun);
    const name = `${s.propertyName}Items`;
    if (s.refLike) {
      const key = refKey(s.itemRef);
      lookups.add(s.itemRef);
      const min = (s.minItems ?? 0) >= 1;
      fields.push({
        kind: 'repeatable',
        name,
        section: { title: titleCase(pluralPhrase(noun)), ...(min ? { required: true } : {}), hint: min ? `At least one, from the ${noun} catalogue` : 'Optional' },
        initialItems: min ? 1 : 0,
        ...(min ? { minItems: { path: `${s.propertyName}.id`, message: `Select at least one ${noun}.` } } : { emptyText: `No ${pluralPhrase(noun)}.` }),
        item: {
          title: `${Noun} {n}`,
          removeLabel: `Remove ${noun} {n}`,
          canRemove: min ? 'more-than-one' : 'always',
          fields: [{ kind: 'ref', name: s.propertyName, lookup: key, label: Noun, placeholder: `Select ${an(noun)}`, required: { message: `Select ${an(noun)}.` }, ...(min ? { groupRuleOnFirst: true } : {}) }],
        },
        addLabel: `Add ${noun}`,
      });
      payload[s.propertyName] = { array: name, keepWhen: [`${s.propertyName}.id`], ...(min ? {} : { omitEmpty: true }), each: { lovRef: s.propertyName, type: s.itemRef, referredType: s.itemRef.replace(/Ref$/, '') } };
      if (min) guard.push({ anyItem: name, path: `${s.propertyName}.id`, message: `At least one ${noun} with an ID is required` });
    } else {
      const entry = entryItem(s, lookups, warnings, r.name, 1);
      if (!entry) continue;
      const flat = entry.fields.filter((f) => f.kind !== 'list').length;
      fields.push({
        kind: 'repeatable',
        name,
        section: { title: titleCase(pluralPhrase(noun)), hint: 'Optional' },
        initialItems: 0,
        emptyText: `No ${pluralPhrase(noun)}.`,
        item: {
          title: `${Noun} {n}`,
          removeLabel: `Remove ${noun} {n}`,
          canRemove: 'always',
          ...(flat >= 3 ? { grid: 3 } : flat === 2 ? { grid: 2 } : {}),
          fields: entry.fields,
        },
        addLabel: `Add ${noun}`,
      });
      payload[s.propertyName] = { array: name, keepWhen: entry.keep, omitEmpty: true, item: entry.item };
    }
  }
  fields.sort((a, b) => FIELD_RANK[a.kind] - FIELD_RANK[b.kind]);
  return {
    formId: `create-${kebab(r.name)}-form`,
    width: m.subs.length || fields.some((f) => f.kind === 'group') ? 'wide' : 'narrow',
    title: `Create ${label}`,
    description: `Fields follow ${r.createShape?.schemaName ?? `${r.name}_FVO`}. References are picked from their catalogues; ids and links are set by the server.`,
    submitLabel: `Create ${label}`,
    validateOn: 'submit',
    fields,
    guard,
    payload,
    toast: `${cap(label)} created successfully`,
    ...(editable(r) ? { edit: editConfig(m, fields, payload) } : {}),
  };
}

function refCardFields(hasVersion) {
  return [
    { label: 'ID', value: { path: 'id' }, mono: true },
    ...(hasVersion ? [{ label: 'Version', value: { path: 'version' }, mono: true }] : []),
    { label: 'Type', value: { path: '@type' }, mono: true },
    { label: 'Base type', value: { path: '@baseType' }, mono: true },
    { label: 'Schema', value: { path: '@schemaLocation' }, mono: true },
    { label: 'Href', value: { path: 'href' }, mono: true },
  ];
}

function detailConfig(ir, m, opts) {
  const { r, label } = m;
  const Title = titleCase(label);
  const nameKey = m.has('name') ? 'name' : 'id';
  const tabs = [{ key: 'overview', label: 'Overview', icon: { icon: 'FileText', size: 15 } }];
  const collections = [];
  const stats = [];
  for (const s of m.subs) {
    const noun = lowerWords(s.propertyName);
    const nounPlural = pluralPhrase(noun);
    const icon = s.refLike ? 'ScrollText' : 'ListTree';
    tabs.push({ key: s.propertyName, label: titleCase(nounPlural), icon: { icon, size: 15 }, count: s.propertyName });
    stats.push({
      key: s.propertyName,
      label: cap(nounPlural),
      icon: { icon, size: 14 },
      value: { count: s.propertyName },
      hint: s.refLike
        ? { join: s.propertyName, pick: ['name', 'id'], sep: ', ', empty: 'None referenced' }
        : { ifAny: s.propertyName, then: 'Recorded', else: `No ${nounPlural}` },
      goTo: s.propertyName,
      ariaLabel: { format: `{0} — open the ${titleCase(nounPlural)} tab`, args: [{ plural: { count: s.propertyName }, one: noun, many: nounPlural }] },
    });
    if (s.refLike) {
      const hasVersion = s.fields.some((f) => f.name === 'version');
      collections.push({
        tab: s.propertyName,
        source: s.propertyName,
        title: titleCase(nounPlural),
        count: { one: noun, many: nounPlural },
        search: { label: `Search ${nounPlural}`, placeholder: `Search ${nounPlural}` },
        defaultView: 'card',
        card: { icon: { icon, size: 18 }, title: { pick: ['name', 'id'] }, subtitle: { pick: ['@referredType'], empty: s.itemRef.replace(/Ref$/, '') }, fields: refCardFields(hasVersion) },
        columns: [
          { key: 'name', label: 'Name', render: 'primary', value: { pick: ['name', 'id'] } },
          { key: 'id', label: 'ID', width: 200, render: 'mono-muted' },
          ...(hasVersion ? [{ key: 'version', label: 'Version', width: 110, render: 'mono-plain', empty: 'em-dash' }] : []),
        ],
      });
    } else {
      const refs = entryRefs(s);
      const scal = entryScalars(s);
      const first = refs[0];
      const fields = [
        ...scal.map((sc) => ({ label: cap(lowerWords(sc.name)), value: { path: sc.name } })),
        { label: 'Entry ID', value: { path: 'id' }, mono: true },
        { label: 'Entry type', value: { path: '@type' }, mono: true },
      ];
      refs.forEach((fr, i) => {
        if (i > 0) fields.push({ label: titleCase(lastWord(fr.name)), value: { path: `${fr.name}.name` } });
        fields.push({ refOf: fr.name, role: titleCase(lastWord(fr.name)) });
      });
      fields.push({ label: 'Entry href', value: { path: 'href' }, mono: true }, { label: 'Base type', value: { path: '@baseType' }, mono: true }, { label: 'Schema', value: { path: '@schemaLocation' }, mono: true });
      collections.push({
        tab: s.propertyName,
        source: s.propertyName,
        title: cap(nounPlural),
        count: { one: noun, many: nounPlural },
        search: { label: `Search ${nounPlural}`, placeholder: `Search ${nounPlural}` },
        defaultView: 'table',
        card: {
          icon: { icon, size: 18 },
          title: first ? { pick: [`${first.name}.name`, `${first.name}.id`], empty: `${cap(noun)} {n}` } : { text: `${cap(noun)} {n}` },
          subtitle: { text: first ? cap(lowerWords(first.name)) : cap(noun) },
          fields,
        },
        columns: [
          ...scal.map((sc, i) => ({ key: sc.name, label: cap(lowerWords(sc.name)), ...(i === 0 ? { width: 140 } : {}), render: 'primary-plain', empty: 'em-dash' })),
          ...refs.map((fr) => ({ key: fr.name, label: titleCase(lowerWords(fr.name)), render: 'ref-stack' })),
        ],
      });
    }
  }
  if (opts.timestamps) {
    stats.push({ key: 'updated', label: 'Last update', icon: { icon: 'Clock3', size: 14 }, value: { relativeTime: 'lastUpdate', empty: '—' }, hint: { dateTime: 'lastUpdate', empty: 'Not provided' } });
  }
  const refSub = m.subs.find((s) => s.refLike);
  const main = refSub ? [{
    block: 'entity-rows',
    title: titleCase(pluralPhrase(lowerWords(refSub.propertyName))),
    source: refSub.propertyName,
    viewAll: { label: `View all ${pluralPhrase(lowerWords(refSub.propertyName))}`, goTo: refSub.propertyName },
    emptyText: `No ${pluralPhrase(lowerWords(refSub.propertyName))}.`,
    icon: { icon: 'ScrollText', size: 16 },
    itemTitle: { pick: ['name', 'id'] },
    subtitle: { parts: [{ expr: { path: 'version' }, format: 'Version {0}' }, { expr: { pick: ['@referredType', '@type'] } }], sep: ' · ' },
    meta: 'id',
  }] : [];
  const aside = [];
  if (opts.timestamps) {
    aside.push({ block: 'timeline', title: 'Timeline', items: [
      { key: 'updated', path: 'lastUpdate', icon: { icon: 'History', size: 14 }, title: 'Last updated' },
      { key: 'created', path: 'createdDate', icon: { icon: 'CalendarPlus', size: 14 }, title: 'Created' },
    ] });
  }
  aside.push({ block: 'key-value', title: 'Record', items: [
    { label: 'ID', path: 'id', mono: true },
    ...m.scalars.filter((f) => !STRING(f) || !['name', 'description'].includes(f.name)).map((f) => ({
      label: labelOf(f.name),
      path: f.name,
      ...(BOOL(f) ? { value: { yesNo: f.name } }
        : DATE(f) ? { value: { dateTime: f.name } }
          : ENUM(f) ? { value: { oneOf: f.name, labels: Object.fromEntries(f.enumValues.map((v) => [String(v), enumLabel(v)])) } } : {}),
    })),
    { label: 'Type', path: '@type', mono: true },
    { label: 'Base type', path: '@baseType', mono: true },
    { label: 'Schema', path: '@schemaLocation', mono: true },
    { label: 'API href', path: 'href', mono: true, link: true },
  ] });
  return {
    idPrefix: kebab(lastWord(r.name)),
    tabsAriaLabel: 'Record sections',
    breadcrumbRoot: Title,
    header: { title: nameKey, recordId: 'id', description: m.has('description') ? 'description' : nameKey },
    loadingText: `Loading ${label}…`,
    notFound: { title: `${Title} not found`, alertTitle: `${cap(label)} not found`, alertDescription: `No ${label} with id {id} could be loaded.` },
    tabs,
    overview: { stats: { label: `${cap(label)} summary`, items: stats }, main, aside },
    collections,
  };
}

function hubConfig(ir, primary) {
  const n = ir.meta.tmfNumber;
  return {
    list: {
      breadcrumb: [ir.meta.specTitle, 'Event Hub'],
      title: 'Event Hub Subscriptions',
      subtitle: `TMF${n} ${ir.meta.specTitle} · hub`,
      card: {
        title: 'Subscriptions',
        description: `Listeners notified on ${ir.meta.specTitle} events.`,
        noun: ['subscription', 'subscriptions'],
        minTableWidth: 860,
        buttonActionVariant: 'menu',
        rowLabel: 'callback',
        searchPlaceholder: 'Search by callback URL',
        searchParam: 'callback',
        emptyTitle: 'No event subscriptions yet',
        emptyBody: `Add a listener with “New Subscription” to receive TMF${n} events.`,
        primaryAction: { label: 'New Subscription', icon: { icon: 'Plus', size: 16 } },
        refresh: true,
        rowClick: 'open-detail',
      },
      rowFrom: { id: { path: 'id' }, callback: { path: 'callback' }, query: { path: 'query' } },
      columns: [
        { key: 'id', label: 'ID', width: 170, sortable: true, render: 'mono-muted' },
        { key: 'callback', label: 'Callback URL', sortable: true, render: 'primary' },
        { key: 'query', label: 'Query Filter', width: 320, render: 'mono', empty: { text: 'All events' } },
      ],
      sortOptions: [{ key: 'callback', label: 'Callback URL' }, { key: 'id', label: 'ID' }],
      filterFields: [
        { key: 'id', label: 'ID', type: 'text' },
        { key: 'callback', label: 'Callback URL', type: 'text' },
        { key: 'query', label: 'Query Filter', type: 'text', placeholder: 'e.g. CreateEvent' },
      ],
      rowActions: [
        { key: 'view', label: 'View details', ariaLabel: 'View subscription {callback}', icon: { icon: 'Eye', size: 16 }, tone: 'brand', action: 'open-detail' },
        { key: 'remove', label: 'Remove', ariaLabel: 'Remove subscription {callback}', icon: { icon: 'Trash2', size: 16 }, tone: 'danger', action: 'confirm-delete' },
      ],
      mobileCard: { id: 'id', title: 'callback', subtitle: { path: 'query', empty: 'All events' } },
      delete: { title: 'Remove subscription?', strong: 'callback', strongClassName: 'lab-break', text: 'will stop receiving events.', confirmLabel: 'Remove', toast: 'Subscription removed' },
    },
    form: {
      formId: 'create-hub-form',
      width: 'narrow',
      title: 'Create event subscription',
      description: `The callback URL receives a POST for every matching TMF${n} event.`,
      submitLabel: 'Subscribe',
      validateOn: 'touched',
      fields: [
        { kind: 'url', name: 'callback', label: 'Callback URL', ariaLabel: 'Callback URL', placeholder: 'https://your-server.com/webhook', required: { message: 'Callback URL is required.' }, pattern: { message: 'Enter a full http(s) URL, e.g. https://your-server.com/webhook' } },
        { kind: 'textarea', name: 'query', label: 'Query Filter', placeholder: 'eventType=<EventName>', minRows: 3, helperText: `e.g. eventType=${primary.name}CreateEvent. Empty = all events.` },
      ],
      guard: [],
      // Hub_FVO is Extensible: @type is required
      payload: { '@type': { const: 'Hub' }, callback: { from: 'callback' }, query: { from: 'query', omitEmpty: true } },
      toast: 'Subscription created',
    },
    detail: hubDetail(ir),
  };
}

/** The record page of one subscription (GET /hub/{id}): what was registered, and how it is notified. */
function hubDetail(ir) {
  return {
    idPrefix: 'hub',
    tabsAriaLabel: 'Subscription sections',
    breadcrumbRoot: 'Event Hub',
    header: { title: 'callback', recordId: 'id', description: 'query' },
    loadingText: 'Loading subscription…',
    notFound: {
      title: 'Subscription not found',
      alertTitle: 'Subscription not found',
      alertDescription: 'No event subscription with id {id} exists, or it was removed.',
    },
    tabs: [{ key: 'overview', label: 'Overview', icon: { icon: 'FileText', size: 16 } }],
    overview: {
      stats: {
        label: 'Subscription summary',
        items: [
          { key: 'events', label: 'Events', icon: { icon: 'BellRing', size: 14 }, value: { ifAny: 'query', then: 'Filtered', else: 'All events' }, hint: { path: 'query', empty: 'No query filter' } },
          { key: 'delivery', label: 'Delivery', icon: { icon: 'Send', size: 14 }, value: { text: 'POST' }, hint: { path: 'callback' } },
        ],
      },
      main: [
        {
          block: 'key-value',
          title: 'Subscription',
          items: [
            { label: 'ID', path: 'id', mono: true },
            { label: 'Callback URL', path: 'callback', link: true },
            { label: 'Query filter', path: 'query', mono: true, value: { path: 'query', empty: 'All events' } },
            { label: 'Type', path: '@type', mono: true },
          ],
        },
      ],
      aside: [
        {
          block: 'key-value',
          title: 'Notification',
          items: [
            { label: 'Method', path: 'callback', value: { text: 'POST to the callback URL' } },
            { label: 'Body', path: 'callback', value: { text: `TMF${ir.meta.tmfNumber} event (JSON)` } },
            { label: 'API href', path: 'href', mono: true, link: true },
          ],
        },
      ],
    },
    collections: [],
  };
}

// ── schemas (types) ──

const INFRA = { '@type': { type: 'string' }, '@baseType': { type: 'string' }, '@schemaLocation': { type: 'string' } };

function schemasFrom(ir, models, opts) {
  const refs = new Map();
  const entries = {};
  const noteRef = (cls, extra = {}) => {
    if (!refs.has(cls)) refs.set(cls, { kind: 'ref', properties: { id: { type: 'string', required: true }, href: { type: 'string', serverManaged: true }, name: { type: 'string' }, ...extra, ...INFRA, '@referredType': { type: 'string' } } });
  };
  const resources = {};
  for (const m of models) {
    const props = { id: { type: 'string', serverManaged: true }, href: { type: 'string', serverManaged: true } };
    for (const f of m.scalars) props[f.name] = { type: DATE(f) ? 'date-time' : BOOL(f) ? 'boolean' : f.tsType === 'number' ? 'number' : 'string', ...(ENUM(f) ? { enum: f.enumValues.map(String) } : {}), ...(m.required.has(f.name) ? { requiredInFVO: true } : {}) };
    if (opts.timestamps) {
      props.createdDate = { type: 'date-time', serverManaged: true, extension: 'backend' };
      props.lastUpdate = { type: 'date-time', serverManaged: true, extension: 'backend' };
    }
    for (const s of m.subs) {
      props[s.propertyName] = { array: s.className === s.itemRef ? s.itemRef : s.className, ...(s.minItems ? { minItems: s.minItems } : {}) };
      if (s.refLike) noteRef(s.itemRef, s.fields.some((f) => f.name === 'version') ? { version: { type: 'string' } } : {});
      else {
        const ep = { id: { type: 'string', serverManaged: true }, href: { type: 'string', serverManaged: true } };
        for (const sc of entryScalars(s)) ep[sc.name] = { type: 'string' };
        for (const fr of entryRefs(s)) {
          ep[fr.name] = { ref: fr.targetRef };
          noteRef(fr.targetRef);
        }
        Object.assign(ep, { '@type': { type: 'string', requiredInFVO: true }, '@baseType': { type: 'string' }, '@schemaLocation': { type: 'string' } });
        entries[s.className] = { kind: 'entry', properties: ep };
      }
    }
    Object.assign(props, { '@type': { type: 'string', requiredInFVO: true }, '@baseType': { type: 'string' }, '@schemaLocation': { type: 'string' } });
    const fvo = [...m.scalars.filter((f) => FORMABLE(f, m.r.name, m.required.has(f.name)) && m.createProps.has(f.name)).map((f) => f.name), ...m.subs.filter((s) => m.createProps.has(s.propertyName)).map((s) => s.propertyName), '@type'];
    resources[m.r.name] = { kind: 'resource', properties: props, shapes: { FVO: fvo, MVO: fvo } };
  }
  const out = { ...Object.fromEntries(refs), ...entries, ...resources };
  if (ir.hub?.present) {
    out.Hub = { kind: 'hub', properties: { id: { type: 'string', serverManaged: true }, href: { type: 'string', serverManaged: true }, callback: { type: 'string', format: 'uri', required: true }, query: { type: 'string' }, '@type': { type: 'string' } }, shapes: { FVO: ['callback', 'query', '@type'] } };
  }
  out.Error = { kind: 'error', properties: { code: { type: 'string', required: true }, reason: { type: 'string', required: true }, message: { type: 'string' }, status: { type: 'string' }, referenceError: { type: 'string' }, '@type': { type: 'string' } } };
  return out;
}

// ── lookups ──

function lookupsFrom(refClasses, warnings) {
  const apis = {};
  const items = {};
  const d = REGISTRY.defaults;
  for (const cls of refClasses) {
    const reg = REGISTRY.refs[cls];
    const key = refKey(cls);
    let apiKey;
    if (reg) {
      apiKey = reg.api;
      const a = REGISTRY.apis[apiKey];
      apis[apiKey] ??= { service: a.service, baseUrlEnv: a.baseUrlEnv, basePath: a.basePath, queryParam: d.queryParam, limit: d.limit, labelField: d.labelField, valueField: d.valueField };
      items[key] = { api: apiKey, path: reg.path, noun: pluralPhrase(lowerWords(cls.replace(/Ref$/, ''))), ref: cls };
    } else {
      apiKey = `${key}Api`;
      warnings.push(`${cls}: not in libs/neudela/ref-registry.yaml — its lookup is generated unresolved; set app.lookups.apis.${apiKey} (base path, env) in the overrides`);
      apis[apiKey] = { service: `${titleCase(lowerWords(cls.replace(/Ref$/, '')))} API`, baseUrlEnv: `VITE_${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_API_BASE_URL`, basePath: '/tmf-api/unresolved', queryParam: d.queryParam, limit: d.limit, labelField: d.labelField, valueField: d.valueField, unresolved: true };
      items[key] = { api: apiKey, path: `/${key}`, noun: pluralPhrase(lowerWords(cls.replace(/Ref$/, ''))), ref: cls };
    }
  }
  return { apis, items };
}

// ── mock seed ──

function stripServer(v) {
  if (Array.isArray(v)) return v.map(stripServer);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'href').map(([k, x]) => [k, stripServer(x)]));
  return v;
}

function mockFrom(ir, models, lookups, opts, nestedModels = []) {
  const resources = models.map((m) => {
    const base = `/${ir.meta.basePath}`;
    const items = (m.r.seedExamples ?? []).map((ex, i) => {
      const id = seedId(m.r.camelName, i);
      const value = stripServer(ex.value ?? {});
      delete value.id;
      const at = new Date(Date.parse('2026-09-01T08:00:00Z') + i * 36e5 * 26).toISOString();
      return { ...value, id, href: `${base}${m.r.paths.collection}/${id}`, ...(opts.timestamps ? { createdDate: at, lastUpdate: at } : {}) };
    });
    const rules = [
      ...m.scalars.filter((f) => STRING(f) && m.required.has(f.name)).map((f) => ({ field: f.name, kind: 'string', message: `${f.name} is required` })),
      ...m.subs.filter((s) => (s.minItems ?? 0) >= 1).map((s) => ({ field: s.propertyName, kind: 'nonEmptyArray', message: `${s.propertyName} must contain at least 1 element` })),
    ];
    return { path: m.r.paths.collection, label: m.r.name, items, rules, patch: !!m.r.operations.update, timestamps: opts.timestamps };
  });
  // a nested collection: items carry their parent record (__parent, mock-only); when the parent
  // embeds the same list its entries are the seed, so the two views agree
  for (const m of nestedModels) {
    const base = `/${ir.meta.basePath}`;
    const parentPath = `/${m.r.paths.collection.split('/')[1]}`;
    const parentStore = resources.find((r) => r.path === parentPath);
    const under = (parentId) => m.r.paths.collection.replace(/\{[^}]+\}/, parentId);
    const fromParents = (parentStore?.items ?? []).flatMap((p) => (Array.isArray(p[m.r.pathSegment]) ? p[m.r.pathSegment] : []).map((sub, i) => {
      const id = sub.id ?? seedId(`${m.r.camelName}-${p.id}`, i);
      return { ...stripServer(sub), id, href: `${base}${under(p.id)}/${id}`, __parent: p.id };
    }));
    const firstParent = parentStore?.items?.[0]?.id;
    const fromExamples = firstParent ? (m.r.seedExamples ?? []).map((ex, i) => {
      const value = stripServer(ex.value ?? {});
      delete value.id;
      const id = seedId(m.r.camelName, i);
      return { ...value, id, href: `${base}${under(firstParent)}/${id}`, __parent: firstParent };
    }) : [];
    resources.push({
      path: m.r.paths.collection,
      label: m.r.name,
      items: fromParents.length ? fromParents : fromExamples,
      rules: m.scalars.filter((f) => STRING(f) && m.required.has(f.name)).map((f) => ({ field: f.name, kind: 'string', message: `${f.name} is required` })),
      patch: !!m.r.operations.update,
      timestamps: opts.timestamps,
    });
  }
  if (ir.hub?.present) {
    resources.push({ path: '/hub', label: 'Hub', items: [], rules: [{ field: 'callback', kind: 'string', message: 'callback is required' }], patch: false, timestamps: false, createFields: ['callback', 'query'], type: 'Hub' });
  }
  const mockLookups = Object.fromEntries(Object.keys(lookups.items).map((k) => [k, Array.from({ length: 5 }, (_, i) => ({ id: `${k}-${String(i + 1).padStart(3, '0')}`, name: `Sample ${lowerWords(k)} ${i + 1}` }))]));
  return { latencyMs: 250, lookups: mockLookups, resources };
}

// ── main ──

/**
 * @param {object} ir TMF IR (ir-cache/*.ir.json)
 * @param {{ overrides?: object, timestamps?: boolean }} options timestamps = the backend adds createdDate/lastUpdate (tmfgen backends do)
 * @returns {{ spec: object, text: string, warnings: string[] }}
 */
export function emitNeudelaSpec(ir, { overrides, timestamps = true, fieldPolicy } = {}) {
  POLICY = fieldPolicy ?? yaml.load(fs.readFileSync(DEFAULT_FIELD_POLICY, 'utf8'));
  const warnings = [];
  const opts = { timestamps };
  const crud = ir.resources.filter((r) => r.operations.list && r.operations.retrieve && !r.nested);
  for (const r of ir.resources.filter((x) => !crud.includes(x) && !x.nested)) {
    warnings.push(`${r.name}: no list + retrieve operation — no page generated`);
  }
  for (const r of crud) {
    if (!r.operations.create) warnings.push(`${r.name}: no create operation — read-only page (no create button, no form)`);
    if (!r.operations.delete) warnings.push(`${r.name}: no delete operation — no delete action`);
  }
  if (!crud.length) throw new Error('no resource with list + retrieve operations in the IR — nothing to generate');
  const models = crud.map((r) => resourceModel(ir, r, warnings));
  const primary = models[0];
  const n = ir.meta.tmfNumber;
  const basePath = `/${ir.meta.basePath}`;
  const refClasses = new Set();

  const pages = {};
  const navigation = [{ path: '/', label: 'Overview', icon: 'LayoutDashboard', page: 'home' }];
  const services = [];
  for (const m of models) {
    const key = m.r.camelName;
    const config = { list: listConfig(ir, m, opts), ...(m.r.operations.create ? { form: formConfig(ir, m, refClasses, warnings) } : {}), detail: detailConfig(ir, m, opts) };
    pages[key] = {
      kind: 'resource',
      dir: m.r.kebabName,
      component: `${m.r.name}Page`,
      comment: `TMF${n} ${m.r.name}: list, create dialog and record page, from config.ts.`,
      expose: { key: `./${m.r.name}`, file: m.r.name, pageName: m.r.name },
      service: `${m.r.camelName}Service`,
      lookups: false,
      config,
    };
    navigation.push({ path: `/${m.r.kebabName}`, label: titleCase(m.plural), icon: 'Database', page: key });
    services.push({ name: `${m.r.camelName}Service`, path: m.r.paths.collection, type: m.r.name, create: `${m.r.name}_FVO`, update: `${m.r.name}_MVO` });
  }
  const usesRef = (form) => JSON.stringify(form?.fields ?? []).includes('"kind":"ref"');
  for (const m of models) pages[m.r.camelName].lookups = usesRef(pages[m.r.camelName].config.form);

  // resources nested under a page's resource (OAS /parent/{id}/child): a tab of the parent's
  // record page lists them live from their own path; a row opens their record page
  const nestedModels = [];
  for (const r of ir.resources.filter((x) => x.nested)) {
    const parentPath = `/${r.paths.collection.split('/')[1]}`;
    const parent = models.find((m) => m.r.paths.collection === parentPath);
    if (!(r.operations.list && r.operations.retrieve)) {
      warnings.push(`${r.name}: nested, but no list + retrieve operation — no tab generated`);
      continue;
    }
    if (!parent) {
      warnings.push(`${r.name}: nested under ${parentPath}, which has no page — no tab generated`);
      continue;
    }
    const m = resourceModel(ir, r, warnings);
    nestedModels.push(m);
    const svc = `${r.camelName}Service`;
    services.push({ name: svc, path: r.paths.collection, type: r.name, create: `${r.name}_FVO`, update: `${r.name}_MVO`, nested: true });
    const form = r.operations.create ? formConfig(ir, m, refClasses, warnings) : null;
    const pdetail = pages[parent.r.camelName].config.detail;
    // the parent embeds the same list (TMF673 geographicSubAddress): the nested tab takes its place
    const embedded = pdetail.collections.find((c) => c.source === r.pathSegment);
    const tab = embedded?.tab ?? r.camelName;
    if (embedded) pdetail.collections = pdetail.collections.filter((c) => c !== embedded);
    else pdetail.tabs.push({ key: tab, label: titleCase(m.plural), icon: { icon: 'Layers', size: 16 } });
    pdetail.nested = [...(pdetail.nested ?? []), {
      tab,
      service: svc,
      lookups: usesRef(form),
      list: listConfig(ir, m, opts),
      ...(form ? { form } : {}),
      detail: detailConfig(ir, m, opts),
    }];
    if (usesRef(form)) pages[parent.r.camelName].lookups = true;
  }
  if (ir.hub?.present) {
    pages.hub = {
      kind: 'resource', dir: 'hub', component: 'HubPage',
      comment: `TMF${n} event hub subscriptions (Hub): list, create dialog, remove — from config.ts.`,
      expose: { key: './Hub', file: 'Hub', pageName: 'Hub' },
      service: 'hubService', lookups: false, config: hubConfig(ir, primary.r),
    };
    navigation.push({ path: '/hub', label: 'Event Hub', icon: 'BellRing', page: 'hub' });
    services.push({ name: 'hubService', path: '/hub', type: 'Hub', create: 'Hub_FVO' });
  }
  const lookups = lookupsFrom(refClasses, warnings);

  const statuses2xx = (op) => (op.statuses ?? []).filter((s) => /^2/.test(s));
  const operations = [];
  for (const m of [...models, ...nestedModels]) {
    const { collection, item } = m.r.paths;
    const ops = m.r.operations;
    const add = (method, p, op) => op && operations.push({ method, path: p, operationId: op.operationId, summary: op.summary, success: statuses2xx(op) });
    add('GET', collection, ops.list);
    add('POST', collection, ops.create);
    add('GET', item, ops.retrieve);
    add('PATCH', item, ops.update);
    add('DELETE', item, ops.delete);
  }
  if (ir.hub?.present) {
    if (ir.hub.specMethods?.post) operations.push({ method: 'POST', path: '/hub', operationId: 'createHub', summary: 'Create a subscription (hub) to receive Events', success: ['201'] });
    if (ir.hub.specMethods?.delete) operations.push({ method: 'DELETE', path: '/hub/{id}', operationId: 'hubDelete', summary: 'Remove a subscription (hub) to receive Events', success: ['204'] });
    // not in most OAS, but served by the generated backend: the Event Hub page lists and opens them
    if (!ir.hub.specMethods?.get) operations.push({ method: 'GET', path: '/hub', operationId: 'listHub', summary: 'List event subscriptions (Event Hub page)', success: ['200'], notInSpec: true });
    if (!ir.hub.specMethods?.retrieve) operations.push({ method: 'GET', path: '/hub/{id}', operationId: 'retrieveHub', summary: 'Retrieve an event subscription (hub record page)', success: ['200'], notInSpec: true });
  }
  const listenerOf = (ev) => (ir.listeners ?? []).find((l) => l.eventName === ev.eventName)?.path ?? `/listener/${ev.eventName}`;
  const events = models.flatMap((m) => (m.r.notificationEvents ?? []).map((ev) => ({ name: ev.eventName, kind: HUMAN_EVENT[ev.eventKind] ?? ev.eventKind, listenerPath: listenerOf(ev) })));

  const appName = `${(ir.meta.serviceNameSuggestion ?? `tmf${n}`).replace(/-service$/, '')}-portal`;
  const lookupEnvs = [...new Set(Object.values(lookups.apis).map((a) => a.baseUrlEnv))];
  const app = {
    meta: {
      name: appName,
      packageName: `@mcs/${appName}`,
      version: '0.1.0',
      uiLang: 'en',
      title: `${ir.meta.specTitle} Portal`,
      description: `TMF${n} ${ir.meta.specTitle} UI on the neudela design system`,
      packageDescription: `TMF${n} ${ir.meta.specTitle} frontend (neudela, Vite, MFE-ready) generated by tmfgen fe-gen.`,
      favicon: { href: '/favicon.svg', type: 'image/svg+xml' },
      typesFile: primary.r.camelName,
    },
    tmf: {
      number: n,
      specTitle: ir.meta.specTitle,
      specVersion: ir.meta.specVersion,
      description: `${ir.meta.specTitle} API (TMF${n} v${ir.meta.specVersion}).`,
    },
    brand: { logoLetter: ir.meta.specTitle.charAt(0).toUpperCase(), title: ir.meta.specTitle, caption: `TMF${n} ${ir.meta.specTitle}` },
    api: { basePath, authHeader: 'X-API-Key' },
    environment: {
      port: 4000 + (Number(n) % 1000),
      apiProxyTargetDefault: `http://localhost:${3000 + (Number(n) % 1000)}`,
      lookupMockBase: '/mock-lookup-api',
      variables: [
        { name: 'VITE_API_BASE_URL', value: '', comment: 'Base URL prepended to /tmf-api/... calls. Empty = same origin, which the Vite\ndev server proxies to API_PROXY_TARGET.' },
        { name: 'API_PROXY_TARGET', value: `http://localhost:${3000 + (Number(n) % 1000)}`, comment: `Where \`npm run dev\` proxies /tmf-api (the TMF${n} backend). Read by vite.config.ts only.` },
        { name: 'VITE_API_KEY', value: '', comment: 'Sent as X-API-Key when set.' },
        ...lookupEnvs.map((env) => ({ name: env, value: '', comment: `${Object.values(lookups.apis).find((a) => a.baseUrlEnv === env).service} service backing the relation pickers. Unset = pickers explain that it is not connected.` })),
      ],
      mock: lookupEnvs.map((env) => ({ name: env, value: '/mock-lookup-api' })),
    },
    navigation,
    services,
    lookups,
    schemas: schemasFrom(ir, [...models, ...nestedModels], opts),
    pages: {
      home: {
        kind: 'overview',
        summary: {
          apiInfo: { tmfNumber: n, title: ir.meta.specTitle, version: ir.meta.specVersion, description: `${ir.meta.specTitle} API (TMF${n} v${ir.meta.specVersion}).`, basePath, authHeader: 'X-API-Key' },
          resources: models.map((m) => ({
            name: m.r.name,
            description: GENERIC_DESC.test(m.r.description ?? '') || !m.r.description ? `${cap(m.plural)} of the ${ir.meta.specTitle} API.` : m.r.description,
            route: `/${m.r.kebabName}`,
            pageLabel: titleCase(m.plural),
            collectionPath: m.r.paths.collection,
            itemPath: m.r.paths.item,
            requiredOnCreate: [...m.required].sort((a, b) => (a.startsWith('@') === b.startsWith('@') ? 0 : a.startsWith('@') ? 1 : -1)),
            subResources: m.subs.map((s) => ({ name: s.propertyName, kind: s.refLike ? 'ref' : 'entry', ...(s.minItems ? { minItems: s.minItems } : {}) })),
          })),
          operations,
          events,
          primaryResourceNoun: titleCase(pluralWord(lastWord(primary.r.name))),
          countService: `${primary.r.camelName}Service`,
        },
      },
      ...pages,
    },
    mock: mockFrom(ir, models, lookups, opts, nestedModels),
  };

  const merged = mergeOverrides({ app }, overrides ?? {});
  // overrides may rename form fields: the edit's field list follows the final form
  for (const page of Object.values(merged.app.pages)) {
    const form = page.config?.form;
    if (form?.edit) form.edit.fields = editFields(form);
  }
  const spec = { apiVersion: 'neudela-fe/v1', kind: 'FrontendApp', ...merged };
  const header = `# neudela-fe/v1 spec — TMF${n} ${ir.meta.specTitle} (generated by tmfgen fe-spec --ui neudela)\n# Template / generation come from generator/templates/fe-neudela/template.yaml.\n`;
  return { spec, text: `${header}${yamlLiteral(spec)}`, warnings };
}
