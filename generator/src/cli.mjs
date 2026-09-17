#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { Command } from 'commander';
import { loadSpec } from './ingest/loadSpec.mjs';
import { buildIR } from './ir/buildIR.mjs';
import { mergeMarkdown } from './ir/mergeMarkdown.mjs';
import { allocatePort } from './scaffold/allocatePort.mjs';
import { scaffoldService } from './scaffold/newService.mjs';
import { emitResources } from './emit/index.mjs';
import { buildCtk } from './ctk/buildCtk.mjs';
import { probeHost, describeProfile } from './inject/probeHost.mjs';
import { injectIntoHost, describePlan } from './inject/apply.mjs';
import { tmfNumber } from './ir/naming.mjs';
import { emitFESpec } from './fe/emitFESpec.mjs';
import { buildFEIR, FEIRError } from './fe/buildFEIR.mjs';
import { formatErrors } from './fe/validateFESpec.mjs';
import { resolveFEIR, scaffoldApp } from './fe/scaffoldApp.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const toPosix = p => String(p).split(path.sep).join('/');

function loadConfig() {
  const p = path.join(root, 'tmfgen.config.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

/** Locate the spec + optional userguide markdown inside a TMF component folder. */
function resolveComponentInputs(componentDir) {
  const openapiDir = path.join(componentDir, 'openapi');
  const searchDir = fs.existsSync(openapiDir) ? openapiDir : componentDir;
  const candidates = fs.readdirSync(searchDir)
    .filter(f => /\.(ya?ml|json)$/i.test(f))
    .filter(f => !/postman/i.test(f))
    .map(f => path.join(searchDir, f));
  if (!candidates.length) throw new Error(`No spec file found under ${searchDir}`);

  const mdDir = path.join(componentDir, 'userguide');
  let md = null;
  if (fs.existsSync(mdDir)) {
    const mds = fs.readdirSync(mdDir).filter(f => /\.md$/i.test(f));
    if (mds.length) md = path.join(mdDir, mds[0]);
  }
  return { spec: candidates[0], md };
}

function summarize(ir) {
  const L = [];
  const m = ir.meta;
  L.push(`TMF${m.tmfNumber}  ${m.specTitle} v${m.specVersion}  (${m.dialect})`);
  L.push(`  basePath        ${m.basePath}   (${m.basePathSource})`);
  L.push(`  exchange        ${m.eventExchange}`);
  L.push(`  service suggest ${m.serviceNameSuggestion}`);
  L.push(`  hub             ${ir.hub.present ? 'present' : 'absent'}  spec methods: ${
    Object.entries(ir.hub.specMethods).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join('/') || 'none'}`);
  L.push(`  listeners       ${ir.listeners.length}: ${ir.listeners.map(l => l.eventKind).join(', ')}`);
  L.push('');
  for (const r of ir.resources) {
    L.push(`  resource ${r.name}   (/${r.pathKey}${r.nested ? ' [nested]' : ''} -> table ${r.tableName})`);
    L.push(`    composed from   ${r.composedFrom.join(' + ') || '-'}`);
    L.push(`    required        ${JSON.stringify(r.required)}`);
    L.push(`    scalar fields   ${r.fields.filter(f => f.kind === 'scalar').map(f => f.name).join(', ') || '-'}`);
    const json = r.fields.filter(f => f.kind === 'json');
    if (json.length) L.push(`    simple-json     ${json.map(f => `${f.name} (${f.reason})`).join(', ')}`);
    L.push(`    flattened refs  ${r.flattenedRefs.map(f => `${f.name}[${f.columns.length} cols]`).join(', ') || '-'}`);
    L.push(`    resource refs   ${r.resourceRefs.map(f => `${f.name} -> ${f.targetResource} (FK ${f.joinColumn})`).join(', ') || '-'}`);
    L.push(`    sub-entities    ${r.subResources.map(s => s.className).join(', ') || '-'}`);
    for (const s of r.subResources) {
      const bits = [
        `${s.fields.filter(f => f.kind === 'scalar').length} scalar`,
        `${s.flattenedRefs.length} flattened`,
        `${s.children.length} child`,
      ];
      L.push(`      - ${s.className} (${s.tableName}) <- ${s.propertyName}: ${bits.join(', ')}`);
      for (const c of s.children) L.push(`          + ${c.className} (${c.tableName}) <- ${c.propertyName}`);
    }
    const opsOn = Object.entries(r.operations).filter(([, v]) => v).map(([k]) => k).join(',');
    L.push(`    operations      ${opsOn || 'none'}`);
    L.push(`    createShape     ${r.createShape ? `${r.createShape.schemaName} required=${JSON.stringify(r.createShape.required)} clientId=${r.createShape.allowsClientId}` : 'MISSING'}`);
    L.push(`    updateShape     ${r.updateShape ? `${r.updateShape.schemaName} required=${JSON.stringify(r.updateShape.required)}` : 'MISSING'}`);
    L.push(`    house filters   ${Object.entries(r.houseFilters).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
    L.push(`    events          ${r.notificationEvents.map(e => e.eventKind).join(', ') || '-'}`);
    L.push(`    list params     ${(r.operations.list?.params || []).map(p => p.name).join(', ') || '-'}`);
    L.push('');
  }
  if (ir.warnings.length) {
    L.push(`  warnings (${ir.warnings.length}):`);
    for (const w of ir.warnings) L.push(`    ! ${w}`);
  }
  return L.join('\n');
}

/** Shared ingestion path so `ir` and `scaffold` can never diverge. */
async function buildIrFrom(opts, config) {
  let specPath = opts.spec;
  let mdPath = opts.md ?? null;
  if (!specPath && opts.component) {
    const found = resolveComponentInputs(path.resolve(opts.component));
    specPath = found.spec;
    if (!mdPath) mdPath = found.md;
  }
  if (!specPath) {
    console.error('error: one of --spec or --component is required');
    process.exit(2);
  }

  let loaded;
  try {
    loaded = await loadSpec(specPath);
  } catch (err) {
    // Vendor specs are occasionally malformed (tmf685/3.0.0 has an unresolvable
    // $ref). Fail with a readable message instead of a parser stack trace.
    const detail = String(err?.message ?? err).split(/\r?\n/)[0];
    console.error('error: cannot load spec');
    console.error(`  ${specPath}`);
    console.error(`  ${detail}`);
    if (err?.code === 'ERESOLVER' || /MissingPointer|does not exist/i.test(detail)) {
      console.error('  the spec itself contains an unresolvable $ref - not a generator fault');
    }
    process.exit(3);
  }

  const ir = buildIR(loaded, {
    tmfNumber: opts.tmf,
    basePath: opts.basePath,
    overrides: config.overrides || {},
  });
  const merge = mergeMarkdown(ir, mdPath);
  if (merge.applied.length) ir.meta.markdownEnrichments = merge.applied;
  return { ir, specPath, mdPath, merge };
}

const program = new Command();
program.name('tmfgen').description('Deterministic code generator for TM Forum ODA components');

function specOptions(cmd) {
  return cmd
    .argument('[target]', 'TMF component folder (e.g. documents/tmf670/4.0.0) or a spec file path - shorthand for --component/--spec')
    .option('-s, --spec <path>', 'path to an OpenAPI/Swagger spec file')
    .option('-c, --component <dir>', 'path to a TMF component version folder (auto-locates openapi/ and userguide/)')
    .option('-m, --md <path>', 'optional user-authored markdown supplement')
    .option('--tmf <number>', 'override the derived TMF number')
    .option('-b, --base-path <path>', 'override the derived TMF base path');
}

/** Let the positional [target] stand in for --component/--spec, auto-detecting which one it is. */
function applyTarget(target, opts) {
  if (!target || opts.spec || opts.component) return;
  if (/\.(ya?ml|json)$/i.test(target)) opts.spec = target;
  else opts.component = target;
}

specOptions(program
  .command('ir')
  .description('Build the intermediate representation from a spec. Emits no code (M1).'))
  .option('-o, --out <path>', 'output path for the IR json')
  .option('-q, --quiet', 'suppress the human-readable summary')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    const config = loadConfig();
    const { ir, mdPath, merge } = await buildIrFrom(opts, config);

    const outDir = path.join(root, 'ir-cache');
    fs.mkdirSync(outDir, { recursive: true });

    // Prefer the component FOLDER version for the cache filename: spec info.version
    // drifts from it (documents/tmf673/4.0.0 declares info.version 4.0.1), and the
    // golden-snapshot workflow needs a stable, predictable path.
    const folderVersion = opts.component ? path.basename(path.resolve(opts.component)) : null;
    const cacheVersion = /^\d+(\.\d+)*$/.test(folderVersion ?? '') ? folderVersion : ir.meta.specVersion;
    const outPath = opts.out
      ? path.resolve(opts.out)
      : path.join(outDir, `tmf${ir.meta.tmfNumber}-${cacheVersion}.ir.json`);
    fs.writeFileSync(outPath, JSON.stringify(ir, null, 2) + '\n', 'utf8');

    if (!opts.quiet) {
      console.log(summarize(ir));
      console.log(`\n  IR written to ${toPosix(path.relative(process.cwd(), outPath))}`);
      if (mdPath) console.log(`  markdown supplement: ${merge.skipped ?? `${merge.applied.length} enrichment(s)`}`);
      else console.log('  markdown supplement: none (spec-only run)');
    }
  });

specOptions(program
  .command('scaffold')
  .description('Create a new standalone service with no resource modules yet (M2).'))
  .option('-n, --name <serviceDir>', 'service directory name (default: derived from the spec)')
  .option('-p, --port <number>', 'explicit port (default: first free in the configured range)', v => Number(v))
  .option('-r, --target-root <dir>', 'override targetRoot from tmfgen.config.json')
  .option('--dry-run', 'report what would be written without writing anything')
  .option('--db <engine>', "database the .env.example ships configured for: 'sqlite' (default) or 'postgres'. Must match the --db used for emit.")
  .action(async (target, opts) => {
    applyTarget(target, opts);
    const config = loadConfig();
    const targetRoot = path.resolve(opts.targetRoot || config.targetRoot || '.');
    const dbType = opts.db || config.dbType || 'sqlite';
    if (!['sqlite', 'postgres'].includes(dbType)) {
      console.error("error: --db must be 'sqlite' or 'postgres', got '" + dbType + "'");
      process.exit(2);
    }
    const { ir } = await buildIrFrom(opts, config);

    let alloc;
    try {
      alloc = allocatePort(targetRoot, config.portRange || [3026, 3099], opts.port ?? null, ir.meta.tmfNumber);
    } catch (err) {
      console.error(`error: ${String(err?.message ?? err)}`);
      process.exit(4);
    }

    const serviceName = opts.name || ir.meta.serviceNameSuggestion;
    const serviceDir = path.join(targetRoot, serviceName);

    console.log(`TMF${ir.meta.tmfNumber}  ${ir.meta.specTitle}  (${ir.meta.dialect})`);
    console.log(`  target        ${toPosix(serviceDir)}`);
    console.log(`  basePath      ${ir.meta.basePath}   (${ir.meta.basePathSource})`);
    console.log(`  port          ${alloc.port}   (${alloc.source})`);
    console.log(`  ports in use  ${alloc.used.join(', ') || 'none found'}`);
    console.log('  resources     0 (scaffold only - resource emitters land in M3+)');
    console.log(`  database      ${dbType}`);

    if (opts.dryRun) {
      console.log('\n  dry run: nothing written');
      return;
    }
    if (fs.existsSync(serviceDir)) {
      console.error(`\nerror: ${toPosix(serviceDir)} already exists`);
      console.error('  refusing to scaffold over an existing service directory');
      process.exit(5);
    }

    const result = scaffoldService(ir, { targetRoot, serviceName, port: alloc.port, dbType });
    console.log(`\n  wrote ${result.written.length} backend files (${result.templateCount} from templates, 6 generated) + service package.json`);
    console.log(`  next: cd ${toPosix(result.backendDir)} && yarn install && yarn build`);
  });

specOptions(program
  .command('emit')
  .description('Emit entities and DTOs for every resource into an existing scaffolded service (M3).'))
  .option('-n, --name <serviceDir>', 'service directory name (default: derived from the spec)')
  .option('-r, --target-root <dir>', 'override targetRoot from tmfgen.config.json')
  .option('--ref-strategy <mode>', "single-ref handling: 'table' (normalised, default) or 'flatten'")
  .option('--soft-delete <mode>', "soft-delete scope: 'roots' (default) or 'all'")
  .option('--db <engine>', "target database for non-portable column types: 'sqlite' (default) or 'postgres'")
  .option('--nested-routes', 'emit nested resources under their parent path as the spec declares (e.g. /topic/{topicId}/event) instead of flat at the root. CHANGES THE API CONTRACT of already-generated services.')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    const config = loadConfig();
    const targetRoot = path.resolve(opts.targetRoot || config.targetRoot || '.');
    const { ir } = await buildIrFrom(opts, config);

    const serviceName = opts.name || ir.meta.serviceNameSuggestion;
    const backendDir = path.join(targetRoot, serviceName, 'backend');
    if (!fs.existsSync(backendDir)) {
      console.error('error: ' + toPosix(backendDir) + ' not found');
      console.error('  run `tmfgen scaffold` first');
      process.exit(6);
    }

    const emitOpts = {
      backendDir,
      overrides: config.overrides || {},
      refStrategy: opts.refStrategy || config.refStrategy || 'table',
      softDelete: opts.softDelete || config.softDelete || 'roots',
      dbType: opts.db || config.dbType || 'sqlite',
      nestedRoutes: opts.nestedRoutes ?? config.nestedRoutes ?? false,
    };
    if (!['sqlite', 'postgres'].includes(emitOpts.dbType)) {
      console.error("error: --db must be 'sqlite' or 'postgres', got '" + emitOpts.dbType + "'");
      process.exit(2);
    }
    const result = emitResources(ir, emitOpts);

    console.log('TMF' + ir.meta.tmfNumber + '  ' + ir.meta.specTitle + '  (' + ir.meta.dialect + ')');
    console.log('  service       ' + toPosix(backendDir));
    console.log('  refStrategy   ' + emitOpts.refStrategy + (emitOpts.refStrategy === 'table' ? '  (normalised: single refs get their own table)' : '  (denormalised: prefixed columns on the parent)'));
    console.log('  softDelete    ' + emitOpts.softDelete + (emitOpts.softDelete === 'roots' ? '  (aggregate roots only)' : '  (every entity)'));
    console.log('');
    for (const r of result.perResource) {
      console.log('  ' + r.resource + '  ->  src/' + r.dir + '/');
      console.log('    routes: ' + (r.routes || []).join(', ') + '   |   ' + r.controller + ', ' + r.service);
      for (const e of r.entities) {
        const mark = e.kind === 'root' ? '*' : (e.reused ? '~' : '-');
        console.log('    ' + mark + ' ' + e.className.padEnd(40) + e.tableName.padEnd(44) +
          String(e.columns).padStart(2) + ' cols, ' + e.relations + ' rel' +
          (e.softDelete ? ', soft-delete' : '') + (e.reused ? '  (shared table)' : ''));
      }
      console.log('    dto: ' + r.dtos.join(', '));
      console.log('');
    }
    console.log('  ' + result.entityCount + ' entities, ' + result.written.length + ' files written');
    console.log('  wiring: app.module.ts, entities.ts, event-types.ts (' + result.eventMembers +
      ' members), listener.controller.ts (' + result.listenerRoutes + ' routes)');
    for (const p of result.preserved || []) console.log('  = preserved (never overwritten): ' + p);
    for (const m of result.merged) console.log('  ~ ' + m);
    for (const w of result.warnings) console.log('  ! ' + w);
  });

specOptions(program
  .command('inject')
  .description('Add a component to a HAND-WRITTEN host service by surgical insertion (M6).')
  .argument('<host>', 'path to the host service backend directory - shorthand for --host'))
  .option('--host <dir>', 'path to the host service backend directory', String)
  .option('--host-emitter <class>', 'which event emitter class to use when the host has several')
  .option('--ref-strategy <mode>', "single-ref handling: 'table' (default) or 'flatten'")
  .option('--soft-delete <mode>', "soft-delete scope: 'roots' (default) or 'all'")
  .option('-a, --apply', 'write the changes (default is a dry run that only reports them)')
  .action(async (hostArg, target, opts) => {
    if (hostArg && !opts.host) opts.host = hostArg;
    applyTarget(target, opts);
    const config = loadConfig();
    if (!opts.host) {
      console.error('error: <host> (or --host <backendDir>) is required');
      process.exit(2);
    }
    const backendDir = path.resolve(opts.host);
    const profile = probeHost(backendDir);
    console.log(describeProfile(profile));
    console.log('');

    // Resolve the event contract: refuse to guess when the host has several.
    let contract = profile.events[0] ?? null;
    if (profile.events.length > 1) {
      if (!opts.hostEmitter) {
        console.error('error: the host uses several event contracts; choose one with --host-emitter');
        console.error('  candidates: ' + profile.events.map(e => e.emitterClass).join(', '));
        process.exit(7);
      }
      contract = profile.events.find(e => e.emitterClass === opts.hostEmitter) ?? null;
      if (!contract) {
        console.error('error: --host-emitter ' + opts.hostEmitter + ' not found in the host');
        process.exit(7);
      }
    }
    const remaining = profile.blockers.filter(b => !b.startsWith('the host uses'));
    if (remaining.length) {
      console.error('error: cannot inject into this host');
      for (const b of remaining) console.error('  ! ' + b);
      process.exit(8);
    }

    const { ir } = await buildIrFrom(opts, config);

    // Emitter import path is relative to the resource module directory, which sits
    // one level under src/ - same depth the probed sample used when it lives there.
    const host = {
      emitterClass: contract.emitterClass,
      emitterImport: contract.importPath.replace(/^\.\.\/\.\.\//, '../'),
      method: contract.method,
      callStyle: contract.callStyle,
      objectFields: contract.objectFields,
      // the host types eventType as a plain string, so literals avoid touching its enum
      eventTypeStyle: 'literal',
      hasApiKeyGuard: fs.existsSync(path.join(backendDir, 'src/common/guards/api-key.guard.ts')),
    };

    console.log('adapting generated code to the host:');
    console.log('  emitter       ' + host.emitterClass + '.' + host.method + '(' + (host.callStyle === 'object' ? '{ ... }' : 'positional') + ')');
    console.log('  import        ' + host.emitterImport);
    console.log('  eventType     ' + host.eventTypeStyle + ' (host types it as string)');
    console.log('  ApiKeyGuard   ' + (host.hasApiKeyGuard ? 'present' : 'ABSENT - @UseGuards omitted'));
    console.log('');

    if (!opts.apply) {
      // Plan the emit for real (without writing) so the preview reports the actual
      // entities and modules, not an empty set.
      const planned = emitResources(ir, {
        backendDir,
        refStrategy: opts.refStrategy || config.refStrategy || 'table',
        softDelete: opts.softDelete || config.softDelete || 'roots',
        overrides: config.overrides || {},
        host, mode: 'inject', dryRun: true,
      });
      console.log('DRY RUN - no files written.');
      console.log('  ' + planned.written.length + ' resource files would be created:');
      for (const f of planned.written.slice(0, 6)) console.log('      + ' + f);
      if (planned.written.length > 6) console.log('      + ... and ' + (planned.written.length - 6) + ' more');
      console.log('  wiring edits that would be made:');
      const preview = injectIntoHost({
        backendDir,
        component: {
          tmfNumber: ir.meta.tmfNumber, specTitle: ir.meta.specTitle,
          basePath: ir.meta.basePath, basePathConstant: ir.meta.basePathConstant,
          eventExchange: ir.meta.eventExchange, eventExchangeConstant: ir.meta.eventExchangeConstant,
        },
        entities: planned.injectEntities,
        modules: planned.injectModules,
        infra: profile.entitiesBarrel.infra,
        dryRun: true,
      });
      console.log(describePlan(preview));
      console.log('');
      console.log('  re-run with --apply to write resource files and wiring');
      return;
    }

    const result = emitResources(ir, {
      backendDir,
      refStrategy: opts.refStrategy || config.refStrategy || 'table',
      softDelete: opts.softDelete || config.softDelete || 'roots',
      overrides: config.overrides || {},
      host,
      mode: 'inject',
    });

    const inject = injectIntoHost({
      backendDir,
      component: {
        tmfNumber: ir.meta.tmfNumber, specTitle: ir.meta.specTitle,
        basePath: ir.meta.basePath, basePathConstant: ir.meta.basePathConstant,
        eventExchange: ir.meta.eventExchange, eventExchangeConstant: ir.meta.eventExchangeConstant,
      },
      entities: result.injectEntities ?? [],
      modules: result.injectModules ?? [],
      infra: profile.entitiesBarrel.infra,
      dryRun: false,
    });

    console.log(result.written.length + ' resource files written');
    console.log('wiring edits:');
    console.log(describePlan(inject));
  });

specOptions(program
  .command('fe-spec')
  .description('Emit a baseline frontend-spec-*.yaml (CRUD per resource, M1). Reads the IR cache from `ir` when present.'))
  .option('-o, --out <path>', 'output path for the frontend-spec yaml (default: ./frontend-spec-tmfNNN-generated.yaml)')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    const config = loadConfig();

    // Prefer the IR cache written by `ir` (deterministic input); fall back to a
    // fresh build so --component still works when the cache is stale/missing.
    // tmf685 + friends fail here with a readable spec-blame message, exit 3.
    let ir = null;
    let origin = 'ir-cache';
    if (opts.component) {
      const componentDir = path.resolve(opts.component);
      const tmf = tmfNumber(componentDir);
      const folderVersion = path.basename(componentDir);
      if (tmf && /^\d+(\.\d+)*$/.test(folderVersion)) {
        const cachePath = path.join(root, 'ir-cache', `tmf${tmf}-${folderVersion}.ir.json`);
        if (fs.existsSync(cachePath)) ir = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      }
    }
    if (!ir) {
      const built = await buildIrFrom(opts, config);
      ir = built.ir;
      origin = built.specPath + (built.specPath !== built.mdPath && built.mdPath ? ` (+ ${built.mdPath})` : '');
    }

    let text;
    try {
      text = await emitFESpec(ir);
    } catch (err) {
      console.error(`error: frontend-spec emission failed (${String(err?.message ?? err).split(/\r?\n/)[0]})`);
      if (err.validationErrors) {
        for (const e of err.validationErrors) console.error(`  ${e.pointer}: ${e.message}`);
      }
      process.exit(10);
    }

    const outPath = path.resolve(opts.out || path.join(process.cwd(), `frontend-spec-tmf${ir.meta.tmfNumber}-generated.yaml`));
    fs.writeFileSync(outPath, text, 'utf8');

    console.log(`TMF${ir.meta.tmfNumber}  ${ir.meta.specTitle}  (${ir.meta.dialect})`);
    console.log(`  IR from       ${origin}`);
    console.log(`  basePath      /${ir.meta.basePath}`);
    console.log(`  output        ${toPosix(path.relative(process.cwd(), outPath))}`);
    console.log(`  pages         ${ir.resources.filter(r => r.operations.list).length} (CRUD baseline, validated)`);
    console.log(`  validation    OK (fe-spec.schema.json + icons + secret-header gates)`);
  });

specOptions(program
  .command('fe-ir')
  .description('Build FE IR from a frontend-spec YAML: parse → validate (M0) → normalize → .feir JSON (M2).'))
  .option('-o, --out <path>', 'output path for the .feir.json (default: .feir/<basename>.feir.json at the workspace root)')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    if (!opts.spec) {
      console.error('error: --spec <yaml> is required');
      process.exit(2);
    }
    const specPath = path.resolve(opts.spec);

    let res;
    try {
      res = await buildFEIR(specPath);
    } catch (err) {
      if (err instanceof FEIRError) {
        console.error(formatErrors(err.errors ?? [{ pointer: err.pointer, message: err.message, line: err.line }]));
        process.exit(2);
      }
      throw err;
    }

    const { ir, summary } = res;
    const workspaceRoot = path.resolve(root, '..');
    const outPath = opts.out
      ? path.resolve(opts.out)
      : path.join(workspaceRoot, '.feir', `${path.basename(specPath, path.extname(specPath))}.feir.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(ir, null, 2) + '\n', 'utf8');

    console.log(`FE IR  ${ir.meta.name ?? ir.source}  (ui: ${(ir.ui && ir.ui.library) || '?'}, ${summary.resources} page(s))`);
    console.log(`  semantic types  ${summary.semanticTypes.length}: ${summary.semanticTypes.join(', ')}`);
    console.log(`  bindings        ${summary.bindings} resolved (${resolvedBindingBreakdown(ir.resolvedBindings)})`);
    console.log(`  schemes         ${summary.schemes.join(', ') || '-'}`);
    console.log(`  theme           ${summary.theme.name ?? 'unnamed'}${summary.theme.darkMode ? ' (dark)' : ''}`);
    console.log(`  output          ${toPosix(path.relative(process.cwd(), outPath))}`);
  });

function resolvedBindingBreakdown(bindings) {
  const bySource = {};
  for (const b of bindings) bySource[b.source] = (bySource[b.source] || 0) + 1;
  return Object.entries(bySource).map(([k, n]) => `${k}:${n}`).join(', ');
}

const feGen = program
  .command('fe-gen')
  .description('Frontend generators (M3+): scaffold CRA5+Craco MUI apps dari frontend-spec YAML.');

specOptions(feGen
  .command('scaffold')
  .description('Scaffold CRA5+Craco MUI full-repo app: FEIR dari .feir/ (build otomatis bila absent) -> feTargetRoot/<meta.name>.'))
  .option('-o, --out <dir>', 'override feTargetRoot (default: tmfgen.config.json feTargetRoot ?? targetRoot); env FE_TARGET_ROOT_OVERRIDE juga dihormati')
  .option('-p, --port <number>', 'port FE dev eksplisit (default: port bebas pertama di fePortRange)', v => Number(v))
  .option('--be-port <number>', 'port BE untuk proxy dev CRA `/tmf-api` (default: 3736, identity TMF736)', v => Number(v))
  .action(async (target, opts) => {
    applyTarget(target, opts);
    if (!opts.spec) {
      console.error('error: --spec <yaml> is required');
      process.exit(2);
    }
    const config = loadConfig();
    const envOut = process.env.FE_TARGET_ROOT_OVERRIDE;
    const feTargetRoot = path.resolve(opts.out || envOut || config.feTargetRoot || config.targetRoot || '.');
    const bePort = opts.bePort ?? config.bePort ?? 3736;

    let feir;
    try {
      feir = await resolveFEIR(path.resolve(opts.spec), {
        feirRoots: [path.join(root, '..', '.feir'), path.join(root, '.feir'), path.join(process.cwd(), '.feir')],
      });
    } catch (err) {
      if (err instanceof FEIRError) {
        console.error(formatErrors(err.errors ?? [{ pointer: err.pointer, message: err.message, line: err.line }]));
        process.exit(2);
      }
      throw err;
    }

    let result;
    try {
      result = scaffoldApp(feir, {
        feTargetRoot,
        port: opts.port ?? null,
        bePort,
        fePortRange: config.fePortRange || [5012, 5099],
      });
    } catch (err) {
      if (err?.code === 'E_EXISTS') {
        console.error(`error: ${err.message}`);
        console.error('  hapus direktori itu dulu, atau pindahkan --out ke tempat lain');
        process.exit(5);
      }
      if (err?.code === 'NO_FE_PORT') {
        console.error(`error: ${err.message}`);
        process.exit(4);
      }
      throw err;
    }

    console.log(`FE app  ${feir.meta?.label ?? feir.meta?.name}  (${feir.meta?.lang ?? 'id'}, ui: ${feir.ui?.library ?? '?'})`);
    console.log(`  target        ${toPosix(result.appDir)}`);
    console.log(`  port          ${result.port}   (fePortRange)${result.used.length ? '' : '  (no existing FE ports found)'}`);
    console.log(`  be proxy      /tmf-api -> http://localhost:${result.bePort}`);
    console.log(`  wrote ${result.written.length} files (template + theme.generated.ts + i18n.generated.ts)`);
    console.log(`  next: cd ${toPosix(result.appDir)} && yarn install && yarn build && yarn start`);
  });

specOptions(feGen
  .command('emit')
  .description('Emit list pages + api defs + routes dari FEIR ke app CRA5 yang sudah di-scaffold (M4).'))
  .option('-o, --out <dir>', 'direktori app target (yang berisi package.json). Default: feTargetRoot/<meta.name>')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    if (!opts.spec) {
      console.error('error: --spec <yaml> is required');
      process.exit(2);
    }
    const config = loadConfig();
    const envOut = process.env.FE_TARGET_ROOT_OVERRIDE;
    const feTargetRoot = path.resolve(envOut || config.feTargetRoot || config.targetRoot || '.');

    let feir;
    try {
      feir = await resolveFEIR(path.resolve(opts.spec), {
        feirRoots: [path.join(root, '..', '.feir'), path.join(root, '.feir'), path.join(process.cwd(), '.feir')],
      });
    } catch (err) {
      if (err instanceof FEIRError) {
        console.error(formatErrors(err.errors ?? [{ pointer: err.pointer, message: err.message, line: err.line }]));
        process.exit(2);
      }
      throw err;
    }

    const appDir = opts.out ? path.resolve(opts.out) : path.join(feTargetRoot, feir.meta?.name ?? 'fe-app');
    if (!fs.existsSync(path.join(appDir, 'package.json'))) {
      console.error(`error: ${toPosix(appDir)} bukan app fe-gen ter-scaffold (tidak ada package.json)`);
      console.error('  jalankan `fe-gen scaffold` dulu (atau beri --out ke direktori app yang ada)');
      process.exit(6);
    }

    const { emitAll } = await import('./fe/emit/index.mjs');
    const result = await emitAll(feir, appDir);

    console.log(`FE emit  ${feir.meta?.label ?? feir.meta?.name}  (ui: ${feir.ui?.library ?? '?'})`);
    console.log(`  target        ${toPosix(appDir)}`);
    for (const s of result.summaries) console.log(`  ${s}`);
    for (const w of result.warnings || []) console.log(`  ! ${w}`);
    console.log(`  wrote ${result.written.length} files:`);
    for (const f of result.written) console.log(`    + ${f}`);
    console.log(`  next: cd ${toPosix(appDir)} && yarn build`);
  });


specOptions(program
  .command('ctk')
  .description('Generate a Conformance Test Kit for a component TM Forum ships none for (writes into <service>/backend/ctk/).'))
  .option('-n, --name <serviceDir>', 'service directory name (default: derived from the spec)')
  .option('-r, --target-root <dir>', 'override targetRoot from tmfgen.config.json')
  .option('-p, --port <number>', 'port the service listens on (default: identity port)', v => Number(v))
  .option('-u, --url <url>', 'full base URL to test against (default: http://127.0.0.1:<port>/<basePath>/)')
  .option('-f, --force', 'overwrite an existing ctk/ directory')
  .action(async (target, opts) => {
    applyTarget(target, opts);
    const config = loadConfig();
    const targetRoot = path.resolve(opts.targetRoot || config.targetRoot || '.');
    const { ir } = await buildIrFrom(opts, config);

    const serviceName = opts.name || ir.meta.serviceNameSuggestion;
    const backendDir = path.join(targetRoot, serviceName, 'backend');
    if (!fs.existsSync(backendDir)) {
      console.error('error: ' + toPosix(backendDir) + ' not found');
      console.error('  run `tmfgen scaffold` first');
      process.exit(6);
    }

    const ctkDir = path.join(backendDir, 'ctk');
    // Never clobber a kit TM Forum shipped - those are the authoritative ones.
    if (fs.existsSync(ctkDir) && !opts.force) {
      console.error('error: ' + toPosix(ctkDir) + ' already exists');
      console.error('  a shipped TM Forum kit must not be overwritten by a generated one');
      console.error('  pass --force only if you are sure this kit was generated');
      process.exit(7);
    }

    const result = buildCtk(ir, { port: opts.port ?? undefined, url: opts.url ?? undefined });

    console.log(`TMF${ir.meta.tmfNumber}  ${ir.meta.specTitle} v${ir.meta.specVersion}`);
    console.log(`  target        ${toPosix(ctkDir)}`);
    console.log(`  resources     ${result.resourceCount} tested`);
    console.log(`  requests      ${result.requestCount}`);
    console.log(`  payloads      ${result.payloadCount} synthesised`);

    for (const f of result.files) {
      const abs = path.join(ctkDir, f.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.text, 'utf8');
    }
    console.log(`\n  wrote ${result.files.length} files`);
    console.log(`  next: cd ${toPosix(path.join(ctkDir, 'ctk'))} && npm install && npm start`);
  });

program.parseAsync(process.argv);
