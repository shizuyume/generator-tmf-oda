/**
 * Estimates how many tables TypeORM will join for one read of a resource.
 *
 * Why this is not just `relations.length`: every emitted relation except the
 * many-to-one-owner back-reference carries `eager: true`, so TypeORM expands them
 * TRANSITIVELY. Entity classes are also shared across resources and written once
 * (first writer wins), so a class reached from resource A carries whatever relations
 * resource B gave it - paths that never appear in A's own `relations: [...]` list.
 *
 * TMF915's AiModel is the worked example: its service lists 35 relation paths, well
 * under SQLite's ceiling, yet the real query reaches 62 paths / 63 tables through
 * shared classes and dies at runtime with
 *
 *   SQLITE_ERROR: at most 64 tables in a join
 *
 * That is why the first attempt at this check - counting the explicit relation array -
 * never fired for the one resource it existed to catch.
 *
 * The number below is a LOWER BOUND on what the database sees: it counts eager
 * relation paths plus the root, and does not model whatever extra tables the driver
 * adds. Hence the warning threshold sits under 64 rather than on it.
 */

/** SQLite hard limit: "at most 64 tables in a join". Not configurable. */
export const SQLITE_MAX_JOIN_TABLES = 64;

/**
 * Warn a little early: the count is a lower bound, and AiModel computed 63 while
 * failing for real. Anything this close is already unsafe on sqlite.
 */
export const JOIN_WARN_THRESHOLD = 55;

/**
 * Global class-level eager graph, built the way emit actually writes files: the first
 * plan to claim a class name is the one whose relations land in the .entity.ts.
 *
 * @returns Map<className, Array<{ prop, target }>>
 */
export function buildEagerGraph(plans, resolve) {
  const graph = new Map();
  for (const { plan } of plans) {
    for (const entity of plan.entities) {
      const cls = resolve(entity.key)?.className;
      if (!cls || graph.has(cls)) continue; // first writer wins, same as pass 2
      const rels = [];
      for (const r of entity.relations) {
        if (r.kind === 'many-to-one-owner') continue; // back-reference, never eager
        const target = resolve(r.targetKey)?.className;
        if (target) rels.push({ prop: r.property, target });
      }
      graph.set(cls, rels);
    }
  }
  return graph;
}

/**
 * Cycles in the eager graph, e.g. A.b -> B and B.a -> A.
 *
 * Every non-owner relation is emitted `eager: true, cascade: true`, so a cycle
 * means loading or saving A pulls B, which pulls A again. The generated service
 * does not fail fast on that: the first `POST` on either resource spins until the
 * process dies with "JavaScript heap out of memory", while build and the mocked
 * unit tests stay green. Seen on BSM C12, where ProcurementRequest referenced
 * ExternalOrderCandidate and ExternalOrderCandidate referenced ProcurementRequest.
 *
 * @returns Array<string>  one readable path per distinct cycle,
 *          e.g. "ProcurementRequest.externalOrderCandidate -> ExternalOrderCandidate.procurementRequest -> ProcurementRequest"
 */
export function findEagerCycles(graph) {
  const cycles = new Map(); // canonical key -> readable path
  const state = new Map(); // cls -> 'open' | 'done'
  const stack = []; // [{ cls, prop }] edges on the current DFS path

  const visit = cls => {
    state.set(cls, 'open');
    for (const r of graph.get(cls) ?? []) {
      stack.push({ cls, prop: r.prop, target: r.target });
      const s = state.get(r.target);
      if (s === 'open') {
        const start = stack.findIndex(e => e.cls === r.target);
        const edges = stack.slice(start);
        const key = edges.map(e => `${e.cls}.${e.prop}`).sort().join('|');
        if (!cycles.has(key)) {
          cycles.set(key, `${edges.map(e => `${e.cls}.${e.prop}`).join(' -> ')} -> ${r.target}`);
        }
      } else if (s !== 'done') {
        visit(r.target);
      }
      stack.pop();
    }
    state.set(cls, 'done');
  };

  for (const cls of [...graph.keys()].sort()) if (!state.has(cls)) visit(cls);
  return [...cycles.values()];
}

/**
 * Distinct eager join paths reachable from `rootClass`.
 *
 * A class already open in the current chain is not re-expanded, which is what keeps a
 * self-referential graph finite instead of recursing forever.
 */
export function countEagerJoinPaths(graph, rootClass, cap = 5000) {
  let total = 0;
  const seen = new Set();
  const stack = [{ cls: rootClass, prefix: '', chain: [rootClass] }];

  while (stack.length) {
    const { cls, prefix, chain } = stack.pop();
    for (const r of graph.get(cls) ?? []) {
      if (chain.includes(r.target)) continue;
      const p = prefix ? `${prefix}.${r.prop}` : r.prop;
      if (seen.has(p)) continue;
      seen.add(p);
      total += 1;
      if (total > cap) return cap;
      stack.push({ cls: r.target, prefix: p, chain: [...chain, r.target] });
    }
  }
  return total;
}
