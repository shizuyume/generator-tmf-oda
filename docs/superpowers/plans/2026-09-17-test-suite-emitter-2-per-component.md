# Test-suite emitter, plan 2 of 3: per-component specs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the five spec files whose content is mechanical in the component's
resource list — hooks, seed-local, subscription, listener and seed — so a
generated service's suite covers its own wiring without hand-written tests.

**Architecture:** A new `generator/src/emit/spec/` directory holding one module
per spec kind plus an `index.mjs` that orchestrates them, called once from
`emit/index.mjs` after the per-resource loop. Every module is a pure string
builder over data `emit/index.mjs` has already computed (`plans`, `seeds`, `ir.meta`)
and writes through the existing `writeFile(rel, content)` helper with a `test/`
prefix. No existing emitter's output changes.

**Tech Stack:** Node ESM (`.mjs`, no build step, no unit-test framework in the
generator), NestJS + TypeORM in the emitted service, Jest + ts-jest for the
emitted suite (shipped by plan 1).

**Spec:** `docs/superpowers/specs/2026-09-17-test-suite-emitter-design.md`

**Depends on:** plan 1 (`docs/superpowers/plans/2026-09-17-test-suite-emitter-1-foundation.md`),
merged at `eb9ae5f`.

## Global Constraints

- **The generator has no unit tests.** `generator/tools/golden.mjs` and
  `generator/tools/check-all.mjs` are the whole test cycle. Do not add a test
  framework to the generator. The Jest suite being emitted is the *generated
  service's*.
- **All generator commands run from `C:/REPOSITORY/oh-my-tmf-agent-workspace/generator`.**
- **`node tools/check-all.mjs` must report exactly `2 gate(s) failed`** —
  `FE fe-gen golden matrix` and `FE schema validate`, both pre-existing, both
  caused by seven gitignored and absent root `frontend-spec-*.yaml` inputs. A
  third failure is a regression.
- **Golden cycle for every task in this plan:** a new emitted file makes
  `node tools/golden.mjs` go RED. That red step is the proof the emitter is
  wired; if golden passes before you run `--update`, the file never reached the
  generated service. Then `--update`, then verify green.
- **`C:/REPOSITORY/GEN_REPO` is read-only reference material.** The
  hand-written specs there are the shape to reproduce. Never write into it,
  never `git checkout` there.
- **Emitted files are Prettier-clean** under `{"singleQuote": true,
  "trailingComma": "all"}`, printWidth 80, LF line endings.
- **Import rebasing.** Specs live in `test/` mirroring `src/`. A spec at
  `test/<p>/x.spec.ts` reaches source as `../../src/<p>/...`; one at
  `test/x.spec.ts` reaches it as `../src/...`. `jest.mock()` paths rebase the
  same way — a wrong depth there fails silently by mocking nothing.
- **Behaviour facts come from `src/emit/behaviour.mjs`, never re-derived.**
  It exports `DEFAULT_OFFSET`, `DEFAULT_LIMIT`, `AUDIT_AND_SOFT_DELETE`,
  `SOFT_DELETE_COLUMNS`, `SOFT_DELETE_TIMESTAMP_COLUMN`,
  `SOFT_DELETE_ATTRIBUTION_COLUMNS`, `SOFT_DELETE_DEFAULTS`,
  `ALWAYS_PRESENT_TRAILER`, `EMPTY_TRAILER_VALUE`, `SORT_ORDER_FALLBACK`, and
  `defaultAtType(resourceName)`. If a spec asserts a value that module owns,
  interpolate it — a literal copy is the drift this module exists to prevent.
- **Non-TMF constraint.** Spec emitters may read only IR/plan fields:
  `resource.name`, `resource.operations`, `resource.paths`, the entity plan,
  and the `seeds` entries. Never the TMF number, CTK artefacts, or anything
  keyed to TM Forum resource names. A TMF-shaped Swagger spec that is not a TM
  Forum component must produce the same suite.
- **Commit to the `merge-local-generator` branch. Never commit or push to
  `main`.**
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Spec-emitter pipeline + `hooks.spec.ts`

Wires the new `emit/spec/` pipeline into `emit/index.mjs` and proves it
end to end with the simplest emitter. Everything after this task is one more
module registered in the same place.

**Files:**
- Create: `generator/src/emit/spec/index.mjs`
- Create: `generator/src/emit/spec/hooks.mjs`
- Modify: `generator/src/emit/index.mjs` (one call site, after the `seeds`
  array is complete)

**Interfaces:**
- Consumes: `plans` (`[{ resource, plan, dir, naming, nested }]`), `seeds`
  (`[{ resource, dir, serviceClass, seedConst, localSeedConst, count }]`) and
  the `writeFile(rel, content)` helper, all already in scope in
  `emit/index.mjs`.
- Produces: `emitSpecs(ctx, writeFile)` in `generator/src/emit/spec/index.mjs`,
  where `ctx` is `{ ir, plans, seeds }`. Tasks 2-5 register their module in the
  same `EMITTERS` list. Each module exports one function taking `ctx` and
  returning `{ rel, text }` or `null` (null = nothing to emit for this
  component).

- [ ] **Step 1: Confirm the baseline is green**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: `all golden checks passed`. If not, the tree was already dirty and
this task's red step proves nothing.

- [ ] **Step 2: Write the orchestrator**

Create `generator/src/emit/spec/index.mjs`:

```js
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

/** Each entry returns { rel, text } to write, or null to emit nothing. */
const EMITTERS = [emitHooksSpec];

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
```

- [ ] **Step 3: Write the hooks spec emitter**

Create `generator/src/emit/spec/hooks.mjs`. It reproduces the shape of
`C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/hooks.spec.ts` — read that
file first — with the import paths rebased from `./<dir>/...` to
`../src/<dir>/...` because the spec now sits at `test/hooks.spec.ts`.

```js
import { camel, kebab } from '../../ir/naming.mjs';

const BANNER = '// GENERATED by tmfgen - DO NOT EDIT. Re-run the generator instead.';

/**
 * test/hooks.spec.ts - one suite per resource's hook module.
 *
 * The per-resource hook modules are the domain seam the generated services call
 * at fixed points. Each is a pass-through unless the component assigns something
 * server-side, so the contract under test is "returns undefined, or a payload
 * that still carries what the caller sent".
 */
export function emitHooksSpec({ plans }) {
  if (!plans.length) return null;

  const mods = plans.map(p => ({
    alias: `${camel(p.resource.name)}Hooks`,
    path: `../src/${p.dir}/${kebab(p.naming.moduleFileBase ?? p.dir)}.hooks`,
    label: camel(p.resource.name),
  }));

  const lines = [
    BANNER,
    '/**',
    ' * The per-resource hook modules are the domain seam the generated services call',
    ' * at fixed points. Each is a pass-through unless the component assigns something',
    ' * server-side, so the contract under test is "returns undefined, or a payload',
    ' * that still carries what the caller sent".',
    ' */',
    ...mods.map(m => `import * as ${m.alias} from '${m.path}';`),
    '',
    `type Hooks = typeof ${mods[0].alias};`,
    '',
    'const MODULES: [string, Hooks][] = [',
    ...mods.map(m => `  ['${m.label}', ${m.alias}],`),
    '];',
    '',
    "describe.each(MODULES)('%s hooks', (_name, hooks) => {",
    "  it('leaves the update payload and the mapped response untouched', async () => {",
    "    await expect(hooks.beforeUpdate('id-1', { name: 'A' })).resolves.toBeUndefined();",
    "    await expect(hooks.afterFindOne({ id: 'id-1' }, {})).resolves.toBeUndefined();",
    '  });',
    '',
    "  it('either passes the create payload through or returns it enriched', async () => {",
    "    const result = await hooks.beforeCreate({ name: 'A' });",
    '    if (result !== undefined) {',
    "      expect(result.name).toBe('A');",
    '    }',
    '  });',
    '});',
    '',
  ];
  return { rel: 'test/hooks.spec.ts', text: lines.join('\n') };
}
```

Before writing this, confirm the hooks file name the emitter must import
matches what `renderHooks` actually writes. Find the write site:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "renderHooks" src/emit/index.mjs
```

Read the `writeFile` line next to it and make the import path in the emitter
match that filename exactly. If it differs from `${moduleFileBase}.hooks.ts`,
use what the code does, not what this plan guessed.

- [ ] **Step 4: Call it from the resource emitter**

In `generator/src/emit/index.mjs`, add the import beside the other emitter
imports:

```js
import { emitSpecs } from './spec/index.mjs';
```

and call it once after the `seeds` array is complete — the line
`seeds.push(...orderedSeeds);` — and before the manifest is written:

```js
  emitSpecs({ ir, plans, seeds }, writeFile);
```

Place it so it runs in both `own` and `inject` modes only if that is what the
surrounding code does for other whole-service files; if `inject` mode returns
early before this point, leave it after the early return so a host service does
not get a suite it never asked for. Read the surrounding code and match it.

- [ ] **Step 5: Verify the module parses and the CLI still loads**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/index.mjs && node --check src/emit/spec/hooks.mjs && node src/cli.mjs --help
```
Expected: no syntax error and the CLI prints its command list. `--help` is what
proves the new import resolves; `node --check` does not follow imports.

- [ ] **Step 6: Run golden and watch it go red**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: FAIL, with a new `backend/test/hooks.spec.ts` in every case. If golden
passes, `emitSpecs` is not being reached — fix the wiring before continuing.

- [ ] **Step 7: Record and verify**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs --update && node tools/golden.mjs && node tools/check-all.mjs
```
Expected: `recorded` for all five cases, then `all golden checks passed`, then
exactly `2 gate(s) failed`.

- [ ] **Step 8: Run the emitted suite for real**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
SCRATCH="C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
node src/cli.mjs scaffold --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --port 5001 --db postgres
node src/cli.mjs emit --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --db postgres
cd "$SCRATCH/alarm-service/backend" && yarn install && yarn test
```

Expected: four suites now (the three from plan 1 plus `test/hooks.spec.ts`),
all passing. Report the suite and test counts.

If `yarn install` cannot complete, say so plainly and report the golden
evidence you do have — never claim a suite passed that you did not run.

- [ ] **Step 9: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/src/emit/index.mjs generator/golden && git commit -F - <<'EOF'
emit: spec-emitter pipeline, and the hooks suite

First of the emitted test files. emit/spec/index.mjs holds the emitter list and
writes through emit/index.mjs's existing writeFile with a test/ prefix, so no
file-writing machinery changes. hooks.mjs reproduces the hand-written
hooks.spec.ts shape from GEN_REPO, driven by the resource list.

Imports rebased from src/ to test/. Verified by running the emitted suite, not
only by golden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `seed-local.spec.ts`

**Files:**
- Create: `generator/src/emit/spec/seed-local.mjs`
- Modify: `generator/src/emit/spec/index.mjs` (register the emitter)

**Interfaces:**
- Consumes: `ctx.seeds` — `[{ resource, dir, serviceClass, seedConst,
  localSeedConst, count }]`. `seedConst` is `null` when the spec carried no
  examples; `localSeedConst` is always present.
- Produces: `emitSeedLocalSpec(ctx)` returning `{ rel, text }` or `null`.

- [ ] **Step 1: Read the reference**

```bash
cat C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/seed-local.spec.ts
```

It imports every resource's `<r>.seed` and `<r>.seed.local` const, collects
them into a `SEEDS` table and asserts each is an array of objects. Note that it
tolerates an EMPTY array — a resource with no examples is legitimate, and
`seedConst` is `null` for exactly that case.

- [ ] **Step 2: Write the emitter**

Create `generator/src/emit/spec/seed-local.mjs`:

```js
import { kebab } from '../../ir/naming.mjs';

const BANNER = '// GENERATED by tmfgen - DO NOT EDIT. Re-run the generator instead.';

/**
 * test/seed-local.spec.ts - the seed lists are plain API payloads.
 *
 * They are allowed to be empty, but they must stay arrays of objects: seed.ts
 * spreads them straight into create(). A resource whose spec carried no
 * examples has no `seedConst` at all and contributes only its local list.
 */
export function emitSeedLocalSpec({ seeds }) {
  if (!seeds.length) return null;

  const entries = [];
  for (const s of seeds) {
    const base = `../src/${s.dir}/${kebab(s.resource)}`;
    if (s.seedConst) entries.push({ name: s.seedConst, path: `${base}.seed` });
    entries.push({ name: s.localSeedConst, path: `${base}.seed.local` });
  }
  if (!entries.length) return null;

  const lines = [
    BANNER,
    '/**',
    ' * The seed lists are plain API payloads. They are allowed to be empty, but they',
    ' * must stay arrays of objects - `seed.ts` spreads them straight into `create()`.',
    ' */',
    ...entries.map(e => `import { ${e.name} } from '${e.path}';`),
    '',
    'const SEEDS: [string, Record<string, any>[]][] = [',
    ...entries.map(e => `  ['${e.name}', ${e.name}],`),
    '];',
    '',
    "describe.each(SEEDS)('%s seed rows', (_name, rows) => {",
    "  it('are an array of payload objects', () => {",
    '    expect(Array.isArray(rows)).toBe(true);',
    '    for (const row of rows) {',
    "      expect(typeof row).toBe('object');",
    '      expect(row).not.toBeNull();',
    '    }',
    '  });',
    '});',
    '',
  ];
  return { rel: 'test/seed-local.spec.ts', text: lines.join('\n') };
}
```

Confirm the seed file names against what actually gets written:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "renderSeedData\|renderLocalSeedStub" src/emit/index.mjs
```

Match the emitter's import paths to the `writeFile` calls beside those, not to
this plan's guess.

- [ ] **Step 3: Register it**

In `generator/src/emit/spec/index.mjs`:

```js
import { emitSeedLocalSpec } from './seed-local.mjs';
```

and add `emitSeedLocalSpec` to the `EMITTERS` array.

- [ ] **Step 4: Parse check**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/seed-local.mjs && node src/cli.mjs --help
```
Expected: clean.

- [ ] **Step 5: Golden red, then record**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: FAIL with a new `backend/test/seed-local.spec.ts` per case. Then:
```bash
node tools/golden.mjs --update && node tools/golden.mjs && node tools/check-all.mjs
```
Expected: green, then exactly `2 gate(s) failed`.

- [ ] **Step 6: Check the no-examples case is handled**

Pick a component whose resources carry no POST examples and confirm the emitted
spec still compiles — it must import only `.seed.local` for those resources,
never a `seedConst` that was never written:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -c "seed'" golden/tmf688-v4/backend/test/seed-local.spec.ts golden/geo-multi/backend/test/seed-local.spec.ts
```
Then open one emitted file and confirm every imported name has a matching
`.seed` or `.seed.local` file in that golden case's `src/`.

- [ ] **Step 7: Run the suite**

```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2/alarm-service/backend" && yarn test
```
Expected: five suites, all passing. If the scratchpad service is stale,
re-run the scaffold+emit commands from Task 1 Step 8 first.

- [ ] **Step 8: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: seed-local suite

Asserts every seed and local-seed export is an array of payload objects, which
is what seed.ts assumes when it spreads them into create(). An empty list is
legitimate and passes; a resource whose spec carried no examples has no
seedConst and contributes only its local list.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `subscription.spec.ts`

Almost entirely fixed text. The only per-component parts are the subscription
controller's class name and import path.

**Files:**
- Create: `generator/src/emit/spec/subscription.mjs`
- Modify: `generator/src/emit/spec/index.mjs` (register)

**Interfaces:**
- Consumes: `ctx.ir.meta` for the component name used in the controller class,
  and `behaviour.mjs`'s `DEFAULT_OFFSET` / `DEFAULT_LIMIT`.
- Produces: `emitSubscriptionSpec(ctx)` returning `{ rel, text }` or `null`.

- [ ] **Step 1: Read the reference and find the real class name**

```bash
cat C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/subscription/subscription.spec.ts
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && ls golden/tmf736-v5/backend/src/subscription/
```

The controller is named `<Component>SubscriptionController` in a file named
`<component>-subscription.controller.ts`. Take both from the generated file
that actually exists in a golden case — do not reconstruct the name from
`ir.meta` fields without checking it against the emitted file.

- [ ] **Step 2: Write the emitter**

Create `generator/src/emit/spec/subscription.mjs`. Import the page-window
constants and interpolate them — this suite asserts `skip: 0, take: 20`, and
those two values are exactly what `behaviour.mjs` exists to keep in one place:

```js
import { DEFAULT_OFFSET, DEFAULT_LIMIT } from '../behaviour.mjs';
```

The emitted text is the reference file verbatim, with three substitutions:
the `import { <Ctrl> } from '../../src/subscription/<file>';` line, the
`describe('<Ctrl>', ...)` title, and the two `new <Ctrl>(...)` constructions.
The `SubscriptionService` import rebases to
`'../../src/subscription/subscription.service'`.

Replace the two hardcoded paging literals with interpolations:

```
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: ${DEFAULT_OFFSET}, take: ${DEFAULT_LIMIT} }));
```

and

```
    expect(svc.findAll).toHaveBeenCalledWith(${DEFAULT_OFFSET}, ${DEFAULT_LIMIT});
```

(there are two call sites for the second one — the `undefined, undefined` case
and the `'abc', 'def'` case; both use the defaults).

- [ ] **Step 3: Register, parse-check, golden**

```js
import { emitSubscriptionSpec } from './subscription.mjs';
```
add to `EMITTERS`, then:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/subscription.mjs && node src/cli.mjs --help && node tools/golden.mjs
```
Expected: parse clean, CLI loads, golden RED with a new
`backend/test/subscription/subscription.spec.ts` per case. Then:
```bash
node tools/golden.mjs --update && node tools/golden.mjs && node tools/check-all.mjs
```

- [ ] **Step 4: Confirm the constants really came from behaviour.mjs**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "take: 20\|, 20)" golden/tmf736-v5/backend/test/subscription/subscription.spec.ts
```
Expected: the emitted TypeScript reads `20`, because the interpolation happened
at generate time. Then confirm the emitter source has no bare `20`:
```bash
grep -n "20" src/emit/spec/subscription.mjs
```
Expected: no bare paging literal — only `DEFAULT_LIMIT`.

- [ ] **Step 5: Run the suite**

```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2/alarm-service/backend" && yarn test
```
Expected: six suites, all passing.

- [ ] **Step 6: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: subscription suite

Covers SubscriptionService's paging and the component's hub controller. The
default page window is interpolated from emit/behaviour.mjs rather than
copied, so the suite cannot drift from what emit/service.mjs generates.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `listener.spec.ts`

**Files:**
- Create: `generator/src/emit/spec/listener.mjs`
- Modify: `generator/src/emit/spec/index.mjs` (register)

**Interfaces:**
- Consumes: the listener handler names. `emit/index.mjs` already computes the
  listener routes when it writes `listener.controller.ts`; find that data
  rather than re-deriving the names.
- Produces: `emitListenerSpec(ctx)` returning `{ rel, text }` or `null`.
  **Returns `null` when the component declares no events** — that is a real
  case: `tmf-componentsuite-service` has 0 events and 0 listeners, and is the
  one service of 35 in GEN_REPO with no `listener.spec.ts`.

- [ ] **Step 1: Read the reference and locate the handler-name source**

```bash
cat C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/listener/listener.spec.ts
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "listener" src/emit/wiring.mjs src/emit/index.mjs | head -20
```

The spec needs the controller class name, its file name, and the full list of
`handle<Resource><EventKind>Event` method names. All three already exist where
`listener.controller.ts` is generated. Use that source.

- [ ] **Step 2: Write the emitter**

Create `generator/src/emit/spec/listener.mjs`. The emitted text is the
reference file with:
- the import rebased to `'../../src/listener/<file>'`
- the `describe` title and the `new <Ctrl>(...)` set to the real class name
- the first four `it()` blocks calling the FIRST handler name in the list
  (the reference uses `handleAckAlarmCreateEvent`, which is simply the first)
- the `handlers` array in the last `it()` listing every handler name

Guard the empty case at the top:

```js
  if (!handlers.length) return null;
```

- [ ] **Step 3: Register, parse-check, golden**

```js
import { emitListenerSpec } from './listener.mjs';
```
add to `EMITTERS`, then:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/listener.mjs && node src/cli.mjs --help && node tools/golden.mjs
```
Expected: golden RED with a new `backend/test/listener/listener.spec.ts`. Then
`--update`, re-verify, and `check-all.mjs` at exactly `2 gate(s) failed`.

- [ ] **Step 4: Prove the no-events guard works**

The five golden cases may all declare events. Find a component that does not
and emit it to the scratchpad, then confirm NO listener spec was written:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
grep -l "componentsuite" ../documents/*/*/openapi/* 2>/dev/null | head -1
```

If TMF910 (`tmf-componentsuite`) is present under `documents/`, scaffold and
emit it to a scratch dir and check `test/listener/` does not exist. If no
zero-event component is available locally, say so in your report and instead
prove the guard by unit-reasoning: show the line and explain which field being
empty triggers it. Do not claim a verification you did not perform.

- [ ] **Step 5: Run the suite and commit**

```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2/alarm-service/backend" && yarn test
```
Expected: seven suites, all passing.

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: listener suite

Covers the listener controller's subscription lookup and its fallbacks, and
asserts every declared listener endpoint answers the same way. Emitted only
when the component declares events - a component with none has no listener
routes, which is why one of the 35 services in GEN_REPO has no such spec.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `seed.spec.ts`

The largest of the five and the only one that mocks the module graph.

**Files:**
- Create: `generator/src/emit/spec/seed.mjs`
- Modify: `generator/src/emit/spec/index.mjs` (register)

**Interfaces:**
- Consumes: `ctx.seeds` (same shape as Task 2).
- Produces: `emitSeedSpec(ctx)` returning `{ rel, text }` or `null`.

- [ ] **Step 1: Read the reference in full**

```bash
cat C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/seed.spec.ts
```

Its structure: a `jest.setTimeout(120000)`, a mocked `@nestjs/core` and
`./app.module`, then per resource *i* a pair of `rowsI_0` / `rowsI_1` mutable
arrays and a pair of `jest.mock()` factories with getters returning them, then
five fixed `it()` blocks covering: skip when rows exist, seed when empty,
`--force`, one payload failing without aborting the rest, and a throw exiting
non-zero.

- [ ] **Step 2: Write the emitter**

Create `generator/src/emit/spec/seed.mjs`. Per-resource generated parts:

```js
  // for seeds[i]
  `let rows${i}_0: AnyRec[] = [];`
  `let rows${i}_1: AnyRec[] = [];`

  `jest.mock('../src/${s.dir}/${kebab(s.resource)}.seed', () => ({`
  `  get ${s.seedConst}() {`
  `    return rows${i}_0;`
  `  },`
  `}));`
```
and the same for `.seed.local` with `localSeedConst` and `rows${i}_1`.

**Critical:** `jest.mock` paths rebase to `../src/...` because the spec sits at
`test/seed.spec.ts`. A wrong depth here does not error — it mocks a module that
does not exist, the real one loads, and the assertions fail confusingly. The
mock of `./app.module` becomes `'../src/app.module'`.

Skip the `.seed` mock entirely for a resource whose `seedConst` is `null`, and
keep its `rows${i}_0` declaration out too, so no unused variable is emitted.

- [ ] **Step 3: Register, parse-check, golden**

```js
import { emitSeedSpec } from './seed.mjs';
```
add to `EMITTERS`, then:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/seed.mjs && node src/cli.mjs --help && node tools/golden.mjs
```
Expected: golden RED with a new `backend/test/seed.spec.ts`. Then `--update`,
re-verify, `check-all.mjs` at exactly `2 gate(s) failed`.

- [ ] **Step 4: Verify the mock paths resolve**

This is the step that catches the silent-failure mode. In a golden case, every
`jest.mock('../src/...')` path must correspond to a real file:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator/golden/tmf736-v5/backend
sed -n "s/^jest.mock('\.\.\/\(src[^']*\)'.*/\1/p" test/seed.spec.ts | while read -r p; do
  [ -f "$p.ts" ] || echo "MISSING: $p.ts"
done
echo "(no MISSING lines = every mock resolves)"
```

- [ ] **Step 5: Run the suite**

```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2/alarm-service/backend" && yarn test
```
Expected: eight suites, all passing. This suite is slow by design (the
reference sets a 120s timeout because several suites share one machine) — do
not shorten the timeout to make it finish sooner.

- [ ] **Step 6: Record the coverage this plan reaches**

```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan2/alarm-service/backend" && yarn test:cov
```
Report the file count and line percentage. Plan 1 ended at 80 files / 31.38%.
The figure will still be well under 90% — the per-resource service specs are
plan 3, and they are the bulk. Put the number in the commit message; plan 3 is
measured against it.

- [ ] **Step 7: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: seed-runner suite

Exercises seed.ts end to end with NestFactory and the app module mocked, so
seeding is covered without a database: skip when rows exist, seed when empty,
--force, one payload failing without aborting the rest, and a throw exiting
non-zero.

jest.mock paths are rebased to ../src/ for the test/ location. A wrong depth
there fails silently - the real module loads and the assertions go confusing -
so every mock path is checked against a real file in a golden case.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Done when

- `node tools/golden.mjs` passes without `--update`.
- `node tools/check-all.mjs` reports exactly `2 gate(s) failed`, both FE, both
  for the missing gitignored YAML inputs.
- A freshly scaffolded and emitted service runs `yarn test` green with eight
  suites: the three from plan 1 plus hooks, seed-local, subscription, listener
  and seed.
- `emitListenerSpec` returns `null` for a component with no events, and this was
  either demonstrated or explicitly reported as not demonstrable here.
- The coverage figure is recorded in a commit message for plan 3 to measure
  against.

## Not in this plan

- `test/<dir>/<resource>.service.spec.ts` — the per-resource suite. Plan 3, and
  the bulk of the work.
- The runtime coverage gate in `check-all.mjs --runtime`. Plan 3, once >=90% is
  reachable.
- Moving the 424 hand-written specs in `GEN_REPO` out of `src/`. Out of scope in
  the spec; the user does that by hand.
