/**
 * Emitters for the generated service's OWN test suite.
 *
 * Specs land under `test/`, mirroring `src/`, because jest.config.js scans
 * test/ alone (see templates/jest.config.js): coverage is then measured over
 * src/ without the suite measuring itself, and a service still carrying
 * hand-written specs under src/ does not run them as a second suite.
 *
 * Every module here that emits a WHOLE-SERVICE file is a pure function of the
 * MANIFEST UNION - every component the service hosts - not of the single IR
 * being emitted. The shared files (src/seed.ts, src/entities.ts,
 * src/app.module.ts) are regenerated from that union, so a suite built from one
 * IR tests a service that no longer exists.
 *
 * `resource.mjs` is the exception, and deliberately so: it emits one file per
 * RESOURCE, which is inherently per-component and idempotent, so it reads
 * `ctx.plans` - the IR being emitted - instead. See its header.
 *
 * None re-derives anything, and none reads a TMF-specific field: a TMF-shaped
 * spec that is not a TM Forum component must produce the same suite.
 *
 * COVERAGE OF THESE EMITTERS, precisely:
 *   - `tools/sweep-emit.mjs` calls emitSpecs for all 130 corpus components with
 *     a counting no-op writeFile, so a shape that CRASHES an emitter fails the
 *     sweep (130/130 OK, 1032 spec files, 0 crashes). It proves text is
 *     produced - nothing about whether that text compiles or passes.
 *   - The five golden cases are the only ones whose emitted suite is byte-
 *     pinned, and one of them is the only one ever RUN (check-all --runtime).
 *
 * FORMATTING: several helpers here and in resource/hooks/listener/seed
 * hand-emulate Prettier's line breaking. That emulation is verified against the
 * five golden cases and is correct THERE ONLY; across the corpus the emitted
 * specs are Prettier-dirty (7 of 7 non-golden components checked). The emitted
 * src/ tree has the same condition in every case including golden, so this is a
 * generator-wide state, not one these emitters introduced. The real fix is to
 * run emitted text through Prettier at write time, or drop the emulation - see
 * the design spec's "Formatting: what is and is not true".
 */
import { emitHooksSpec } from './hooks.mjs';
import { emitSeedLocalSpec } from './seed-local.mjs';
import { emitSubscriptionSpec } from './subscription.mjs';
import { emitListenerSpec } from './listener.mjs';
import { emitSeedSpec } from './seed.mjs';
import { emitResourceSpecs } from './resource.mjs';

/**
 * Each entry returns nothing to emit (`null`), one `{ rel, text }`, or an array
 * of them - `emitResourceSpecs` writes one file per resource.
 */
const EMITTERS = [
  emitHooksSpec,
  emitSeedLocalSpec,
  emitSubscriptionSpec,
  emitListenerSpec,
  emitSeedSpec,
  emitResourceSpecs,
];

/**
 * @param {{ components: object[], resources: object[], seeds: object[],
 *           plans: object[], resolve: Function, entityDirOf: Function,
 *           meta: object, host: object|null }} ctx
 *   `components` is the manifest union (see wiring.mjs's orderedComponents);
 *   `resources` and `seeds` are those components' entries flattened, in the
 *   same order the shared files use. `plans`, `resolve`, `entityDirOf` and
 *   `meta` describe the SINGLE IR being emitted, for the per-resource files.
 * @param {(rel: string, text: string) => void} writeFile
 * @returns {string[]} the relative paths written
 */
export function emitSpecs(ctx, writeFile) {
  const written = [];
  for (const emit of EMITTERS) {
    const out = emit(ctx);
    if (!out) continue;
    for (const file of Array.isArray(out) ? out : [out]) {
      writeFile(file.rel, file.text);
      written.push(file.rel);
    }
  }
  return written;
}
