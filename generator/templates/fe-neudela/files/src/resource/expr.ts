import { formatDateTime, formatRelativeTime } from '../components/list-table/format';

// Value expressions of a resource config: how a page reads a value out of a record.
// Pure data (no functions), so the generator writes configs as plain literals and this
// file is the only interpreter. `{n}` in a text is the 1-based item number, `{0}` an argument.

export type Expr =
  | { path: string; empty?: string }
  | { pick: string[]; empty?: string }
  | { count: string }
  | { join: string; pick: string[]; sep: string; empty?: string }
  | { dateTime: string; empty?: string }
  | { relativeTime: string; empty?: string }
  | { text: string }
  | { ifAny: string; then: string; else: string }
  | { plural: Expr; one: string; many: string }
  | { format: string; args: Expr[] }
  | { parts: { expr: Expr; format?: string }[]; sep: string }
  | { sumCount: string[] }
  | { yesNo: string; empty?: string }
  | { oneOf: string; labels: Record<string, string>; empty?: string };

type Rec = Record<string, unknown>;

export function at(record: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => (cur && typeof cur === 'object' ? (cur as Rec)[key] : undefined), record);
}

const present = (v: unknown) => v !== undefined && v !== null && v !== '';

export function pick(record: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = at(record, p);
    if (present(v)) return v;
  }
  return undefined;
}

export const countOf = (record: unknown, path: string) => {
  const v = at(record, path);
  return Array.isArray(v) ? v.length : 0;
};

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "{n}" → index + 1; "{0}".. → args. */
export function fill(text: string, index?: number, args: string[] = []): string {
  return text
    .replace(/\{n\}/g, index === undefined ? '{n}' : String(index + 1))
    .replace(/\{(\d+)\}/g, (_m, i) => args[Number(i)] ?? '');
}

/** Evaluates an expression; `undefined` when the value is absent (callers decide the fallback). */
export function evaluate(expr: Expr, record: unknown, index?: number): unknown {
  if ('path' in expr) {
    const v = at(record, expr.path);
    return present(v) ? v : expr.empty;
  }
  if ('pick' in expr && !('join' in expr)) {
    const v = pick(record, expr.pick);
    return present(v) ? v : (expr.empty === undefined ? undefined : fill(expr.empty, index));
  }
  if ('count' in expr) return countOf(record, expr.count);
  if ('sumCount' in expr) return expr.sumCount.reduce((n, p) => n + countOf(record, p), 0);
  if ('join' in expr) {
    const list = at(record, expr.join);
    const text = Array.isArray(list) ? list.map((x) => pick(x, expr.pick)).filter(present).join(expr.sep) : '';
    return text || expr.empty;
  }
  if ('dateTime' in expr) {
    const v = at(record, expr.dateTime) as string | undefined;
    return v ? formatDateTime(v) : expr.empty;
  }
  if ('relativeTime' in expr) {
    const v = formatRelativeTime(at(record, expr.relativeTime) as string | undefined);
    return v || expr.empty;
  }
  if ('text' in expr) return fill(expr.text, index);
  if ('yesNo' in expr) {
    const v = at(record, expr.yesNo);
    return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : expr.empty;
  }
  if ('oneOf' in expr) {
    const v = at(record, expr.oneOf);
    return present(v) ? (expr.labels[String(v)] ?? String(v)) : expr.empty;
  }
  if ('ifAny' in expr) return countOf(record, expr.ifAny) > 0 ? expr.then : expr.else;
  if ('plural' in expr) return plural(Number(evaluate(expr.plural, record, index) ?? 0), expr.one, expr.many);
  if ('format' in expr) return fill(expr.format, index, expr.args.map((a) => String(evaluate(a, record, index) ?? '')));
  if ('parts' in expr) {
    return expr.parts
      .map((p) => {
        const v = evaluate(p.expr, record, index);
        return present(v) ? (p.format ? fill(p.format, index, [String(v)]) : String(v)) : undefined;
      })
      .filter(present)
      .join(expr.sep);
  }
  return undefined;
}

export const text = (expr: Expr, record: unknown, index?: number): string | undefined => {
  const v = evaluate(expr, record, index);
  return present(v) ? String(v) : undefined;
};
