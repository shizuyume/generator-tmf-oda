import fs from 'node:fs';
import path from 'node:path';

/**
 * Anchor-based, idempotent insertion into files the generator does NOT own.
 *
 * Generator-owned services regenerate their wiring wholesale from the manifest.
 * A hand-written host cannot: `app.module.ts` and `entities.ts` there contain human
 * code (Neo4j, BFF and graph modules, in the geographic case) that must survive.
 * So every edit here is a surgical insert that skips itself when the symbol is
 * already present, and reports exactly which lines it would add.
 */

/** @returns {{file:string, inserts:string[], skipped:string[], next:string}} */
function editConstants(text, component) {
  const inserts = [];
  const skipped = [];
  const lines = [];

  const has = name => new RegExp(`export const ${name}\\b`).test(text);
  if (has(component.basePathConstant)) skipped.push(component.basePathConstant);
  else lines.push(`export const ${component.basePathConstant} = '${component.basePath}';`);
  if (has(component.eventExchangeConstant)) skipped.push(component.eventExchangeConstant);
  else lines.push(`export const ${component.eventExchangeConstant} = '${component.eventExchange}';`);

  if (!lines.length) return { inserts, skipped, next: text };
  const block = [`\n// TMF${component.tmfNumber} ${component.specTitle} - added by tmfgen`, ...lines, ''].join('\n');
  inserts.push(...lines);
  return { inserts, skipped, next: text.replace(/\s*$/, '\n') + block };
}

function editEntitiesBarrel(text, entities, infra) {
  const inserts = [];
  const skipped = [];
  let next = text;

  const pending = entities.filter(e => {
    const present = new RegExp(`\\b${e.className}\\b`).test(text);
    if (present) skipped.push(e.className);
    return !present;
  });
  if (!pending.length) return { inserts, skipped, next };

  // imports go after the last existing import line
  const importLines = [...next.matchAll(/^import .*;$/gm)];
  const lastImport = importLines[importLines.length - 1];
  const importBlock = pending.map(e => `import { ${e.className} } from './${e.importPath}';`).join('\n');
  const at = lastImport.index + lastImport[0].length;
  next = `${next.slice(0, at)}\n${importBlock}${next.slice(at)}`;

  // array entries go BEFORE the infra tail, so the host's convention is preserved
  const firstInfra = infra[0];
  const entryBlock = pending.map(e => `  ${e.className},`).join('\n');
  const infraRe = new RegExp(`^(\\s*)${firstInfra},?$`, 'm');
  if (infraRe.test(next)) {
    next = next.replace(infraRe, `${entryBlock}\n$1${firstInfra},`);
  } else {
    next = next.replace(/\n\];/, `\n${entryBlock}\n];`);
  }
  inserts.push(...pending.map(e => e.className));
  return { inserts, skipped, next };
}

function editAppModule(text, modules) {
  const inserts = [];
  const skipped = [];
  let next = text;

  const pending = modules.filter(m => {
    const present = new RegExp(`\\b${m.moduleClass}\\b`).test(text);
    if (present) skipped.push(m.moduleClass);
    return !present;
  });
  if (!pending.length) return { inserts, skipped, next };

  const localImports = [...next.matchAll(/^import \{ \w+ \} from '\.\/[^']+';$/gm)];
  const lastLocal = localImports[localImports.length - 1];
  const importBlock = pending.map(m => `import { ${m.moduleClass} } from './${m.moduleImportPath}';`).join('\n');
  const at = lastLocal.index + lastLocal[0].length;
  next = `${next.slice(0, at)}\n${importBlock}${next.slice(at)}`;

  // entry goes at the end of the imports array, just before its closing bracket
  const entryBlock = pending.map(m => `    ${m.moduleClass},`).join('\n');
  const closing = next.match(/\n(\s*)\],\s*\n\s*\}\)/);
  if (!closing) throw new Error('cannot locate the end of the imports array in app.module.ts');
  next = next.replace(closing[0], `\n${entryBlock}${closing[0]}`);

  inserts.push(...pending.map(m => m.moduleClass));
  return { inserts, skipped, next };
}

/**
 * @param {object} opts
 * @param {string} opts.backendDir
 * @param {object} opts.component  manifest-style component entry
 * @param {object[]} opts.entities  [{className, importPath}]
 * @param {object[]} opts.modules   [{moduleClass, moduleImportPath}]
 * @param {string[]} opts.infra     infra entity names closing the barrel
 * @param {boolean} opts.dryRun
 */
export function injectIntoHost(opts) {
  const { backendDir, component, entities, modules, infra, dryRun } = opts;
  const src = path.join(backendDir, 'src');
  const plan = [];

  const targets = [
    {
      rel: 'src/common/constants/tmf.constants.ts',
      edit: t => editConstants(t, component),
    },
    {
      rel: 'src/entities.ts',
      edit: t => editEntitiesBarrel(t, entities, infra),
    },
    {
      rel: 'src/app.module.ts',
      edit: t => editAppModule(t, modules),
    },
  ];

  for (const t of targets) {
    const abs = path.join(backendDir, t.rel);
    if (!fs.existsSync(abs)) {
      plan.push({ file: t.rel, error: 'file not found' });
      continue;
    }
    const before = fs.readFileSync(abs, 'utf8');
    const { inserts, skipped, next } = t.edit(before);
    plan.push({
      file: t.rel,
      inserts,
      skipped,
      changed: next !== before,
    });
    if (!dryRun && next !== before) fs.writeFileSync(abs, next, 'utf8');
  }

  return { plan, dryRun: !!dryRun, src };
}

export function describePlan(result) {
  const L = [];
  for (const p of result.plan) {
    if (p.error) { L.push(`  ${p.file}: ERROR ${p.error}`); continue; }
    const state = p.changed ? (result.dryRun ? 'WOULD CHANGE' : 'CHANGED') : 'no change';
    L.push(`  ${p.file}  [${state}]`);
    for (const i of p.inserts) L.push(`      + ${i}`);
    if (p.skipped.length) L.push(`      = already present: ${p.skipped.join(', ')}`);
  }
  return L.join('\n');
}
