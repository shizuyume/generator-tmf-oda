import { flattenSchema, refName, resolveRef } from '../ingest/schemaUtils.mjs';
import { classifyProperty, expandSubResource } from './nesting.mjs';
import { pascal, camel, identifier, kebab, snake, apiName, exchangeBase, tmfNumber, majorVersion } from './naming.mjs';

const INFRA_PATH_SEGMENTS = new Set(['hub', 'listener']);

/* ── dialect shims ───────────────────────────────────────────────────── */

/** OAS3 keeps schemas in components.schemas; Swagger 2.0 in definitions. */
function schemasOf(doc) {
  return doc.components?.schemas ?? doc.definitions ?? {};
}

/**
 * Variant-schema conventions differ by spec generation:
 *   v5 / OAS3      Foo_FVO (create)   Foo_MVO (update)   + Foo_RES, Foo_EVO
 *   v4 / Swagger2  Foo_Create         Foo_Update
 * 222 _Create and 158 _Update definitions exist across the v4 corpus.
 */
const VARIANT_SUFFIXES = ['_RES', '_EVO', '_FVO', '_MVO', '_Create', '_Update', 'Array'];

function createVariantNames(name) {
  return [`${name}_FVO`, `${name}_Create`];
}
function updateVariantNames(name) {
  return [`${name}_MVO`, `${name}_Update`];
}

function firstExistingSchema(doc, names) {
  const schemas = schemasOf(doc);
  for (const n of names) if (schemas[n]) return { name: n, schema: schemas[n] };
  return null;
}

/* ── operation helpers ───────────────────────────────────────────────── */

function deref(doc, node) {
  return node?.$ref ? resolveRef(doc, node.$ref)?.schema ?? null : node ?? null;
}

function schemaNameFrom(schema) {
  if (!schema) return null;
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === 'array' && schema.items?.$ref) return refName(schema.items.$ref);
  return null;
}

/** OAS3: response.content['application/json'].schema | Swagger2: response.schema */
function responseSchemaName(doc, response) {
  const r = deref(doc, response);
  if (!r) return null;
  const v3 = r.content?.['application/json']?.schema;
  return schemaNameFrom(v3 ?? r.schema);
}

/** OAS3: requestBody.content[...].schema | Swagger2: parameters[in=body].schema */
function requestSchemaName(doc, operation) {
  if (!operation) return null;
  const rb = deref(doc, operation.requestBody);
  const v3 = rb?.content?.['application/json']?.schema;
  if (v3) return schemaNameFrom(v3);
  const body = (operation.parameters || [])
    .map(p => (p.$ref ? resolveRef(doc, p.$ref)?.schema ?? null : p))
    .find(p => p?.in === 'body');
  return schemaNameFrom(body?.schema);
}

/**
 * Create-payload examples, taken from the POST requestBody rather than matched by
 * name, so they are provably the ones the spec attaches to this resource. These are
 * what the seeder emits; v4/Swagger2 specs carry none (0 of 78 in the corpus), so
 * seeding is simply not generated there.
 */
/** Pull { label, value } pairs out of an OAS `examples` map or a lone `example`. */
function examplesFromMedia(doc, media, prefix) {
  const out = [];
  if (!media) return out;
  if (media.examples) {
    for (const [label, node] of Object.entries(media.examples)) {
      const resolved = node?.$ref ? resolveRef(doc, node.$ref)?.schema : node;
      const value = resolved?.value;
      if (value && typeof value === 'object') out.push({ label: `${prefix}${label}`, value });
    }
  } else if (media.example && typeof media.example === 'object') {
    out.push({ label: `${prefix}example`, value: media.example });
  }
  return out;
}

/**
 * A list example is an ARRAY of instances; each element is its own seed row.
 * Passing the array through as one payload would seed a single nonsense row.
 */
function flattenExamples(examples) {
  const out = [];
  for (const { label, value } of examples) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v && typeof v === 'object') out.push({ label: `${label}[${i}]`, value: v });
      });
    } else {
      out.push({ label, value });
    }
  }
  return out;
}

/**
 * Seed rows for a resource.
 *
 * POST request examples are the first choice - they are authored as create payloads.
 * But a READ-ONLY resource has no POST at all, and those are exactly the ones a
 * conformance kit cannot populate through the API: TMF936's /productOffering and
 * TMF931's /apiProduct declare only `get`, so their kits test /{id} against an empty
 * database and every attribute assertion fails.
 *
 * Those specs do carry GET RESPONSE examples, which are the same instances in their
 * persisted shape, so they are used as the fallback. The item response is preferred
 * over the collection because it is a single object rather than an array, and
 * response-only keys (`href`) are ignored by the builder rather than rejected.
 *
 * Not every spec has either: TMF654 carries no example anywhere, so it stays unseeded.
 */
function seedExamplesFor(doc, collection, item) {
  const post = examplesFromMedia(doc, deref(doc, collection?.post?.requestBody)?.content?.['application/json'], '');
  if (post.length) return flattenExamples(post);

  const ok = op => deref(doc, op?.responses?.['200'])?.content?.['application/json'];
  const fromItem = examplesFromMedia(doc, ok(item?.get), 'GET item: ');
  const fromList = examplesFromMedia(doc, ok(collection?.get), 'GET list: ');
  return flattenExamples([...fromItem, ...fromList]);
}

/** Path-level parameters apply to every operation on that path, in both dialects. */
function paramNames(doc, ...paramLists) {
  const seen = new Set();
  const out = [];
  for (const list of paramLists) {
    for (const raw of list || []) {
      const p = raw.$ref ? resolveRef(doc, raw.$ref)?.schema ?? null : raw;
      if (!p?.name || seen.has(`${p.in}:${p.name}`)) continue;
      seen.add(`${p.in}:${p.name}`);
      out.push({ name: p.name, in: p.in, description: p.description || '', required: !!p.required });
    }
  }
  return out;
}

function operationInfo(doc, op, pathLevelParams) {
  if (!op) return null;
  return {
    operationId: op.operationId || null,
    summary: op.summary || '',
    description: op.description || '',
    params: paramNames(doc, pathLevelParams, op.parameters).filter(p => p.in !== 'body'),
    statuses: Object.keys(op.responses || {}).filter(c => /^\d{3}$/.test(c)).sort(),
  };
}

/* ── resource discovery ──────────────────────────────────────────────── */

const isParamSeg = s => /^\{.+\}$/.test(s);

/**
 * Group paths into resources, supporting nested collections. 38 nested resource
 * paths exist in the v4 corpus, e.g.
 *   /geographicAddress/{geographicAddressId}/geographicSubAddress
 * which geographic-address-service implements as its own module - so they are
 * modelled as first-class resources carrying a parent chain.
 */
function discoverResources(doc) {
  const found = new Map(); // key -> { segments, parentSegments, collectionPath, itemPath }
  for (const p of Object.keys(doc.paths || {})) {
    const raw = p.replace(/^\//, '').split('/').filter(Boolean);
    if (!raw.length || INFRA_PATH_SEGMENTS.has(raw[0])) continue;
    const named = raw.filter(s => !isParamSeg(s));
    if (!named.length) continue;

    const key = named.join('/');
    if (!found.has(key)) {
      found.set(key, {
        segments: named,
        parentSegments: named.slice(0, -1),
        collectionPath: null,
        itemPath: null,
      });
    }
    const entry = found.get(key);
    if (isParamSeg(raw[raw.length - 1])) entry.itemPath = p;
    else entry.collectionPath = p;
  }
  return found;
}

/** Strip the variant suffix so the canonical schema (and its create/update pair) is found. */
function canonicalSchemaName(name) {
  let n = String(name || '');
  let prev;
  do {
    prev = n;
    for (const s of VARIANT_SUFFIXES) {
      if (n.endsWith(s)) { n = n.slice(0, -s.length); break; }
    }
  } while (n !== prev);
  return n;
}

/** Prefer a schema name the spec itself uses; fall back to PascalCase of the path segment. */
function resolveResourceName(doc, segment, collection, item) {
  const candidates = [
    collection?.get && responseSchemaName(doc, collection.get.responses?.['200']),
    collection?.post && requestSchemaName(doc, collection.post),
    collection?.post && responseSchemaName(doc, collection.post.responses?.['201']),
    item?.get && responseSchemaName(doc, item.get.responses?.['200']),
  ].filter(Boolean).map(canonicalSchemaName);

  const schemas = schemasOf(doc);
  for (const c of candidates) if (schemas[c]) return c;
  return candidates[0] ?? pascal(segment);
}

/* ── listeners & hub ─────────────────────────────────────────────────── */

function discoverListeners(doc, resourceCamelNames) {
  const listeners = [];
  for (const [p, ops] of Object.entries(doc.paths || {})) {
    if (!p.startsWith('/listener/')) continue;
    const eventName = p.split('/')[2];
    if (!eventName) continue;
    const base = eventName.replace(/Event$/, '');
    const owner = resourceCamelNames
      .filter(r => base.startsWith(r))
      .sort((a, b) => b.length - a.length)[0] ?? null;
    listeners.push({
      path: p,
      eventName,
      resource: owner ? pascal(owner) : null,
      eventKind: owner ? base.slice(owner.length) : base, // Create | Delete | StateChange | ...
      operationId: ops?.post?.operationId ?? null,
    });
  }
  return listeners.sort((a, b) => a.eventName.localeCompare(b.eventName));
}

function discoverHub(doc) {
  const paths = doc.paths || {};
  return {
    present: Object.keys(paths).some(p => p === '/hub' || p.startsWith('/hub/')),
    // The reference exposes GET /hub as a house convention even though specs omit it.
    specMethods: {
      post: !!paths['/hub']?.post,
      delete: !!(paths['/hub/{id}']?.delete || paths['/hub']?.delete),
      get: !!paths['/hub']?.get,
    },
  };
}

/* ── base path ───────────────────────────────────────────────────────── */

/**
 * Swagger 2.0 declares the real thing (`basePath: /tmf-api/geographicAddressManagement/v4/`),
 * verified to match this repo's constants exactly - including TMF675, whose basePath is
 * `geographicLocation/v1` where title-derivation would wrongly produce v4.
 * OAS3 v5 specs only carry a placeholder `servers[0].url`, so there it must be derived.
 */
function resolveBasePath(doc, dialect, title, version, warnings) {
  if (dialect === 'swagger2' && doc.basePath) {
    const clean = String(doc.basePath).replace(/^\/+|\/+$/g, '');
    const m = clean.match(/\/v(\d+(?:\.\d+)*)$/i);
    return { basePath: clean, major: m ? m[1].split('.')[0] : majorVersion(version), source: 'spec.basePath' };
  }
  const serverUrl = doc.servers?.[0]?.url || '';
  if (/serverRoot|localhost|example\.com/i.test(serverUrl) || !serverUrl) {
    warnings.push(
      `No usable base path in the spec (servers[0].url = ${serverUrl || 'absent'}); ` +
      `derived from info.title instead - verify it, or pass --base-path.`,
    );
  }
  const major = majorVersion(version);
  return { basePath: `tmf-api/${apiName(title)}/v${major}`, major, source: 'derived from info.title' };
}

/* ── main ────────────────────────────────────────────────────────────── */

export function buildIR({ doc, dialect, specPath }, options = {}) {
  const warnings = [];
  const overrides = options.overrides || {};
  const schemas = schemasOf(doc);

  const title = doc.info?.title || '';
  const version = doc.info?.version || '';
  const tmf = options.tmfNumber || tmfNumber(specPath) || tmfNumber(title);
  if (!tmf) warnings.push('Could not derive TMF number from spec path or title; pass --tmf.');

  const resolved = resolveBasePath(doc, dialect, title, version, warnings);
  const basePath = options.basePath || resolved.basePath;

  // v4 titles are decorated ('API Place - GeographicAddress v4.0.1'), so the exchange
  // name comes from the base path's api segment, which is stable across both dialects.
  const apiSegment = basePath.split('/').filter(Boolean)[1] || apiName(title);
  const exchange = exchangeBase(apiSegment);

  const discovered = discoverResources(doc);
  const resources = [];

  for (const [key, paths] of discovered) {
    const collection = paths.collectionPath ? doc.paths[paths.collectionPath] : null;
    const item = paths.itemPath ? doc.paths[paths.itemPath] : null;
    const segment = paths.segments[paths.segments.length - 1];
    const name = resolveResourceName(doc, segment, collection, item);
    const schema = schemas[name];
    if (!schema) {
      warnings.push(`Resource ${name} (path /${key}) has no schema definition; skipped.`);
      continue;
    }

    const flat = flattenSchema(doc, schema);
    const fields = [];
    const flattenedRefs = [];
    const subResources = [];
    const infra = [];

    for (const [propName, propSchema] of Object.entries(flat.properties)) {
      const c = classifyProperty(doc, propName, propSchema, { required: flat.required });
      if (c.kind === 'infra') { infra.push(propName); continue; }
      if (c.kind === 'subResource') {
        subResources.push(expandSubResource(doc, name, c, 1, overrides));
        continue;
      }
      if (c.kind === 'flattenedRef') flattenedRefs.push(c);
      else fields.push(c);
    }

    const createVariant = firstExistingSchema(doc, createVariantNames(name));
    const updateVariant = firstExistingSchema(doc, updateVariantNames(name));
    if (!createVariant) {
      warnings.push(`No ${name}_FVO/_Create schema; create DTO must be derived from the resource schema.`);
    }
    if (!updateVariant) {
      warnings.push(`No ${name}_MVO/_Update schema; update DTO must be derived from the resource schema.`);
    }

    const shapeOf = variant => {
      if (!variant) return null;
      const f = flattenSchema(doc, variant.schema);
      return {
        schemaName: variant.name,
        required: f.required,
        properties: Object.keys(f.properties),
        omitsHref: !Object.prototype.hasOwnProperty.call(f.properties, 'href'),
        allowsClientId: Object.prototype.hasOwnProperty.call(f.properties, 'id'),
      };
    };

    const scalarNames = new Set(fields.map(f => f.name));
    const houseFilters = {
      // only emit a filter when the column will actually exist
      name: scalarNames.has('name'),
      q: scalarNames.has('name') || scalarNames.has('description'),
      sort: true,
      lifecycleStatus: scalarNames.has('lifecycleStatus'),
    };
    if (!houseFilters.lifecycleStatus) {
      warnings.push(
        `${name} has no lifecycleStatus field; lifecycleStatus filter and column are NOT emitted ` +
        `(database-pattern.md lists it as mandatory - applied conditionally on purpose).`,
      );
    }

    const pathParams = {
      collection: collection?.parameters || [],
      item: item?.parameters || [],
    };

    const ops = {
      list: operationInfo(doc, collection?.get, pathParams.collection),
      create: operationInfo(doc, collection?.post, pathParams.collection),
      retrieve: operationInfo(doc, item?.get, pathParams.item),
      update: operationInfo(doc, item?.patch ?? item?.put, pathParams.item),
      delete: operationInfo(doc, item?.delete, pathParams.item),
    };
    const missing = Object.entries(ops).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      warnings.push(`${name} spec declares no ${missing.join('/')} operation; those routes are NOT emitted.`);
    }

    // The spec's own name is what the schema lookups above needed (`<name>_FVO`);
    // from here on the name is a TypeScript identifier, so it has to be a legal one.
    // `specName` is retained because sibling-reference matching below compares
    // against schema names, not class names.
    const className = identifier(name);
    resources.push({
      name: className,
      specName: name,
      camelName: camel(className),
      kebabName: kebab(className),
      tableName: overrides[name]?.tableName ?? snake(className),
      pathSegment: segment,
      pathKey: key,
      parentSegments: paths.parentSegments,
      nested: paths.parentSegments.length > 0,
      description: flat.description || '',
      composedFrom: [...new Set(flat.sources)],
      required: flat.required,
      infraFields: infra,
      fields,
      flattenedRefs,
      resourceRefs: [],
      subResources,
      createShape: shapeOf(createVariant),
      updateShape: shapeOf(updateVariant),
      houseFilters,
      seedExamples: seedExamplesFor(doc, collection, item),
      operations: ops,
      paths: { collection: paths.collectionPath, item: paths.itemPath },
    });
  }

  /**
   * Second pass: a single ref whose target is ANOTHER RESOURCE OF THIS SAME COMPONENT
   * is a real foreign key, not flattened columns - which is what the golden reference
   * does (Partnership.specification is @ManyToOne -> PartnershipSpecification, not 7
   * prefixed columns). Cross-component refs stay flattened, because no FK can span
   * services. The check is purely structural, so it needs no human judgement.
   */
  // keyed by the SPEC name: `fr.targetRef` is a schema name, which is what the spec
  // wrote, not the sanitised class name
  const resourceNames = new Map(resources.map(r => [r.specName ?? r.name, r]));
  for (const r of resources) {
    const keep = [];
    for (const fr of r.flattenedRefs) {
      const target = fr.targetRef ? canonicalSchemaName(fr.targetRef.replace(/Ref$/, '')) : null;
      const sibling = target && target !== (r.specName ?? r.name) ? resourceNames.get(target) : null;
      if (!sibling) { keep.push(fr); continue; }
      r.resourceRefs.push({
        name: fr.name,
        targetResource: sibling.name,
        targetTable: sibling.tableName,
        relation: 'many-to-one',
        joinColumn: `${snake(fr.name)}_id`,
        required: r.required.includes(fr.name),
        description: fr.description,
        // retained so the response mapper knows which ref properties to project back
        projectedProps: fr.columns.map(c => c.sourceProp),
        // The schema this property points at, e.g. 'OpenGatewayProductSpecificationRef'.
        // TMF v5 marks '@type' REQUIRED on every Ref schema (it is the discriminator),
        // and the value the specs use in their own examples is this schema's name - not
        // the referred entity's name, which is what '@referredType' carries.
        refSchema: fr.targetRef || null,
      });
    }
    r.flattenedRefs = keep;
  }

  const listeners = discoverListeners(doc, resources.map(r => r.camelName));
  for (const r of resources) {
    r.notificationEvents = listeners
      .filter(l => l.resource === r.name)
      .map(l => ({
        eventName: l.eventName,
        eventKind: l.eventKind,
        enumMember: `${snake(r.name).toUpperCase()}_${snake(l.eventKind).toUpperCase()}`,
      }));
  }
  const orphanListeners = listeners.filter(l => !l.resource);
  if (orphanListeners.length) {
    warnings.push(`Listener paths not matched to any resource: ${orphanListeners.map(l => l.eventName).join(', ')}`);
  }

  return {
    meta: {
      tmfNumber: tmf,
      specTitle: title,
      specVersion: version,
      versionMajor: resolved.major,
      dialect,
      basePath,
      basePathSource: options.basePath ? 'cli override' : resolved.source,
      basePathConstant: `TMF${tmf}_BASE_PATH`,
      eventExchange: `${exchange}.events`,
      eventExchangeConstant: `TMF${tmf}_EVENT_EXCHANGE`,
      eventTypeEnum: `${pascal(exchange)}EventType`,
      serviceNameSuggestion: `${kebab(exchange)}-service`,
      sourceSpec: specPath.replace(/\\/g, '/'),
      generatorVersion: '0.1.0',
    },
    resources,
    hub: discoverHub(doc),
    listeners,
    warnings,
  };
}
