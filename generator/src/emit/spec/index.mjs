/**
 * Emitters for the generated service's OWN test suite.
 *
 * Specs land under `test/`, mirroring `src/`, because jest.config.js scans
 * test/ alone (see templates/jest.config.js): coverage is then measured over
 * src/ without the suite measuring itself, and a service still carrying
 * hand-written specs under src/ does not run them as a second suite.
 *
 * Every module here is a pure function of the IR and the plan data
 * emit/index.mjs already computed. None re-derives anything, and none reads a
 * TMF-specific field - a TMF-shaped spec that is not a TM Forum component must
 * produce the same suite.
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
 * @param {{ ir: object, plans: object[], seeds: object[] }} ctx
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
