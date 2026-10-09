import { BadRequestException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { FILTER_LIMITS, parseAttributeParam, parseJsonPathFilter, parseSort } from './filter-parser';
import type { FilterAttr, FilterCondition, FilterExpr, FilterNode, FilterSchema, FilterScope } from './filter.types';

/**
 * Applies a list query's filters and sort to the findAll query builder of a resource:
 *   - `filter=` (JSONPath, any number) and attribute keys (TMF630) → one AST → each scope
 *     becomes `e.id IN (subquery)` with bound parameters — the joined rows of the response
 *     stay complete (a filter on policy[] never drops the other policies of a match);
 *   - `q` = name or description contains, `name` = name contains (house filters);
 *   - `sort=-attr,attr` on the resource's own attributes.
 * Attribute-style keys the resource cannot filter on are IGNORED, as before this module existed:
 * a client (or a conformance kit) sending an extra query parameter still gets its list. A
 * `filter=` expression is explicit, so there an unknown attribute, bad syntax or a wrong value
 * type answers 400 with a TMF Error body — as does a wrong value for a known attribute key.
 */

/** Query keys that are never attribute filters. */
const RESERVED = new Set(['fields', 'offset', 'limit', 'sort', 'filter', 'q']);

const NUMBER = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

const fail = (message: string): never => {
  throw new BadRequestException(`Invalid filter: ${message}`);
};

interface Ctx {
  qb: SelectQueryBuilder<ObjectLiteral>;
  sqlite: boolean;
  params: Record<string, unknown>;
  next: number;
}

function paramName(ctx: Ctx): string {
  ctx.next += 1;
  return `flt${ctx.next}`;
}

/** A filter value as the column's type; dates in the format the driver stores. */
function coerce(ctx: Ctx, attr: FilterAttr, value: string | number | boolean, label: string): unknown {
  switch (attr.type) {
    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && NUMBER.test(value)) return Number(value);
      return fail(`${label} expects a number, got ${JSON.stringify(value)}`);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      return fail(`${label} expects true or false, got ${JSON.stringify(value)}`);
    case 'date': {
      const d = new Date(String(value));
      if (typeof value === 'boolean' || Number.isNaN(d.getTime())) {
        return fail(`${label} expects an ISO 8601 date, got ${JSON.stringify(value)}`);
      }
      // sqlite keeps datetimes as UTC text "YYYY-MM-DD HH:MM:SS.SSS"; postgres takes a Date
      return ctx.sqlite ? d.toISOString().replace('T', ' ').replace('Z', '') : d;
    }
    default:
      return String(value);
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** `path` inside a scope node → [sql column, attribute]; joins the ref it goes through. */
function resolveColumn(node: FilterNode, alias: string, path: string[], joins: Set<string>, scopeLabel: string): [string, FilterAttr] {
  const [head, attrName] = path;
  if (path.length === 1 && node.attrs[head]) return [`${alias}.${node.attrs[head].property}`, node.attrs[head]];
  const ref = node.refs[head];
  if (path.length === 2 && ref?.attrs[attrName]) {
    joins.add(head);
    return [`${alias}_${head}.${ref.attrs[attrName].property}`, ref.attrs[attrName]];
  }
  const known = [
    ...Object.keys(node.attrs),
    ...Object.entries(node.refs).flatMap(([r, n]) => Object.keys(n.attrs).map((a) => `${r}.${a}`)),
  ];
  return fail(`unknown attribute "${path.join('.')}" in ${scopeLabel} (filterable: ${known.join(', ')})`);
}

function compileContains(ctx: Ctx, col: string, c: FilterCondition): string {
  const p = paramName(ctx);
  const text = String(c.value);
  if (c.ignoreCase) {
    ctx.params[p] = `%${likeEscape(text.toLowerCase())}%`;
    return `LOWER(${col}) LIKE :${p} ESCAPE '\\'`;
  }
  // LIKE ignores case on sqlite: a case-sensitive contains is a position search instead
  ctx.params[p] = text;
  return ctx.sqlite ? `instr(${col}, :${p}) > 0` : `strpos(${col}, :${p}) > 0`;
}

function compileCondition(ctx: Ctx, node: FilterNode, alias: string, c: FilterCondition, joins: Set<string>, scopeLabel: string): string {
  const [col, attr] = resolveColumn(node, alias, c.path, joins, scopeLabel);
  const label = `${scopeLabel === '$' ? '' : `${scopeLabel}.`}${c.path.join('.')}`;
  if (c.op === 'contains') {
    if (attr.type !== 'string') fail(`${label}: =~ only applies to text attributes`);
    return compileContains(ctx, col, c);
  }
  if (c.value === null) return c.op === '==' ? `${col} IS NULL` : `${col} IS NOT NULL`;
  if (attr.type === 'boolean' && c.op !== '==' && c.op !== '!=') fail(`${label}: true / false compare with == or != only`);
  const p = paramName(ctx);
  ctx.params[p] = coerce(ctx, attr, c.value, label);
  // != keeps rows where the attribute is absent, as JSONPath does
  if (c.op === '!=') return `(${col} <> :${p} OR ${col} IS NULL)`;
  return `${col} ${c.op === '==' ? '=' : c.op} :${p}`;
}

function compileExpr(ctx: Ctx, node: FilterNode, alias: string, e: FilterExpr, joins: Set<string>, scopeLabel: string): string {
  const sub = (x: FilterExpr) => compileExpr(ctx, node, alias, x, joins, scopeLabel);
  switch (e.kind) {
    case 'cond':
      return compileCondition(ctx, node, alias, e, joins, scopeLabel);
    case 'not':
      return `NOT (${sub(e.item)})`;
    case 'and':
      return `(${e.items.map(sub).join(' AND ')})`;
    case 'or':
      return `(${e.items.map(sub).join(' OR ')})`;
  }
}

/** One scope → `<root>.id IN (SELECT …)`. */
function applyScope(ctx: Ctx, schema: FilterSchema, rootAlias: string, scope: FilterScope, n: number): void {
  const node = scope.array === null
    ? { ...schema, attrs: { ...schema.attrs, ...schema.timestamps } }
    : schema.arrays[scope.array];
  if (!node) fail(`unknown list "${scope.array}" (lists: ${Object.keys(schema.arrays).join(', ') || 'none'})`);
  const alias = `fs${n}`;
  const joins = new Set<string>();
  const where = compileExpr(ctx, node, alias, scope.expr, joins, scope.array ?? '$');
  const sub = ctx.qb.subQuery().from(node.entity, alias);
  if (scope.array === null) sub.select(`${alias}.id`);
  else sub.innerJoin(`${alias}.owner`, `${alias}_owner`).select(`${alias}_owner.id`);
  for (const r of joins) sub.leftJoin(`${alias}.${node.refs[r].relation}`, `${alias}_${r}`);
  sub.where(where);
  ctx.qb.andWhere(`${rootAlias}.id IN ${sub.getQuery()}`);
}

/** Comma lists mean "any of" for equality: `state=raised,cleared`. */
function anyOf(c: FilterCondition): FilterExpr {
  if (c.op !== '==' || typeof c.value !== 'string' || !c.value.includes(',')) return c;
  return { kind: 'or', items: c.value.split(',').map((v) => ({ ...c, value: v })) };
}

const isText = (raw: unknown): raw is string | string[] =>
  typeof raw === 'string' || (Array.isArray(raw) && raw.every((v) => typeof v === 'string'));

const ATTRIBUTE_KEY = /^@?[A-Za-z_]\w*(\.@?[A-Za-z_]\w*)*$/;

/** Can the resource filter on this attribute path (root, a single ref, or one embedded list)? */
function isKnownPath(schema: FilterSchema, path: string[]): boolean {
  const inNode = (node: FilterNode, p: string[]) =>
    (p.length === 1 && !!node.attrs[p[0]]) || (p.length === 2 && !!node.refs[p[0]]?.attrs[p[1]]);
  const [head] = path;
  if (schema.arrays[head] && path.length > 1) return inNode(schema.arrays[head], path.slice(1));
  return inNode({ ...schema, attrs: { ...schema.attrs, ...schema.timestamps } }, path);
}

/**
 * Groups attribute-style conditions per scope: `policy.name=x&policy.id=1` → one policy element.
 * Keys that are not attribute paths of this resource are skipped (TMF630 leniency, see above).
 */
function attributeScopes(schema: FilterSchema, query: Record<string, unknown>): FilterScope[] {
  const root: FilterExpr[] = [];
  const perArray = new Map<string, FilterExpr[]>();
  const reserved = new Set([...RESERVED, ...schema.reserved]);
  for (const [key, raw] of Object.entries(query)) {
    if (raw === '' || reserved.has(key) || !isText(raw) || !ATTRIBUTE_KEY.test(key)) continue;
    if (key === 'name' && schema.attrs.name) continue; // house filter
    const conds = parseAttributeParam(key, raw);
    if (!isKnownPath(schema, conds[0].path)) continue;
    const head = conds[0].path[0];
    if (schema.arrays[head] && conds[0].path.length > 1) {
      const items = perArray.get(head) ?? [];
      items.push(...conds.map((c) => anyOf({ ...c, path: c.path.slice(1) })));
      perArray.set(head, items);
    } else {
      root.push(...conds.map(anyOf));
    }
  }
  const all = (items: FilterExpr[]): FilterExpr => (items.length === 1 ? items[0] : { kind: 'and', items });
  const scopes: FilterScope[] = root.length ? [{ array: null, expr: all(root) }] : [];
  for (const [array, items] of perArray) scopes.push({ array, expr: all(items) });
  return scopes;
}

export function applyQueryFilters(
  qb: SelectQueryBuilder<ObjectLiteral>,
  query: Record<string, unknown>,
  schema: FilterSchema,
  alias = 'e',
): void {
  const driver = String(qb.connection?.options?.type ?? '');
  const ctx: Ctx = { qb, sqlite: driver === 'sqlite' || driver === 'better-sqlite3', params: {}, next: 0 };

  // house filters
  const contains = (attr: string, text: string) => {
    const p = paramName(ctx);
    ctx.params[p] = `%${likeEscape(text.toLowerCase())}%`;
    return `LOWER(${alias}.${schema.attrs[attr].property}) LIKE :${p} ESCAPE '\\'`;
  };
  const { name, q } = query;
  if (typeof name === 'string' && name && schema.attrs.name) qb.andWhere(contains('name', name));
  if (typeof q === 'string' && q) {
    const cols = ['name', 'description'].filter((a) => schema.attrs[a]);
    if (cols.length) qb.andWhere(`(${cols.map((a) => contains(a, q)).join(' OR ')})`);
  }

  const raw = query.filter;
  const filters: unknown[] = [];
  if (Array.isArray(raw)) filters.push(...raw);
  else if (raw !== undefined) filters.push(raw);
  if (filters.length > FILTER_LIMITS.filters) fail(`more than ${FILTER_LIMITS.filters} filter= parameters`);
  const scopes = [
    ...filters.map((f) => (typeof f === 'string' ? parseJsonPathFilter(f) : fail('filter must be text'))),
    ...attributeScopes(schema, query),
  ];
  scopes.forEach((s, i) => applyScope(ctx, schema, alias, s, i));

  const sortable = { ...schema.attrs, ...schema.timestamps };
  for (const key of parseSort(isText(query.sort) ? query.sort : undefined)) {
    const attr = sortable[key.attr];
    if (!attr) fail(`cannot sort by "${key.attr}" (sortable: ${Object.keys(sortable).join(', ')})`);
    qb.addOrderBy(`${alias}.${attr.property}`, key.direction);
  }
  qb.setParameters({ ...qb.getParameters(), ...ctx.params });
}
