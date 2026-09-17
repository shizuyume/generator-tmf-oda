import { kebab } from '../ir/naming.mjs';

/**
 * Directories the scaffold always creates for every service, regardless of
 * which TMF component is emitted. A resource whose own directory collides
 * with one of these overwrites hand-maintained infra files (event.module.ts,
 * subscription.service.ts, listener.module.ts) or produces a duplicate class
 * identifier in the module it renders into.
 */
export const RESERVED_MODULE_DIRS = new Set(['event', 'subscription', 'listener', 'common']);

/**
 * Token used for a resource's OWN directory and its Controller/Service/Module
 * class + file names - distinct from resource.name (TMF schema identity: DTO
 * names, entity class, @type wire value) and from resource.pathSegment (the
 * HTTP route). Neither of those changes here; only the module's internal
 * file layout does.
 */
export function resolveModuleName(resourceName) {
  return RESERVED_MODULE_DIRS.has(kebab(resourceName)) ? `Tmf${resourceName}` : resourceName;
}
