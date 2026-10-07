// scaffold.mjs — write a neudela (Vite) app from a neudela-fe/v1 spec.
//
//   scaffold: fixed files (templates/fe-neudela/files, verbatim) + per-app files (emitApp)
//   emit:     per-app files only, into an existing app (re-generation after a spec change)
// Text is written with LF line endings whatever the checkout's autocrlf did to the template.
import fs from 'node:fs';
import path from 'node:path';
import { emitApp } from './emitApp.mjs';
import { NEUDELA_TEMPLATE_DIR } from './loadSpec.mjs';

const FILES_DIR = path.join(NEUDELA_TEMPLATE_DIR, 'files');
const TEXT = /\.(tsx?|mjs|js|json|css|html|ya?ml|md|svg|txt)$|^\.|\/\.[^/]+$/;

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/** The fixed files, relative paths, sorted. */
export function fixedFiles() {
  return walk(FILES_DIR);
}

export function readFixed(rel) {
  const buf = fs.readFileSync(path.join(FILES_DIR, rel));
  return TEXT.test(rel) ? buf.toString('utf8').replace(/\r\n/g, '\n') : buf;
}

function write(appDir, rel, content, written) {
  const abs = path.join(appDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  written.push(rel);
}

/** Override the dev-server port (CLI --port) without touching the caller's spec. */
export function withPort(spec, port) {
  if (port == null) return spec;
  return { ...spec, app: { ...spec.app, environment: { ...spec.app.environment, port: Number(port) } } };
}

export function scaffoldNeudela(spec, appDir) {
  if (fs.existsSync(appDir) && fs.readdirSync(appDir).length) {
    const err = new Error(`refusing to scaffold: ${appDir} already exists and is non-empty`);
    err.code = 'E_EXISTS';
    throw err;
  }
  const written = [];
  for (const rel of fixedFiles()) write(appDir, rel, readFixed(rel), written);
  for (const [rel, content] of emitApp(spec)) write(appDir, rel, content, written);
  return { appDir, written: written.sort(), port: spec.app.environment.port };
}

export function emitNeudela(spec, appDir) {
  if (!fs.existsSync(path.join(appDir, 'package.json'))) {
    const err = new Error(`${appDir} is not a scaffolded app (no package.json)`);
    err.code = 'E_NOT_APP';
    throw err;
  }
  const written = [];
  for (const [rel, content] of emitApp(spec)) write(appDir, rel, content, written);
  return { appDir, written: written.sort() };
}
