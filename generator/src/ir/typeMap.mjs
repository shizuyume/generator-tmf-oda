import { words } from './naming.mjs';

/**
 * OpenAPI type/format -> { tsType, column, validators }
 *
 * Column shapes are taken from the golden reference
 * (partnership_management/backend/src/partnership/entities/*.entity.ts).
 * id-like scalars were varchar(36), sized for a bare UUID, and SKILL.md gates on
 * that. TM Forum's OWN examples break it: TMF936 ships a productOffering whose
 * productOfferingTermOrConditionSpecification.id is
 * "ab7792f8-6628-4c4b-a557-699adc26d4ce_terms_1" - 44 characters, a UUID with a
 * composite suffix. Seeding that example failed with "value too long for type
 * character varying(36)", and a spec-conformant client sending the same id would
 * get a 500. Widened to ID_COLUMN_LENGTH below, regardless of target database.
 *
 * Dates are database-target-dependent: `datetime` under sqlite (the
 * generator's default), `timestamptz` under postgres - driven by the
 * `dbTarget` parameter threaded down from `--database` (see cli.mjs /
 * ir/buildIR.mjs).
 */

/**
 * Room for a UUID plus a composite suffix, which real TMF payloads use. Not 1000 (the
 * href width): an id this long is already pathological, and keeping it bounded keeps
 * index sizes and error messages sane.
 */
export const ID_COLUMN_LENGTH = 100;

const NAME_RULES = [
  // [ test(fieldName, lastWord), column, tsType ]
  [(n, w) => n === 'id' || /(^|[a-z])Id$/.test(n), { type: 'varchar', length: ID_COLUMN_LENGTH }, 'string'],
  [(n, w) => w === 'href', { type: 'varchar', length: 1000 }, 'string'],
  [(n, w) => w === 'schemalocation' || /SchemaLocation$/i.test(n), { type: 'varchar', length: 1000 }, 'string'],
  [(n, w) => n === 'description', { type: 'text' }, 'string'],
  [(n, w) => /^(lifecycleStatus|status|state|version|role|priority|rating)$/i.test(n.replace(/^@/, '')), { type: 'varchar', length: 50 }, 'string'],
  [(n, w) => w === 'name', { type: 'varchar', length: 255 }, 'string'],
  // generic suffix rules run on the LAST WORD so '@type' and '@baseType' agree
  [(n, w) => ['type', 'kind', 'unit', 'status', 'state', 'role'].includes(w), { type: 'varchar', length: 100 }, 'string'],
];

const TYPE_RULES = {
  string: { column: { type: 'varchar', length: 255 }, tsType: 'string', validators: ['IsString'] },
  integer: { column: { type: 'int' }, tsType: 'number', validators: [] },
  number: { column: { type: 'float' }, tsType: 'number', validators: [] },
  boolean: { column: { type: 'boolean' }, tsType: 'boolean', validators: ['IsBoolean'] },
};

// dates are the one format whose column type depends on the target database
const DATE_COLUMN = {
  sqlite: { type: 'datetime' },
  postgres: { type: 'timestamptz' },
};

const FORMAT_RULES = {
  uri: { column: { type: 'varchar', length: 1000 }, tsType: 'string', validators: ['IsString'] },
  int32: { column: { type: 'int' }, tsType: 'number', validators: [] },
  int64: { column: { type: 'bigint' }, tsType: 'string', validators: [] },
  float: { column: { type: 'float' }, tsType: 'number', validators: [] },
  double: { column: { type: 'float' }, tsType: 'number', validators: [] },
};

/**
 * Exact decimals (money, exchange rates, percentages).
 *
 * `number` and `float`/`double` map to a binary `float` column, which is wrong for
 * money: 0.1 + 0.2 != 0.3, and a "total must equal project value" rule compares
 * sums. TMF itself marks such values `format: decimal` (TMF684 `weight`), so that
 * format - or an explicit x-db-precision / x-db-scale - selects `numeric(p,s)`.
 *
 *   precision  x-db-precision, else 18
 *   scale      x-db-scale, else derived from multipleOf (0.01 -> 2), else 2
 *
 * The API keeps `number` on the wire (TMF Money.value is a number). Postgres hands
 * numeric back as a string, so the column carries a transformer that converts it
 * to a number on read (emit/entity.mjs). Storage and SQL arithmetic stay exact;
 * hand-written hooks that add amounts must use a decimal library rather than `+`.
 */
export const DECIMAL_DEFAULT = Object.freeze({ precision: 18, scale: 2 });

function scaleFromMultipleOf(multipleOf) {
  if (typeof multipleOf !== 'number' || !(multipleOf > 0) || multipleOf >= 1) return null;
  const text = multipleOf.toString();
  const exp = /e-(\d+)$/i.exec(text);
  if (exp) return Number(exp[1]);
  const dot = text.indexOf('.');
  return dot === -1 ? null : text.length - dot - 1;
}

export function isDecimalSchema(schema = {}) {
  return schema.format === 'decimal' || schema['x-db-precision'] != null || schema['x-db-scale'] != null;
}

export function decimalColumn(schema = {}) {
  const precision = Number(schema['x-db-precision'] ?? DECIMAL_DEFAULT.precision);
  const scale = Number(schema['x-db-scale'] ?? scaleFromMultipleOf(schema.multipleOf) ?? DECIMAL_DEFAULT.scale);
  if (!Number.isInteger(precision) || precision < 1 || precision > 1000) {
    throw new Error(`x-db-precision must be an integer 1..1000, got ${schema['x-db-precision']}`);
  }
  if (!Number.isInteger(scale) || scale < 0 || scale > precision) {
    throw new Error(`decimal scale must be an integer 0..precision (${precision}), got ${scale}`);
  }
  return { type: 'numeric', precision, scale, transformer: 'decimal' };
}

/**
 * @param {string} fieldName
 * @param {object} schema  a resolved (non-$ref) scalar schema
 * @param {'sqlite'|'postgres'} dbTarget
 * @returns {{tsType:string, column:object, validators:string[], enumValues:string[]|null}}
 */
export function mapScalar(fieldName, schema = {}, dbTarget = 'sqlite') {
  const format = schema.format;
  const type = schema.type || 'string';

  // format wins over type (date-time is a string in OpenAPI)
  if (format === 'date-time' || format === 'date') {
    const column = DATE_COLUMN[dbTarget] ?? DATE_COLUMN.sqlite;
    return { tsType: 'Date', column: { ...column }, validators: [], enumValues: null };
  }
  if ((type === 'number' || type === 'integer') && isDecimalSchema(schema)) {
    return { tsType: 'number', column: decimalColumn(schema), validators: [], enumValues: null };
  }
  if (format && FORMAT_RULES[format]) {
    const r = FORMAT_RULES[format];
    return { tsType: r.tsType, column: { ...r.column }, validators: [...r.validators], enumValues: null };
  }

  // enums stay plain varchar + IsString: the reference never uses TypeORM enums
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return {
      tsType: 'string',
      column: { type: 'varchar', length: 100 },
      validators: ['IsString'],
      enumValues: schema.enum,
    };
  }

  if (type === 'string') {
    const parts = words(fieldName);
    const lastWord = parts[parts.length - 1] || '';
    for (const [test, column, tsType] of NAME_RULES) {
      if (test(fieldName, lastWord)) return { tsType, column: { ...column }, validators: ['IsString'], enumValues: null };
    }
  }

  const r = TYPE_RULES[type];
  if (r) return { tsType: r.tsType, column: { ...r.column }, validators: [...r.validators], enumValues: null };

  // unknown scalar -> passthrough json
  return { tsType: 'any', column: jsonColumn(dbTarget), validators: [], enumValues: null };
}

/**
 * Fallback column for unmodelled/free-form JSON blobs. `simple-json` is a
 * SQLite/MySQL TypeORM column type; postgres has a native `jsonb` instead.
 */
export function jsonColumn(dbTarget = 'sqlite') {
  return dbTarget === 'postgres' ? { type: 'jsonb' } : { type: 'simple-json' };
}
