// emit/mcs-common.mjs — aggregator registered in emit/index.mjs's EMITTER_KINDS as
// 'mcs-common' (-> emitMcsCommons, kebab-aware PascalCase). Combines the full mcs-common
// emitter suite (generator/src/fe/emit/mcs-common/*.mjs) into the one exported function
// the shared emitAll() loader expects. No-op for every other federationTemplate (the 3
// self-contained adapters keep going through page/form/detail/mfe.mjs unchanged).
import { emitTypes } from './mcs-common/types.mjs';
import { emitServices } from './mcs-common/service.mjs';
import { emitRelations } from './mcs-common/relations.mjs';
import { emitPages } from './mcs-common/pages.mjs';
import { emitHub } from './mcs-common/hub.mjs';
import { emitApp } from './mcs-common/app.mjs';
import { emitExposes } from './mcs-common/exposes.mjs';
import { emitCraco } from './mcs-common/craco.mjs';

export async function emitMcsCommons(feir, appDir) {
  if (feir.output?.mfe?.federationTemplate !== 'common-remote') {
    return { written: [], summary: 'mcs-common: nonaktif (federationTemplate != common-remote)' };
  }
  if (feir.output?.type !== 'mfe') {
    throw new Error('emit/mcs-common: federationTemplate=common-remote requires output.type=mfe');
  }

  // Order matters: types before service/pages (both import from ../types); relations
  // before pages (pages imports each lookup service by name); craco/app/exposes last
  // (app.mjs enumerates resources+hub, exposes.mjs matches output.mfe.exposes targets).
  const steps = [emitTypes, emitServices, emitRelations, emitPages, emitHub, emitApp, emitExposes, emitCraco];
  const written = [];
  const summaries = [];
  for (const step of steps) {
    const result = step(feir, appDir);
    written.push(...(result.written ?? []));
    if (result.summary) summaries.push(result.summary);
  }
  return { written: [...new Set(written)].sort(), summary: `mcs-common: ${summaries.join(' | ')}` };
}
