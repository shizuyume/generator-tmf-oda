import { flattenSchema, scalarProps, refName, resolveRef } from '../ingest/schemaUtils.mjs';
import { pascal, camel, snake } from './naming.mjs';
import { mapScalar, SIMPLE_JSON } from './typeMap.mjs';

/**
 * THE SINGLE NESTING RULE.
 *
 * The golden reference flattens nested objects three different ways, chosen by hand,
 * which is precisely why its toResponse() cannot be derived. Committing to one rule
 * makes un-flattening the mechanical inverse of flattening, so toResponse() becomes
 * fully generated:
 *
 *   array of object/$ref  -> sub-entity (own table, OneToMany/ManyToOne)
 *   single object/$ref    -> flattened into prefixed columns on the parent
 *   array of scalar       -> simple-json
 *   free-form object      -> simple-json
 *   scalar                -> plain column
 *
 * TMF @-metadata (@type/@baseType/@schemaLocation) and id/href are classified 'infra':
 * they are already part of the invariant entity trailer, so they must not be emitted
 * twice as domain fields.
 */

const INFRA_FIELDS = new Set(['id', 'href', '@type', '@baseType', '@schemaLocation', '@referredType']);

function isFreeForm(schema) {
  if (!schema) return true;
  if (schema.$ref || schema.allOf) return false;
  if (schema.properties) return false;
  if (schema.additionalProperties) return true;
  return schema.type === 'object' || schema.type === undefined;
}

/**
 * Follow a $ref chain to the concrete schema node.
 *
 * Necessary because TMF routinely refs *scalar* definitions, not just objects:
 *   state: { $ref: '#/definitions/TaskStateType' }   ->  { type: 'string', enum: [...] }
 * Treating those as objects would turn every lifecycle/status enum into simple-json.
 * Array-typed definitions (position, polygon) are refd the same way.
 */
function resolveEffective(doc, schema, depth = 0) {
  if (!schema?.$ref || depth > 8) return { schema, refTarget: null };
  const resolved = resolveRef(doc, schema.$ref);
  if (!resolved) return { schema, refTarget: null };
  const deeper = resolveEffective(doc, resolved.schema, depth + 1);
  return {
    // keep the referring node's description if the target has none
    schema: { ...deeper.schema, description: schema.description || deeper.schema?.description || '' },
    refTarget: deeper.refTarget ?? resolved.name,
  };
}

function isScalar(schema) {
  return schema && !schema.$ref && !schema.allOf && !schema.properties &&
    ['string', 'integer', 'number', 'boolean'].includes(schema.type);
}

/**
 * @returns {{kind:string, ...}} classification of one property
 */
export function classifyProperty(doc, fieldName, rawSchema, ctx) {
  if (INFRA_FIELDS.has(fieldName)) {
    return { kind: 'infra', name: fieldName };
  }

  // A property name starting with '@' beyond the standard trailer (@type/@baseType/
  // @schemaLocation/@referredType, handled above as 'infra') is real TMF wire syntax
  // (e.g. ResourceSpecCharacteristic's `@valueSchemaLocation`), but `@foo` is not a
  // legal TypeScript identifier - emitting it verbatim as a class member or DTO
  // property name is a syntax error, not just a lint nit. Sanitise it the same way
  // the invariant trailer does (atType, atBaseType, ...) and carry the original wire
  // name via `expose` so the DTO/entity/service still round-trip the real JSON key.
  //
  // The same applies to ANY property name that is not a legal identifier, not just
  // '@'-prefixed ones. TMF924 declares `NB-IoTSupport`; a hyphen makes it a
  // subtraction in a class body:
  //
  //   NB-IoTSupport?: Record<string, any>;
  //     ~ error TS1068: Unexpected token. A constructor, method, accessor, or
  //       property was expected.
  //
  // Both cases are handled identically: a safe TS name plus `expose` carrying the
  // real JSON key, so the wire contract is unchanged.
  const atMatch = /^@(.+)/.exec(fieldName);
  const legalIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fieldName);
  const safeName = atMatch
    ? `at${pascal(atMatch[1])}`
    : (legalIdentifier ? fieldName : camel(fieldName));
  const exposeName = atMatch || !legalIdentifier ? fieldName : undefined;

  // A $ref may point at a scalar, an array, or an object - resolve before branching.
  const { schema: effective, refTarget } = resolveEffective(doc, rawSchema);
  const schema = isScalar(effective) || effective?.type === 'array' ? effective : rawSchema;

  // ── $ref to a scalar (enum / plain type) ──
  if (isScalar(effective)) {
    const mapped = mapScalar(fieldName, effective);
    return {
      kind: 'scalar',
      name: safeName,
      ...(exposeName ? { expose: exposeName } : {}),
      tsType: mapped.tsType,
      column: mapped.column,
      validators: mapped.validators,
      enumValues: mapped.enumValues,
      enumRef: refTarget,
      nullable: !(ctx?.required || []).includes(fieldName),
      description: effective.description || '',
    };
  }

  // ── arrays ──
  if (schema?.type === 'array') {
    const items = schema.items || {};
    if (isScalar(items)) {
      return {
        kind: 'json', name: safeName, ...(exposeName ? { expose: exposeName } : {}),
        tsType: `${mapScalar(fieldName, items).tsType}[]`,
        column: { ...SIMPLE_JSON }, nullable: true, reason: 'array of scalar',
      };
    }
    if (isFreeForm(items)) {
      return {
        kind: 'json', name: safeName, ...(exposeName ? { expose: exposeName } : {}),
        tsType: 'Record<string, any>[]',
        column: { ...SIMPLE_JSON }, nullable: true, reason: 'array of unmodelled object',
      };
    }
    return {
      kind: 'subResource',
      name: safeName,
      itemRef: items.$ref ? refName(items.$ref) : null,
      itemSchema: items,
      minItems: schema.minItems ?? null,
      description: schema.description || '',
    };
  }

  // ── single object / $ref ──
  if (schema?.$ref || schema?.allOf || schema?.properties) {
    const props = scalarProps(doc, schema);
    const keys = Object.keys(props);
    if (!keys.length) {
      return {
        kind: 'json', name: safeName, ...(exposeName ? { expose: exposeName } : {}),
        tsType: 'Record<string, any>',
        column: { ...SIMPLE_JSON }, nullable: true, reason: 'object with no scalar props',
      };
    }
    return {
      kind: 'flattenedRef',
      name: safeName,
      targetRef: schema.$ref ? refName(schema.$ref) : null,
      description: schema.description || '',
      // prefixed columns; `sourceProp` is what makes the inverse (toResponse) mechanical
      columns: keys.map(prop => {
        const mapped = mapScalar(prop, props[prop]);
        return {
          name: `${camel(fieldName)}${pascal(prop)}`,
          sourceProp: prop,
          tsType: mapped.tsType,
          column: mapped.column,
          nullable: true,
        };
      }),
    };
  }

  if (isFreeForm(schema)) {
    return {
      kind: 'json', name: safeName, ...(exposeName ? { expose: exposeName } : {}),
      tsType: 'Record<string, any>',
      column: { ...SIMPLE_JSON }, nullable: true, reason: 'free-form',
    };
  }

  // ── scalar ──
  const mapped = mapScalar(fieldName, schema);
  return {
    kind: 'scalar',
    name: safeName,
    ...(exposeName ? { expose: exposeName } : {}),
    tsType: mapped.tsType,
    column: mapped.column,
    validators: mapped.validators,
    enumValues: mapped.enumValues,
    nullable: !(ctx?.required || []).includes(fieldName),
    description: schema.description || '',
  };
}

/**
 * Expand a sub-resource into a full entity descriptor. Recurses one more level:
 * a nested array inside a sub-resource becomes another sub-entity (the golden
 * reference proves 2 levels), a nested single ref becomes flattened columns.
 */
/**
 * Schema names that are too generic to use as an entity name: they appear in many
 * unrelated places and would collide. Anything else, the spec's own name wins.
 */
const GENERIC_REF_NAMES = new Set([
  'Entity', 'EntityRef', 'BaseRef', 'Addressable', 'Extensible', 'Ref', 'Any',
]);

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
]);


/**
 * Prefer the name the SPEC gives the item schema, falling back to a synthesised
 * parent-scoped name. This is what the reference does - Partnership.partner items
 * $ref Partner -> class `Partner`, while Partner.account items $ref BaseRef (too
 * generic) -> synthesised `PartnerAccountRef`.
 *
 * It also keeps identifiers short. Accumulating the whole ancestor chain produced
 * `party_rev_sharing_algorithm_condition_variable_policy_condition_variable_ref`
 * at 76 chars, past PostgreSQL's 63-byte identifier limit, where it would be
 * silently truncated and could collide.
 */
export function subResourceNameCandidates(parentPrefix, sub) {
  const usable = sub.itemRef && !GENERIC_REF_NAMES.has(sub.itemRef) && !UNUSABLE_NAMES.has(sub.itemRef);
  const specName = usable ? sub.itemRef : null;
  const suffix = /Ref$/.test(sub.itemRef || '') && !/Ref$/i.test(sub.name) ? 'Ref' : '';
  // Avoid stuttering: checkProductOfferingQualification.checkProductOfferingQualificationItem
  // must not become CheckProductOfferingQualificationCheckProductOfferingQualificationItem,
  // which blows past PostgreSQL's 63-byte table-name limit.
  const fieldPascal = pascal(sub.name);
  const synthesised = fieldPascal.startsWith(parentPrefix)
    ? `${fieldPascal}${suffix}`
    : `${parentPrefix}${fieldPascal}${suffix}`;
  return specName ? [specName, synthesised] : [synthesised];
}

/**
 * A sub-resource whose item schema composes `EntityRef` is a REFERENCE WRAPPER, not
 * an owned entity: its `id`/`href`/`@referredType` describe the *referred* entity
 * (EntityRef documents them as "the identifier of the referred entity"). Those were
 * being stripped as infra, so `policy[]` lost `href` and `@referredType` on the way
 * out - which the TMF736 conformance profile lists as mandatory in responses.
 *
 * An owned entity composes `Entity` instead (PartyRevSharingPolicyConditionVariable),
 * and there `id` really is its own identity.
 */
const REF_WRAPPER_BASE = 'EntityRef';

export function expandSubResource(doc, parentPrefix, sub, depth, overrides = {}) {
  const flat = flattenSchema(doc, sub.itemSchema);
  const refLike = flat.sources.includes(REF_WRAPPER_BASE);
  const explicit = overrides[`${parentPrefix}.${sub.name}`];
  const candidates = subResourceNameCandidates(parentPrefix, sub);
  const className = explicit?.className ?? candidates[0];
  const tableName = explicit?.tableName ?? snake(className);

  const fields = [];
  const flattenedRefs = [];
  const children = [];

  for (const [propName, propSchema] of Object.entries(flat.properties)) {
    const c = classifyProperty(doc, propName, propSchema, { required: flat.required });
    if (c.kind === 'infra') continue;
    if (c.kind === 'subResource') {
      if (depth >= 2) {
        // depth cap: deeper nesting degrades to simple-json rather than exploding tables
        fields.push({
          kind: 'json', name: propName, tsType: 'Record<string, any>[]',
          column: { ...SIMPLE_JSON }, nullable: true, reason: 'nesting depth cap',
        });
      } else {
        children.push(expandSubResource(doc, className, c, depth + 1, overrides));
      }
      continue;
    }
    if (c.kind === 'flattenedRef') flattenedRefs.push(c);
    else fields.push(c);
  }

  // reference identity, kept only for wrappers; `sourceProp` drives the inverse so
  // the mapper emits `id` / `href` / `@referredType` back out
  if (refLike) {
    const props = flat.properties;
    const identity = [
      ['id', 'refId', { type: 'varchar', length: 36 }],
      ['href', 'href', { type: 'varchar', length: 1000 }],
      ['@referredType', 'referredType', { type: 'varchar', length: 100 }],
    ];
    for (const [sourceProp, colName, column] of identity) {
      if (!Object.prototype.hasOwnProperty.call(props, sourceProp)) continue;
      fields.unshift({
        kind: 'scalar',
        name: colName,
        sourceProp,
        tsType: 'string',
        column,
        nullable: true,
        description: props[sourceProp]?.description || '',
      });
    }
  }

  return {
    className,
    tableName,
    nameCandidates: candidates,
    refLike,
    propertyName: sub.name,
    itemRef: sub.itemRef,
    description: sub.description || flat.description || '',
    minItems: sub.minItems,
    // the item schema's own OAS `required:` list, surfaced so version-bump
    // major/minor detection can tell "a required field was removed" apart from
    // any other change - see entityPlan.mjs's requiredFields.
    requiredFields: flat.required ?? [],
    depth,
    fields,
    flattenedRefs,
    children,
  };
}
