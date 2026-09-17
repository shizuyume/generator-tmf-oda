import { kebab } from '../ir/naming.mjs';

/**
 * Module naming, with a guard against the namespaces the scaffold already owns.
 *
 * Directory, file name and module class were all derived straight from the resource
 * name, with nothing checking them against what `scaffold` had already written. A
 * spec that declares a resource named `Event` (TMF915 does) therefore emitted over
 * src/event/event.module.ts - the infra event module - producing three failures at
 * once: the infra wiring (emitter/store/delivery/RabbitMQ) lost its module, the
 * emitted module imported ITSELF via the hardcoded '../event/event.module', and
 * app.module.ts imported `EventModule` twice from the same path.
 *
 * Entity names already had collision resolution (resolveEntityNames, which is what
 * produces CharacteristicRelationship3). This applies the same discipline one level
 * up, to module names.
 *
 * Only the module's own identity is remapped. Route paths come from the spec
 * (resource.pathSegment) and are never touched - conformance must not depend on how
 * a directory happens to be named.
 */

/** Directories under src/ that `scaffold` writes and owns. */
export const SCAFFOLD_OWNED_DIRS = new Set(['event', 'subscription', 'listener', 'common']);

/**
 * Route paths the scaffold's own controllers claim. A spec resource emitted on one of
 * these overlaps silently: Nest does not reject duplicate paths, it resolves them by
 * module registration order. Reported as a warning rather than remapped, because the
 * path is the spec's and moving it would break conformance.
 */
export const SCAFFOLD_OWNED_ROUTES = new Map([
  ['hub', 'the scaffold subscription controller (src/subscription/*-subscription.controller.ts)'],
  ['listener', 'the scaffold listener controller (src/listener/listener.controller.ts)'],
]);

export function moduleNaming(resourceName) {
  const base = kebab(resourceName);
  if (!SCAFFOLD_OWNED_DIRS.has(base)) {
    return { dir: base, moduleClass: `${resourceName}Module`, moduleFileBase: base, remappedFrom: null };
  }
  return {
    dir: `tmf-${base}`,
    moduleClass: `Tmf${resourceName}Module`,
    moduleFileBase: `tmf-${base}`,
    remappedFrom: base,
  };
}
