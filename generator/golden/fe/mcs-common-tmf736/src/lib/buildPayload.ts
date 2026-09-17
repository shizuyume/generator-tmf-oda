// Generic payload-spec resolver — adapted from src/gen/StandardFormModal.tsx's toPayload()
// (shared with the fe-mui/fe-neudela/fe-default templates) so the declarative payload
// mapping written by buildFEIR.mjs's normalizePayload() behaves identically here, even
// though this template does NOT use StandardFormModal for rendering.
//
// spec leaves are always one of: a string token ('fields.X' / 'item.X'), a {$src,$tx}
// transform node, or a nested object (reconstructed recursively).

function resolvePayloadToken(token: string, values: Record<string, unknown>, item?: Record<string, unknown>): unknown {
  const m = /^(fields|item)\.(.+)$/.exec(token);
  if (m) {
    const src = m[1] === 'item' ? (item ?? values) : values;
    return (src as Record<string, unknown>)[m[2]];
  }
  return token; // literal (not expected in practice - buildFEIR normalizes all leaves to tokens)
}

// F3: 10 verb tertutup (schema $defs.transformVerb). buildFEIR already rejects any verb
// outside this list before emit, so `default` below should never actually be hit.
function applyTransform(value: unknown, verb?: string): unknown {
  switch (verb) {
    case 'id': return (value as Record<string, unknown> | null | undefined)?.['id'];
    case 'name': return (value as Record<string, unknown> | null | undefined)?.['name'];
    case 'value': return (value as Record<string, unknown> | null | undefined)?.['value'];
    case 'string': return value == null ? value : String(value);
    case 'number': return value == null || value === '' ? value : Number(value);
    case 'boolean': return Boolean(value);
    case 'trim': return typeof value === 'string' ? value.trim() : value;
    case 'iso-date': return value ? new Date(value as string | number | Date).toISOString() : value;
    case 'array-ids': return Array.isArray(value) ? value.map((v) => (v as Record<string, unknown> | null)?.['id']) : value;
    case 'json': return value;
    default: return value;
  }
}

/** Reconstruct a payload object from a declarative mapping spec (api.payload / itemPayload). */
export function toPayload(
  values: Record<string, unknown>,
  spec: Record<string, unknown>,
  item?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value === 'string') {
      out[key] = resolvePayloadToken(value, values, item);
    } else if (value && typeof value === 'object' && '$src' in (value as Record<string, unknown>)) {
      const node = value as { $src: string; $tx?: string };
      out[key] = applyTransform(resolvePayloadToken(node.$src, values, item), node.$tx);
    } else if (value && typeof value === 'object') {
      out[key] = toPayload(values, value as Record<string, unknown>, item);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface ComputedFromRule {
  /** field name that gets written */
  target: string;
  /** sibling field name it mirrors (same row for a repeatable, same root otherwise) */
  source: string;
}

/** `field.computedFrom` mirrors a sibling field's value into a readOnly field — same
 * semantics as the generic runtime's `useWatch(computedFrom) + setValue(path, watched)`
 * (see src/gen/StandardFormModal.tsx FieldControl), just applied once at submit time here
 * instead of reactively while typing (this template renders no input for a readOnly
 * field, so there is nothing to live-preview). */
function applyComputedFrom(values: Record<string, unknown>, rules: ComputedFromRule[]): Record<string, unknown> {
  if (!rules.length) return values;
  const out = { ...values };
  for (const { target, source } of rules) out[target] = out[source];
  return out;
}

/**
 * Build the final API payload from raw RHF form values: applies computedFrom mirroring
 * (root-level, and per-row for any repeatable field that has its own rules), then
 * resolves the root `spec` against `values`, first re-mapping any repeatable array
 * field's raw rows through its own `itemPayload` (flat row -> API nested shape) —
 * mirrors StandardFormModal's "rekonstruksi itemPayload per repeatable" pass.
 */
export function buildPayload(
  values: Record<string, unknown>,
  spec: Record<string, unknown>,
  repeatableItemPayloads: Record<string, Record<string, unknown>>,
  computedFromRoot: ComputedFromRule[] = [],
  computedFromRepeatable: Record<string, ComputedFromRule[]> = {},
): Record<string, unknown> {
  const mappedValues: Record<string, unknown> = applyComputedFrom(values, computedFromRoot);
  for (const [fieldName, itemPayload] of Object.entries(repeatableItemPayloads)) {
    const rows = mappedValues[fieldName];
    if (Array.isArray(rows)) {
      const rowRules = computedFromRepeatable[fieldName] ?? [];
      mappedValues[fieldName] = rows.map((row) =>
        toPayload(applyComputedFrom(row as Record<string, unknown>, rowRules), itemPayload),
      );
    }
  }
  return toPayload(mappedValues, spec);
}

function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce((acc: unknown, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), obj);
}

/** Inverse of toPayload: walks a payload spec and, for every `fields.X`/`item.X` token
 * (bare or `{$src,$tx}` — transforms are NOT inverted, the raw wire value is used as-is),
 * reads the API value at that spec position out of `source` and writes it to
 * `out[flatFieldName]`. Same spec object works for both directions since the token names
 * are the same flat field names either way. */
function flattenSpec(spec: Record<string, unknown>, source: Record<string, unknown>, path: string[], out: Record<string, unknown>): void {
  for (const [wireKey, node] of Object.entries(spec)) {
    if (typeof node === 'string') {
      const m = /^(?:fields|item)\.(.+)$/.exec(node);
      if (m) out[m[1]] = getPath(source, [...path, wireKey]);
    } else if (node && typeof node === 'object' && '$src' in (node as Record<string, unknown>)) {
      const m = /^(?:fields|item)\.(.+)$/.exec((node as { $src: string }).$src);
      if (m) out[m[1]] = getPath(source, [...path, wireKey]);
    } else if (node && typeof node === 'object') {
      flattenSpec(node as Record<string, unknown>, source, [...path, wireKey], out);
    }
  }
}

/**
 * Build react-hook-form defaultValues from a loaded API record — the inverse of
 * buildPayload(), using the SAME declarative spec (edit forms reuse the add form's field
 * list/itemPayload, so root scalars and repeatable rows both map back correctly). Used to
 * prefill an edit dialog from the detail page's already-loaded record
 * (`prefillFrom: detail` in the fe-spec).
 */
export function mapDetailToDefaults(
  detail: Record<string, unknown>,
  spec: Record<string, unknown>,
  repeatableItemPayloads: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  flattenSpec(spec, detail, [], out);
  for (const [fieldName, itemPayload] of Object.entries(repeatableItemPayloads)) {
    const rows = detail[fieldName];
    out[fieldName] = Array.isArray(rows)
      ? rows.map((row) => {
          const rowOut: Record<string, unknown> = {};
          flattenSpec(itemPayload, row as Record<string, unknown>, [], rowOut);
          return rowOut;
        })
      : [];
  }
  return out;
}
