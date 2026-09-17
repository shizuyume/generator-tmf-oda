/**
 * Nested-resource routes, opt-in via `emit --nested-routes`.
 *
 * A TMF spec can declare a resource under a parent: TMF915 puts `event` and `hub`
 * beneath /topic/{topicId}, TMF673 puts `geographicSubAddress` beneath
 * /geographicAddress/{geographicAddressId}. The emitter has always flattened those to
 * the root ("nested resources are emitted flat for now"), dropping the parent key
 * entirely - so two hubs created under different topics were indistinguishable, and
 * clients written against the published spec addressed a path that did not exist.
 *
 * Turning this into a route change alone would be WORSE than the deviation: the
 * mapper builds `href` from the flat segment, so responses would advertise a URL that
 * no longer resolves, while the builder and findAll would neither store nor filter on
 * the parent key. Everything below therefore moves together - route, parent column,
 * builder assignment, collection scoping, scoped lookup, and href.
 *
 * Default OFF. Enabling it changes the API contract of every already-generated
 * service that has a nested resource, so it is a deliberate per-run choice rather
 * than a silent upgrade.
 */

/**
 * @param resource IR resource
 * @param enabled  whether --nested-routes was passed
 * @returns null when flat, else { route, params, hrefSegment, routeSegment }
 */
export function nestedRouteInfo(resource, enabled) {
  if (!enabled || !resource?.nested) return null;
  const collection = resource.paths?.collection;
  if (!collection) return null;

  // Zero parameters is legitimate: TMF910 nests UserInfoType under a STATIC segment
  // (/openid/userinfo). Requiring a parameter here sent it back to the flat root as
  // /userinfo, which the spec never declares - the kit got a plain 404. There is no
  // parent key to store or scope by in that case, only a different route.
  const params = [...collection.matchAll(/\{(\w+)\}/g)].map(m => m[1]);

  // '/topic/{topicId}/event' -> 'topic/:topicId/event' for @Controller
  const routeSegment = collection.replace(/^\//, '').replace(/\{(\w+)\}/g, ':$1');

  // '/topic/{topicId}/event' -> 'topic/${e.topicId}/event', spliced into the
  // mapper's template literal so the emitted href interpolates at runtime
  const hrefSegment = collection.replace(/^\//, '').replace(/\{(\w+)\}/g, (_, p) => '${e.' + p + '}');

  return { route: routeSegment, routeSegment, hrefSegment, params };
}

/** Column injected on the root entity for each parent key. */
export function parentKeyColumn(param, resourceName, parentName) {
  return {
    name: param,
    description: `Parent ${parentName} of this ${resourceName} (nested route key, not client-assignable).`,
    column: { type: 'varchar', length: 36, nullable: true },
    tsType: 'string',
    optional: true,
    // keeps it out of scalarAssignable, so PATCH bodies can never reassign the
    // parent - while still being in `settable`, which is what create() uses
    immutable: true,
  };
}
