# Test-suite emitter, plan 1 of 3: foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generated service a runnable test toolchain and the three
spec files that need no per-component knowledge, and extract the behaviour
constants that plans 2 and 3 depend on.

**Architecture:** Three independent changes to the generator. One is a pure
extract-constant refactor of `src/emit/service.mjs` into a new
`src/emit/behaviour.mjs`. Two are additions to `templates/`, which
`scaffold` already copies recursively — no emitter code and no change to
`newService.mjs`. Nothing in this plan emits anything per-resource; that is
plans 2 and 3.

**Tech Stack:** Node ESM (`.mjs`, no build step, no unit-test framework in the
generator itself), NestJS + TypeORM in the emitted service, Jest + ts-jest for
the emitted suite.

**Spec:** `docs/superpowers/specs/2026-09-17-test-suite-emitter-design.md`

## Global Constraints

- **The generator has no unit tests.** Its entire test strategy is
  `generator/tools/golden.mjs` (byte-stable snapshots + double-run determinism)
  and `generator/tools/check-all.mjs` (which runs golden plus a 130-component
  corpus sweep and the FE gates). Every task in this plan is verified with
  those two commands. Do not add a test framework to the generator.
- **All commands run from `generator/`**, i.e. `cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator`.
- **Two gates already fail on this machine and must keep failing exactly the
  same way:** `FE fe-gen golden matrix` and `FE schema validate`. Both fail only
  because the seven root `frontend-spec-*.yaml` inputs are gitignored (`/*.yaml`)
  and absent here. `check-all.mjs` must report **`2 gate(s) failed`** before and
  after every task. A third failure is a regression.
- **Never `git checkout` in `C:/REPOSITORY/GEN_REPO`** and never write into it.
  It is a read-only reference in this plan.
- **Emitted files are Prettier-clean** under the service's own
  `.prettierrc` (`{"singleQuote": true, "trailingComma": "all"}`, default
  `printWidth` 80) and use LF line endings.
- **Commit to the `merge-local-generator` branch. Never commit or push to
  `main`.**
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Extract the shared behaviour constants

The service emitter writes the runtime behaviour; the spec emitter in plan 3
will assert it. If each keeps its own copy of "the default page is 20 rows",
a later change to one silently teaches the other to assert the new behaviour,
and the suite stays green across a regression. This task gives both a single
source.

It is a pure extract-constant refactor: the generated output must not change by
one byte. `golden.mjs` run **without** `--update` is the assertion.

**Files:**
- Create: `generator/src/emit/behaviour.mjs`
- Modify: `generator/src/emit/service.mjs` (lines 23-25, 148, 452)

**Interfaces:**
- Consumes: nothing.
- Produces: `generator/src/emit/behaviour.mjs` exporting
  `DEFAULT_OFFSET: number`, `DEFAULT_LIMIT: number`,
  `AUDIT_AND_SOFT_DELETE: Set<string>`, `SOFT_DELETE_COLUMNS: string[]`,
  `ALWAYS_PRESENT_TRAILER: Set<string>`, `SORT_ORDER_FALLBACK: number`.
  Plan 3's `emit/spec/service.mjs` imports all six.

- [ ] **Step 1: Confirm the baseline is green before touching anything**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: `all golden checks passed`. If it does not, stop — the tree was
already dirty and this task's assertion is meaningless.

- [ ] **Step 2: Create the shared module**

Create `generator/src/emit/behaviour.mjs`:

```js
/**
 * Runtime behaviour the service emitter generates, in one place because two
 * emitters depend on it.
 *
 * emit/service.mjs writes the service code. emit/spec/service.mjs writes the
 * tests that assert that code. When each holds its own copy of a fact like the
 * default page size, changing one teaches the other to assert the NEW
 * behaviour, and the suite stays green straight through a regression - the
 * failure mode a generated test suite exists to prevent.
 *
 * Only facts BOTH emitters need belong here. Anything one side alone uses
 * stays where it is.
 */

/** findAll() window when the query supplies neither offset nor limit. */
export const DEFAULT_OFFSET = 0;
export const DEFAULT_LIMIT = 20;

/**
 * Columns that belong to US (audit / soft delete) rather than to the spec.
 * The name alone is not authoritative - see isHousekeeping() in service.mjs,
 * which also checks the column's origin - but the name set is shared.
 */
export const AUDIT_AND_SOFT_DELETE = new Set([
  'createdDate', 'lastUpdate', 'deletedAt', 'deletedBy', 'deletedReason',
]);

/** Soft-delete bookkeeping cleared when a create reuses a deleted id. */
export const SOFT_DELETE_COLUMNS = ['deletedAt', 'deletedBy', 'deletedReason'];

/**
 * Trailer attributes emitted on every root response even when unset, as the
 * empty string. v5 conformance profiles schema-validate the response and v4
 * kits assert the attribute is present; an empty string satisfies both and
 * invents no URI the server cannot know. TMF730 fails 20 assertions without
 * this, against a POST body baked into its CTK image that sends neither.
 */
export const ALWAYS_PRESENT_TRAILER = new Set(['atBaseType', 'atSchemaLocation']);

/** Owned rows come back ordered by sortOrder; a row without one sorts first. */
export const SORT_ORDER_FALLBACK = 0;
```

- [ ] **Step 3: Import them in the service emitter**

`generator/src/emit/service.mjs` opens with exactly two imports:

```js
import { createHash } from 'node:crypto';
import { camel, pascal, kebab } from '../ir/naming.mjs';
```

Add a third below them:

```js
import {
  AUDIT_AND_SOFT_DELETE,
  SOFT_DELETE_COLUMNS,
  ALWAYS_PRESENT_TRAILER,
  DEFAULT_OFFSET,
  DEFAULT_LIMIT,
  SORT_ORDER_FALLBACK,
} from './behaviour.mjs';
```

- [ ] **Step 4: Delete the three local definitions**

Remove this block (currently at lines 23-25):

```js
const AUDIT_AND_SOFT_DELETE = new Set([
  'createdDate', 'lastUpdate', 'deletedAt', 'deletedBy', 'deletedReason',
]);
```

Remove this line inside the response-mapper renderer (currently line 148):

```js
  const ALWAYS_PRESENT_TRAILER = new Set(['atBaseType', 'atSchemaLocation']);
```

Remove this line (currently line 452):

```js
  const softDeleteCols = ['deletedAt', 'deletedBy', 'deletedReason'];
```

and replace its uses. `softDeleteCols` is referenced later in the same
function; rename those references to `SOFT_DELETE_COLUMNS`. Find them with:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "softDeleteCols" src/emit/service.mjs
```
Expected after the rename: no matches.

- [ ] **Step 5: Use the page-window constants**

Replace the literals in the `findAll` renderer (currently line 590):

```js
    qb.skip(query.offset ?? 0).take(query.limit ?? 20);
```

with a template interpolation of the shared values:

```js
    qb.skip(query.offset ?? ${DEFAULT_OFFSET}).take(query.limit ?? ${DEFAULT_LIMIT});
```

This line sits inside a JS template literal that renders TypeScript, so
`${DEFAULT_OFFSET}` interpolates at generate time and the emitted TypeScript
still reads `query.offset ?? 0`. That is the point: the output is unchanged.

Do the same for the `sortOrder` read fallback. There is exactly one such line
(currently line 179) and it carries the fallback twice, once per comparand:

```js
      lines.push(`    out.${rel.property} = [...(e.${rel.property} ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((c) => this.map${target.className}(c${rootIdArg}));`);
```

Replace both `?? 0` occurrences on that line with `?? ${SORT_ORDER_FALLBACK}`.

Do **not** touch the two `{ sortOrder: __i }` lines (currently 289 and 291).
Those are the write side — they assign a row's position on create — and carry
no fallback. Find the read fallback with:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "sortOrder ?? 0" src/emit/service.mjs
```
Expected after the change: no matches.

- [ ] **Step 6: Verify the module parses**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node --check src/emit/behaviour.mjs && node --check src/emit/service.mjs && node src/cli.mjs --help
```
Expected: no syntax error, and the CLI prints its command list. `--help` is
what proves the new import actually resolves; `node --check` does not follow
imports.

- [ ] **Step 7: Verify the output did not move**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: `all golden checks passed`, with **no** `--update`. Any diff here
means the extraction changed behaviour and must be fixed, not re-recorded.

- [ ] **Step 8: Verify nothing else regressed**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/check-all.mjs
```
Expected: `2 gate(s) failed` — the two pre-existing FE failures named in Global
Constraints, and nothing else. In particular `corpus sweep` must still report
`130 components, 0 crashes`.

- [ ] **Step 9: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/src/emit/behaviour.mjs generator/src/emit/service.mjs && git commit -F - <<'EOF'
emit: extract shared behaviour constants

The spec emitter (plan 3) asserts the behaviour service.mjs generates. With
each side holding its own copy of a fact like the default page size, changing
one would teach the other to assert the new behaviour and the suite would stay
green across a regression. Both now import emit/behaviour.mjs.

Pure extract-constant: golden passes unchanged, without --update.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Ship a runnable test toolchain in the scaffold

A generated service today declares no test dependencies and no test script. In
`GEN_REPO` this is worked around by symlinking `node_modules` to another
service. The scaffold will carry its own instead.

`tsconfig.build.json` already excludes `test` and `**/*spec.ts`, so `nest build`
needs no change — verified, do not edit it.

**Files:**
- Modify: `generator/templates/package.json`
- Create: `generator/templates/jest.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: every scaffolded service gains `jest.config.js` at its backend root
  and the scripts `test` and `test:cov`. Jest resolves specs from
  `<backend>/test` only. Plan 2 and plan 3 emit into that directory.

- [ ] **Step 1: Add the test dependencies and scripts**

In `generator/templates/package.json`, add to `scripts` (after `lint`):

```json
    "test": "jest",
    "test:cov": "jest --coverage",
```

and add to `devDependencies`, keeping the existing alphabetical order:

```json
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
```

`@nestjs/testing` is pinned to the same minor as the other `@nestjs/*` runtime
packages already in `dependencies` (`^10.3.0`), because `Test.createTestingModule`
must match the Nest version under test.

- [ ] **Step 2: Create the Jest config**

Create `generator/templates/jest.config.js`:

```js
/**
 * Unit-test setup for the generated suite.
 *
 * Tests mock TypeORM (DataSource / EntityManager / Repository) rather than
 * hitting a database: a service generated with `--db postgres` carries postgres
 * column types and will not boot on sqlite, so an in-memory database is not an
 * option.
 *
 * `roots` is test/ ALONE. Specs live outside src/ so that coverage is measured
 * over src/ without the suite measuring itself, and so that a service still
 * carrying hand-written specs under src/ does not run two suites at once.
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/dto/**',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
};
```

Two differences from the copy in `GEN_REPO`, both forced by specs moving out of
`src/`: `rootDir` is `.` rather than `src`, and the `collectCoverageFrom` globs
and the `ts-jest` `tsconfig` path are rebased accordingly.

- [ ] **Step 3: Run golden and watch it fail**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: FAIL. Every case reports a new file `jest.config.js` and a changed
`package.json`. This is the red step — it proves the new template actually
reaches the generated service. If golden passes here, `scaffold` is not picking
the file up and the task is not done.

- [ ] **Step 4: Record the new output**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs --update && node tools/golden.mjs
```
Expected: `recorded` lines for all five cases, then `all golden checks passed`
on the verify run.

- [ ] **Step 5: Confirm the file landed where Jest expects it**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && ls golden/tmf736-v5/backend/jest.config.js && grep -A2 '"test"' golden/tmf736-v5/backend/package.json
```
Expected: the file exists at the backend root (not inside `src/`), and
`package.json` shows the `test` and `test:cov` scripts.

- [ ] **Step 6: Verify nothing else regressed**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/check-all.mjs
```
Expected: `2 gate(s) failed`, the two pre-existing FE ones.

- [ ] **Step 7: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/templates/package.json generator/templates/jest.config.js generator/golden && git commit -F - <<'EOF'
scaffold: ship a runnable test toolchain

A generated service declared no test dependencies and no test script; the
services in GEN_REPO only run their suites by symlinking node_modules to
another service. The scaffold now carries jest, ts-jest, @types/jest and
@nestjs/testing, a test and test:cov script, and a jest.config.js.

Jest resolves specs from test/ only - outside src/, so coverage is measured
over src/ without the suite measuring itself, and a service still holding
hand-written specs under src/ does not run two suites at once.

tsconfig.build.json already excluded test/ and **/*spec.ts, so nest build
needed no change.

Golden re-recorded.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Template the three specs that need no per-component knowledge

Measured across all 35 services in `GEN_REPO`: `common.spec.ts` is identical in
all 35 (its two "variants" differ only in whether one import wraps across
lines), `event.spec.ts` likewise has two such variants, and `entities.spec.ts`
names no resource at all — it walks the entity barrel generically.

They test code that is itself a template. They are static files, not emitter
output.

All three are satisfied by `scaffold` alone — verified: a scaffold-only service
already has `src/common/`, `src/event/` and `src/entities.ts` (the barrel, with
the two infra entities `EventSubscription` and `EventLog`). So these specs are
green on an M2 service that has no resources emitted yet, which is the property
that lets them ship at scaffold time rather than emit time.

**Files:**
- Create: `generator/templates/test/common/common.spec.ts`
- Create: `generator/templates/test/event/event.spec.ts`
- Create: `generator/templates/test/entities.spec.ts`

**Interfaces:**
- Consumes: Task 2's `jest.config.js` (`roots: ['<rootDir>/test']`) and the
  four test devDependencies.
- Produces: three spec files in every scaffolded service. Plans 2 and 3 add
  siblings under the same `test/` root and must not collide with these paths.

- [ ] **Step 1: Copy the three sources**

Take `entities.spec.ts` from `warranty-service` specifically — it is the only
variant that walks the prototype chain (`ownedByAnEntity`), which is what keeps
it correct when a relation is declared on a shared base class rather than on an
entity in the barrel.

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
mkdir -p templates/test/common templates/test/event
cp C:/REPOSITORY/GEN_REPO/cdr-transaction-service/backend/src/common/common.spec.ts templates/test/common/common.spec.ts
cp C:/REPOSITORY/GEN_REPO/alarm-service/backend/src/event/event.spec.ts templates/test/event/event.spec.ts
cp C:/REPOSITORY/GEN_REPO/warranty-service/backend/src/entities.spec.ts templates/test/entities.spec.ts
```

- [ ] **Step 2: Rebase the imports for the new location**

The sources lived in `src/`; the templates land in `test/`. Rewrite exactly
these import specifiers and no others — the package imports
(`@nestjs/common`, `rxjs`, `typeorm`) stay untouched.

In `templates/test/common/common.spec.ts`:

| from | to |
|---|---|
| `'./guards/api-key.guard'` | `'../../src/common/guards/api-key.guard'` |
| `'./filters/http-exception.filter'` | `'../../src/common/filters/http-exception.filter'` |
| `'./interceptors/pagination.interceptor'` | `'../../src/common/interceptors/pagination.interceptor'` |
| `'./utils/query-helper.util'` | `'../../src/common/utils/query-helper.util'` |
| `'./utils/response-mapper.util'` | `'../../src/common/utils/response-mapper.util'` |
| `'./utils/tmf-resource.util'` | `'../../src/common/utils/tmf-resource.util'` |

In `templates/test/event/event.spec.ts`:

| from | to |
|---|---|
| `'./event-store.service'` | `'../../src/event/event-store.service'` |
| `'./event-emitter.service'` | `'../../src/event/event-emitter.service'` |
| `'./event-delivery.service'` | `'../../src/event/event-delivery.service'` |
| `'./rabbitmq.service'` | `'../../src/event/rabbitmq.service'` |

In `templates/test/entities.spec.ts`:

| from | to |
|---|---|
| `'./entities'` | `'../src/entities'` |

- [ ] **Step 3: Normalise formatting**

The sources are CRLF and were hand-formatted, so they fail Prettier's own
check. Canonicalise rather than inheriting that.

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
for f in templates/test/common/common.spec.ts templates/test/event/event.spec.ts templates/test/entities.spec.ts; do
  python -c "import io,sys; p=sys.argv[1]; s=io.open(p,encoding='utf-8',newline='').read().replace('\r\n','\n'); io.open(p,'w',encoding='utf-8',newline='').write(s)" "$f"
done
C:/REPOSITORY/GEN_REPO/alarm-service/backend/node_modules/.bin/prettier --write templates/test/common/common.spec.ts templates/test/event/event.spec.ts templates/test/entities.spec.ts
```

Note: `.prettierrc` is not present in `templates/test/`, so Prettier resolves
the one at `generator/templates/.prettierrc` — the same
`{"singleQuote": true, "trailingComma": "all"}` the generated service uses.
Confirm that file is the one being applied:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && cat templates/.prettierrc
```
Expected: `{"singleQuote": true, "trailingComma": "all"}` (formatted across
lines).

- [ ] **Step 4: Confirm no placeholder syntax leaked in**

`scaffold` renders every template through `render()`, which throws on an
unknown `{{...}}` placeholder. TypeScript's `${...}` is not one, but check:

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && grep -n "{{" templates/test/common/common.spec.ts templates/test/event/event.spec.ts templates/test/entities.spec.ts
```
Expected: no matches. A match means the file would crash `scaffold`.

- [ ] **Step 5: Run golden and watch it fail**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs
```
Expected: FAIL, with three new files per case under `backend/test/`. This proves
`walk(templatesDir)` picked up the new directory without any change to
`newService.mjs`.

- [ ] **Step 6: Record the new output**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/golden.mjs --update && node tools/golden.mjs
```
Expected: `recorded` for all five cases, then `all golden checks passed`.

- [ ] **Step 7: Prove the suite actually runs and passes**

This is the step that matters. Golden proves the files are stable; only running
them proves they are correct. Scaffold and emit a real service into the
scratchpad, install, and run the suite.

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator
SCRATCH="C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan1"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
node src/cli.mjs scaffold --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --port 5001 --db postgres
node src/cli.mjs emit --component ../documents/tmf642/5.0.0 --target-root "$SCRATCH" --name alarm-service --db postgres
cd "$SCRATCH/alarm-service/backend" && yarn install && yarn test
```

Expected: Jest discovers exactly three suites (`test/common/common.spec.ts`,
`test/event/event.spec.ts`, `test/entities.spec.ts`) and every test passes.

If `entities.spec.ts` fails, the likely cause is the barrel import path — check
that `src/entities.ts` exists at that path in the generated service and that
the rewrite in Step 2 matches it.

- [ ] **Step 8: Record the coverage this plan reaches**

Run:
```bash
cd "C:/Users/NB-183/AppData/Local/Temp/claude/C--REPOSITORY-oh-my-tmf-agent-workspace/71e8f77f-8190-457b-ba6d-fb9f8f0b143e/scratchpad/plan1/alarm-service/backend" && yarn test:cov
```
Expected: passes, with line coverage well under 90% — these three specs cover
`src/common/**` and `src/event/**` only, not the per-resource services. Note
the actual figure in the commit message; plan 3 is measured against it.

Do **not** add a coverage gate here. The spec puts that in plan 3, after the
per-resource suite makes 90% reachable.

- [ ] **Step 9: Verify nothing else regressed**

Run:
```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace/generator && node tools/check-all.mjs
```
Expected: `2 gate(s) failed`, the two pre-existing FE ones.

- [ ] **Step 10: Commit**

```bash
cd C:/REPOSITORY/oh-my-tmf-agent-workspace && git add generator/templates/test generator/golden && git commit -F - <<'EOF'
scaffold: template the three component-agnostic specs

common.spec.ts, event.spec.ts and entities.spec.ts need no per-component
knowledge: measured across all 35 services in GEN_REPO, common.spec.ts is
identical in every one (its two "variants" differ only in whether an import
wraps), and entities.spec.ts names no resource at all - it walks the entity
barrel generically. They test code that is itself a template, so they are
static files rather than emitter output.

entities.spec.ts is taken from warranty-service, the only variant that walks
the prototype chain, which is what keeps it correct when a relation is
declared on a shared base class instead of on an entity in the barrel.

Imports rebased from src/ to test/. Sources normalised to LF and run through
Prettier - the hand-written originals fail prettier --check.

scaffold needed no change: walk(templatesDir) already recurses.

Verified by running the suite in a scaffolded service, not only by golden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Done when

- `node tools/golden.mjs` passes without `--update`.
- `node tools/check-all.mjs` reports exactly `2 gate(s) failed`, both FE, both
  for the missing gitignored YAML inputs.
- A freshly scaffolded service runs `yarn install && yarn test` green with three
  suites, and `yarn test:cov` produces a coverage figure.
- `generator/src/emit/behaviour.mjs` exports the six values plan 3 imports.

## Not in this plan

- Any per-resource or per-component spec. Plans 2 and 3.
- The runtime coverage gate in `check-all.mjs --runtime`. Plan 3, once 90% is
  reachable.
- Moving the 424 hand-written specs in `GEN_REPO` out of `src/`. Explicitly out
  of scope in the spec; the user does that by hand.
