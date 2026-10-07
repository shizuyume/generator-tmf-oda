// loadSpec.mjs — read a neudela-fe/v1 spec.
//
// A spec carries the `app` block and may carry its own `template` / `generation` (the lab's
// neudela-fe-template.yaml carries both). When absent they come from the generator's built-in
// templates/fe-neudela/template.yaml, so an app spec only needs `apiVersion`, `kind` and `app`.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(url.fileURLToPath(import.meta.url));
export const NEUDELA_TEMPLATE_DIR = path.resolve(here, '..', '..', '..', 'templates', 'fe-neudela');
export const NEUDELA_API_VERSION = 'neudela-fe/v1';

/** True when the YAML text is a neudela-fe/v1 document (cheap check before parsing fully). */
export function isNeudelaSpecText(text) {
  return /^apiVersion:\s*["']?neudela-fe\/v1["']?\s*$/m.test(text);
}

export function isNeudelaSpecFile(file) {
  try {
    return isNeudelaSpecText(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

let builtin;
export function builtinTemplate() {
  builtin ??= yaml.load(fs.readFileSync(path.join(NEUDELA_TEMPLATE_DIR, 'template.yaml'), 'utf8'));
  return builtin;
}

/** Parse + complete a spec document. Throws on a wrong apiVersion or a missing app block. */
export function loadSpecText(text, name = '<spec>') {
  const doc = yaml.load(text);
  if (!doc || doc.apiVersion !== NEUDELA_API_VERSION) {
    throw new Error(`${name}: apiVersion must be ${NEUDELA_API_VERSION}`);
  }
  if (!doc.app) throw new Error(`${name}: missing the app block`);
  const base = builtinTemplate();
  return {
    ...doc,
    generation: doc.generation ?? base.generation,
    template: doc.template ?? base.template,
  };
}

export function loadSpecFile(file) {
  return loadSpecText(fs.readFileSync(file, 'utf8'), path.basename(file));
}
