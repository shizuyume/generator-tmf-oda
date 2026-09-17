import { words } from './naming.mjs';

/**
 * OpenAPI type/format -> { tsType, column, validators }
 *
 * Column shapes are taken from the golden reference
 * (partnership_management/backend/src/partnership/entities/*.entity.ts).
 * Invariant that is NOT negotiable, because SKILL.md gates on it:
 *   - id-like scalars are varchar(36), regardless of target database
 *
 * Dates are database-target-dependent: `datetime` under sqlite (the
 * generator's default), `timestamptz` under postgres - driven by the
 * `dbTarget` parameter threaded down from `--database` (see cli.mjs /
 * ir/buildIR.mjs).
 */

const NAME_RULES = [
  // [ test(fieldName, lastWord), column, tsType ]
  [(n, w) => n === 'id' || /(^|[a-z])Id$/.test(n), { type: 'varchar', length: 36 }, 'string'],
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
