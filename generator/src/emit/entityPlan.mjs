import { pascal, snake, camel } from '../ir/naming.mjs';

/**
 * IR -> a flat list of entity descriptors ready for rendering.
 *
 * NORMALISATION (refStrategy, default 'table')
 * --------------------------------------------
 * A single-valued ref is given its OWN TABLE rather than being flattened into
 * prefixed columns on the parent. Flattening puts attributes of the *referenced*
 * thing into the referring row (submittedGeographicAddressCity depends on the
 * address, not on the validation), which is a transitive dependency and breaks 3NF.
 *
 * refStrategy: 'flatten' restores the old behaviour if wide tables are preferred
 * over joins; both forms keep `sourceProp` per column and stay invertible.
 *
 * SOFT DELETE (softDelete, default 'roots')
 * -----------------------------------------
 * Aggregate roots carry the soft-delete triplet. Owned children do NOT, and that is
 * deliberate: their lifecycle is bound to the parent by cascade, and the service
 * replaces collections wholesale on update (delete-then-reinsert, per the
 * reference). Soft-deleting rows that are re-inserted on every update would pile up
 * dead rows with no way to tell a historical row from a current one. 'all' is
 * available but implies M4 must switch to diff-merge instead of replace.
 *
 * NAMING
 * ------
 * Entities carry a stable `key` and a list of `nameCandidates`; final class/table
 * names are assigned centrally (resolveEntityNames) so duplicates can be merged and
 * PostgreSQL's 63-byte identifier limit enforced.
 */

const PK_COLUMN = { type: 'varchar', length: 36 };
const TRAILER_PROPS = ['@type', '@baseType', '@schemaLocation'];
const GENERIC_REF_NAMES = new Set(['Entity', 'EntityRef', 'BaseRef', 'Addressable', 'Extensible', 'Ref', 'Any']);

/**
 * Spec schema names that must never become class names: they shadow JavaScript
 * globals (TMF675 really does define a schema called `Object`, which produced a
 * class that broke `Object.keys` and failed to compile) or collide with reserved
 * words. Such a name falls through to the parent-scoped synthesised name.
 */
const UNUSABLE_NAMES = new Set([
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Date', 'Error',
  'Map', 'Set', 'Promise', 'Symbol', 'JSON', 'Math', 'RegExp', 'Infinity', 'NaN',
  'Class', 'Interface', 'Enum', 'Type', 'Void', 'Null', 'Undefined', 'Any',
  // hardcoded infra entity classes (see scaffold/newService.mjs entitiesBarrel)
  'EventSubscription', 'EventLog',
]);

const PG_IDENTIFIER_LIMIT = 63;
const SQLITE_MAX_JOIN_TABLES = 64; // sqlite.org/limits.html #9: max tables in a join

/**
 * SQLite's query planner refuses to compile a SELECT touching more than 64
 * tables (root + every LEFT JOINed child/ref/sibling-resource entity). This
 * is a hard compile error at query time under sqlite, harmless under
 * postgres - callers should only check this when the resolved database
 * target is (or defaults to) sqlite.
 *
 * @param {string} resourceName
 * @param {number} tableCount root + non-root entities + resourceRefs
 * @returns {string|null} a warning message, or null if under the limit
 */
export function checkSqliteJoinLimit(resourceName, tableCount) {
  if (tableCount <= SQLITE_MAX_JOIN_TABLES) return null;
  return (
    `${resourceName}: findAll() would join ${tableCount} tables, over SQLite's ` +
    `${SQLITE_MAX_JOIN_TABLES}-table join limit; the query will fail to compile at runtime ` +
    `under sqlite - target postgres with --database postgres, or reduce nesting`
  );
}

function refNameCandidates(parentClass, fieldName, targetRef) {
  const usable = targetRef && !GENERIC_REF_NAMES.has(targetRef) && !UNUSABLE_NAMES.has(targetRef);
  const specName = usable ? targetRef : null;
  const fieldPascal = pascal(fieldName);
  // same anti-stutter rule as sub-resources (see ir/nesting.mjs)
  const base = fieldPascal.startsWith(parentClass) ? fieldPascal : `${parentClass}${fieldPascal}`;
  const synthesised = /Ref$/.test(targetRef || '') && !/ref$/i.test(fieldName) ? `${base}Ref` : base;
  return specName ? [specName, synthesised] : [synthesised];
}

function tmfTrailer(isRoot, defaultType) {
  return [
    {
      name: 'atType', tsType: 'string', expose: '@type',
      column: { type: 'varchar', length: 100, ...(isRoot ? { default: defaultType } : { nullable: true }) },
      optional: !isRoot, immutable: true,
    },
    {
      name: 'atSchemaLocation', tsType: 'string', expose: '@schemaLocation',
      column: { type: 'varchar', length: 1000, nullable: true }, optional: true, immutable: true,
    },
    {
      name: 'atBaseType', tsType: 'string', expose: '@baseType',
      column: { type: 'varchar', length: 100, nullable: true }, optional: true, immutable: true,
    },
  ];
}

const softDeleteColumns = () => ([
  { name: 'deletedAt', tsType: 'Date', deleteDateColumn: true, optional: true },
  { name: 'deletedBy', tsType: 'string', column: { type: 'varchar', length: 100, nullable: true }, optional: true },
  { name: 'deletedReason', tsType: 'string', column: { type: 'varchar', length: 255, nullable: true }, optional: true },
]);

const auditColumns = () => ([
  { name: 'createdDate', tsType: 'Date', createDateColumn: true },
  { name: 'lastUpdate', tsType: 'Date', updateDateColumn: true },
]);

/**
 * Housekeeping columns (audit/soft-delete) are named independently of the spec, so
 * a TMF resource that happens to declare its own field under the same name (TMF737's
 * `lastUpdate` is a real, patchable, client-visible scalar - not our internal
 * @UpdateDateColumn) would otherwise produce two class members with the same name,
 * which TypeScript rejects outright. The spec-declared field always wins: it carries
 * real wire semantics (description, patchability) that our housekeeping column does
 * not, so the housekeeping column is dropped rather than the other way round.
 */
function withoutNameCollisions(existingColumns, extraColumns) {
  const used = new Set(existingColumns.map(c => c.name));
  return extraColumns.filter(c => !used.has(c.name));
}

/**
 * The generated back-reference to a child/sub-entity's parent is always called
 * `owner` - but TMF908's ExternalIdentifier spec declares its own scalar field
 * named `owner` ("Name of the external system that owns the entity"). Same
 * class of bug as the lastUpdate collision above: the spec-declared field wins,
 * so the structural relation is renamed out of its way instead.
 */
function ownerPropertyFor(fields) {
  const used = new Set((fields ?? []).map(f => f.name));
  if (!used.has('owner')) return 'owner';
  let candidate = 'ownerRef';
  let i = 2;
  while (used.has(candidate)) candidate = `ownerRef${i++}`;
  return candidate;
}

/**
 * Column nullability honours BOTH the resource schema's `required` and the create
 * payload's. TMF resource schemas typically require only `@type`, while `Foo_FVO`
 * requires the real mandatory fields - so deriving from the resource alone would
 * leave `name` nullable on a column the API always supplies. The reference makes it
 * NOT NULL, and so do we.
 */
function fieldToColumn(f, requiredSet = null) {
  // `required` in the OAS schema lists the WIRE name (e.g. '@valueSchemaLocation'),
  // not the sanitised TS identifier classifyProperty produced for it - match on
  // whichever wire name this field actually carries.
  const wireName = f.expose || f.name;
  const required = f.nullable === false || (requiredSet?.has(wireName) ?? false);
  return {
    name: f.name,
    tsType: f.tsType,
    column: { ...f.column, ...(required ? {} : { nullable: true }) },
    optional: !required,
    description: f.description || '',
    enumValues: f.enumValues || null,
    // carries the WIRE name for the inverse mapping: without it a reference
    // wrapper's refId/referredType columns were serialised under their column
    // names instead of `id` / `@referredType`.
    sourceProp: f.sourceProp,
    // an '@'-prefixed field (e.g. '@valueSchemaLocation') got a sanitised TS name
    // above; carry the original wire name through so the entity/DTO round-trip it.
    expose: f.expose,
    // a field literally named `version` is server-managed (see service.mjs's
    // renderBuilder/update templates), never trusted from client input.
    isVersion: f.name === 'version',
  };
}

function refToPlan(parentKey, parentClassHint, fr, opts, out) {
  if (opts.refStrategy === 'flatten') {
    return {
      columns: fr.columns.map(c => ({
        name: c.name,
        tsType: c.tsType,
        column: { ...c.column, nullable: true },
        optional: true,
        sourceProp: c.sourceProp,
        refField: fr.name,
      })),
      relations: [],
    };
  }

  const key = `${parentKey}.${fr.name}`;
  const ov = opts.overrides?.[key];
  const columns = [
    // the ref row's own surrogate key
    { name: 'id', tsType: 'string', primary: true, column: { ...PK_COLUMN } },
    ...fr.columns
      .filter(c => !TRAILER_PROPS.includes(c.sourceProp))
      .map(c => ({
        // The REFERENCED entity's id is not this row's identity, so it cannot also
        // be called `id`. The reference solves this the same way, with `refId`
        // (see RoleSpecAgreementSpecRef).
        name: c.sourceProp === 'id' ? 'refId' : camel(c.sourceProp.replace(/^@/, '')),
        tsType: c.tsType,
        column: { ...c.column, nullable: true },
        optional: true,
        sourceProp: c.sourceProp,
      })),
  ];

  out.push({
    key,
    nameCandidates: ov?.className
      ? [ov.className]
      : refNameCandidates(parentClassHint, fr.name, fr.targetRef),
    tableNameOverride: ov?.tableName,
    kind: 'ref',
    ownerKey: parentKey,
    ownerField: fr.name,
    targetRef: fr.targetRef,
    description: fr.description || '',
    columns: [...columns, ...tmfTrailer(false, null)],
    relations: [],
    softDelete: opts.softDelete === 'all',
    audit: false,
  });

  // FK lives on the parent: a plain many-to-one, which TypeORM handles without an
  // inverse side. Orphan cleanup on update is the service's job (M4).
  return {
    columns: [],
    relations: [{
      kind: 'many-to-one-ref',
      property: fr.name,
      targetKey: key,
      joinColumn: `${snake(fr.name)}_id`,
      nullable: true,
    }],
  };
}

function expandSub(sub, parentKey, parentClassHint, opts, out) {
  const key = `${parentKey}.${sub.propertyName}`;
  const ov = opts.overrides?.[key];
  const classHint = sub.nameCandidates?.[0] ?? sub.className;

  const columns = [{ name: 'id', tsType: 'string', primary: true, column: { ...PK_COLUMN } }];
  const relations = [{
    kind: 'many-to-one-owner',
    property: ownerPropertyFor(sub.fields),
    targetKey: parentKey,
    inverse: sub.propertyName,
    joinColumnFrom: parentKey,
  }];

  for (const f of sub.fields) columns.push(fieldToColumn(f));

  for (const fr of sub.flattenedRefs) {
    const r = refToPlan(key, classHint, fr, opts, out);
    columns.push(...r.columns);
    relations.push(...r.relations);
  }

  for (const child of sub.children) {
    relations.push({
      kind: 'one-to-many',
      property: child.propertyName,
      targetKey: `${key}.${child.propertyName}`,
      inverse: ownerPropertyFor(child.fields),
    });
    expandSub(child, key, classHint, opts, out);
  }

  if (opts.softDelete === 'all') columns.push(...withoutNameCollisions(columns, softDeleteColumns()));

  out.push({
    key,
    nameCandidates: ov?.className ? [ov.className] : (sub.nameCandidates ?? [sub.className]),
    tableNameOverride: ov?.tableName,
    kind: 'child',
    refLike: !!sub.refLike,
    ownerKey: parentKey,
    ownerField: sub.propertyName,
    description: sub.description || '',
    columns: [...columns, ...tmfTrailer(false, null)],
    relations,
    softDelete: opts.softDelete === 'all',
    audit: false,
    minItems: sub.minItems,
    // natural identity for correlating "the same logical row" across a
    // wholesale delete+rebuild on update (see service.mjs's version carry-forward):
    // a ref wrapper's own row id is internal (fresh uuid every rebuild), so the
    // client-visible identity is the REFERRED id, stored as `refId`; an owned
    // entity's own `id` column IS client-suppliable (see refToPlan/renderBuilder).
    correlationColumn: sub.refLike ? 'refId' : 'id',
    correlationWireKey: 'id',
    requiredFields: sub.requiredFields ?? [],
  });
}

export function buildEntityPlan(resource, options = {}) {
  const opts = {
    refStrategy: options.refStrategy ?? 'table',
    softDelete: options.softDelete ?? 'roots',
    overrides: options.overrides ?? {},
  };
  const extra = [];
  const warnings = [];
  const rootKey = resource.name;

  // required = resource schema OR create payload (see fieldToColumn)
  const requiredSet = new Set([
    ...(resource.required ?? []),
    ...(resource.createShape?.required ?? []),
  ]);

  const columns = [{ name: 'id', tsType: 'string', primary: true, column: { ...PK_COLUMN } }];
  const relations = [];

  for (const f of resource.fields) columns.push(fieldToColumn(f, requiredSet));

  for (const fr of resource.flattenedRefs) {
    const r = refToPlan(rootKey, resource.name, fr, opts, extra);
    columns.push(...r.columns);
    relations.push(...r.relations);
  }

  // sibling-resource refs are real foreign keys to that resource's own table
  for (const rr of resource.resourceRefs) {
    relations.push({
      kind: 'many-to-one-resource',
      property: rr.name,
      targetKey: rr.targetResource,
      joinColumn: rr.joinColumn,
      nullable: !rr.required,
      projectedProps: rr.projectedProps,
    });
  }

  for (const sub of resource.subResources) {
    relations.push({
      kind: 'one-to-many',
      property: sub.propertyName,
      targetKey: `${rootKey}.${sub.propertyName}`,
      inverse: ownerPropertyFor(sub.fields),
      minItems: sub.minItems,
    });
    expandSub(sub, rootKey, resource.name, opts, extra);
  }

  const root = {
    key: rootKey,
    nameCandidates: [resource.name],
    kind: 'root',
    description: resource.description || '',
    columns: [
      ...columns,
      ...withoutNameCollisions(columns, softDeleteColumns()),
      ...withoutNameCollisions(columns, auditColumns()),
      ...tmfTrailer(true, resource.name),
    ],
    relations,
    softDelete: true,
    audit: true,
    tableNameOverride: resource.tableName,
    // the root's own PK is always the client-suppliable `id` - see expandSub's
    // correlationColumn note for why this concept exists.
    correlationColumn: 'id',
    correlationWireKey: 'id',
    requiredFields: resource.required ?? [],
  };

  if (opts.refStrategy === 'table' && resource.flattenedRefs.length) {
    warnings.push(
      `${resource.name}: ${resource.flattenedRefs.length} single ref(s) normalised into ` +
      `their own table(s); the service must clean up orphaned ref rows on update (M4)`,
    );
  }

  return { entities: [root, ...extra], warnings, options: opts };
}

/** Stable fingerprint of an entity's shape, used to merge genuine duplicates. */
function shapeHash(entity) {
  return JSON.stringify({
    cols: entity.columns.map(c => [c.name, c.column?.type ?? null, c.column?.length ?? null, !!c.primary]),
    // The OWNER is part of a child's identity: two children with identical columns
    // but different parents are different tables, because their FK points elsewhere.
    // Merging them made the shared class demand an owner of the wrong type.
    // Refs carry no owner relation, so they still merge freely - which is the case
    // worth merging (one PolicyVariableRef table for every field that refs it).
    rels: entity.relations.map(r =>
      r.kind === 'many-to-one-owner' ? [r.kind, r.property, r.targetKey] : [r.kind, r.property]),
  });
}

/**
 * Assign final class/table names across ALL resources of a service.
 *
 * - first unused candidate wins
 * - a candidate already taken by an entity with an identical shape is REUSED
 *   (two resources referencing the same PolicyRef share one normalised table)
 * - a name clash with a different shape falls through to the next candidate
 * - a table name over PostgreSQL's 63-byte limit is a hard error, never a silent
 *   truncation
 *
 * @returns {{names: Map<string,{className:string,tableName:string}>, merged: string[], errors: string[]}}
 */
export function resolveEntityNames(allEntities) {
  const byName = new Map();   // className -> { hash, key }
  const byTable = new Map();  // tableName -> className
  const names = new Map();    // key -> { className, tableName }
  const merged = [];
  const errors = [];
  const collisions = [];

  // Roots first: a resource must keep its natural name and table. Without this a
  // sub-entity named after the same schema (GeographicAddressValidation's nested
  // GeographicAddress) could claim `geographic_address` and force the real resource
  // to a suffixed class name while both still pointed at the same table.
  const ordered = [
    ...allEntities.filter(e => e.kind === 'root'),
    ...allEntities.filter(e => e.kind !== 'root'),
  ];

  for (const entity of ordered) {
    const hash = shapeHash(entity);
    let chosen = null;

    for (const candidate of entity.nameCandidates) {
      const taken = byName.get(candidate);
      if (!taken) { chosen = candidate; break; }
      if (taken.hash === hash) {
        // identical shape: share the table rather than duplicating it
        names.set(entity.key, names.get(taken.key));
        merged.push(`${entity.key} -> reuses ${candidate}`);
        chosen = null;
        break;
      }
    }
    if (names.has(entity.key)) continue;

    if (!chosen) {
      // Every candidate is taken by a different shape. Prefer the SHORTEST base and
      // add a numeric suffix: since children no longer merge across owners, the
      // full parent-chain name is often long enough to break the 63-byte table
      // limit, while `GeographicSubAddress2` stays short and still unique.
      const bases = [...entity.nameCandidates].sort((a, b) => a.length - b.length);
      for (const base of bases) {
        for (let i = 2; i < 50; i++) {
          const candidate = `${base}${i}`;
          if (byName.has(candidate)) continue;
          if (snake(candidate).length > PG_IDENTIFIER_LIMIT) break;
          chosen = candidate;
          break;
        }
        if (chosen) break;
      }
      chosen = chosen ?? entity.nameCandidates[entity.nameCandidates.length - 1];
    }

    // Table names must be unique too. The root's override is honoured, but a
    // non-root that would collide gets suffixed - two entities sharing a table is
    // a broken schema, not a merge.
    let tableName = entity.tableNameOverride ?? snake(chosen);
    const explicitTable = entity.tableNameOverride !== undefined;
    if (!explicitTable && byTable.has(tableName)) {
      const base = snake(entity.nameCandidates[entity.nameCandidates.length - 1]);
      let candidate = base;
      let i = 2;
      while (byTable.has(candidate)) candidate = `${base}_${i++}`;
      collisions.push(
        `table "${tableName}" already used by ${byTable.get(tableName)}; ` +
        `${entity.key} renamed to "${candidate}" - if these are meant to be the same ` +
        `entity, model it as a relation to that resource instead`,
      );
      tableName = candidate;
    }
    if (tableName.length > PG_IDENTIFIER_LIMIT) {
      errors.push(
        `table name "${tableName}" is ${tableName.length} chars, over PostgreSQL's ` +
        `${PG_IDENTIFIER_LIMIT}-byte identifier limit (entity ${entity.key}); ` +
        `add an override in tmfgen.config.json`,
      );
    }
    byName.set(chosen, { hash, key: entity.key });
    byTable.set(tableName, chosen);
    names.set(entity.key, { className: chosen, tableName });
  }

  return { names, merged, errors, collisions };
}
