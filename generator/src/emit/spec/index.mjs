/**
 * Emitters for the generated service's OWN test suite.
 *
 * Specs land under `test/`, mirroring `src/`, because jest.config.js scans
 * test/ alone (see templates/jest.config.js): coverage is then measured over
 * src/ without the suite measuring itself, and a service still carrying
 * hand-written specs under src/ does not run them as a second suite.
 *
 * Every module here is a pure function of the MANIFEST UNION - every component
 * the service hosts - not of the single IR being emitted. The shared files
 * (src/seed.ts, src/entities.ts, src/app.module.ts) are regenerated from that
 * union, so a suite built from one IR tests a service that no longer exists.
 * None re-derives anything, and none reads a TMF-specific field: a TMF-shaped
 * spec that is not a TM Forum component must produce the same suite.
 */
import { emitHooksSpec } from './hooks.mjs';
import { emitSeedLocalSpec } from './seed-local.mjs';
import { emitSubscriptionSpec } from './subscription.mjs';
import { emitListenerSpec } from './listener.mjs';
import { emitSeedSpec } from './seed.mjs';

/** Each entry returns { rel, text } to write, or null to emit nothing. */
const EMITTERS = [
  emitHooksSpec,
  emitSeedLocalSpec,
  emitSubscriptionSpec,
  emitListenerSpec,
  emitSeedSpec,
];

/**
 * @param {{ components: object[], resources: object[], seeds: object[] }} ctx
 *   `components` is the manifest union (see wiring.mjs's orderedComponents);
 *   `resources` and `seeds` are those components' entries flattened, in the
 *   same order the shared files use.
 * @param {(rel: string, text: string) => void} writeFile
 * @returns {string[]} the relative paths written
 */
export function emitSpecs(ctx, writeFile) {
  const written = [];
  for (const emit of EMITTERS) {
    const out = emit(ctx);
    if (!out) continue;
    writeFile(out.rel, out.text);
    written.push(out.rel);
  }
  return written;
}
