import { BadRequestException } from '@nestjs/common';
import type {
  FilterCondition,
  FilterExpr,
  FilterOp,
  FilterScope,
  FilterValue,
  SortKey,
} from './filter.types';

/**
 * Parsers of the two TMF630 filter styles into one AST (filter.types.ts). Nothing here touches
 * the database: the AST is translated with bound parameters by filter-typeorm.ts.
 *
 * JSONPath subset (TMF630 Part 5):
 *   filter  := '$' '[' '?(' expr ')' ']'  |  name '[' '?(' expr ')' ']'
 *   expr    := and ('||' and)*            and := unary ('&&' unary)*
 *   unary   := '!' unary | '(' expr ')' | path op value
 *   path    := '@' '.' seg ('.' seg)*     (also `@name`); seg := name | '@' name  (@type)
 *   op      := == (or =)  !=  <  <=  >  >=  =~
 *   value   := 'text' | "text" | number | true | false | null | /literal/[i]   (/…/ with =~ only)
 * `=~ /text/i` is "contains" (case-insensitive with i). The text is a literal: regex
 * metacharacters must be escaped (`/1\.5/`), anything else is refused — no regex engine runs.
 */

export const FILTER_LIMITS = {
  /** characters in one filter= value */
  length: 2000,
  /** filter= params per request */
  filters: 10,
  /** conditions across one filter= value */
  conditions: 30,
  /** nesting of ( ) and ! */
  depth: 10,
};

const fail = (message: string): never => {
  throw new BadRequestException(`Invalid filter: ${message}`);
};

type Tok =
  | { t: 'sym'; v: string; at: number }
  | { t: 'name'; v: string; at: number }
  | { t: 'str'; v: string; at: number }
  | { t: 'num'; v: number; at: number }
  | { t: 'kw'; v: 'true' | 'false' | 'null'; at: number }
  | { t: 're'; v: string; i: boolean; at: number };

const SYMBOLS = ['&&', '||', '==', '!=', '<=', '>=', '=~', '?(', '$', '@', '[', ']', '(', ')', '.', '!', '<', '>', '='];
const REGEX_META = /[.*+?^${}()|[\]\\]/;

function regexLiteral(src: string, at: number): string {
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '\\') {
      // the tokenizer ends a literal only on an unescaped "/", so a \ always has a next char
      out += src[i + 1];
      i += 1;
    } else if (REGEX_META.test(c)) {
      fail(`=~ takes a literal text: escape "${c}" (at ${at + i}) — patterns are not supported`);
    } else {
      out += c;
    }
  }
  return out;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          v += src[j + 1];
          j += 2;
        } else {
          v += src[j];
          j += 1;
        }
      }
      if (j >= src.length) fail(`unterminated string at ${i}`);
      toks.push({ t: 'str', v, at: i });
      i = j + 1;
      continue;
    }
    if (c === '/') {
      // a regex literal only directly after =~
      const prev = toks[toks.length - 1];
      if (!prev || prev.t !== 'sym' || prev.v !== '=~') fail(`unexpected "/" at ${i}`);
      let j = i + 1;
      while (j < src.length && src[j] !== '/') j += src[j] === '\\' ? 2 : 1;
      if (j >= src.length) fail(`unterminated /…/ at ${i}`);
      const body = src.slice(i + 1, j);
      let k = j + 1;
      let flags = '';
      while (k < src.length && /[a-z]/.test(src[k])) flags += src[k++];
      if (flags && flags !== 'i') fail(`unsupported /…/${flags} flags (only i)`);
      toks.push({ t: 're', v: regexLiteral(body, i + 1), i: flags === 'i', at: i });
      i = k;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: Number(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const v = m[0];
      if (v === 'true' || v === 'false' || v === 'null') toks.push({ t: 'kw', v, at: i });
      else toks.push({ t: 'name', v, at: i });
      i += v.length;
      continue;
    }
    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (!sym) fail(`unexpected "${c}" at ${i}`);
    toks.push({ t: 'sym', v: sym!, at: i });
    i += sym!.length;
  }
  return toks;
}

class Parser {
  private pos = 0;
  private conditions = 0;

  constructor(private readonly toks: Tok[], private readonly src: string) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }

  private isSym(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'sym' && t.v === v;
  }

  private expectSym(v: string): void {
    if (!this.isSym(v)) fail(`expected "${v}" at ${this.peek()?.at ?? this.src.length}`);
    this.pos += 1;
  }

  /** One path segment: `name` or a TMF meta attribute `@type`. */
  private segment(): string {
    if (this.isSym('@')) {
      this.pos += 1;
      return `@${this.name()}`;
    }
    return this.name();
  }

  private name(): string {
    const t = this.peek();
    if (!t || t.t !== 'name') fail(`expected an attribute name at ${t?.at ?? this.src.length}`);
    this.pos += 1;
    return (t as { v: string }).v;
  }

  scope(): FilterScope {
    let array: string | null = null;
    if (this.isSym('$')) this.pos += 1;
    else array = this.name();
    this.expectSym('[');
    this.expectSym('?(');
    const expr = this.or(0);
    this.expectSym(')');
    this.expectSym(']');
    if (this.pos !== this.toks.length) fail(`unexpected text at ${this.peek()!.at}`);
    return { array, expr };
  }

  private or(depth: number): FilterExpr {
    const items = [this.and(depth)];
    while (this.isSym('||')) {
      this.pos += 1;
      items.push(this.and(depth));
    }
    return items.length === 1 ? items[0] : { kind: 'or', items };
  }

  private and(depth: number): FilterExpr {
    const items = [this.unary(depth)];
    while (this.isSym('&&')) {
      this.pos += 1;
      items.push(this.unary(depth));
    }
    return items.length === 1 ? items[0] : { kind: 'and', items };
  }

  private unary(depth: number): FilterExpr {
    if (depth > FILTER_LIMITS.depth) fail(`nesting deeper than ${FILTER_LIMITS.depth}`);
    if (this.isSym('!')) {
      this.pos += 1;
      return { kind: 'not', item: this.unary(depth + 1) };
    }
    if (this.isSym('(')) {
      this.pos += 1;
      const e = this.or(depth + 1);
      this.expectSym(')');
      return e;
    }
    return this.comparison();
  }

  private comparison(): FilterCondition {
    this.expectSym('@');
    const path: string[] = [];
    if (this.isSym('.')) this.pos += 1;
    path.push(this.segment());
    while (this.isSym('.')) {
      this.pos += 1;
      path.push(this.segment());
    }
    const opTok = this.peek();
    if (!opTok || opTok.t !== 'sym' || !['==', '=', '!=', '<', '<=', '>', '>=', '=~'].includes(opTok.v)) {
      fail(`expected a comparison after @.${path.join('.')} at ${opTok?.at ?? this.src.length}`);
    }
    this.pos += 1;
    const valTok = this.peek();
    if (!valTok) fail('missing value at the end');
    this.pos += 1;
    this.conditions += 1;
    if (this.conditions > FILTER_LIMITS.conditions) fail(`more than ${FILTER_LIMITS.conditions} conditions`);
    const sym = (opTok as { v: string }).v;
    if (sym === '=~') {
      if (valTok!.t !== 're') fail(`=~ takes /text/ or /text/i at ${valTok!.at}`);
      const re = valTok as Extract<Tok, { t: 're' }>;
      return { kind: 'cond', path, op: 'contains', value: re.v, ignoreCase: re.i };
    }
    if (valTok!.t === 'sym' || valTok!.t === 'name') fail(`expected a value at ${valTok!.at}`);
    let value: FilterValue;
    if (valTok!.t === 'kw') value = valTok!.v === 'null' ? null : valTok!.v === 'true';
    else value = (valTok as { v: string | number }).v;
    const op = (sym === '=' ? '==' : sym) as FilterOp;
    if (value === null && op !== '==' && op !== '!=') fail('null compares with == or != only');
    return { kind: 'cond', path, op, value };
  }
}

/** One `filter=` value → its scope. */
export function parseJsonPathFilter(src: string): FilterScope {
  if (src.length > FILTER_LIMITS.length) fail(`longer than ${FILTER_LIMITS.length} characters`);
  return new Parser(tokenize(src), src).scope();
}

const ATTR_OPS: Record<string, FilterOp> = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * TMF630 attribute style, one query key: `state=raised`, `state=raised,cleared` (any of),
 * `lastUpdate.gte=…`, `policy.name=Roaming`. The path is resolved against the schema by the
 * translator; here it is only split into path + operator.
 */
export function parseAttributeParam(key: string, raw: string | string[]): FilterCondition[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const parts = key.split('.');
  let op: FilterOp = '==';
  const last = parts[parts.length - 1];
  if (parts.length > 1 && ATTR_OPS[last]) {
    op = ATTR_OPS[last];
    parts.pop();
  }
  if (parts.some((p) => !/^@?[A-Za-z_][A-Za-z0-9_]*$/.test(p))) fail(`"${key}" is not an attribute path`);
  return values.map((v): FilterCondition => ({ kind: 'cond', path: parts, op, value: v }));
}

/** `sort=-lastUpdate,name` (TMF630); `name:DESC` is accepted too. */
export function parseSort(raw: string | string[] | undefined): SortKey[] {
  if (!raw) return [];
  const items = (Array.isArray(raw) ? raw : [raw]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  return items.map((item) => {
    const colon = /^(.+):(asc|desc)$/i.exec(item);
    if (colon) return { attr: colon[1], direction: colon[2].toUpperCase() as 'ASC' | 'DESC' };
    if (item.startsWith('-')) return { attr: item.slice(1), direction: 'DESC' };
    return { attr: item.replace(/^\+/, ''), direction: 'ASC' };
  });
}
