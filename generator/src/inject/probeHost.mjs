import fs from 'node:fs';
import path from 'node:path';

/**
 * Probe a hand-written host service and describe its conventions, so generated code
 * can be shaped to fit rather than assuming the golden reference's dialect.
 *
 * This exists because `geographic-address-service` diverges from the reference in
 * every contract that matters: `emitEvent` takes an object rather than four
 * positional args, the infra entities are `GeoSubscription`/`GeoEventLog` rather
 * than `EventSubscription`/`EventLog`, there is no `event-types.ts`, and the
 * listener is one wildcard route instead of one route per event. Injecting
 * reference-shaped code there would not compile.
 *
 * Everything is DETECTED, never assumed; anything undetectable is reported as null
 * so the caller can refuse to inject rather than guess.
 */

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(abs);
  }
  return out;
};

/**
 * Collect EVERY distinct event contract in the host, not the first one found.
 * `geographic-address-service` really does use two different emitters from
 * different resource services, so there is no single "host contract" - reporting
 * one would be a guess dressed up as a detection.
 */
function probeEventContracts(srcDir) {
  const files = walk(srcDir).filter(f => /\.service\.ts$/.test(f) && !/\/(event|subscription|listener)\//.test(f.split(path.sep).join('/')));
  const found = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const call = text.match(/this\.\w+\.(emitEvent|emit)\(\s*(\{)?/);
    if (!call) continue;

    const method = call[1];
    const callStyle = call[2] ? 'object' : 'positional';

    // which fields does the object form carry?
    let objectFields = null;
    if (callStyle === 'object') {
      const block = text.slice(call.index, call.index + 500);
      const inner = block.match(/\{([\s\S]*?)\}\s*\)/);
      if (inner) {
        objectFields = [...inner[1].matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);
      }
    }

    // the emitter class and where it comes from
    const emitterProp = call[0].match(/this\.(\w+)\./)?.[1] ?? null;
    const ctor = text.match(new RegExp(`private readonly ${emitterProp}\\s*:\\s*(\\w+)`));
    const emitterClass = ctor?.[1] ?? null;
    let importPath = null;
    if (emitterClass) {
      const imp = text.match(new RegExp(`import\\s*\\{[^}]*\\b${emitterClass}\\b[^}]*\\}\\s*from\\s*'([^']+)'`, 's'));
      importPath = imp?.[1] ?? null;
    }

    // is the eventType an enum member or a bare string?
    const enumUse = text.match(/eventType:\s*(\w+)\.\w+/);
    const eventTypeStyle = enumUse ? 'enum' : 'literal';

    const key = `${emitterClass}.${method}/${callStyle}`;
    if (!found.has(key)) {
      found.set(key, {
        method, callStyle, objectFields, emitterClass, importPath, eventTypeStyle,
        enumName: enumUse?.[1] ?? null,
        samples: [],
      });
    }
    found.get(key).samples.push(path.basename(file));
  }
  return [...found.values()];
}

/** Read the entities barrel and learn which infra entities close the array. */
function probeEntitiesBarrel(srcDir) {
  const file = path.join(srcDir, 'entities.ts');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const arr = text.match(/export const entities\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) return null;
  const names = arr[1].split(',').map(s => s.trim()).filter(Boolean);
  return {
    file: 'src/entities.ts',
    entries: names,
    // the last two are conventionally the infra entities; new ones go before them
    infra: names.slice(-2),
  };
}

function probeAppModule(srcDir) {
  const file = path.join(srcDir, 'app.module.ts');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const localImports = [...text.matchAll(/^import\s*\{\s*(\w+)\s*\}\s*from\s*'(\.\/[^']+)';$/gm)]
    .map(m => ({ className: m[1], from: m[2] }));
  const importsArray = text.match(/imports:\s*\[([\s\S]*?)\n\s*\],?\n\s*\}\)/);
  return {
    file: 'src/app.module.ts',
    moduleImports: localImports.filter(i => i.className.endsWith('Module')),
    hasImportsArray: !!importsArray,
  };
}

function probeConstants(srcDir) {
  const file = path.join(srcDir, 'common', 'constants', 'tmf.constants.ts');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return {
    file: 'src/common/constants/tmf.constants.ts',
    defined: [...text.matchAll(/export const (\w+)/g)].map(m => m[1]),
  };
}

function probeInfra(srcDir) {
  const listener = walk(path.join(srcDir, 'listener'));
  const listenerText = listener.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const subs = walk(path.join(srcDir, 'subscription'));
  const subsText = subs.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  return {
    listenerStyle: /@Post\(['"`]listener\/:\w+/.test(listenerText) ? 'wildcard'
      : /@Post\(['"`]\w+Event/.test(listenerText) ? 'per-event' : null,
    hubPresent: /\/hub/.test(subsText),
    hubBasePathConstant: subsText.match(/\$\{(\w*BASE_PATH)\}\/hub/)?.[1] ?? null,
  };
}

export function probeHost(backendDir) {
  const srcDir = path.join(backendDir, 'src');
  if (!fs.existsSync(srcDir)) throw new Error(`no src/ under ${backendDir}`);

  const generated = fs.existsSync(path.join(backendDir, '.tmfgen-manifest.json'));
  const profile = {
    backendDir,
    generatorOwned: generated,
    events: probeEventContracts(srcDir),
    entitiesBarrel: probeEntitiesBarrel(srcDir),
    appModule: probeAppModule(srcDir),
    constants: probeConstants(srcDir),
    infra: probeInfra(srcDir),
  };

  const blockers = [];
  if (!profile.entitiesBarrel) blockers.push('no src/entities.ts barrel to inject into');
  if (!profile.appModule?.hasImportsArray) blockers.push('cannot locate the imports array in app.module.ts');
  if (!profile.events.length) {
    blockers.push('no existing resource service found to learn the event contract from');
  } else if (profile.events.length > 1) {
    blockers.push(
      `the host uses ${profile.events.length} different event contracts (` +
      profile.events.map(e => `${e.emitterClass}.${e.method}`).join(', ') +
      '); pick one explicitly with --host-emitter, generated code cannot guess',
    );
  } else {
    if (!profile.events[0].emitterClass) blockers.push('could not determine the event emitter class');
    if (!profile.events[0].importPath) blockers.push('could not determine the event emitter import path');
  }
  profile.blockers = blockers;
  return profile;
}

export function describeProfile(p) {
  const L = [];
  L.push(`host: ${p.backendDir.split(path.sep).join('/')}`);
  L.push(`  generator-owned : ${p.generatorOwned ? 'yes (.tmfgen-manifest.json present)' : 'no - hand-written host'}`);
  if (p.events.length) {
    L.push(`  event contracts : ${p.events.length}`);
    for (const e of p.events) {
      L.push(`    - ${e.emitterClass}.${e.method}(${e.callStyle === 'object' ? '{ ' + (e.objectFields ?? []).join(', ') + ' }' : 'type, id, resourceType, payload'})`);
      L.push(`      import ${e.importPath}   eventType: ${e.eventTypeStyle}${e.enumName ? ` (${e.enumName})` : ''}`);
      L.push(`      used by ${e.samples.length} service(s): ${e.samples.slice(0, 3).join(', ')}`);
    }
  } else {
    L.push('  event contracts : NONE DETECTED');
  }
  L.push(`  infra entities  : ${p.entitiesBarrel ? p.entitiesBarrel.infra.join(', ') : 'n/a'} (${p.entitiesBarrel?.entries.length ?? 0} registered)`);
  L.push(`  app modules     : ${p.appModule?.moduleImports.length ?? 0} already imported`);
  L.push(`  constants file  : ${p.constants ? `${p.constants.defined.length} defined` : 'absent'}`);
  L.push(`  listener style  : ${p.infra.listenerStyle ?? 'none'}`);
  L.push(`  hub             : ${p.infra.hubPresent ? `present (${p.infra.hubBasePathConstant ?? 'unknown constant'})` : 'absent'}`);
  if (p.blockers.length) {
    L.push(`  BLOCKERS (${p.blockers.length}):`);
    for (const b of p.blockers) L.push(`    ! ${b}`);
  }
  return L.join('\n');
}
