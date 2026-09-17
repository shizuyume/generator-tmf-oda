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
 * The two halves of SOFT_DELETE_COLUMNS, because they are written differently:
 * the timestamp carries the tombstone (a Date on delete, null on resurrection)
 * while the attribution columns carry who and why (a string on delete,
 * undefined on resurrection).
 */
export const SOFT_DELETE_TIMESTAMP_COLUMN = SOFT_DELETE_COLUMNS[0];
export const SOFT_DELETE_ATTRIBUTION_COLUMNS = SOFT_DELETE_COLUMNS.slice(1);

/**
 * What remove() records when the caller names neither. The hand-written suites
 * in GEN_REPO assert both values, so the spec emitter needs them too.
 */
export const SOFT_DELETE_DEFAULTS = Object.freeze({
  deletedBy: 'system',
  deletedReason: 'Deleted via API',
});

/**
 * `@type` is what a TMF client dispatches polymorphic handling on, so a root
 * response must always carry one. A create that does not set it defaults to
 * the resource's own name.
 */
export function defaultAtType(resourceName) {
  return resourceName;
}

/**
 * Trailer attributes emitted on every root response even when unset, as the
 * empty string. v5 conformance profiles schema-validate the response and v4
 * kits assert the attribute is present; an empty string satisfies both and
 * invents no URI the server cannot know. TMF730 fails 20 assertions without
 * this, against a POST body baked into its CTK image that sends neither.
 */
export const ALWAYS_PRESENT_TRAILER = new Set(['atBaseType', 'atSchemaLocation']);

/** The value an ALWAYS_PRESENT_TRAILER attribute takes when the row has none. */
export const EMPTY_TRAILER_VALUE = '';

/** Owned rows come back ordered by sortOrder; a row without one sorts first. */
export const SORT_ORDER_FALLBACK = 0;

/**
 * Whether `@type` survives attribute selection (`?fields=`). The two CTK
 * generations demand the OPPOSITE and cannot both be satisfied: v4 kits assert
 * "instance has only id, href and the filtered attribute" and fail
 * TMF704/705/706/707 when `@type` is kept, while v5 profiles schema-validate
 * every response and fail TMF736/738 when it is dropped. So it is decided per
 * component from the spec's major version.
 *
 * scaffold/newService.mjs writes the answer into
 * common/utils/tmf-resource.util.ts as INCLUDE_ATYPE_IN_FIELD_SELECTION; the
 * per-resource spec asserts the same side of it. A second copy of `>= 5` in the
 * spec emitter would let a change to one leave the other asserting the old
 * behaviour as correct.
 */
export function includeAtTypeInFieldSelection(versionMajor) {
  return Number(versionMajor) >= 5;
}

/**
 * Newest-first ordering over the subscription store. Three places read it and
 * must agree: the listener controller's "most recent subscription" fallback
 * (emit/wiring.mjs), SubscriptionService.findAll (the static scaffold template
 * templates/src/subscription/subscription.service.ts), and the emitted specs
 * that assert both.
 */
export const LATEST_ORDER_COLUMN = 'createdDate';
export const LATEST_ORDER_DIRECTION = 'DESC';

/** How many rows that fallback asks for. */
export const LATEST_TAKE = 1;

/**
 * What the listener controller synthesises when the store holds no
 * subscription at all: never a real row, so the id is a sentinel and the
 * callback is empty rather than an invented URL.
 */
export const PLACEHOLDER_SUBSCRIPTION = Object.freeze({
  id: 'unknown',
  callback: '',
});

/** Route segment the hub controller is mounted under, below the base path. */
export const HUB_PATH_SEGMENT = 'hub';
