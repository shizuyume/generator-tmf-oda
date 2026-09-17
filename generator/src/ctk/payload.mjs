/**
 * Synthesises a minimal valid POST payload for a resource from the IR.
 *
 * The TM Forum kits ship a hand-written `config.json` payload per resource. Seven of
 * the components in this workspace have no kit at all, and most specs carry no POST
 * example either (`seedExamples` is empty), so the payload has to be derived from the
 * schema: the create shape's required attributes, typed from the IR's field metadata.
 *
 * Deliberately MINIMAL - only what the spec marks required. A fatter payload gives the
 * kit more to disagree with, and the point of these generated kits is to exercise the
 * CRUD contract, not to fuzz every attribute.
 */

const UUIDS = [
  '3f1a7c58-0d5e-4c1b-9a2f-7e6b8d4c1a90',
  '8b2e5d71-6c4a-4f89-b3d2-1a9e7f5c8b04',
  'c47d9a12-5e83-4b6f-8c1a-2d7e9b3f6a58',
  'e91f3b64-7a2d-4c58-9e1b-5f8c2a6d4b73',
];
// Stable, not random: a generated kit has to be reproducible, and newman diffs are
// unreadable when every run changes the payload.
let uuidCursor = 0;
const nextUuid = () => UUIDS[uuidCursor++ % UUIDS.length];

export function resetPayloadSeed() {
  uuidCursor = 0;
}

/** A scalar value that satisfies the column's type and any enum the spec declares. */
function scalarFor(field) {
  if (field.enumValues?.length) return field.enumValues[0];
  const type = field.column?.type ?? 'varchar';
  const name = field.name ?? 'value';

  if (type === 'boolean') return true;
  if (type === 'int' || type === 'bigint') return 1;
  if (type === 'float') return 1.5;
  if (type === 'datetime' || type === 'timestamp') return '2026-01-15T09:30:00.000Z';

  // string-ish
  if (/^id$|Id$/.test(name)) return nextUuid();
  if (name === 'href') return `/generated/${name}`;
  if (/email/i.test(name)) return 'ctk@example.com';
  if (/url|uri/i.test(name)) return 'https://example.com/ctk';
  if (name === '@type' || name === 'atType') return undefined; // server-defaulted
  if (type === 'text') return `CTK generated value for ${name}`;

  const v = `ctk-${name}`;
  const max = field.column?.length;
  return max && v.length > max ? v.slice(0, max) : v;
}

/**
 * TMF reference shape.
 *
 * An id alone is NOT enough. The server upserts the referenced row to satisfy the
 * foreign key, so if the target has required attributes the insert fails with a
 * not-null violation and the create returns 500 - TMF909's Service references
 * ServiceSpecification, whose `name` is required. TM Forum's own kits send a
 * populated reference for the same reason (see the TMF708 kit's payload).
 *
 * One level deep only: a reference inside a reference stays a bare id, which is
 * enough for the FK and keeps the payload readable.
 */
function refValue(targetResource, ir) {
  const ref = { id: nextUuid() };
  const target = targetResource && (ir?.resources ?? []).find(r => r.name === targetResource);
  if (!target) return ref;
  for (const key of target.createShape?.required ?? target.required ?? []) {
    if (key === '@type') { ref['@type'] = target.name; continue; }
    const field = (target.fields ?? []).find(f => f.name === key);
    if (field) {
      const v = scalarFor(field);
      if (v !== undefined) ref[key] = v;
    }
    // a required non-scalar on the target is left out on purpose: nesting deeper
    // makes the payload unreadable and the FK only needs the row to exist
  }
  return ref;
}

/**
 * @param resource IR resource
 * @returns a plain object suitable as the POST body
 */
export function synthesizePayload(resource, ir = null) {
  // A spec-provided example always wins - it is authored against the real contract.
  // It arrives as an OpenAPI `examples` map entry, i.e. { label, value }, so the
  // body is under `.value`. Using the wrapper verbatim posts { label, value } and
  // every required attribute reads as missing.
  const example = (resource.seedExamples ?? [])[0];
  const exampleBody = example?.value ?? example;
  if (exampleBody && typeof exampleBody === 'object' && Object.keys(exampleBody).length) {
    // strip read-only/server-assigned keys an example may carry
    const { id, href, ...rest } = exampleBody;
    if (Object.keys(rest).length) return rest;
  }

  // Mirror what the DTO emitter does: when the spec carries no `_Create`/`_FVO`
  // schema, `createShape.required` is null and the create DTO falls back to the
  // RESOURCE's own required list. Reading only createShape produced an empty payload
  // for those components, and the DTO then rejected it - TMF910's TroubleTicket
  // returned 400 for missing `status` and `statusChangeReason`.
  const required = resource.createShape?.required ?? resource.required ?? [];
  const body = {};

  for (const key of required) {
    if (key === '@type') { body['@type'] = resource.name; continue; }

    const field = (resource.fields ?? []).find(f => f.name === key);
    if (field) {
      const v = scalarFor(field);
      if (v !== undefined) body[key] = v;
      continue;
    }

    const flat = (resource.flattenedRefs ?? []).find(f => f.name === key);
    if (flat) { body[key] = refValue(null, ir); continue; }

    const res = (resource.resourceRefs ?? []).find(f => f.name === key);
    if (res) { body[key] = refValue(res.targetResource, ir); continue; }

    const sub = (resource.subResources ?? []).find(s => s.propertyName === key || s.className === key);
    if (sub) {
      const element = () => {
        const inner = {};
        for (const rq of sub.requiredFields ?? []) {
          const sf = (sub.fields ?? []).find(f => f.name === rq);
          if (sf) {
            const v = scalarFor(sf);
            if (v !== undefined) inner[rq] = v;
            continue;
          }
          // A required sub-field that is NOT a scalar is a reference, and a reference
          // is an OBJECT. Falling back to `ctk-<name>` sent a bare string, and the DTO
          // said so: TMF662's AssociationRole.entity is an EntityRef and the create
          // failed with "associationRole.0.nested property entity must be either
          // object or array".
          const fr = (sub.flattenedRefs ?? []).find(f => f.name === rq);
          inner[rq] = fr ? refValue(null, ir) : `ctk-${rq}`;
        }
        return Object.keys(inner).length ? inner : { id: nextUuid() };
      };
      // An array sub-resource must be an array, and long enough: the spec's own
      // minItems is honoured. TMF662 sets minItems 2 on both Association.
      // associationRole and AssociationSpecification.associationRoleSpec, and a
      // one-element payload was rejected with "must contain at least 2 elements".
      // Each element is built fresh so generated ids differ.
      const count = Math.max(1, Number(sub.minItems) || 1);
      body[key] = Array.from({ length: count }, () => element());
      continue;
    }

    // required but absent from every metadata bucket: send a reference, which is the
    // shape most unmatched TMF attributes take
    body[key] = refValue(null, ir);
  }

  // `name` is not always required but almost every kit asserts on it, and an empty
  // body makes the create test meaningless
  if (!Object.keys(body).length) {
    const nameField = (resource.fields ?? []).find(f => f.name === 'name');
    body[nameField ? 'name' : 'id'] = nameField ? `ctk-${resource.camelName}` : nextUuid();
  }
  return body;
}
