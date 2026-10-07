// yamlLiteral.mjs — deterministic YAML printer for neudela-fe/v1 specs.
//
// Same input → same text. Mappings keep insertion order. A mapping/sequence is written in flow
// style (`{ a: 1 }`, `[a, b]`) when it fits in `width` columns and holds no nested multi-line
// value; otherwise in block style. Strings are plain when unambiguous, else double-quoted
// (JSON escaping, valid YAML). The output round-trips through js-yaml to the same value.

const PLAIN = /^[A-Za-z_/.$<(][^:#,[\]{}&*!|>'"%`]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~|y|n)$/i;
const NUMBER = /^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

function str(s, flow) {
  const plain = s !== ''
    && PLAIN.test(s)
    && !RESERVED.test(s)
    && !NUMBER.test(s)
    && s === s.trim()
    && !s.includes(' #')
    && !s.includes(': ')
    && !s.endsWith(':')
    && !(flow && /[,[\]{}]/.test(s));
  return plain ? s : JSON.stringify(s);
}

const keyOf = (k) => str(String(k), true);

function scalar(v, flow) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return str(v, flow);
  return String(v);
}

const isColl = (v) => v !== null && typeof v === 'object';

function flow(v) {
  if (!isColl(v)) return scalar(v, true);
  if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`;
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  return e.length ? `{ ${e.map(([k, x]) => `${keyOf(k)}: ${flow(x)}`).join(', ')} }` : '{}';
}

/** Lines of `v` as a block value at `indent`. */
function block(v, indent, width) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) return ['[]'];
    const lines = [];
    for (const item of v) {
      const f = flow(item);
      if (!isColl(item) || indent + 2 + f.length <= width) {
        lines.push(`${pad}- ${f}`);
      } else if (Array.isArray(item)) {
        lines.push(`${pad}-`, ...block(item, indent + 2, width));
      } else {
        const sub = mapLines(item, indent + 2, width);
        lines.push(`${pad}- ${sub[0].trimStart()}`, ...sub.slice(1));
      }
    }
    return lines;
  }
  return mapLines(v, indent, width);
}

function mapLines(obj, indent, width) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const head = `${pad}${keyOf(k)}:`;
    const f = flow(v);
    if (!isColl(v) || head.length + 1 + f.length <= width || (Array.isArray(v) && v.length === 0) || (!Array.isArray(v) && Object.keys(v).length === 0)) {
      lines.push(`${head} ${f}`);
    } else {
      lines.push(head, ...block(v, indent + 2, width));
    }
  }
  return lines;
}

/** YAML text of a mapping (top level), ending with a newline. */
export function yamlLiteral(obj, { indent = 0, width = 120 } = {}) {
  return `${mapLines(obj, indent, width).join('\n')}\n`;
}
