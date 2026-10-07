/**
 * In-memory TMF API + relation lookups for `npm run dev:mock` (vite --mode mock).
 * Dev-server middleware only: never bundled into the app, so src/ has no mock branches
 * and talks to the API exactly as it does against the real backend. What it serves is
 * described by mock/seed.ts (per app).
 *
 * Behaviour follows the generated backend: offset/limit paging with X-Total-Count /
 * X-Result-Count, TMF630 filters (JSONPath `filter=` + attribute style, see below),
 * `sort=-field,field`, 201 on create, 204 on delete, 404 / 400 / 405 with a `message` body.
 * State resets on restart.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type Item = Record<string, any>;

export interface MockRule {
  field: string;
  /** string: a non-blank string; nonEmptyArray: an array with at least one element. */
  kind: 'string' | 'nonEmptyArray';
  message: string;
}

export interface MockResource {
  /**
   * Collection path under `apiBase`, e.g. '/partyRevSharingAlgorithm', or a nested one,
   * '/geographicAddress/{geographicAddressId}/geographicSubAddress' (items carry `__parent`).
   */
  path: string;
  /** Name in 404 messages. */
  label: string;
  items: Item[];
  rules: MockRule[];
  /** PATCH /{path}/{id} supported. */
  patch: boolean;
  /** Set createdDate + lastUpdate on create (lastUpdate on patch). */
  timestamps: boolean;
  /** Only these body fields are kept on create (then @type = `type`); otherwise the whole body. */
  createFields?: string[];
  type?: string;
}

export interface MockSpec {
  name: string;
  apiBase: string;
  latencyMs: number;
  /** Lookup collections by full path (e.g. '/mock-policy-api/tmf-api/policyManagement/v5/policy'). */
  lookups: Record<string, { id: string; name: string }[]>;
  resources: MockResource[];
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

// ─── List filtering (TMF630, same grammar as the generated backend's common/filter) ─
//   filter=$[?(@.a=='x' && @.b>=2)]       the resource      filter=policy[?(@.name=~/roam/i)]
//     && || ! ( )   == (or =) != < <= > >=   'text' "text" number true false null
//     =~ /literal/ or /literal/i = contains (pattern characters must be escaped)
//     conditions inside list[?( … )] hold for ONE element; filter= params are ANDed
//   attr=v (equality; v1,v2 = any of) · attr.ne|gt|gte|lt|lte=v · list.attr=v (one element)
//   name= (contains, any case) · q= (name or description contains) · sort=-a,b (or a:DESC)
// Unlike the backend there is no per-resource whitelist: an unknown attribute just never matches.

type Pred = (scope: unknown) => boolean;

const RESERVED = new Set(['offset', 'limit', 'sort', 'fields', 'filter', 'q', 'name']);
const ATTR_OPS: Record<string, string> = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const SYMBOLS = ['&&', '||', '==', '!=', '<=', '>=', '=~', '?(', '$', '@', '[', ']', '(', ')', '.', '!', '<', '>', '='];

class FilterError extends Error {}
const fail = (message: string): never => {
  throw new FilterError(`Invalid filter: ${message}`);
};

/** Values at `path`; a list on the way contributes each of its elements. */
function valuesAt(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap((v) => valuesAt(v, path));
  if (path.length === 0) return [value];
  if (value === null || typeof value !== 'object') return [undefined];
  return valuesAt((value as Record<string, unknown>)[path[0]], path.slice(1));
}

function order(actual: unknown, expected: unknown): number {
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected;
  const a = Date.parse(String(actual));
  const b = Date.parse(String(expected));
  if (!Number.isNaN(a) && !Number.isNaN(b) && typeof actual === 'string') return a - b;
  return String(actual).localeCompare(String(expected));
}

function compare(actual: unknown, op: string, expected: unknown, ignoreCase = false): boolean {
  const absent = actual === undefined || actual === null;
  if (expected === null) return op === '==' ? absent : !absent;
  if (op === '!=') return absent || String(actual) !== String(expected);
  if (absent) return false;
  if (op === 'contains') {
    const a = String(actual);
    const e = String(expected);
    return ignoreCase ? a.toLowerCase().includes(e.toLowerCase()) : a.includes(e);
  }
  if (op === '==') return String(actual) === String(expected);
  const diff = order(actual, expected);
  if (op === '>') return diff > 0;
  if (op === '>=') return diff >= 0;
  if (op === '<') return diff < 0;
  return diff <= 0;
}

const condition = (path: string[], op: string, expected: unknown, ignoreCase?: boolean): Pred =>
  (scope) => {
    const values = valuesAt(scope, path);
    // != / == null hold when no value matches the other way round
    return op === '!=' ? values.every((v) => compare(v, op, expected)) : values.some((v) => compare(v, op, expected, ignoreCase));
  };

const KEYWORDS: Record<string, boolean | null> = { true: true, false: false, null: null };

type Tok = { t: 'sym' | 'name' | 'str' | 'num' | 'kw' | 're'; v: any; i?: boolean; at: number };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j += 1;
        v += src[j];
        j += 1;
      }
      if (j >= src.length) fail(`unterminated string at ${i}`);
      toks.push({ t: 'str', v, at: i });
      i = j + 1;
    } else if (c === '/') {
      const prev = toks[toks.length - 1];
      if (prev?.t !== 'sym' || prev.v !== '=~') fail(`unexpected "/" at ${i}`);
      let j = i + 1;
      let v = '';
      while (j < src.length && src[j] !== '/') {
        if (src[j] === '\\') j += 1;
        else if (/[.*+?^${}()|[\]]/.test(src[j])) fail(`=~ takes a literal text: escape "${src[j]}" (at ${j})`);
        v += src[j] ?? '';
        j += 1;
      }
      if (j >= src.length) fail(`unterminated /…/ at ${i}`);
      const flags = /^[a-z]*/.exec(src.slice(j + 1))![0];
      if (flags && flags !== 'i') fail(`unsupported /…/${flags} flags (only i)`);
      toks.push({ t: 're', v, i: flags === 'i', at: i });
      i = j + 1 + flags.length;
    } else if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(src.slice(i))![0];
      toks.push({ t: 'num', v: Number(m), at: i });
      i += m.length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))![0];
      toks.push({ t: ['true', 'false', 'null'].includes(m) ? 'kw' : 'name', v: m, at: i });
      i += m.length;
    } else {
      const sym = SYMBOLS.find((s) => src.startsWith(s, i)) ?? fail(`unexpected "${c}" at ${i}`);
      toks.push({ t: 'sym', v: sym, at: i });
      i += sym.length;
    }
  }
  return toks;
}

/** One `filter=` value → a predicate on an item. */
function parseJsonPath(src: string): Pred {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isSym = (v: string) => peek()?.t === 'sym' && peek().v === v;
  const expect = (v: string) => {
    if (!isSym(v)) fail(`expected "${v}" at ${peek()?.at ?? src.length}`);
    pos += 1;
  };
  const name = (): string => {
    const t = peek();
    if (t?.t !== 'name') fail(`expected an attribute name at ${t?.at ?? src.length}`);
    pos += 1;
    return t.v;
  };
  const segment = (): string => {
    if (!isSym('@')) return name();
    pos += 1;
    return `@${name()}`;
  };

  function comparison(): Pred {
    expect('@');
    if (isSym('.')) pos += 1;
    const path = [segment()];
    while (isSym('.')) {
      pos += 1;
      path.push(segment());
    }
    const op = peek();
    if (op?.t !== 'sym' || !['==', '=', '!=', '<', '<=', '>', '>=', '=~'].includes(op.v)) fail(`expected a comparison at ${op?.at ?? src.length}`);
    pos += 1;
    const val = peek() ?? fail('missing value at the end');
    pos += 1;
    if (op.v === '=~') {
      if (val.t !== 're') fail(`=~ takes /text/ or /text/i at ${val.at}`);
      return condition(path, 'contains', val.v, val.i);
    }
    if (val.t === 'sym' || val.t === 'name') fail(`expected a value at ${val.at}`);
    const value = val.t === 'kw' ? KEYWORDS[val.v] : val.v;
    return condition(path, op.v === '=' ? '==' : op.v, value);
  }
  function unary(): Pred {
    if (isSym('!')) {
      pos += 1;
      const p = unary();
      return (s) => !p(s);
    }
    if (isSym('(')) {
      pos += 1;
      const p = or();
      expect(')');
      return p;
    }
    return comparison();
  }
  function and(): Pred {
    const items = [unary()];
    while (isSym('&&')) {
      pos += 1;
      items.push(unary());
    }
    return (s) => items.every((p) => p(s));
  }
  function or(): Pred {
    const items = [and()];
    while (isSym('||')) {
      pos += 1;
      items.push(and());
    }
    return (s) => items.some((p) => p(s));
  }

  let list: string | null = null;
  if (isSym('$')) pos += 1;
  else list = name();
  expect('[');
  expect('?(');
  const pred = or();
  expect(')');
  expect(']');
  if (pos !== toks.length) fail(`unexpected text at ${peek().at}`);
  if (list === null) return pred;
  return (item) => {
    const elements = (item as Record<string, unknown>)[list];
    return Array.isArray(elements) && elements.some(pred);
  };
}

/** Attribute-style keys → predicates; `list.a=1&list.b=2` must hold for one element. */
function attributePredicates(params: URLSearchParams): Pred[] {
  const preds: Pred[] = [];
  const perList = new Map<string, Pred[]>();
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key) || raw === '') continue;
    const path = key.split('.');
    const op = path.length > 1 && ATTR_OPS[path[path.length - 1]] ? ATTR_OPS[path.pop()!] : '==';
    const anyOf = op === '==' ? raw.split(',') : [raw];
    const build = (p: string[]): Pred => {
      const alts = anyOf.map((v) => condition(p, op, v));
      return (s) => alts.some((a) => a(s));
    };
    if (path.length > 1) {
      perList.set(path[0], [...(perList.get(path[0]) ?? []), build(path.slice(1))]);
    } else {
      preds.push(build(path));
    }
  }
  for (const [list, items] of perList) {
    preds.push((item) => {
      const v = (item as Record<string, unknown>)[list];
      return Array.isArray(v) ? v.some((el) => items.every((p) => p(el))) : items.every((p) => p(v));
    });
  }
  return preds;
}

function listPredicates(params: URLSearchParams): Pred[] {
  const contains = (attrs: string[], text: string): Pred => (item) =>
    attrs.some((a) => compare((item as Record<string, unknown>)[a], 'contains', text, true));
  const preds: Pred[] = [];
  const name = params.get('name');
  if (name) preds.push(contains(['name'], name));
  const q = params.get('q');
  if (q) preds.push(contains(['name', 'description'], q));
  const filters = params.getAll('filter').filter(Boolean);
  if (filters.length > 10) fail('more than 10 filter= parameters');
  return [...preds, ...filters.map(parseJsonPath), ...attributePredicates(params)];
}

function sortItems(items: Item[], raw: string[]): Item[] {
  const keys = raw.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean).map((k) => {
    const colon = /^(.+):(asc|desc)$/i.exec(k);
    if (colon) return { attr: colon[1], sign: colon[2].toUpperCase() === 'DESC' ? -1 : 1 };
    return k.startsWith('-') ? { attr: k.slice(1), sign: -1 } : { attr: k.replace(/^\+/, ''), sign: 1 };
  });
  if (!keys.length) return items;
  return [...items].sort((a, b) => {
    for (const { attr, sign } of keys) {
      const d = String(a[attr] ?? '').localeCompare(String(b[attr] ?? ''));
      if (d) return d * sign;
    }
    return 0;
  });
}

function listResponse(res: ServerResponse, items: Item[], params: URLSearchParams) {
  let preds: Pred[];
  try {
    preds = listPredicates(params);
  } catch (err) {
    if (err instanceof FilterError) return send(res, 400, { code: '400', reason: 'Bad Request', message: err.message });
    throw err;
  }
  const result = sortItems(items.filter((item) => preds.every((p) => p(item))), params.getAll('sort'));
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const limit = Math.max(1, Number(params.get('limit') ?? 10) || 10);
  const page = result.slice(offset, offset + limit);
  send(res, 200, page, {
    'X-Total-Count': String(result.length),
    'X-Result-Count': String(page.length),
  });
}

function ruleError(rules: MockRule[], body: any): string | null {
  for (const r of rules) {
    const v = body?.[r.field];
    if (r.kind === 'string' && (typeof v !== 'string' || !v.trim())) return r.message;
    if (r.kind === 'nonEmptyArray' && (!Array.isArray(v) || v.length === 0)) return r.message;
  }
  return null;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function mockApi(spec: MockSpec): Plugin {
  // fresh copies: the seed module stays untouched
  const stores = spec.resources.map((r) => ({ ...r, items: structuredClone(r.items) }));
  // `/a/{id}/b` (a resource nested under a parent record) or `/a`, each optionally `/{id}`
  const routes = stores.map((store) => ({
    store,
    nested: store.path.includes('{'),
    re: new RegExp(`^${store.path.replace(/\{[^}]+\}/g, '([^/]+)')}(?:/([^/]+))?/?$`),
  }));

  /** What the API returns: an item without the mock's own parent marker. */
  const visible = ({ __parent: _parent, ...item }: Item) => item;

  async function handle(r: (typeof stores)[number], req: IncomingMessage, res: ServerResponse, id: string | undefined, params: URLSearchParams, parentId?: string) {
    // a nested collection holds the items of one parent record
    const inScope = (it: Item) => parentId === undefined || it.__parent === parentId;
    const items = r.items;
    const index = id ? items.findIndex((a) => a.id === id && inScope(a)) : -1;
    if (id && index === -1) return send(res, 404, { message: `${r.label} ${id} not found` });
    const collection = parentId === undefined ? r.path : r.path.replace(/\{[^}]+\}/, encodeURIComponent(parentId));

    switch (req.method) {
      case 'GET':
        return id ? send(res, 200, visible(items[index])) : listResponse(res, items.filter(inScope).map(visible), params);
      case 'POST': {
        if (id) return send(res, 405, { message: 'Method not allowed' });
        const body = await readJson(req);
        const error = body ? ruleError(r.rules, body) : 'Invalid JSON body';
        if (error) return send(res, 400, { message: error });
        const newId = randomUUID();
        const href = `${spec.apiBase}${collection}/${newId}`;
        const now = new Date().toISOString();
        const created: Item = r.createFields
          ? {
              id: newId,
              href,
              ...Object.fromEntries(r.createFields.filter((f) => body[f] !== undefined && body[f] !== '').map((f) => [f, body[f]])),
              ...(r.type ? { '@type': r.type } : {}),
            }
          : { ...body, id: newId, href, ...(r.timestamps ? { createdDate: now, lastUpdate: now } : {}) };
        items.unshift(parentId === undefined ? created : { ...created, __parent: parentId });
        return send(res, 201, created);
      }
      case 'PATCH': {
        if (!id || !r.patch) return send(res, 405, { message: 'Method not allowed' });
        const body = await readJson(req);
        if (!body) return send(res, 400, { message: 'Invalid JSON body' });
        const { id: _ignoredId, href: _ignoredHref, createdDate: _ignoredCreated, ...patch } = body;
        items[index] = { ...items[index], ...patch, ...(r.timestamps ? { lastUpdate: new Date().toISOString() } : {}) };
        return send(res, 200, visible(items[index]));
      }
      case 'DELETE':
        if (!id) return send(res, 405, { message: 'Method not allowed' });
        items.splice(index, 1);
        return send(res, 204);
      default:
        return send(res, 405, { message: 'Method not allowed' });
    }
  }

  return {
    name: `${spec.name}:mock-api`,
    configureServer(server) {
      server.config.logger.info(`  ➜  ${spec.name} mock API enabled (in-memory, resets on restart)`);

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://mock.local');

        const lookup = spec.lookups[url.pathname];
        if (lookup) {
          const q = (url.searchParams.get('name') ?? '').toLowerCase();
          const limit = Number(url.searchParams.get('limit') ?? 20) || 20;
          await new Promise((r) => setTimeout(r, spec.latencyMs));
          return send(res, 200, lookup.filter((i) => i.name.toLowerCase().includes(q)).slice(0, limit));
        }

        if (!url.pathname.startsWith(spec.apiBase)) return next();

        const rel = url.pathname.slice(spec.apiBase.length);
        await new Promise((r) => setTimeout(r, spec.latencyMs));
        for (const route of routes) {
          const m = route.re.exec(rel);
          if (!m) continue;
          const [parentId, id] = route.nested ? [decodeURIComponent(m[1]), m[2]] : [undefined, m[1]];
          try {
            return await handle(route.store, req, res, id, url.searchParams, parentId);
          } catch (err) {
            return send(res, 500, { message: err instanceof Error ? err.message : 'Mock error' });
          }
        }
        return send(res, 404, { message: `Unknown resource ${rel}` });
      });
    },
  };
}
