#!/usr/bin/env node
/**
 * One-time harvest of the static template set from the golden reference
 * (partnership_management, TMF668) into generator/templates/.
 *
 * Run once and commit the result: the generator must be self-contained, not
 * dependent on the reference service still existing at that path.
 *
 *   node tools/harvest.mjs [--from <backend dir>]
 *
 * Three categories:
 *   verbatim  - byte-identical for any TMF component, copied as-is
 *   tokenised - identical except for TMF-number / title / port literals, which
 *               are rewritten to {{PLACEHOLDER}} here and rendered at scaffold time
 *   dropped   - deliberately NOT harvested; each has a recorded reason
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const fromArgIdx = process.argv.indexOf('--from');
const FROM = fromArgIdx > -1
  ? path.resolve(process.argv[fromArgIdx + 1])
  : 'D:/Neuronworks/project/tm-forum/partnership_management/backend';

const OUT = path.join(root, 'templates');

const VERBATIM = [
  'src/common/dto/query-base.dto.ts',
  'src/common/filters/http-exception.filter.ts',
  'src/common/guards/api-key.guard.ts',
  'src/common/interceptors/pagination.interceptor.ts',
  'src/common/utils/query-helper.util.ts',
  'src/common/utils/response-mapper.util.ts',
  'src/common/utils/tmf-resource.util.ts',
  'src/event/entities/event-log.entity.ts',
  'src/event/event-delivery.service.ts',
  'src/event/event-store.service.ts',
  'src/event/event.module.ts',
  'src/subscription/dto/create-subscription.dto.ts',
  'src/subscription/entities/event-subscription.entity.ts',
  'src/subscription/subscription.service.ts',
  'nest-cli.json',
  'tsconfig.json',
  'tsconfig.build.json',
  '.eslintrc.js',
  '.prettierrc',
  '.gitignore',
];

/** Files whose only variance is a literal; rewritten to placeholders. */
const TOKENISED = [
  'src/event/event-emitter.service.ts',
  'src/event/rabbitmq.service.ts',
  'src/main.ts',
  'package.json',
];

const DROPPED = {
  'src/subscription/subscription.controller.ts': 'generated per component (each has its own base path)',
  'src/subscription/subscription.module.ts': 'generated - registers one hub controller per component',
  'src/listener/listener.module.ts': 'generated - registers one listener controller per component',
  'src/common/dto/base-tmf-update.dto.ts': 'dead code - never imported by any DTO',
  'src/common/interceptors/tmf-response.interceptor.ts': 'dead code - never applied by any controller',
  'src/common/utils/relation-mapper.util.ts': 'dead code - mapBaseRefInput never imported',
  '.env': 'contains live RabbitMQ credentials; a placeholder .env.example is generated instead',
  'dev.db': 'local sqlite artifact',
  'yarn.lock': 'lockfile is resolved per generated service, not inherited',
};

/**
 * Reference literals -> placeholders. Order matters: longest/most specific first,
 * so 'TMF668 Partnership Management API v4' is not partially eaten by 'TMF668_'.
 */
const TOKEN_RULES = [
  [/TMF668 Partnership Management API v4/g, '{{API_DESCRIPTION}}'],
  [/'Partnership Management'/g, "'{{API_TITLE}}'"],
  [/'partnership-management'/g, "'{{SERVICE_SLUG}}'"],
  [/"@partnership-management\/backend"/g, '"@{{SERVICE_SLUG}}/backend"'],
  [/TMF668_EVENT_EXCHANGE/g, '{{EVENT_EXCHANGE_CONST}}'],
  [/TMF668_BASE_PATH/g, '{{BASE_PATH_CONST}}'],
  [/\.setVersion\('4\.0\.0'\)/g, ".setVersion('{{API_VERSION}}')"],
  [/process\.env\.PORT \|\| 3020/g, 'process.env.PORT || {{PORT}}'],
];

function applyTokens(text, relPath) {
  let out = text;
  const applied = [];
  for (const [re, replacement] of TOKEN_RULES) {
    if (re.test(out)) {
      out = out.replace(re, replacement);
      applied.push(replacement);
    }
    re.lastIndex = 0;
  }
  // Nothing may still reference the reference component.
  const leftover = out.match(/TMF668|[Pp]artnership/g);
  return { out, applied, leftover: leftover ? [...new Set(leftover)] : [] };
}

function copy(rel, transform) {
  const src = path.join(FROM, rel);
  if (!fs.existsSync(src)) return { rel, status: 'MISSING' };
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const text = fs.readFileSync(src, 'utf8');
  if (!transform) {
    fs.writeFileSync(dest, text, 'utf8');
    return { rel, status: 'verbatim', bytes: text.length };
  }
  const { out, applied, leftover } = transform(text, rel);
  fs.writeFileSync(dest, out, 'utf8');
  return { rel, status: 'tokenised', bytes: out.length, applied, leftover };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const report = { from: FROM, verbatim: [], tokenised: [], dropped: DROPPED, missing: [], warnings: [] };

for (const rel of VERBATIM) {
  const r = copy(rel);
  if (r.status === 'MISSING') { report.missing.push(rel); continue; }
  report.verbatim.push({ file: rel, bytes: r.bytes });
}

for (const rel of TOKENISED) {
  const r = copy(rel, applyTokens);
  if (r.status === 'MISSING') { report.missing.push(rel); continue; }
  report.tokenised.push({ file: rel, bytes: r.bytes, placeholders: r.applied });
  if (r.leftover.length) {
    report.warnings.push(`${rel}: unreplaced reference literal(s): ${r.leftover.join(', ')}`);
  }
}

// Any harvested file still mentioning the reference component is a harvest bug.
for (const { file } of report.verbatim) {
  const text = fs.readFileSync(path.join(OUT, file), 'utf8');
  const hits = text.match(/TMF668|partnershipManagement/g);
  if (hits) report.warnings.push(`${file}: verbatim file references the reference component: ${[...new Set(hits)].join(', ')}`);
}

fs.writeFileSync(path.join(OUT, 'harvest-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`harvested from ${FROM}`);
console.log(`  verbatim  : ${report.verbatim.length}`);
console.log(`  tokenised : ${report.tokenised.length}`);
console.log(`  dropped   : ${Object.keys(DROPPED).length}`);
if (report.missing.length) console.log(`  MISSING   : ${report.missing.join(', ')}`);
for (const w of report.warnings) console.log(`  ! ${w}`);
for (const t of report.tokenised) console.log(`    ${t.file} -> ${t.placeholders.join(' ') || '(no tokens found)'}`);
