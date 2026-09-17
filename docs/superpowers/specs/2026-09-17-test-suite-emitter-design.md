# Test-suite emitter

Status: approved design, not yet implemented
Date: 2026-09-17

## Problem

A generated service ships no tests. Every one of the 35 services in `GEN_REPO`
therefore carries a hand-written suite: **424 `*.spec.ts` files, 94,941 lines**,
authored to clear SonarQube's Coverage >= 90% gate. That work is redone from
scratch for every new component, and it is the single largest piece of manual
effort left in the pipeline.

It also blocks a goal beyond TM Forum: the generator is meant to take any
Swagger spec written to TMF conventions, not only TM Forum's own. Those
third-party components have no hand-written suite to copy from, so without an
emitter they start at zero coverage with nobody to write them up.

## What the hand-written suites actually contain

Measured across all 35 services in `GEN_REPO`, not assumed.

A service emits 15 spec files (counts from `alarm-service`, 7 resources):

| File | Lines (avg) | Present | Distinct contents | Names resources? |
|---|---|---|---|---|
| `common/common.spec.ts` | 251 | 35/35 | 2 | no |
| `event/event.spec.ts` | 199 | 35/35 | 2 | no |
| `entities.spec.ts` | 67 | 35/35 | 4 | no |
| `seed.spec.ts` | 160 | 35/35 | 35 | yes |
| `subscription/subscription.spec.ts` | 88 | 35/35 | 35 | yes |
| `listener/listener.spec.ts` | 62 | 34/35 | 34 | yes |
| `hooks.spec.ts` | 36 | 20/35 | 20 | yes |
| `seed-local.spec.ts` | 30 | 20/35 | 20 | yes |
| `<resource>.service.spec.ts` | 335–764 | per resource | per resource | yes |

The "Present" column records what was hand-written, not what is structurally
possible. Only one gap there is structural: `listener.spec.ts` is missing from
`tmf-componentsuite-service` because that component declares no events. The
20/35 for `hooks.spec.ts` and `seed-local.spec.ts` is simply work that was
never done for the other 15 — every service has the files those specs import.

The "distinct contents" column is what splits the design in two. For
`common.spec.ts` the two variants differ **only** by whether an import
statement is wrapped across lines — the assertions are identical in all 35.
`entities.spec.ts` names no resource at all; it walks the entity barrel
generically, and its four variants are successive hand-improvements, the
richest of which walks the prototype chain so that relations declared on a
shared base class stay in scope.

The per-resource service spec is the bulk and the only genuinely hard one. For
a root resource it runs to ~764 lines across `create`, `findAll`,
`findEntity`/`findOne`, `update` and `remove`, asserting behaviour that depends
on the resource's own shape: which single refs are normalised into their own
tables, which collections exist, that rows come back ordered by `sortOrder`
rather than insertion, that a row without `sortOrder` sorts first, that
`@schemaLocation` and `@baseType` default to the empty string, that a
soft-deleted id is resurrected rather than rejected, and that the
`beforeCreate` / `afterFindOne` hooks are honoured.

## Scope

In scope: emit the full suite — all 15 file kinds, at parity with the
hand-written ones — plus the toolchain needed to run it.

Out of scope, explicitly:

- Migrating the 424 existing spec files in `GEN_REPO`. They stay in `src/`,
  untouched and unrun, and are moved to `test/` by hand later.
- Support for non-TMF Swagger specs as a feature. It is a design *constraint*
  here (see below), not something this spec builds.

## Architecture

Two layers, split by where variation actually lives.

### Layer 1 — static templates, copied at `scaffold` time

New directory `generator/templates/test/`:

- `common/common.spec.ts`
- `event/event.spec.ts`
- `entities.spec.ts`

These test code that is itself a template (`common/guards`, `common/filters`,
`common/interceptors`, `common/utils`, `event/*`) or that iterates a barrel
generically. They carry no placeholders and need no emitter code. They are
copied verbatim alongside the rest of `templates/`, the same way
`api-key.guard.ts` already is.

`entities.spec.ts` is templated from the prototype-chain-walking variant, which
is the only one that stays correct when relations are declared on a base class.

### Layer 2 — emitted from the IR at `emit` time

New directory `generator/src/emit/spec/`:

| Module | Emits |
|---|---|
| `index.mjs` | orchestration, mirroring `emit/index.mjs` |
| `service.mjs` | `test/<dir>/<resource>.service.spec.ts` |
| `seed.mjs` | `test/seed.spec.ts`, `test/seed-local.spec.ts` |
| `subscription.mjs` | `test/subscription/subscription.spec.ts` |
| `listener.mjs` | `test/listener/listener.spec.ts` |
| `hooks.mjs` | `test/hooks.spec.ts` |

### The drift guard — `generator/src/emit/behaviour.mjs`

The real risk at full parity is not volume, it is drift: the spec asserts
behaviour that `emit/service.mjs` produces. If each side derives its own
assumptions, a later change to the service emitter moves both together and the
tests stay green while both are wrong.

The facts both sides need are today literals inside `emit/service.mjs`:

- default page size (20) and default offset (0)
- sort-key handling and the column map
- `@type` defaulting to the resource name
- collection ordering by `sortOrder`, with a missing `sortOrder` sorting first
- soft-delete resurrection on create with a reused id
- `@schemaLocation` / `@baseType` defaulting to the empty string

They are lifted into `behaviour.mjs` and imported by `emit/service.mjs` and
`emit/spec/service.mjs` alike.

**This is the only change to an existing emitter, and it is a pure
extract-constant refactor.** The golden snapshots prove it changed nothing: if
the extraction is wrong, golden goes red before any new file is written.

## Toolchain

A generated service currently cannot run tests at all — `package.json` declares
no `jest`, `ts-jest`, `@types/jest` or `@nestjs/testing`, and no test script.
In `GEN_REPO` this is papered over by symlinking `node_modules` to
`ai-management-service/backend/node_modules`. The generator will own the
toolchain instead:

- `templates/package.json` — add the four devDependencies; add `test` and
  `test:cov` scripts.
- `templates/jest.config.js` — new. `rootDir: '.'`, `roots: ['<rootDir>/test']`,
  `testRegex: '.*\\.spec\\.ts$'`, `ts-jest` transform with
  `isolatedModules: true`, `collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts',
  '!src/main.ts', '!src/**/dto/**', '!src/**/*.module.ts']`,
  `coverageDirectory: 'coverage'`.
- `templates/tsconfig.build.json` — exclude `test/`, so `nest build` does not
  compile specs into `dist`.
- `templates/package.json` `lint` script already globs `{src,test}/**/*.ts`; no
  change needed.

Jest scans `test/` only. Hand-written specs still sitting in `src/` in
`GEN_REPO` are therefore neither run nor counted, which is what keeps the
existing services out of this change.

No change to `scaffold` is required for any of this. `newService.mjs` copies
templates with `walk(templatesDir)`, which recurses the whole tree and filters
out only `harvest-report.json` and the `fe-*` directories; a new
`templates/test/` tree and a new `templates/jest.config.js` therefore land at
their relative paths automatically. The static specs contain no `{{...}}`
placeholders, so the `render()` pass leaves them untouched (it throws only on
an unknown placeholder, and TypeScript's `${...}` is not one).

`jest.config.js` is a single file, identical in all 35 services today, so it
templates cleanly. The one change from the existing copy is `rootDir`: it moves
from `'src'` to `'.'` because the specs move out of `src/`.

## Data flow

No change to how files are written. The `plans` loop in `emit/index.mjs`
already computes `{ resource, plan, dir, naming, nested }` and a `resolve()`
for entity keys. The spec emitters consume exactly those and write through the
existing `writeFile(rel, content)` helper with `rel` prefixed `test/`.

Emitted specs are recorded in `.tmfgen-manifest.json` as managed files like any
other, so re-emit overwrites them and a hand-edited spec raises the drift
warning that already exists.

## Non-TMF constraint

The spec emitters may read only IR and plan fields: `resource.name`,
`resource.columns`, `resource.relations`, `resource.resourceRefs`,
`resource.operations`, `resource.paths`, and the entity plan. They must not
read the TMF number, CTK artefacts, or anything keyed to TM Forum resource
names.

A Swagger spec that follows TMF conventions but is not a TM Forum component
must produce the same suite. This is a review criterion for every spec emitter
module, not a runtime check.

## Edge cases

- **Read-only resource.** A resource whose spec declares only `get` must not
  emit `describe('create')`, `update` or `remove`. Driven by
  `resource.operations` — the same flags `emit/service.mjs` branches on.
- **No collections or refs.** The corresponding `describe` blocks are omitted,
  not emitted empty. An empty `describe` is a Sonar smell and asserts nothing.
- **Shared entity classes.** Entities are written once, under the first
  resource that claims them (first-writer-wins, tracked by `emittedClasses`).
  The spec emitter reuses that set so a shared class is not asserted twice.
- **No events.** A component that declares no events emits no listener routes,
  so `test/listener/listener.spec.ts` is skipped. This is the one structural
  gap in the hand-written suites: `tmf-componentsuite-service` (0 events, 0
  listeners) is the single service of 35 without it.
- **`hooks.spec.ts` and `seed-local.spec.ts` are always emitted.** The
  hand-written suites carry them in only 20 of 35 services, but that is uneven
  hand-work, not a structural condition — every service in `GEN_REPO` has the
  `*.hooks.ts` and `*.seed.local.ts` files those specs import, and the current
  generator emits both for every resource. The same uneven rollout shows in
  `base.entity.ts` (18/35) and `api-common-errors.decorator.ts` (24/35).
- **Resource with no seed examples.** `resource.seedExamples` may be empty —
  `renderSeedData` then emits an empty array, and the seed assertions must
  tolerate that rather than require rows. The hand-written `seed-local.spec.ts`
  already does: it asserts the export is an array of objects, allowing empty.

## Verification

Three gates, in increasing strength.

1. **Corpus sweep** (existing, extended for the spec emitters). All 130
   components emit without crashing. The spec emitters do NOT join it
   automatically - `tools/sweep-emit.mjs` calls the renderers by hand, so it
   was extended to call `emitSpecs` per component with a counting no-op
   `writeFile`; a corpus shape that throws inside a spec emitter now fails that
   component the way a crashing entity renderer already does. Current result:
   130/130 components OK, 1032 spec files emitted, 0 crashes. What this proves
   is that the emitters PRODUCE text for every corpus shape - not that the text
   compiles or passes. Only gates 2 and 3 do that, and they cover five cases.
2. **Golden snapshots + double-run determinism** (existing). The `test/` trees
   join the golden snapshot for all five cases. Two runs must be byte-identical.
3. **Runtime coverage gate** (new, in `check-all.mjs --runtime`). On one golden
   case: `yarn install && yarn test:cov`, then assert the run exited 0 **and**
   that line coverage parsed from `coverage/lcov.info` is >= 90%.

### Formatting: what is and is not true

The emitters hand-emulate Prettier's line breaking (`spec/resource.mjs`'s
`propLine`/`objectConst`/`callLines` layer, and the same idea in `hooks.mjs`,
`listener.mjs` and `seed.mjs`). That emulation is verified against the FIVE
GOLDEN CASES only, and it is correct there. It is NOT correct across the
corpus: of seven non-golden components emitted and checked (tmf622, 637, 641,
645, 653, 679, 700), all seven produced at least one Prettier-dirty spec file -
e.g. tmf700's `test/hooks.spec.ts` keeps `MODULES` broken where Prettier
inlines it, and its `shipping-order.service.spec.ts` breaks a `manager.delete`
call Prettier hugs. So: "the emitted specs are Prettier-clean" holds for the
golden cases and nowhere else.

This is a generator-wide condition, not something the spec emitters introduced:
the emitted `src/` tree is Prettier-dirty in every case INCLUDING golden (13
files in tmf736-v5).

Follow-up (out of scope here): either run the emitted text through Prettier at
write time - one formatting authority, and the hand-emulation layers delete
themselves - or drop the emulation and accept whatever line breaks the emitters
produce, with `prettier --check` removed from the contract entirely. Making the
hand-emulation correct across the corpus is the one option not worth taking.

Gate 3 is the one that matters. Golden proves the output is stable; only
running the suite proves it passes and reaches the coverage the emitter exists
to deliver.

## Implementation order

Full scope, but sequenced so each step is verifiable on its own and golden
stays green throughout:

1. `behaviour.mjs` extract-constant refactor. Golden must be unchanged.
2. Toolchain: `package.json`, `jest.config.js`, `tsconfig.build.json`.
3. Layer 1 static templates: `common`, `event`, `entities`.
4. Small Layer 2 emitters: `hooks`, `seed-local`.
5. Remaining Layer 2 emitters: `listener`, `subscription`, `seed`.
6. `emit/spec/service.mjs` — the per-resource suite.
7. Runtime coverage gate.

Steps 1–5 are expected to hold coverage well under 90%; the gate in step 7 is
added last, after step 6 makes it achievable.

## Risks

- **Step 6 is the bulk and the most error-prone.** The per-resource suite
  encodes detailed behaviour, and a wrong assertion produces a test that fails
  on correct code. Mitigation: it is emitted last, against golden cases whose
  expected service behaviour is already pinned, and the runtime gate runs it
  for real rather than trusting the snapshot.
- **Adding four devDependencies** enlarges every generated service's install.
  Accepted deliberately: without them the emitted specs cannot run, which was
  the gap this spec exists to close.
- **`behaviour.mjs` touches the one emitter we should least like to break.**
  Mitigated by doing it first, alone, with golden as the proof.
