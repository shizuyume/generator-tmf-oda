# Test-suite emitter, plan 3 of 3: per-resource specs and the coverage gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit `test/<dir>/<resource>.service.spec.ts` for every resource — the
suite that actually exercises the generated service and controller — and gate it
with a runtime check that the emitted tests pass and reach >=90% line coverage.

**Architecture:** One more emitter in the `src/emit/spec/` pipeline built in plan
2, but unlike the other five it emits one file PER RESOURCE rather than one per
service. It is built up over six tasks — fixture, controller, then create,
findAll, findOne, update+remove — each adding describes to the same emitted
file, so every task's progress is measurable as tests and coverage going up. A
seventh task adds the runtime gate.

**Tech Stack:** Node ESM (`.mjs`, no build step, no unit-test framework in the
generator), NestJS + TypeORM in the emitted service, Jest + ts-jest for the
emitted suite.

**Spec:** `docs/superpowers/specs/2026-09-17-test-suite-emitter-design.md`

**Depends on:** plan 1 (`...-1-foundation.md`, merged at `eb9ae5f`) and plan 2
(`...-2-per-component.md`, merged at `a882721`).

## Where this starts from

A generated service today ships 8 spec files and reaches **80 measurable files /
47.03% line coverage**. Of the 1114 uncovered lines, **971 are `*.service.ts`
and 137 are `*.controller.ts`** — both of which this plan covers, in the same
emitted file.

The reference is `C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts`
(764 lines) and its simpler sibling `ack-alarm/ack-alarm.service.spec.ts` (334).
Both are laid out the same way:

| Lines (alarm) | Content |
|---|---|
| 1-143 | imports, `makeRepo`, `makeQueryBuilder`, `COLLECTIONS`, `HREF`, `HREF_SEGMENT`, `row()`, `entity()` |
| 144-183 | the service describe's own `beforeEach` wiring |
| 184-295 | `create` · 296-348 `findAll` · 349-466 `findEntity/findOne` · 467-620 `update` · 621-658 `remove` |
| 659-748 | `describe('<R>Controller')` |
| 749-764 | `describe('<R> entities')` |

A resource with no collections and no refs (ack-alarm, 334 lines) omits the
entities describe and shrinks the service describe. Measured, it also has NO
`update` and NO `remove` describe at all - only create, findAll and
findEntity/findOne, with its controller at line 277. That is operation gating in
the reference itself, and the clearest evidence that these blocks must be emitted
per the resource's declared operations rather than unconditionally.

## Global Constraints

- **The generator has no unit tests.** `generator/tools/golden.mjs` and
  `generator/tools/check-all.mjs` are the whole test cycle. Do not add a test
  framework to the generator. The Jest suite being emitted is the *generated
  service's*.
- **All generator commands run from `C:/REPOSITORY/oh-my-tmf-agent-workspace/generator`.**
- **`node tools/check-all.mjs` must report exactly `2 gate(s) failed`** until
  task 7 adds a gate — `FE fe-gen golden matrix` and `FE schema validate`, both
  pre-existing, both from seven gitignored and absent root `frontend-spec-*.yaml`
  inputs. A third failure before task 7 is a regression.
- **Golden cycle:** a changed emitted file makes `node tools/golden.mjs` go RED.
  That red step is the proof the emitter is reached. Then `--update`, then verify
  green. Never `--update` without seeing red first.
- **The emitters run on the manifest UNION, not one IR.** Plan 2 fixed a Critical
  where `emitSpecs` saw only the last component of a multi-component service and
  the emitted suite failed outright on golden case `geo-multi`. `emitSpecs` is
  called after `writeWiring` with `orderedComponents(manifest)`. Every new
  emitter consumes that union. **`geo-multi` must be run, not just golden-diffed,
  at every task** — golden snapshots a broken file perfectly.
- **Never assert the behaviour of a user-owned file.** `*.hooks.ts` carries
  `// NOT managed by tmfgen. Created once if missing; never overwritten.` Plan 2
  shipped a spec asserting its return values and had to retract it: the moment a
  user implements a hook, a file stamped `DO NOT EDIT` goes red. Where this
  plan's specs involve hooks, assert only that the service CALLS them, never what
  they return.
- **Behaviour facts come from `src/emit/behaviour.mjs`, never re-derived.** It
  exports `DEFAULT_OFFSET`, `DEFAULT_LIMIT`, `AUDIT_AND_SOFT_DELETE`,
  `SOFT_DELETE_COLUMNS`, `SOFT_DELETE_TIMESTAMP_COLUMN`,
  `SOFT_DELETE_ATTRIBUTION_COLUMNS`, `SOFT_DELETE_DEFAULTS`,
  `ALWAYS_PRESENT_TRAILER`, `EMPTY_TRAILER_VALUE`, `SORT_ORDER_FALLBACK`,
  `LATEST_ORDER_COLUMN`, `LATEST_ORDER_DIRECTION`, `LATEST_TAKE`,
  `PLACEHOLDER_SUBSCRIPTION`, `HUB_PATH_SEGMENT`, and `defaultAtType(name)`.
  A literal copy of any of these in a spec emitter is the drift the module exists
  to prevent.
- **Non-TMF constraint.** Spec emitters may read only IR/plan fields —
  `resource.name`, `resource.fields`, `resource.operations`, `resource.paths`,
  `resource.resourceRefs`, the entity plan, the manifest union. Never the TMF
  number, CTK artefacts, or TM-Forum-specific resource names.
- **Emitted files are Prettier-clean.** Check from INSIDE a golden case
  directory so the service's own `.prettierrc` applies:
  `cd generator/golden/tmf736-v5/backend && cp test/<f> test/.tmp.ts && C:/REPOSITORY/GEN_REPO/alarm-service/backend/node_modules/.bin/prettier --check test/.tmp.ts ; rm -f test/.tmp.ts`
  A copy under `/tmp` silently uses Prettier's DEFAULTS and reports bogus
  single→double quote changes. Delete the temp file or it becomes golden churn.
  A line over 80 chars is only a defect when Prettier can actually break it.
- **`C:/REPOSITORY/GEN_REPO` is read-only reference.** Never write there.
- **Commit to `merge-local-generator`. Never commit or push to `main`.**
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Per-resource file, fixture preamble, and the entities describe

Establishes the one-file-per-resource emitter and the fixture every later task
builds on. Ends with a spec that compiles, runs and asserts something real —
that every entity class the resource maps is constructible.

**Files:**
- Create: `generator/src/emit/spec/resource.mjs`
- Modify: `generator/src/emit/spec/index.mjs` (register)

**Interfaces:**
- Consumes: **`ctx.plans`, NOT the manifest union.** `emitSpecs` today receives
  `{ components, resources, seeds }` built from the manifest, and a manifest
  resource entry carries only `className, dir, importPath, moduleClass,
  moduleImportPath, pathSegment, resource` — no columns, no relations, no refs.
  The per-resource fixture needs all three. Add `plans` to the object passed at
  the `emitSpecs(...)` call site in `emit/index.mjs` (it is still in scope there)
  and consume that.

  This is correct, not a workaround, and it does NOT reopen the multi-component
  Critical plan 2 fixed. That bug existed because `seed.spec.ts` is ONE file
  describing EVERY resource, so a single IR gave it a partial view. A
  per-resource spec describes exactly ONE resource: emitting component A writes
  A's resources' spec files, and component B's spec files — written when B was
  emitted — sit on disk untouched and still correct. Per-resource files are
  inherently per-component and idempotent. The union stays for the whole-service
  files that genuinely need it.
- Produces: `emitResourceSpecs(ctx)` returning an ARRAY of `{ rel, text }` —
  one per resource — or `[]`. Note this differs from the other five emitters,
  which return a single object or `null`. Update `emitSpecs` to accept both:
  an emitter may return `null`, an object, or an array of objects.

- [ ] **Step 1: Read both references end to end**

```bash
sed -n '1,72p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/ack-alarm/ack-alarm.service.spec.ts
sed -n '1,143p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
sed -n '749,764p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
```

The fixture is: imports, `makeRepo()`, `makeQueryBuilder(rows)`, a `COLLECTIONS`
tuple, an `HREF` constant, an `HREF_SEGMENT` map, `row(collection, index)` and
`entity(over)`. The simple resource omits what it does not have.

- [ ] **Step 2: Work out what each fixture part comes from**

Write this mapping down in the emitter's header comment before you write code,
and verify each against a generated service in `generator/golden/`:

| Fixture part | Derived from |
|---|---|
| `import { <R>Service }` / `<R>Controller` | the resource's module dir and file names, as `emit/index.mjs` writes them |
| `import { <C>EventType }` | the event-types barrel the component emits |
| `COLLECTIONS` | the resource's owned (one-to-many) relations |
| `HREF` | `ir.meta.basePath` + `resource.pathSegment` + a fixed `res-1` |
| `HREF_SEGMENT` | per collection, the path segment its row mapper writes into the child href |
| `row()`'s `atType` | the collection's target entity class name |
| `entity()`'s scalars | the root entity's non-housekeeping columns, each `res-<name>` |

**Do not guess any of these from the reference file's literal values.** The
reference is TMF642's; your emitter must produce the equivalent for any
component. Where the mapping is not obvious from the IR, read the corresponding
renderer in `src/emit/service.mjs` — whatever it writes is what the fixture must
describe.

- [ ] **Step 3: Write the emitter with only the entities describe**

Create `generator/src/emit/spec/resource.mjs`. Emit the full fixture from Step 2
plus this one describe, modelled on the reference's lines 749-764:

```
describe('<R> entities', () => {
  it('are constructible, so the mocked repositories stand in for real rows', () => {
    // one expect per entity class the resource maps
  });
});
```

Omit the describe entirely when the resource maps no entities beyond its root —
an empty describe asserts nothing and is a Sonar smell.

Emit nothing (`[]`) for a resource with no operations at all.

- [ ] **Step 4: Teach `emitSpecs` to accept an array**

In `generator/src/emit/spec/index.mjs`, change the loop so an emitter may return
`null`, one `{ rel, text }`, or an array of them:

```js
  for (const emit of EMITTERS) {
    const out = emit(ctx);
    if (!out) continue;
    for (const file of Array.isArray(out) ? out : [out]) {
      writeFile(file.rel, file.text);
      written.push(file.rel);
    }
  }
```

and register `emitResourceSpecs`.

- [ ] **Step 5: Parse check and CLI load**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/spec/resource.mjs && node --check src/emit/spec/index.mjs && node src/cli.mjs --help
```

- [ ] **Step 6: Golden red, then record**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: FAIL with one new `backend/test/<dir>/<resource>.service.spec.ts` per
resource per case. Then `--update`, re-verify green, then `check-all.mjs` at
exactly `2 gate(s) failed`.

- [ ] **Step 7: Run both shapes**

Single-component:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
SCRATCH="C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan3"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
node src/cli.mjs scaffold --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --port 5001 --db postgres
node src/cli.mjs emit --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --db postgres
cd "$SCRATCH/alarm-service/backend" && yarn install && yarn test
```
Expected: 15 suites (8 + 7 resources), all passing. Report the counts.

Multi-component — **this is not optional**; plan 2 shipped a Critical that golden
could not see:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
cp -r golden/geo-multi/backend "$SCRATCH/geo-multi-backend"
```
then junction `node_modules` from the plan3 service at BOTH the service level and
the `backend` level (it is a yarn workspace layout), and run jest there.
Expected: green. Report suite and test counts.

- [ ] **Step 8: Prettier and coverage**

Prettier-check the emitted spec in two golden cases with different resource
names, per the Global Constraints recipe. Then:
```bash
cd "$SCRATCH/alarm-service/backend" && yarn test:cov
```
Report file count and line percentage. It was 80 files / 47.03%.

- [ ] **Step 9: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: per-resource spec file and its fixture

The sixth spec emitter, and the first that emits one file per resource rather
than one per service - emitSpecs now accepts an array from an emitter as well
as a single file or null.

This commit lands the fixture every later task builds on (makeRepo,
makeQueryBuilder, COLLECTIONS, HREF, HREF_SEGMENT, row, entity) plus the
entities describe, so the file already asserts something real: every entity
class the resource maps is constructible.

Run on the multi-component geo-multi case as well as a single-component
service - golden alone cannot see a suite that is wrong for a service hosting
more than one component.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The controller describe

~90 lines in the reference and close to uniform across resources: the route
metadata and the delegation from controller to service.

**Files:**
- Modify: `generator/src/emit/spec/resource.mjs`

**Interfaces:**
- Consumes: the resource's `operations` flags and `pathSegment`; the DTO class
  names the controller types its write bodies as.
- Produces: a `describe('<R>Controller')` block appended to the same emitted
  file.

- [ ] **Step 1: Read the reference block**

```bash
sed -n '659,748p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
sed -n '277,334p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/ack-alarm/ack-alarm.service.spec.ts
```

Its `it()`s are: sets the Location header from the created resource href; omits
it when there is no href; passes the query through to findAll; forwards id and
field selection to findOne; forwards id and payload to update; delegates the
delete route; is constructible by Nest with its route metadata intact; types
every write body as its DTO class so ValidationPipe has something to validate.

- [ ] **Step 2: Gate each `it()` on the operation that backs it**

A read-only resource has no create, update or remove route. Emit only the
`it()`s whose operation the resource declares — `resource.operations` carries the
same flags `emit/service.mjs` and `emit/controller.mjs` branch on. Do not emit a
`describe` with no `it()` in it.

- [ ] **Step 3: Golden red, record, verify**

`node tools/golden.mjs` (red) → `--update` → green → `check-all.mjs` at exactly
`2 gate(s) failed`.

- [ ] **Step 4: Run both shapes, Prettier, coverage**

Same as Task 1 Steps 7-8. Report: single-component suite/test counts,
multi-component suite/test counts, Prettier clean on two cases, and the coverage
figure. **`*.controller.ts` should move off 0% here** — say by how much.

- [ ] **Step 5: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: controller describe in the per-resource spec

Covers the route metadata and the controller's delegation to its service:
Location header on create, query pass-through on list, id and field selection
on read, id and payload on update, delegation on delete, Nest constructibility
with route metadata intact, and DTO-typed write bodies so ValidationPipe has a
class to validate.

Each it() is gated on the operation that backs it, so a read-only resource
emits no create/update/remove assertions rather than an empty describe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The service describe — `create`

The first and largest slice of the service suite.

**Files:**
- Modify: `generator/src/emit/spec/resource.mjs`

- [ ] **Step 1: Read the reference block**

```bash
sed -n '184,295p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
```

Its `it()`s, in order: persists every scalar and answers with the stored
resource plus its href; emits a create event carrying the mapped response; keeps
a client-supplied id and defaults `@type` to the resource name; generates a uuid
when no id is supplied and keeps a supplied `@type`; clears the soft-delete
stamps so a reused id is resurrected rather than rejected; writes the single refs
as their own rows before the aggregate that points at them; writes a place row
and the nested entity before the aggregate; numbers each collection row by its
position in the payload; leaves the single refs unset and every collection empty
when the payload omits them; builds from the payload the `beforeCreate` hook
returns, not the raw dto.

- [ ] **Step 2: Map each `it()` to the resource shape that justifies it**

Emit an `it()` only when the resource actually has the thing it asserts:

| `it()` | Emitted when |
|---|---|
| persists every scalar | always (create exists) |
| emits a create event | the component declares a create event for this resource |
| keeps client id / defaults `@type` | always |
| generates a uuid | always |
| resurrects a soft-deleted id | the resource soft-deletes |
| writes single refs first | `resource.resourceRefs` is non-empty |
| writes a nested row before the aggregate | the resource has a collection whose target itself owns a collection |
| numbers rows by position | the resource has at least one collection |
| leaves refs unset / collections empty | the resource has refs or collections |
| builds from the `beforeCreate` payload | always |

**The `@type` default must come from `defaultAtType()` in `behaviour.mjs`.** The
soft-delete column names must come from `SOFT_DELETE_TIMESTAMP_COLUMN` and
`SOFT_DELETE_ATTRIBUTION_COLUMNS`. The `sortOrder` numbering must use
`SORT_ORDER_FALLBACK`. A literal here is drift.

**The hook assertion is about the CALL, not the return.** `*.hooks.ts` is
user-owned. Assert that `create` passes the hook's result to the builder when the
hook returns one — never that the hook returns any particular thing.

- [ ] **Step 3: Golden red, record, verify; run both shapes; Prettier; coverage**

As Task 1 Steps 6-8. Report every figure. `*.service.ts` coverage should move
substantially here — say by how much.

- [ ] **Step 4: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: create() coverage in the per-resource spec

Scalars, the create event, client-supplied vs generated id, the @type default,
soft-delete resurrection on a reused id, ref rows written before the aggregate
that points at them, nested rows before their parent, sortOrder numbering by
payload position, the empty-payload case, and that create builds from what the
beforeCreate hook returns.

Every it() is gated on the resource shape that justifies it, and every value
the generated service also knows - the @type default, the soft-delete column
names, the sortOrder fallback - is interpolated from emit/behaviour.mjs rather
than copied, so the suite cannot drift from what emit/service.mjs generates.

The hook assertion covers the CALL, not the return value: *.hooks.ts is
user-owned and a generated spec must not constrain what a user puts in it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The service describe — `findAll`

**Files:**
- Modify: `generator/src/emit/spec/resource.mjs`

- [ ] **Step 1: Read the reference block**

```bash
sed -n '296,348p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
```

`it()`s: maps every row and reports the unpaged total; excludes soft-deleted rows
and narrows by id; pages with the supplied window; defaults to the first page of
twenty; orders by the requested sort key; projects only the requested fields,
keeping id, href and `@type`.

- [ ] **Step 2: Interpolate the page window**

"defaults to the first page of twenty" asserts `DEFAULT_OFFSET` and
`DEFAULT_LIMIT`. Interpolate both, and **do not hardcode the word "twenty" in the
test title** — plan 2 left exactly that in the subscription spec's titles, where
changing `DEFAULT_LIMIT` would falsify the prose. Build the title from the
constant.

The soft-delete filter asserts `SOFT_DELETE_TIMESTAMP_COLUMN IS NULL`;
interpolate it.

- [ ] **Step 3: Golden red, record, verify; run both shapes; Prettier; coverage**

As Task 1 Steps 6-8. Report every figure.

- [ ] **Step 4: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: findAll() coverage in the per-resource spec

Row mapping and the unpaged total, the soft-delete filter and id narrowing, the
supplied page window, the default window, sort-key ordering, and field
projection that keeps id, href and @type.

The default window is interpolated from behaviour.mjs - including into the test
TITLE, so changing DEFAULT_LIMIT cannot leave a spec that says "twenty" while
asserting something else.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The service describe — `findEntity` / `findOne`

**Files:**
- Modify: `generator/src/emit/spec/resource.mjs`

- [ ] **Step 1: Read the reference block**

```bash
sed -n '349,466p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
```

`it()`s: throws NotFoundException when the row is missing or soft-deleted; maps
every scalar and the resource href; maps the single refs, exposing their referred
id rather than the row id; maps every collection including a nested entity; falls
back to the row id when a child carries no refId; omits refs and returns empty
collections when the row carries none; orders each collection by `sortOrder`
rather than insertion; treats a row with no `sortOrder` as first; defaults
`@schemaLocation` and `@baseType` to the empty string; projects requested fields
on a single read; returns what the `afterFindOne` hook decorates.

- [ ] **Step 2: Interpolate the trailer defaults and the sort fallback**

`@schemaLocation` / `@baseType` defaulting to the empty string is
`ALWAYS_PRESENT_TRAILER` and `EMPTY_TRAILER_VALUE`. "Treats a row with no
sortOrder as first" is `SORT_ORDER_FALLBACK`. Interpolate all three.

The `afterFindOne` assertion is again about the CALL: assert the service passes
the mapped response through the hook and returns what it gets back, without
asserting what an implementation would return.

- [ ] **Step 3: Golden red, record, verify; run both shapes; Prettier; coverage**

As Task 1 Steps 6-8. Report every figure.

- [ ] **Step 4: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: findOne() coverage in the per-resource spec

NotFoundException for a missing or soft-deleted row, scalar and href mapping,
single refs exposing their referred id, collections including nested rows, the
refId fallback to the row id, the empty-row case, sortOrder ordering with a
missing value sorting first, the empty-string trailer defaults, field
projection on a single read, and the afterFindOne hook.

The trailer defaults and the sortOrder fallback come from behaviour.mjs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The service describe — `update` and `remove`

**Files:**
- Modify: `generator/src/emit/spec/resource.mjs`

- [ ] **Step 1: Read the reference blocks**

```bash
sed -n '467,658p' C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/alarm/alarm.service.spec.ts
```

`update`: throws NotFoundException for a missing or soft-deleted row; applies
every scalar the payload carries; leaves omitted fields untouched; replaces each
collection wholesale, deleting owned rows first; treats a collection sent as
`null` like one sent as `[]`; deletes rows orphaned by replacing a collection;
does not touch a child table when no row nested one; replaces a single ref and
removes the row it orphaned.

`remove` occupies lines 621-658. Enumerate its `it()`s from the file rather than
from this plan; they cover the soft-delete write and its default attribution.

- [ ] **Step 2: Interpolate the soft-delete facts**

`remove()` writes `SOFT_DELETE_TIMESTAMP_COLUMN` and, when the caller names
neither, `SOFT_DELETE_DEFAULTS.deletedBy` / `.deletedReason`. Interpolate all
three — these are precisely the values plan 1 extracted for this task.

- [ ] **Step 3: Golden red, record, verify; run both shapes; Prettier; coverage**

As Task 1 Steps 6-8. Report every figure. This is the last content task — report
whether coverage has reached 90%, and if not, what is still uncovered, broken
down by file kind.

- [ ] **Step 4: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/spec generator/golden && git commit -F - <<'EOF'
emit: update() and remove() coverage in the per-resource spec

update: NotFoundException, scalar application, untouched omissions, wholesale
collection replacement with owned rows deleted first, null treated as [],
orphan cleanup for both collections and single refs, and the no-nested-row case.

remove: the soft-delete write and its default attribution, both interpolated
from behaviour.mjs - the values plan 1 extracted for exactly this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: The runtime coverage gate

Golden proves the emitted suite is stable. Only running it proves it passes and
reaches the coverage the emitter exists to deliver. This is the gate the whole
three-plan effort is measured by.

**Files:**
- Modify: `generator/tools/check-all.mjs`

**Interfaces:**
- Consumes: the emitted suite in a generated service.
- Produces: a new gate in `check-all.mjs --runtime`.

- [ ] **Step 1: Read how `--runtime` already works**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && sed -n '1,40p' tools/check-all.mjs && grep -n "runtime" tools/check-all.mjs
```

`--runtime` is opt-in because its gates need a built service with dependencies
installed. Add to that set; do not make this gate run in the default static pass,
or `check-all.mjs` becomes a multi-minute command for everyone.

- [ ] **Step 2: Write the gate**

It must, against one generated service: run the emitted suite, assert it exited
0, parse line coverage from `coverage/lcov.info`, and assert it is >= 90.

Parse `lcov.info` rather than scraping the text summary — the summary's format is
Jest's to change. In lcov, `LF:` is lines found and `LH:` lines hit, once per
file; line coverage is the sum of `LH` over the sum of `LF`.

Report both numbers in the gate's output whether it passes or fails, so a
failure says how far short it fell.

- [ ] **Step 3: Prove the gate can fail**

A gate that cannot fail is worse than no gate. Demonstrate it: temporarily raise
the threshold above the achieved figure, run `check-all.mjs --runtime`, and show
it reporting a third failed gate. Put the threshold back to 90 and show it
passing. Paste both outputs in your report.

- [ ] **Step 4: Confirm the default pass is unchanged**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/check-all.mjs
```
Expected: still exactly `2 gate(s) failed`, and no slower than before — the new
gate must not run without `--runtime`.

- [ ] **Step 5: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/tools/check-all.mjs && git commit -F - <<'EOF'
tools: gate the emitted suite on passing and >=90% coverage

Golden proves the emitted specs are byte-stable; only running them proves they
pass and reach the coverage the emitter exists to deliver. The gate runs the
emitted suite against a generated service, requires exit 0, and parses line
coverage from coverage/lcov.info (sum of LH over sum of LF - the text summary's
format is Jest's to change).

Opt-in under --runtime, like the other gates that need an installed service, so
the default static pass stays fast.

Demonstrated failing as well as passing: a gate that cannot fail is worse than
no gate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Done when

- `node tools/golden.mjs` passes without `--update`.
- `node tools/check-all.mjs` reports exactly `2 gate(s) failed` in the default
  pass — the two pre-existing FE ones.
- `node tools/check-all.mjs --runtime` passes its new coverage gate, and that
  gate has been demonstrated failing when the threshold is raised.
- A single-component generated service runs its emitted suite green.
- The multi-component `geo-multi` case runs its emitted suite green — checked by
  running it, not by golden.
- Line coverage of a generated service is >= 90%.

## If 90% is not reached

Task 6 reports what is still uncovered by file kind. Do not lower the gate to
match. Either add the missing assertions, or — if what remains is genuinely
untestable without a database — narrow `collectCoverageFrom` to exclude it and
say so explicitly in the commit, so the number keeps meaning what it says.

## Not in this plan

- Moving the 424 hand-written specs in `GEN_REPO` out of `src/`. Out of scope in
  the spec; the user does that by hand.
- Support for non-TMF Swagger specs as a feature. It is a constraint on these
  emitters, not a deliverable here.
