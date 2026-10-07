// tsLiteral.mjs — deterministic TypeScript literal printer for the neudela emitters.
//
// Same input → same text: keys in insertion order, single quotes, trailing commas, 2-space
// indent. An object/array is printed on one line when it fits in `width` columns (counted
// from its indent) and has no nested multi-line value; otherwise one entry per line.
// Values tagged with code() are emitted verbatim (identifiers, imported functions).

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CODE = Symbol('code');

/** A raw TypeScript expression (printed as-is). */
export const code = (text) => ({ [CODE]: text });

export function quote(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

const keyOf = (k) => (IDENT.test(k) ? k : quote(k));

function inline(v) {
  if (v && typeof v === 'object' && CODE in v) return v[CODE];
  if (v === null) return 'null';
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return entries.length ? `{ ${entries.map(([k, x]) => `${keyOf(k)}: ${inline(x)}`).join(', ')} }` : '{}';
}

/**
 * @param {unknown} v value
 * @param {number} indent current indent (spaces)
 * @param {number} lead columns already used on the line before the value (e.g. "key: ")
 */
export function tsLiteral(v, indent = 0, lead = 0, width = 120) {
  const one = inline(v);
  const isObj = v && typeof v === 'object' && !(CODE in v);
  if (!isObj || indent + lead + one.length <= width) return one;
  const pad = ' '.repeat(indent + 2);
  if (Array.isArray(v)) {
    return `[\n${v.map((x) => `${pad}${tsLiteral(x, indent + 2, 0, width)},`).join('\n')}\n${' '.repeat(indent)}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => {
    const kk = `${keyOf(k)}: `;
    return `${pad}${kk}${tsLiteral(x, indent + 2, kk.length, width)},`;
  }).join('\n')}\n${' '.repeat(indent)}}`;
}
