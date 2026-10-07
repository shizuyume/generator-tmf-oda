import { formatDateRangeLabel } from './format';
import type { FilterCondition, ListTableFilterField } from './types';

// Filter conditions → TMF630 JSONPath `filter=` params (the generated backend's common/filter):
//   text  → @.attr=~/value/i                  (contains, any case — as the search box)
//   date  → @.attr>='start of day' && @.attr<='end of day'   (ISO, local calendar days)
// Conditions on the resource itself share one `$[?( … && … )]`; a condition on an embedded
// list is its own `list[?( … )]`, so each chip matches on any element. All params are ANDed.

export type QueryValue = string | string[];

export function emptyCondition(field: ListTableFilterField): FilterCondition {
  return field.type === 'date'
    ? { field: field.key, type: 'date', from: null, to: null }
    : { field: field.key, type: 'text', value: '' };
}

export function isComplete(c: FilterCondition): boolean {
  return c.type === 'date' ? Boolean(c.from || c.to) : c.value.trim() !== '';
}

/** 'YYYY-MM-DD' (local) ⇄ Date */
export function toYmd(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromYmd(ymd: string | null): Date | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDayIso(ymd: string): string {
  return fromYmd(ymd)!.toISOString();
}

function endOfDayIso(ymd: string): string {
  const d = fromYmd(ymd)!;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** `=~ /…/` takes literal text: every pattern character (and the delimiter) is escaped. */
export function regexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`);
}

const quoted = (s: string) => `'${s.replace(/[\\']/g, (c) => `\\${c}`)}'`;

/** One condition → its JSONPath predicates, relative to its scope (`attr` may be `ref.id`). */
function predicates(c: FilterCondition, attr: string): string[] {
  const at = `@.${attr}`;
  if (c.type === 'text') return [`${at}=~/${regexLiteral(c.value.trim())}/i`];
  const out: string[] = [];
  if (c.from) out.push(`${at}>=${quoted(startOfDayIso(c.from))}`);
  if (c.to) out.push(`${at}<=${quoted(endOfDayIso(c.to))}`);
  return out;
}

/** The conditions as `filter=` params (one per scope; the backend ANDs them). */
export function toJsonPathFilters(filters: FilterCondition[], fields: ListTableFilterField[]): string[] {
  const root: string[] = [];
  const lists: string[] = [];
  for (const c of filters) {
    if (!isComplete(c)) continue;
    const field = fields.find((f) => f.key === c.field);
    const preds = predicates(c, field?.param ?? c.field);
    if (field?.list) lists.push(`${field.list}[?(${preds.join(' && ')})]`);
    else root.push(...preds);
  }
  return [...(root.length ? [`$[?(${root.join(' && ')})]`] : []), ...lists];
}

/** Appends the conditions to `params` as `filter=` (an existing `filter` is kept and ANDed). */
export function appendFilterParams(
  params: Record<string, unknown>,
  filters: FilterCondition[],
  fields: ListTableFilterField[],
): void {
  const out = params as Record<string, QueryValue>;
  const next = toJsonPathFilters(filters, fields);
  if (!next.length) return;
  out.filter = [...[out.filter ?? []].flat(), ...next];
}

/** TMF630 sort: `name` ascending, `-name` descending. */
export function toSortParam(columnKey: string, direction: 'asc' | 'desc'): string {
  return direction === 'desc' ? `-${columnKey}` : columnKey;
}

/** Chip text, e.g. { label: 'Name contains', value: '“video”' }. */
export function describeFilter(c: FilterCondition, field?: ListTableFilterField): { label: string; value: string } {
  const name = field?.label ?? c.field;
  if (c.type === 'text') return { label: `${name} contains`, value: `“${c.value.trim()}”` };
  return { label: name, value: formatDateRangeLabel(fromYmd(c.from), fromYmd(c.to)) };
}
