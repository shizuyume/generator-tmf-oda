import { at } from './expr';
import type { FormConfig, PayloadNode } from './types';

// Builds the request body from form values and the config's payload spec. References picked
// from a LOV carry id + name only — href and the rest are set by the backend. Key order
// follows the spec.

type Values = Record<string, any>;

const trimmed = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const isPlainObject = (v: unknown): v is Values => !!v && typeof v === 'object' && !Array.isArray(v);
// `false` counts as empty for an optional checkbox: unchecked = attribute not sent;
// a value object with nothing filled in is not sent either
const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === false
  || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);

/** A form value as the attribute's JSON type: numbers and JSON text are typed as strings. */
function converted(v: unknown, as?: 'number' | 'json'): unknown {
  if (typeof v !== 'string' || v === '' || !as) return v;
  if (as === 'number') return Number(v);
  try {
    return JSON.parse(v);
  } catch {
    return v; // the field's own rule reports it; never reached after validation
  }
}

/** A TMF *Ref picked from a LOV: id + name only (name dropped when empty). */
function lovRef(value: { id?: string; name?: string } | undefined, type: string, referredType: string) {
  const id = String(value?.id ?? '').trim();
  if (!id) return undefined;
  const name = String(value?.name ?? '').trim();
  return { id, ...(name ? { name } : {}), '@type': type, '@referredType': referredType };
}

/** [value, omit-when-empty] of one payload node. */
function nodeValue(node: PayloadNode, values: Values): [unknown, boolean] {
  if ('const' in node) return [node.const, false];
  if ('from' in node) return [converted(trimmed(at(values, node.from)), node.as), !!node.omitEmpty];
  if ('object' in node) return [build(node.item, (at(values, node.object) as Values | undefined) ?? {}), true];
  if ('array' in node) {
    const items = ((at(values, node.array) as Values[] | undefined) ?? [])
      .filter((item) => node.keepWhen.some((p) => String(at(item, p) ?? '').trim() !== ''));
    const mapped = items.map((item) => ('each' in node ? nodeValue(node.each, item)[0] : build(node.item, item)));
    return [mapped, !!node.omitEmpty];
  }
  return [lovRef(at(values, node.lovRef) as { id?: string; name?: string } | undefined, node.type, node.referredType), true];
}

function build(spec: Record<string, PayloadNode>, values: Values): Values {
  const out: Values = {};
  for (const [key, node] of Object.entries(spec)) {
    const [v, omitEmpty] = nodeValue(node, values);
    if (omitEmpty && isEmpty(v)) continue;
    out[key] = v;
  }
  return out;
}

export function buildPayload(form: FormConfig, values: Values): Values {
  return build(form.payload, values);
}

// ── edit (PATCH) ──

function setAt(target: Values, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = target;
  for (const k of keys.slice(0, -1)) {
    cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

const refValue = (r: unknown) => {
  const ref = (r ?? {}) as { id?: string; name?: string };
  return { id: ref.id ?? '', name: ref.name ?? '' };
};

/** An attribute value as the form holds it: numbers as text, JSON pretty-printed. */
function formValue(v: unknown, as?: 'number' | 'json'): unknown {
  if (v === undefined || v === null) return '';
  if (as === 'number') return String(v);
  if (as === 'json') return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  return v;
}

/** The form values of one array element, by the payload node that wrote it. */
function elementValues(node: PayloadNode, el: unknown): Values {
  if ('lovRef' in node) return { [node.lovRef]: refValue(el) };
  if ('from' in node) return { [node.from]: formValue(el, node.as) };
  return {};
}

/** Inverse of build(): the form values that produce `record` (used to prefill the edit form). */
function unbuild(spec: Record<string, PayloadNode>, record: Values): Values {
  const out: Values = {};
  for (const [key, node] of Object.entries(spec)) {
    const v = record?.[key];
    if ('const' in node) continue;
    if ('from' in node) setAt(out, node.from, formValue(v, node.as));
    else if ('lovRef' in node) setAt(out, node.lovRef, refValue(v));
    else if ('object' in node) setAt(out, node.object, unbuild(node.item, isPlainObject(v) ? v : {}));
    else {
      const list = Array.isArray(v) ? v : [];
      setAt(out, node.array, list.map((el) => ('each' in node ? elementValues(node.each, el) : unbuild(node.item, el as Values))));
    }
  }
  return out;
}

export function valuesFromRecord(form: FormConfig, record: Values): Values {
  return unbuild(form.payload, record);
}

/**
 * The PATCH body: the update schema's attributes whose value differs from what the form was
 * opened with. A cleared attribute is sent as null (a cleared list as []), so the server drops it.
 */
export function buildPatch(form: FormConfig, initial: Values, values: Values): Values {
  const allowed = new Set(form.edit?.payload ?? []);
  const before = build(form.payload, initial);
  const after = build(form.payload, values);
  const out: Values = {};
  for (const key of Object.keys(form.payload)) {
    if (!allowed.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key in after) out[key] = after[key];
    else out[key] = 'array' in form.payload[key] ? [] : null;
  }
  return out;
}

/** The config's last check before the request; the message of the first failing rule. */
export function guardError(form: FormConfig, values: Values): string | null {
  for (const g of form.guard) {
    if ('required' in g && !String(at(values, g.required) ?? '').trim()) return g.message;
    if ('anyItem' in g) {
      const items = (at(values, g.anyItem) as Values[] | undefined) ?? [];
      if (!items.some((item) => String(at(item, g.path) ?? '').trim())) return g.message;
    }
  }
  return null;
}
