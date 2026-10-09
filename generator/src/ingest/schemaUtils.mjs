/**
 * $ref / allOf resolution against a BUNDLED OpenAPI doc.
 *
 * We deliberately bundle rather than dereference: dereferencing resolves away the
 * $ref target NAMES, and those names are what sub-entity/DTO classes are named after
 * (e.g. `policy` -> items $ref PolicyRef -> class PolicyRef).
 */

export function refName(ref) {
  if (typeof ref !== 'string') return null;
  const parts = ref.split('/');
  return parts[parts.length - 1] || null;
}

function componentBucket(doc, ref) {
  // '#/components/schemas/Foo' (OAS3) | '#/definitions/Foo' (Swagger2)
  const segs = ref.replace(/^#\//, '').split('/');
  let node = doc;
  for (const s of segs) {
    if (node == null) return null;
    node = node[s];
  }
  return node ?? null;
}

export function resolveRef(doc, ref) {
  const schema = componentBucket(doc, ref);
  return schema ? { name: refName(ref), schema } : null;
}

/**
 * Merge an allOf chain into one flat schema.
 * Returns { properties, required, description, sources } where `sources` lists the
 * $ref names that were composed in (TMF736: ['Entity'] -> Extensible + Addressable).
 */
export function flattenSchema(doc, schema, seen = new Set(), depth = 0) {
  const out = { properties: {}, required: [], description: schema?.description || '', sources: [] };
  if (!schema || depth > 12) return out;

  if (schema.$ref) {
    const key = schema.$ref;
    if (seen.has(key)) return out; // circular guard
    seen.add(key);
    const resolved = resolveRef(doc, key);
    if (!resolved) return out;
    out.sources.push(resolved.name);
    const inner = flattenSchema(doc, resolved.schema, seen, depth + 1);
    Object.assign(out.properties, inner.properties);
    out.required.push(...inner.required);
    out.sources.push(...inner.sources);
    if (!out.description) out.description = inner.description;
    return out;
  }

  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      const inner = flattenSchema(doc, member, new Set(seen), depth + 1);
      Object.assign(out.properties, inner.properties);
      out.required.push(...inner.required);
      out.sources.push(...inner.sources);
      if (!out.description && inner.description) out.description = inner.description;
    }
  }

  if (schema.properties) Object.assign(out.properties, schema.properties);
  if (Array.isArray(schema.required)) out.required.push(...schema.required);
  if (schema.description && !out.description) out.description = schema.description;

  out.required = [...new Set(out.required)];
  return out;
}

/** Scalar props of a schema, used when flattening a single ref into prefixed columns. */
export function scalarProps(doc, schema) {
  const flat = flattenSchema(doc, schema);
  const result = {};
  for (const [name, prop] of Object.entries(flat.properties)) {
    const p = prop.$ref ? null : prop;
    if (!p) continue;
    if (p.type === 'array' || p.type === 'object' || p.properties || p.allOf) continue;
    result[name] = p;
  }
  return result;
}

/**
 * Properties the discriminator SUBTYPES of a schema add on top of it. A ContactMedium
 * item may really be an EmailContactMedium, whose `emailAddress` lives only on the
 * subtype; modelling just the base dropped it on the round trip. They become ordinary
 * (always optional) columns of the base table.
 *
 * A name that two subtypes declare with different shapes (Characteristic.value is a
 * string on one, an object on another) cannot share one column: the first declaration
 * wins and the clash is returned so the IR can warn about it.
 *
 * @returns {{ properties: Record<string, object>, conflicts: string[] }}
 */
export function subtypeProps(doc, schema, baseProps = {}) {
  const out = { properties: {}, conflicts: [] };
  const resolved = schema?.$ref ? resolveRef(doc, schema.$ref) : null;
  const mapping = (resolved?.schema ?? schema)?.discriminator?.mapping;
  if (!mapping) return out;

  const baseName = resolved?.name;
  const shape = (p) => JSON.stringify({ $ref: p.$ref, type: p.type, format: p.format, items: p.items?.$ref ?? p.items?.type });
  const clashes = new Map(); // prop -> subtypes declaring it with a different shape
  const owner = {};
  for (const [subName, ref] of Object.entries(mapping)) {
    const target = refName(ref);
    // the mapping lists the base itself, and FVO/MVO variants only matter for input shapes
    if (target === baseName || /_(FVO|MVO)$/.test(target)) continue;
    for (const [prop, propSchema] of Object.entries(flattenSchema(doc, { $ref: ref }).properties)) {
      if (prop in baseProps) continue;
      if (!(prop in out.properties)) {
        out.properties[prop] = propSchema;
        owner[prop] = subName;
      } else if (shape(out.properties[prop]) !== shape(propSchema)) {
        if (!clashes.has(prop)) clashes.set(prop, [owner[prop]]);
        clashes.get(prop).push(subName);
      }
    }
  }
  out.conflicts = [...clashes].map(([prop, subs]) => `${prop} (kept ${subs[0]}'s, ignored ${subs.slice(1).join('/')})`);
  return out;
}
