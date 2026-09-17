export function toEntityPayload(dto: Record<string, any>): Record<string, any> {
  const payload = { ...dto };
  if (payload['@type'] !== undefined) {
    payload.atType = payload['@type'];
    delete payload['@type'];
  }
  if (payload['@baseType'] !== undefined) {
    payload.atBaseType = payload['@baseType'];
    delete payload['@baseType'];
  }
  if (payload['@schemaLocation'] !== undefined) {
    payload.atSchemaLocation = payload['@schemaLocation'];
    delete payload['@schemaLocation'];
  }
  return payload;
}

export function toTmfResource(
  entity: Record<string, any>,
): Record<string, any> {
  const resource = { ...entity };
  if (resource.atType !== undefined) {
    resource['@type'] = resource.atType;
    delete resource.atType;
  }
  if (resource.atBaseType !== undefined) {
    resource['@baseType'] = resource.atBaseType;
    delete resource.atBaseType;
  }
  if (resource.atSchemaLocation !== undefined) {
    resource['@schemaLocation'] = resource.atSchemaLocation;
    delete resource.atSchemaLocation;
  }
  return resource;
}

/**
 * Bumps a TM Forum-style "major.minor" version string. Major resets minor to 0
 * (e.g. "1.7" -> "2.0"); minor increments in place (e.g. "1.0" -> "1.1").
 * Missing/malformed input is treated as "1.0" before bumping.
 */
export function nextVersion(previous: string | undefined, isMajor: boolean): string {
  const [major, minor] = String(previous ?? '1.0').split('.').map(Number);
  return isMajor ? `${(major || 1) + 1}.0` : `${major || 1}.${(minor || 0) + 1}`;
}

/**
 * Computes the next value for a server-managed `version` column: MAJOR if a
 * field the resource's own OAS schema marks `required` is being removed/
 * emptied by this update, MINOR for any other change, or unchanged if nothing
 * in `oldSnapshot`/`newSnapshot` actually differs. Only the entity's own
 * directly-owned fields are compared - nested relations are out of scope by
 * design.
 */
export function applyVersionBump(
  previous: string | undefined,
  oldSnapshot: Record<string, any>,
  newSnapshot: Record<string, any>,
  requiredFields: string[],
): string {
  const isEmpty = (v: any) =>
    v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const removedRequired = requiredFields.some(
    (f) => !isEmpty(oldSnapshot[f]) && isEmpty(newSnapshot[f]),
  );
  if (removedRequired) return nextVersion(previous, true);
  // `null` (an unset DB column) and `undefined` (a key the client never sent)
  // both mean "no value" - without normalising them first, every no-op PATCH
  // on a row with any nullable column would spuriously read as "changed".
  const normalize = (v: any) => v ?? undefined;
  const changed = Object.keys(oldSnapshot).some(
    (k) => JSON.stringify(normalize(oldSnapshot[k])) !== JSON.stringify(normalize(newSnapshot[k])),
  );
  return changed ? nextVersion(previous, false) : (previous ?? '1.0');
}

/**
 * Whether `@type` survives attribute selection. The two CTK generations demand the
 * OPPOSITE here and cannot both be satisfied:
 *   - v4 kits assert "Instance has only id, href and filtered attribute" - including
 *     `@type` fails TMF704/705/706/707.
 *   - v5 conformance profiles schema-validate every response and reject a payload
 *     without it - omitting `@type` fails TMF736/738.
 * So it is decided per component at generate time from the spec's major version.
 */
const INCLUDE_ATYPE_IN_FIELD_SELECTION = true;

export function projectFields(
  items: Record<string, any>[],
  fields?: string,
): Record<string, any>[] {
  if (!fields) return items;
  const fieldList = fields.split(',').map((f) => f.trim());
  return items.map((item) => {
    const projected: Record<string, any> = {};
    if (INCLUDE_ATYPE_IN_FIELD_SELECTION && item['@type']) projected['@type'] = item['@type'];
    if (item.id) projected.id = item.id;
    if (item.href) projected.href = item.href;
    for (const field of fieldList) {
      if (field in item) projected[field] = item[field];
    }
    return projected;
  });
}
