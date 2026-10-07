# go-gin adapter: behaviour parity sheet (Tahap 0)

This sheet is the contract between the NestJS output that tmfgen emits today and the Go
output the `go-gin` adapter must produce. **A behaviour that is not listed here is not
implemented.** Every Go test that proves a row carries its ID in the test name, for example
`TestB18_PatchReplacesCollectionInTx`.

## How to read it

**Evidence.** Primary evidence is the generated golden output
`golden/tmf736-v5/backend/src/**` (abbreviated `G:`). Secondary evidence is the emitter or
template that produced it (`E:`, relative to `generator/`). Static templates match the
golden line for line apart from token substitution.

**Labels.**
- **observed**: the code was read and proves it.
- **suspected**: it depends on framework or runtime behaviour that was not executed.

**Go column.**
- **P**: the Go output reproduces the Nest behaviour.
- **X-nn**: a deliberate divergence, listed in the divergence table with its reason.
- **Q-nn**: an open question that must be answered before the tahap that implements it.

Case study: TMF736 v5.0.0 (`PartyRevSharingAlgorithm`, base path
`tmf-api/revenueSharingAlgorithmManagement/v5`). The Go location column names the planned
package from the approved plan.

---

## A. Collection: list, paging, `fields`, filter, sort

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-01 | `GET /<base>/<res>` → 200. Body is a **bare JSON array**, not an envelope | G: `common/interceptors/pagination.interceptor.ts:16-26` | P | `platform/httpx` `WriteList` |
| B-02 | Default `offset=0`, `limit=20`. `offset<0`, `limit<1` or a non-integer → 400. **No maximum limit** | G: `...service.ts:115`, `common/dto/query-base.dto.ts:11-23`; E: `src/emit/behaviour.mjs:16-17` | P for defaults and 400; **X-01** for the maximum | `platform/httpx` paging |
| B-03 | `X-Total-Count` = unpaged match count (count runs before skip/take). `X-Result-Count` = page length. CORS exposes exactly these two headers | G: `...service.ts:114`, `pagination.interceptor.ts:23-24`, `main.ts:11-15` | P | `platform/httpx`, `platform/middleware` CORS |
| B-04 | No default `ORDER BY`; row order is whatever the database returns (observed) | G: `...service.ts:97-119` | **X-02** | `platform/httpx` sort |
| B-05 | `fields=a,b`: output keeps `@type` (v5 only), `id` and `href` first, then each requested key present on the item. Unknown names are ignored, nested paths are unsupported, and `fields=` (empty) returns the full resource. Applies to list and retrieve only; POST and PATCH always return the full resource | G: `common/utils/tmf-resource.util.ts:86-104`, `...service.ts:118,135`; E: `src/emit/behaviour.mjs:87-89` | P (response shape). **X-03** (projection is pushed into SQL) | `platform/httpx` fields |
| B-06 | Repeated `?fields=a&fields=b` on retrieve bypasses DTO validation and `.split` throws → 500 (suspected); on list → 400 | G: `...controller.ts:63`, `query-base.dto.ts:6-9` | **X-04** | `platform/httpx` fields |
| B-07 | Filters: `name` is a case-insensitive substring match; `q` matches `name` OR `description` (case-insensitive substring); `id` is exact; `deletedAt IS NULL` is always applied. Unknown query params are ignored (no whitelist) | G: `common/utils/query-helper.util.ts:7-22`, `...service.ts:107-112`, `main.ts:17`; E: `src/emit/service.mjs:585-593` | P | `platform/httpx` filter + `<resource>/repository.go` |
| B-08 | `lifecycleStatus` filter is applied unconditionally, even though TMF736 has no such column → SQL error → 500 (code observed, 500 suspected). LIKE wildcards `%` and `_` in input are not escaped (observed) | G: `query-base.dto.ts:30-33`, `query-helper.util.ts:9,20`; E: `src/emit/service.mjs:587`, `src/ir/buildIR.mjs:364-367` | **X-05** | `platform/httpx` filter |
| B-09 | `sort=a,-b`: a leading `-` means DESC. Names are **entity property names** (`name`, `createdDate`, `atType`), with no whitelist; raw text is interpolated into ORDER BY (possible injection surface, suspected) | G: `query-helper.util.ts:23-31`, `...service.ts:109` | **X-06** | `platform/httpx` sort |

## B. Create

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-10 | `POST` → **201** with the full mapped resource. `Location` = resource `href`, **relative with a leading slash** (`/tmf-api/.../partyRevSharingAlgorithm/<id>`) | G: `...controller.ts:18-19,33-37`; E: `src/emit/controller.mjs:86-88` | P | `<resource>/handler.go` |
| B-11 | A client-supplied `id` is honoured (`input.id ?? uuid`) | G: `...service.ts:234`; E: `src/emit/service.mjs:545-547` | P | `<resource>/service.go` |
| B-12 | Reusing the id of a **soft-deleted** row resurrects it (soft-delete columns are nulled before save) | G: `...service.ts:77-79`; E: `src/emit/service.mjs:557-558` | P | `<resource>/service.go` |
| B-13 | Reusing the id of a **live** row: no existence check and no 409; a single `save` probably overwrites it and returns 201 (suspected) | G: `...service.ts:61-95` | **X-07** | `<resource>/service.go` |
| B-14 | v5: `@type` is required by the create DTO (missing → 400). A falsy `@type` (for example `""`) is defaulted to the resource name, and the column default is the same value | G: `create-...dto.ts:287-290`, `...service.ts:65-67`, `entities/...entity.ts:40` | P | `<resource>/dto.go` + `service.go` |
| B-15 | `@baseType` and `@schemaLocation` are stored as sent (possibly null) and rendered as `""` when null (root only, see B-27) | G: `...service.ts:237-239,339-344` | P | `<resource>/serializer.go` |
| B-16 | Validation: `name` required, each `policy[].id` required. `policy` combines `@ArrayMinSize(1)` with `@IsOptional`: omitted is OK, `[]` → 400, `null` is accepted. Unknown body keys are ignored. The pipe is `ValidationPipe({transform:true})` without whitelist | G: `create-...dto.ts:22-25,248-257,265-271`, `main.ts:17`; E: `src/emit/dto.mjs:83-93,187,244-246` | P | `<resource>/dto.go` (gin `binding`) |
| B-17 | Nested ref `version` is server-managed: `'1.0'` on create, and the client value is ignored | G: `...service.ts:249,258`; E: `src/emit/service.mjs:272-287` | P | `<resource>/service.go` |
| B-18 | A **required** sibling-resource ref is upserted into the sibling's table; an **optional** one is attached only if the target row exists, otherwise the key is dropped (emitter only; TMF736 has none) | E: `src/emit/service.mjs:327-342,526-540` | P | `<resource>/service.go` |
| B-19 | Create is **not transactional**: normalised ref rows are saved first, then the aggregate, then the row is re-read. Ref rows are orphaned if the aggregate save fails (observed) | G: `...service.ts:81-85` | **X-08** | `platform/database` `WithTx` |
| B-20 | `hooks.beforeCreate` can replace the payload before persistence | G: `...service.ts:62`, `...hooks.ts:10-30` | P (hook point) | `<resource>/hooks.go` |

## C. Retrieve

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-21 | `GET /<res>/:id` → 200 with the mapped resource. `afterFindOne` hook runs before projection, only on retrieve | G: `...service.ts:121-136` | P | `<resource>/handler.go` + `hooks.go` |
| B-22 | Missing or soft-deleted → **404** `{"code":"404","reason":"Not Found","message":"PartyRevSharingAlgorithm <id> not found","status":"404","referenceError":"NotFoundException","@type":"Error"}`. The `id` path param is not validated | G: `...service.ts:123,127`, `common/filters/http-exception.filter.ts:32-45` | P (message and fields). `referenceError` is **X-09** | `platform/apperr` |

## D. PATCH

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-23 | 200 with the full re-read resource. Scalars are merged when `!== undefined`. `@type`, `@baseType` and `@schemaLocation` are accepted but **silently ignored** (immutable), and `id` in the body is ignored | G: `...service.ts:138-157,204-211`, `update-...dto.ts:281-294`; E: `src/emit/service.mjs:460-462`, `src/emit/entityPlan.mjs:72,76,80` | P | `<resource>/service.go` + `platform/optional` |
| B-24 | Any collection key that is present (including `null`) is **replaced wholesale inside one transaction**: delete owned rows, delete the normalised ref rows they pointed at (orphan cleanup), rebuild, save. `null` is the same as `[]` | G: `...service.ts:144,158-199` | P | `<resource>/repository.go` + `platform/database` |
| B-25 | Rebuilt children get **no `sortOrder`** on update, so array order after PATCH falls back to database order (code observed, ordering impact suspected; compare create at `...service.ts:241-243`) | G: `...service.ts:161,177,193`; E: `src/emit/service.mjs:702` | **X-10** | `<resource>/service.go` |
| B-26 | PolicyRef `version`: matched by old `refId` to new `id`. MAJOR bump if a required field was emptied, MINOR if anything else changed, unchanged otherwise. The root has no version column | G: `...service.ts:258`, `common/utils/tmf-resource.util.ts:42-75`; E: `src/emit/entityPlan.mjs:317-318` | P (ref `version`). Plus **X-11** (root optimistic lock) | `platform/tmf` version helper |
| B-27a | The update DTO has **no `ArrayMinSize`**: `policy: []` or `null` is accepted even though the spec says minItems 1 | G: `update-...dto.ts:260-265`; E: `src/emit/dto.mjs:187,244-245` | **Q-01** | `<resource>/dto.go` |
| B-28 | Owned children without a client id get a **new surrogate uuid on every rebuild** | G: `...service.ts:292,320,387,414` | P | `<resource>/service.go` |
| B-29 | Missing or soft-deleted → 404, thrown inside the transaction. `beforeUpdate` hook runs **before** the 404 check | G: `...service.ts:139,149-151` | P (404). **X-12** (hook ordering) | `<resource>/service.go` |
| B-30 | Only `application/json` bodies are parsed; `application/merge-patch+json` probably arrives as an empty body → 200, no change, event still emitted (suspected) | G: `main.ts` (no custom parser) | **X-13** | `platform/httpx` `Bind` |
| B-31 | `name: null` would assign null to a NOT NULL column → 500 (suspected) | G: `entities/...entity.ts:17-18` | **X-14** | `<resource>/dto.go` |

## E. Delete

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-32 | `DELETE /:id` → **204**, no body. Soft delete: `deletedAt=now`, `deletedBy='system'`, `deletedReason='Deleted via API'` (the controller never passes by/reason). Missing or already deleted → 404 | G: `...controller.ts:86-87,98-99`, `...service.ts:215-229`; E: `src/emit/behaviour.mjs:29,37-38,44-47` | P. `deletedBy` is **X-15** | `<resource>/service.go` |

## F. Response mapping

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-33 | Root key order: `id, name, description, @type, @schemaLocation, @baseType, href, <collections…>`. `@schemaLocation` and `@baseType` default to `""` on the **root only**. `href` = `/<base>/<res>/<id>` | G: `...service.ts:333-346` | P (Go struct field order fixes key order) | `<resource>/serializer.go` |
| B-34 | `stripEmpty`: null or undefined keys are **omitted**, and empty arrays `[]` are **kept**. `createdDate`, `lastUpdate` and `deleted*` never appear | G: `...service.ts:25-32` | P (`omitempty` on pointers; slices non-nil) | `<resource>/dto.go` Response |
| B-35 | Arrays are sorted by `sortOrder` ascending (null treated as 0, stable) | G: `...service.ts:345`; E: `src/emit/service.mjs:187` | P | `<resource>/repository.go` (`Preload` ordered) |
| B-36 | Owned child: `id = refId ?? surrogate PK`; `href` synthesised as `/<base>/<res>/<rootId>/<prop>/<refId ?? id>` (not a routable path). A client-sent child `href` is dropped | G: `...service.ts:385-398`; E: `src/emit/service.mjs:164-173` | P | `<resource>/serializer.go` |
| B-37 | Ref-like child (for example `policy`) and single refs echo the client `href`, `id` (from `refId`), `name`, `@referredType`, `@type`, `@schemaLocation` and `@baseType`; `version` only for `policy`. Nulls are omitted and there is no href synthesis. Sibling refs project `{id, href, name, @type, @referredType}` | G: `...service.ts:348-359,412-425`; E: `src/emit/service.mjs:188-207`, `src/emit/entityPlan.mjs:237-268` | P | `<resource>/serializer.go` |

## G. Events

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-38 | Event names come from the spec's `/listener/*` paths. Create → `<res>CreateEvent` (full response). PATCH → `<res>AttributeValueChangeEvent` (full response). Delete → `<res>DeleteEvent` with `{id, href}`. An event that is not declared is never emitted | G: `...service.ts:87-92,206-211,222-227`, `event/event-types.ts:3-8`; E: `src/ir/buildIR.mjs:224-243,457-465` | P (which events, which payload) | `<resource>/events.go` |
| B-39 | AttributeValueChange fires on **every** PATCH, even a no-op | G: `...service.ts:206-211` | **X-16** | `<resource>/service.go` |
| B-40 | StateChange fires only if the spec declares it, a field matches `/^(lifecycleStatus\|state\|status)$/`, and the PATCH payload **contains** that key (presence, not an actual change). It fires after AttributeValueChange | E: `src/emit/service.mjs:436-457,720-725` | **X-17** | `<resource>/service.go` |
| B-41 | Envelope is **not** a TMF envelope: `{eventType, resourceId, resourceType, payload}` | G: `event/event-emitter.service.ts:19-46` | **X-18** (plan D11) | `platform/outbox` |
| B-42 | Four sinks, all fire-and-forget: EventEmitter2, awaited `event_log` insert, RabbitMQ, webhooks. The service does not await `emitEvent`. `event_log.resourceId` is `varchar(36)` while resource ids can be up to 100 characters → possible unhandled rejection on Postgres (suspected) | G: `event/event-emitter.service.ts:19-46`, `event/event-store.service.ts:13-26`, `event/entities/event-log.entity.ts:16` | **X-19** | `platform/outbox` |
| B-43 | RabbitMQ: exchange `<eventExchange>` (for TMF736 `revenueSharingAlgorithm.events`), type `topic`, `durable:true`; routing key = eventType; JSON body; `{persistent:true}`. URL is `RABBITMQ_URL \|\| amqp://localhost:5672`; reconnect after `RABBITMQ_RECONNECT_DELAY_MS \|\| 5000`. A publish while disconnected is **dropped** | G: `event/rabbitmq.service.ts:15,19,22-56,66-79`, `common/constants/tmf.constants.ts:4` | P for exchange, routing key and persistence. **X-20** for delivery guarantee and URL default | `platform/broker/rabbitmq` |
| B-44 | Webhook: `POST <callback>` with the envelope, 10 s timeout, no retry. Sent to every subscription whose `query` is null or **contains the eventType as a substring** | G: `event/event-delivery.service.ts:23-49` | P for matching and timeout. **X-21** for retry | `platform/webhook` |

## H. Hub and listener

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-45 | `POST /<base>/hub` `{callback (required), query?}` → **201** `{id, callback, query?, createdDate, href}`. `Location`/`href` = `tmf-api/.../hub/<id>` with **no leading slash**, which is inconsistent with B-10 (observed) | G: `subscription/...controller.ts:43-53`, `subscription/dto/create-subscription.dto.ts:5-13`; E: `src/emit/wiring.mjs:129-197` | P for body and status. **X-22** for the leading slash | `platform/webhook` hub handler |
| B-46 | `DELETE /<base>/hub/:id` → **always 204**, even for an unknown id. There is no `GET /hub/:id` | G: `subscription/...controller.ts:55-59` | P | same |
| B-47 | `GET /<base>/hub?offset&limit` (a house addition; the spec has no GET): `createdDate DESC`, bare array of raw rows without `href`, plus count headers. A negative offset or limit is passed straight through (suspected) | G: `subscription/...controller.ts:26-41`, `subscription/subscription.service.ts:15-38` | P, with paging validated by B-02 rules | same |
| B-48 | The hub is emitted for every component, whether or not the spec has `/hub`. `callback` is not validated as a URL | E: `src/emit/wiring.mjs:366-368` | P for presence. **X-23** for URL validation | same |
| B-49 | Listener: one `POST /<base>/listener/<eventName>` per spec `/listener/*` path, **unguarded**, → 201. It only logs and echoes the subscription named by `body.subscriptionId`, else the newest one, else the placeholder `{id:'unknown', callback:'', createdDate}` | G: `listener/...listener.controller.ts:16-19,28-75`; E: `src/emit/wiring.mjs:199-264` | P | `<component>/listener.go` |

## I. Seed, health, docs, base path

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-50 | Seed rows come from the spec's POST request examples, then GET-item 200 examples, then GET-list 200 examples (arrays flattened). Per resource, seeding is skipped if data exists unless `--force`. Each row is created through the service, and failures are logged and skipped. `*.seed.local.ts` is written once. Resources are ordered by sibling dependency | G: `seed.ts:15-66`, `...seed.ts:2-60`, `...seed.local.ts:1-9`; E: `src/ir/buildIR.mjs:75-132`, `src/emit/seed.mjs:27-193`, `src/emit/index.mjs:246-258` | P. **X-24** (validation) | `cmd/<service>` `seed` subcommand |
| B-51 | `GET /health` → 200 `{status:'ok', timestamp:<ISO>, service:<slug>}`: outside the base path, unguarded | G: `main.ts:21-27` | P, plus `/ready` (plan) | `platform/httpserver` |
| B-52 | Swagger UI at `/api/docs` (title and version from the spec) | G: `main.ts:29-36` | **X-25** | `api/openapi.yaml` + route |
| B-53 | Base path: v5 OAS3 derives `tmf-api/<apiName>/v<major>` from `info.title`; Swagger 2 uses the spec's `basePath`. Every controller prepends the constant | E: `src/ir/buildIR.mjs:266-281,297,481`; G: `common/constants/tmf.constants.ts:3` | P (read from IR netral `app.basePath`, never re-derived) | `internal/router` |
| B-54 | Listens on `0.0.0.0:${PORT \|\| <allocated>}` | G: `main.ts:40-41` | P (`PORT` env, same allocated default) | `internal/config` |

## J. Errors, auth, nested routes, HTTP details

| ID | Nest behaviour | Evidence | Go | Go location |
|---|---|---|---|---|
| B-55 | Every `HttpException` → `{code, reason, message, status, referenceError, @type:'Error'}`, with `code` and `status` as strings. Validation messages are joined with `'; '`. The reason map covers 400/401/403/404/405/406/409/410/422/429/500/502/503 | G: `common/filters/http-exception.filter.ts:9-45`, `main.ts:18` | P (profile `tmf`). `referenceError` is **X-09** | `platform/apperr` |
| B-56 | Non-HttpException errors (DB errors, TypeErrors) bypass the filter → Nest default `{"statusCode":500,"message":"Internal server error"}` (suspected) | G: `http-exception.filter.ts:25` (`@Catch(HttpException)`) | **X-26** | `platform/apperr` + `middleware` recover |
| B-57 | Unknown route → 404 in TMF shape (suspected). No 405 | framework | **X-27** | `internal/router` |
| B-58 | Auth: header `x-api-key`; `SKIP_AUTH==='true'` bypasses; expected key `API_KEY \|\| 'dev-key-123'`; failure → 401 "Invalid or missing API key". Guarded: resource and hub controllers. Not guarded: listener, `/health`, docs. The guard runs before validation | G: `common/guards/api-key.guard.ts:12-21`, `...controller.ts:12`, `listener/...controller.ts:18-19`, `backend/.env.example:28-29` | P for header, guarded set and ordering. **X-28** for fallback key and modes | `platform/auth` |
| B-59 | Nested routes (`--nested-routes`, off by default): `…/parent/:parentId/child`; the path param wins over the body on create; list filters on it; retrieve, PATCH and DELETE return 404 when the stored parent differs; the parent column is immutable | E: `src/emit/nestedRoutes.mjs:27-60`, `src/emit/service.mjs:505,588-591,604-617` | P | `<resource>/routes.go` |
| B-60 | CORS `origin: CORS_ORIGIN \|\| '*'` together with `credentials:true`, which browsers reject for credentialed requests (suspected) | G: `main.ts:11-15` | **X-29** | `platform/middleware` |
| B-61 | Express defaults: weak ETag and 304, `X-Powered-By: Express`, HEAD mapped to GET, trailing slash matches, JSON body limit 100 kB (413 with reason `Unknown`) (all suspected) | G: `main.ts` (no overrides) | **X-30** | `platform/httpserver` |

---

## Deliberate divergences (X-nn)

Each one is either a bug fix or a hardening step. None removes behaviour a TMF client can rely
on per the spec.

| ID | Go behaviour | Why |
|---|---|---|
| X-01 | `limit` is capped at `LIST_MAX_LIMIT` (default 1000). A larger value → 400 | Unbounded pages are a denial-of-service vector (plan "ponytail": `limit` wajib dengan batas atas) |
| X-02 | Default order `created_at, id` when no `sort` is given | Offset paging without a stable order is nondeterministic in Postgres |
| X-03 | `fields=` becomes a `SELECT` column list (plus the columns `href` and `@type` need), not only a response filter | Avoids reading unused columns and preloading unused relations |
| X-04 | Repeated `fields` params are joined as a comma list on both list and retrieve | Removes the suspected 500 on retrieve |
| X-05 | House filters (`lifecycleStatus`, …) exist only when the column exists in the IR. LIKE input is escaped (`\%`, `\_`) with `ESCAPE '\'` | Fixes the Nest 500 (`buildIR.mjs:364-367` already says the filter is not emitted) and literal wildcard matching |
| X-06 | `sort` takes **wire names** from an IR whitelist (for example `name`, `-lastUpdate`). An unknown name → 400. Values are mapped to quoted column names | Removes interpolated ORDER BY and the 500 on unknown fields |
| X-07 | POST with the id of a **live** row → 409 Conflict (`code:"409"`) | Silent overwrite through POST is data loss |
| X-08 | Create runs in one transaction (refs, aggregate and outbox row) | No orphans; required for the outbox guarantee |
| X-09 | `referenceError` is the Go error kind (for example `NotFound`, `ValidationError`) instead of a Nest class name | The field is free text; there is no Nest class to name |
| X-10 | PATCH keeps the request array order (`sortOrder` = index), same as create | Fixes the lost-order bug (B-25) |
| X-11 | The root gets a `version` column for optimistic locking. A concurrent PATCH loses with 409 | Prevents lost updates; not visible on the wire unless it conflicts |
| X-12 | `beforeUpdate` runs **after** the 404 check, with the loaded entity | A hook should never run for a row that does not exist |
| X-13 | PATCH accepts `application/json` and `application/merge-patch+json` (same merge semantics). `application/json-patch+json` → 415 | TMF v5 recommends merge-patch; an unparsed body must not become a silent no-op |
| X-14 | Setting a required field to `null` in PATCH → 400 | Fixes the suspected 500 (B-31) |
| X-15 | `deletedBy` = authenticated principal id when auth is on, otherwise `system` | Audit trail |
| X-16 | AttributeValueChange is emitted only when at least one field or collection actually changed | A no-op PATCH is not an attribute change |
| X-17 | StateChange is emitted only when the state value actually changed | Plan Tahap 0 item 3 |
| X-18 | TMF envelope: `eventId`, `eventTime`, `eventType`, `event: {<resource>: …}` (plan D11) | Standard TMF event shape. **Routing key and exchange stay identical** (B-43), so broker consumers keep working |
| X-19 | Events are written to `outbox` inside the business transaction and delivered by the dispatcher. Delivered rows are kept (status `sent`) and serve as the event log. There is no separate `event_log` table | One table, no lost events, no unhandled rejections |
| X-20 | RabbitMQ publish goes through the outbox with publisher confirms, `MessageId=eventId`, and retry with backoff. `RABBITMQ_URL` is required when `RABBITMQ_ENABLED=true`, with no localhost default | At-least-once delivery instead of dropping (plan D17) |
| X-21 | Webhook delivery retries with backoff (bounded attempts), per subscriber | A missed callback is otherwise unrecoverable |
| X-22 | Hub `Location`/`href` use a leading slash, same as B-10 | Consistency |
| X-23 | Hub `callback` must be an absolute `http(s)` URL → 400 otherwise | Prevents storing undeliverable targets |
| X-24 | Seed rows go through the same validation as POST | `seed.mjs:13-15` claims this but the Nest runner skips it |
| X-25 | Docs: the IR-generated `api/openapi.yaml` is served at `/api/docs/openapi.yaml`. There is no bundled Swagger UI | "Ponytail": no UI assets in a backend binary |
| X-26 | Every error, including DB errors and panics, is rendered in the profile's error shape. Status 500 has a generic message and the detail goes to the log only | Uniform contract and no internals leaked |
| X-27 | Unknown route → 404 and wrong method → 405 (`HandleMethodNotAllowed`), both in the profile's error shape | Correct HTTP semantics |
| X-28 | `AUTH_MODE=none\|apikey\|jwt`. `apikey` requires `API_KEY` at startup (no fallback), compared with `subtle.ConstantTimeCompare`. There is no `SKIP_AUTH`; use `AUTH_MODE=none` | Removes the hardcoded credential (Sonar S2068) |
| X-29 | `credentials:true` only with an explicit `CORS_ORIGINS` list, never with `*` | Browsers reject `*` + credentials |
| X-30 | No `X-Powered-By`, no ETag, strict trailing slash (redirect disabled). Body limit is `BODY_LIMIT_BYTES` (default 1 MiB) → 413 in the error shape | Hardening; the Nest behaviours are framework defaults, not a contract |

## Open questions (must be answered before the tahap that uses them)

| ID | Question | Proposed default |
|---|---|---|
| Q-01 | Should PATCH enforce the spec `minItems` when the collection key is present (`policy: []` → 400)? Nest accepts it (B-27a) | **Enforce** when the key is present and not null. `null` still means "clear" only if `minItems` is 0 |

## Coverage of the Tahap 0 checklist

| Plan item | Rows |
|---|---|
| list: offset/limit, count headers | B-01 to B-03 |
| `fields=`, filter, sort | B-05 to B-09 |
| create: 201 + Location, client id, resurrect, `@type` default | B-10 to B-15 |
| sibling ref | B-18 |
| PATCH | B-23 to B-31 |
| soft delete, then 204 | B-32 |
| mapper | B-33 to B-37 |
| events, hub, listener | B-38 to B-49 |
| seed, health, error shape | B-50 to B-58 |
