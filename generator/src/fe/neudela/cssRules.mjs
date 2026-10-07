// cssRules.mjs — the neudela adapter's CSS ⇄ rule-list bridge.
//
// `parseCss(text)` turns a stylesheet into the ordered rule list stored under
// `template.styles.sheets[].rules` in a neudela-fe/v1 spec; `cssFromRules(rules)` turns that list
// back into a stylesheet. Rule shapes (same as the YAML):
//   { select, decl: {prop: value}, note? }
//   { media, rules: [...], note? }
//   { keyframes, frames: [{ select, decl }], note? }
// Comments are kept only as `note` on the node that follows them; declaration values are
// whitespace-normalised. Supports exactly what the neudela-lab sheets use: rules, @media, @keyframes.

const ws = (s) => s.replace(/\s+/g, ' ').trim();

function decls(body) {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of clean) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) {
      if (cur.trim()) parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  const out = [];
  for (const d of parts) {
    const i = d.indexOf(':');
    out.push([d.slice(0, i).trim(), ws(d.slice(i + 1))]);
  }
  return out;
}

/** @returns {Array<object>} nodes: {kind:'rule'|'media'|'keyframes', ...} with decl as [prop, value][] */
export function parseCss(text) {
  let pos = 0;
  const n = text.length;

  function block() {
    const nodes = [];
    let note = null;
    let buf = '';
    while (pos < n) {
      if (text.startsWith('/*', pos)) {
        const j = text.indexOf('*/', pos) + 2;
        const comment = text.slice(pos + 2, j - 2);
        if (!buf.trim()) {
          const c = ws(comment.replace(/─/g, ' ')).replace(/\s{2,}/g, ' ');
          note = note === null ? c : `${note} ${c}`;
        }
        pos = j;
        continue;
      }
      const c = text[pos];
      if (c === '}') {
        pos += 1;
        return nodes;
      }
      if (c === '{') {
        const head = ws(buf);
        buf = '';
        pos += 1;
        if (head.startsWith('@media')) {
          nodes.push({ kind: 'media', query: head.slice('@media'.length).trim(), rules: block(), note });
        } else if (head.startsWith('@keyframes')) {
          const frames = block().map((f) => [f.select, f.decl]);
          nodes.push({ kind: 'keyframes', name: head.split(' ')[1], frames, note });
        } else {
          let j = pos;
          let depth = 1;
          while (depth) {
            if (text.startsWith('/*', j)) {
              j = text.indexOf('*/', j) + 2;
              continue;
            }
            if (text[j] === '{') depth += 1;
            else if (text[j] === '}') depth -= 1;
            j += 1;
          }
          const body = text.slice(pos, j - 1);
          pos = j;
          const select = head.split(',').map((s) => s.trim()).join(', ');
          nodes.push({ kind: 'rule', select, decl: decls(body), note });
        }
        note = null;
        continue;
      }
      buf += c;
      pos += 1;
    }
    return nodes;
  }

  return block();
}

/** Parsed nodes → the YAML rule shape (decl as an ordered object). `knob(media, select, prop, value)` may rewrite a value. */
export function toYamlRules(nodes, knob = (_m, _s, _p, v) => v, mediaName = (q) => [null, q]) {
  const walk = (list, media) => list.map((nd) => {
    if (nd.kind === 'media') {
      const [name, query] = mediaName(nd.query);
      return { media: query, ...(nd.note ? { note: nd.note } : {}), rules: walk(nd.rules, name) };
    }
    if (nd.kind === 'keyframes') {
      return {
        keyframes: nd.name,
        ...(nd.note ? { note: nd.note } : {}),
        frames: nd.frames.map(([select, d]) => ({ select, decl: Object.fromEntries(d) })),
      };
    }
    return {
      select: nd.select,
      ...(nd.note ? { note: nd.note } : {}),
      decl: Object.fromEntries(nd.decl.map(([p, v]) => [p, knob(media, nd.select, p, v)])),
    };
  });
  return walk(nodes, null);
}

/** YAML rule list (values already resolved) → CSS text. Notes become comments. */
export function cssFromRules(rules, indent = '') {
  const out = [];
  const comment = (note, ind) => (note ? `${ind}/* ${note} */\n` : '');
  const declBlock = (decl, ind) => Object.entries(decl).map(([p, v]) => `${ind}  ${p}: ${v};`).join('\n');
  for (const r of rules) {
    if (r.media !== undefined) {
      out.push(`${comment(r.note, indent)}${indent}@media ${r.media} {\n${cssFromRules(r.rules, `${indent}  `)}${indent}}\n`);
    } else if (r.keyframes !== undefined) {
      const frames = r.frames.map((f) => `${indent}  ${f.select} {\n${declBlock(f.decl, `${indent}  `)}\n${indent}  }`).join('\n');
      out.push(`${comment(r.note, indent)}${indent}@keyframes ${r.keyframes} {\n${frames}\n${indent}}\n`);
    } else {
      const sel = r.select.split(', ').join(`,\n${indent}`);
      out.push(`${comment(r.note, indent)}${indent}${sel} {\n${declBlock(r.decl, indent)}\n${indent}}\n`);
    }
  }
  return out.join('\n');
}
