import fs from 'node:fs';
import path from 'node:path';
import { loadSpec } from '../src/ingest/loadSpec.mjs';
import { buildIR } from '../src/ir/buildIR.mjs';
import { buildEntityPlan, resolveEntityNames } from '../src/emit/entityPlan.mjs';
import { renderEntity, entityFileName } from '../src/emit/entity.mjs';
import { renderPayloadDto, renderQueryDto } from '../src/emit/dto.mjs';
import { renderService } from '../src/emit/service.mjs';
import { renderController, renderModule, renderHooks } from '../src/emit/controller.mjs';
import { renderSeedData, renderLocalSeedStub, orderSeedsByReference } from '../src/emit/seed.mjs';
import { componentEntry } from '../src/emit/wiring.mjs';
import { emitSpecs } from '../src/emit/spec/index.mjs';
import { kebab } from '../src/ir/naming.mjs';

import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const base = path.resolve(here, '..', '..', 'documents');
let ok = 0, skipped = 0, failed = 0, ents = 0, collisions = 0, longNames = 0, specFiles = 0;
const fails = [];
for (const c of fs.readdirSync(base)) {
  const cd = path.join(base, c);
  if (!fs.statSync(cd).isDirectory()) continue;
  for (const v of fs.readdirSync(cd)) {
    const od = path.join(cd, v, 'openapi');
    if (!fs.existsSync(od)) continue;
    const f = fs.readdirSync(od).filter(x => /\.(ya?ml|json)$/i.test(x) && !/postman/i.test(x))[0];
    if (!f) continue;
    let ir;
    try { ir = buildIR(await loadSpec(path.join(od, f)), {}); }
    catch { skipped++; continue; }
    try {
      const plans = ir.resources.map(r => ({ r, p: buildEntityPlan(r, {}), dir: kebab(r.name) }));
      const all = plans.flatMap(x => x.p.entities);
      const { names, errors, collisions: col } = resolveEntityNames(all);
      if (errors.length) { longNames++; fails.push(`${c}/${v}: ${errors[0]}`); }
      collisions += col.length;
      const resolve = k => names.get(k) ?? null;
      const dirByClass = new Map();
      for (const x of plans) for (const e of x.p.entities) { const s = resolve(e.key); if (s && !dirByClass.has(s.className)) dirByClass.set(s.className, x.dir); }
      const seen = new Set();
      // What the spec emitters need, collected as the per-resource renderers run -
      // the same values emitResources puts in the manifest entry it feeds them.
      const barrelEntries = [];
      const resourceModules = [];
      const seedEntries = [];
      for (const x of plans) {
        for (const e of x.p.entities) {
          const self = resolve(e.key);
          if (seen.has(self.className)) continue;
          seen.add(self.className);
          renderEntity(e, self, resolve, k => { const s = resolve(k); return s ? dirByClass.get(s.className) ?? '' : ''; }, x.dir);
          barrelEntries.push({
            className: self.className,
            importPath: `${x.dir}/entities/${kebab(self.className)}.entity`,
          });
          ents++;
        }
        renderPayloadDto(x.r, 'create');
        renderPayloadDto(x.r, 'update');
        renderQueryDto(x.r);
        const svc = renderService(x.r, x.p, {
          resolve,
          basePathConstant: ir.meta.basePathConstant,
          eventTypeEnum: ir.meta.eventTypeEnum,
          notificationEvents: x.r.notificationEvents ?? [],
        });
        renderController(x.r, { basePathConstant: ir.meta.basePathConstant });
        const mod = renderModule(x.r, [{ className: 'X', importFrom: './x' }]);
        renderHooks(x.r);

        const seed = renderSeedData(x.r);
        const localSeed = renderLocalSeedStub(x.r);
        resourceModules.push({
          resource: x.r.name, dir: x.dir, pathSegment: x.r.pathSegment,
          moduleClass: mod.className,
          moduleImportPath: `${x.dir}/${mod.fileName.replace(/\.ts$/, '')}`,
          className: mod.className,
          importPath: `${x.dir}/${mod.fileName.replace(/\.ts$/, '')}`,
        });
        seedEntries.push({
          resource: x.r.name, dir: x.dir, serviceClass: svc.className,
          seedConst: seed ? seed.constName : null,
          localSeedConst: localSeed.constName,
          count: seed ? seed.count : 0,
        });
      }

      // The generated service ships its OWN Jest suite, so a corpus shape that
      // crashes the spec emitters is a broken service - the same failure as a
      // crashing entity or service renderer, and it fails the component here.
      // In production the spec emitters take the manifest UNION; the sweep
      // hosts one component per service, so the union is that component alone,
      // assembled exactly as emitResources assembles its manifest entry.
      const entry = componentEntry(ir);
      entry.resources = resourceModules;
      entry.entities = barrelEntries;
      entry.events = ir.resources.flatMap(r => r.notificationEvents ?? []);
      entry.listeners = (ir.listeners ?? []).map(l => ({ eventName: l.eventName }));
      entry.seeds = orderSeedsByReference(seedEntries, ir.resources);
      const components = [entry];
      emitSpecs({
        components,
        resources: components.flatMap(c => c.resources ?? []),
        seeds: components.flatMap(c => c.seeds ?? []),
        plans: plans.map(x => ({ resource: x.r, plan: x.p, dir: x.dir, nested: null })),
        resolve,
        entityDirOf: className => dirByClass.get(className) ?? null,
        meta: ir.meta,
        host: null,
      }, () => { specFiles++; });
      ok++;
    } catch (e) { failed++; fails.push(`${c}/${v}: ${String(e.message).split('\n')[0].slice(0,120)}`); }
  }
}
console.log(`components emitted OK : ${ok}`);
console.log(`entities rendered     : ${ents}`);
console.log(`spec files emitted    : ${specFiles}`);
console.log(`table collisions      : ${collisions}`);
console.log(`over-63-char names    : ${longNames}`);
console.log(`emit crashes          : ${failed}`);
console.log(`spec unloadable       : ${skipped}`);
for (const f of fails.slice(0, 12)) console.log('  ! ' + f);
