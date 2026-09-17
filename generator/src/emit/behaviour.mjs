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
