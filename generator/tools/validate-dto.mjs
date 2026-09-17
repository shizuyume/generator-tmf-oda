#!/usr/bin/env node
/**
 * Run a generated DTO against a real payload, so its validators can be TESTED and
 * not merely read. There are no HTTP routes until M4, and this exercises exactly
 * what the controller will: class-transformer + class-validator, same as Nest's
 * ValidationPipe.
 *
 *   node tools/validate-dto.mjs <backendDir> <resourceDir> <create|update> [payload.json]
 *
 * With no payload file it runs a built-in suite that probes the interesting cases
 * (missing required field, spec minItems, nested object, unknown field).
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const [, , backendArg, resourceDir, modeArg = 'create', payloadFile] = process.argv;
if (!backendArg || !resourceDir) {
  console.error('usage: node tools/validate-dto.mjs <backendDir> <resourceDir> [create|update] [payload.json]');
  process.exit(2);
}
const backendDir = path.resolve(backendArg);
const mode = modeArg === 'update' ? 'update' : 'create';

// resolve the service's own dependencies, not the generator's
const require = createRequire(path.join(backendDir, 'package.json'));
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');

const dtoDir = path.join(backendDir, 'dist', resourceDir, 'dto');
if (!fs.existsSync(dtoDir)) {
  console.error(`error: ${dtoDir} not found - run the build first`);
  process.exit(2);
}
const file = fs.readdirSync(dtoDir).find(f => f.startsWith(`${mode}-`) && f.endsWith('.js'));
if (!file) {
  console.error(`error: no ${mode}-*.js in ${dtoDir}`);
  process.exit(2);
}
const mod = require(path.join(dtoDir, file));
const DtoClass = Object.values(mod).find(v => typeof v === 'function');
console.log(`DTO: ${DtoClass.name}  (${path.join(resourceDir, 'dto', file)})\n`);

function check(label, payload, expectValid) {
  const instance = plainToInstance(DtoClass, payload);
  // mirrors the reference's ValidationPipe: transform on, whitelist off
  const errors = validateSync(instance, { whitelist: false, forbidNonWhitelisted: false });
  const valid = errors.length === 0;
  const ok = expectValid === undefined ? true : valid === expectValid;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`      valid=${valid}${expectValid !== undefined ? ` expected=${expectValid}` : ''}`);
  for (const e of errors) {
    const msgs = Object.values(e.constraints ?? {});
    console.log(`      - ${e.property}: ${msgs.join('; ') || 'nested errors'}`);
    for (const c of e.children ?? []) {
      console.log(`          . ${c.property}: ${Object.values(c.constraints ?? {}).join('; ')}`);
    }
  }
  return ok;
}

if (payloadFile) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(payloadFile), 'utf8'));
  check(`payload from ${payloadFile}`, payload);
  process.exit(0);
}

// built-in probes: each targets a specific claim about the generated DTO
const results = [];
const minimal = { '@type': 'PartyRevSharingAlgorithm', name: 'Standard 70/30 split' };

results.push(check('minimal valid payload (required fields only)', minimal, true));
results.push(check('missing name -> rejected (required by _FVO)',
  { '@type': 'PartyRevSharingAlgorithm' }, false));
results.push(check('missing @type -> rejected (required by _FVO)',
  { name: 'x' }, false));
results.push(check('empty policy array -> rejected (spec minItems: 1)',
  { ...minimal, policy: [] }, false));
results.push(check('policy with one item -> accepted',
  { ...minimal, policy: [{ id: 'p1', name: 'Policy A' }] }, true));
results.push(check('nested ref inside conditionVariable -> accepted',
  {
    ...minimal,
    conditionVariable: [{
      value: '70',
      policyCondition: { id: 'c1', name: 'Tier 1', '@referredType': 'PolicyCondition' },
    }],
  }, true));
results.push(check('wrong type on name (number) -> rejected',
  { ...minimal, name: 12345 }, false));
results.push(check('unknown field -> tolerated (ValidationPipe has no whitelist)',
  { ...minimal, notARealField: 'x' }, true));

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} expectations met`);
process.exit(failed ? 1 : 0);
