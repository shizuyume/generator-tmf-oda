/**
 * Resolver binding — namespace resmi (kontrak FE IR / M0):
 * query | pagination | search | filter | index | item | pageContext | config | api.
 * Var tak dikenal → THROW (pola BE "rendering throws on any placeholder").
 */
export interface BindingContext {
  query?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  search?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  index?: unknown;
  item?: Record<string, unknown>;
  pageContext?: Record<string, unknown>;
  config?: Record<string, unknown>;
  api?: Record<string, unknown>;
}

const NAMESPACES = new Set(['query', 'pagination', 'search', 'filter', 'index', 'item', 'pageContext', 'config', 'api']);

function lookup(ctx: BindingContext, ns: string, key: string | null): unknown {
  if (key === null) return (ctx as Record<string, unknown>)[ns];
  const source = (ctx as Record<string, unknown>)[ns];
  if (source && typeof source === 'object') return (source as Record<string, unknown>)[key];
  return undefined;
}

export function resolveTemplate(template: string, ctx: BindingContext = {}): string {
  return template.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (whole, raw: string) => {
    const dot = raw.indexOf('.');
    const ns = dot === -1 ? raw : raw.slice(0, dot);
    const key = dot === -1 ? null : raw.slice(dot + 1);
    if (!NAMESPACES.has(ns)) {
      throw new Error(
        `QueryContext: namespace "${ns}" tak dikenal (resmi: query|pagination|search|filter|index|item|pageContext|config|api)`,
      );
    }
    const value = lookup(ctx, ns, key);
    if (value === undefined || value === null) {
      throw new Error(`QueryContext: var "{{${raw}}}" tidak diketahui di namespace "${ns}"`);
    }
    return String(value);
  });
}