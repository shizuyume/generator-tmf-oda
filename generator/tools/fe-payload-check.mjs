// tools/fe-payload-check.mjs — self-check emit/form.mjs (M4 todo 8).
//
// DUA lapis (keputusan tertulis di evidensi task-8):
//  (1) TEXT asserts pada EMITTER OUTPUT (zodSchemas.ts) — persis instruksi todo 8 §4.5:
//        a. zodSchemas memuat .min(1 (required), z.array(...).min(1) (policy minItems)
//        b. mapping nested policyCondition/actionVariable dgn token item.policyConditionId dst
//        c. editPayloadSpec TANPA "@type" (PATCH partial — @type tidak dikirim)
//        d. addPayloadSpec MEMUAT "@type": "fields.atType"
//  (2) RUNTIME asserts pada EMITTER BUILDER — import emit/form.mjs (generator plain-JS, node
//        bisa import; yang TIDAK bisa node adalah file .ts hasil emit). Ini membuktikan
//        builder menghasilkan .email()/.min(1)/z.array(...).min(n) utk field EMAIL yang
//        tmf736 MEMANG TIDAK punya (tidak bisa di-assert pada output tmf736 literal).
//  Trade-off dicatat: gate runtime sebenarnya (submit validasi zod + POST payload nested)
//  = Playwright todo 9; tsc = acceptance 3. Check ini = gate teks + builder, cepat, fail-loud.
//
// Usage: node tools/fe-payload-check.mjs <appDir> [pageId]
// Exit non-0 + pesan pertama yang gagal. Tanpa arg = help.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

function read(file) {
  if (!fs.existsSync(file)) {
    fails.push(`missing file: ${file}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

async function main() {
  const appDir = process.argv[2];
  const pageId = process.argv[3] ?? 'party-rev-sharing-algorithms';
  if (!appDir) {
    console.error('usage: node tools/fe-payload-check.mjs <appDir> [pageId]');
    process.exit(2);
  }

  const zodPath = path.join(appDir, 'src', 'pages', pageId, 'zodSchemas.ts');
  const zod = read(zodPath);
  const addForm = read(path.join(appDir, 'src', 'pages', pageId, 'AddForm.tsx'));
  const editForm = read(path.join(appDir, 'src', 'pages', pageId, 'EditForm.tsx'));

  /* ── 1a. zod rules hadir di output ── */
  const nameExpr = /'name':\s*z\.string\(\)\.min\(1,/.exec(zod);
  assert(nameExpr, `zodSchemas: field "name" WAJIB z.string().min(1, ...) — assertion gagal (expression: ${nameExpr ? 'ok' : 'MISSING'})`);

  const policyExpr = /'policy':\s*z\.array\(z\.object\(\{[^}]*'id':[^}]*\}\)\)\.min\(1,/.exec(zod);
  assert(policyExpr, `zodSchemas: "policy" WAJIB z.array(...).min(1, ...) (minItems 1) — tiada (${policyExpr ? 'ok' : 'MISSING'})`);

  const reqMsg = /'Wajib diisi'/.exec(zod);
  assert(reqMsg, `zodSchemas: pesan "Wajib diisi" utk required Wajib ada — tiada`);

  const minLen = /\.min\(3, 'Minimal 3 karakter'\)/.exec(zod);
  assert(minLen, `zodSchemas: name minLength 3 -> .min(3, 'Minimal 3 karakter') Wajib ada — tiada`);

  /* ── 1b. itemPayload mapping nested (conditionVariable.policyCondition dst) ── */
  const nestedCond = /"policyCondition":\{[^}]*"id":"item\.policyConditionId"/.exec(zod);
  assert(nestedCond, `zodSchemas: conditionVariable.itemPayload Wajib berisi policyCondition.id <- item.policyConditionId (mapping NESTED) — tiada`);
  const nestedAct = /"policyAction":\{[^}]*"id":"item\.policyActionId"/.exec(zod);
  assert(nestedAct, `zodSchemas: actionVariable.itemPayload Wajib berisi policyAction.id <- item.policyActionId — tiada`);

  const replType = /"@referredType":"item\.policyConditionReferredType"/.exec(zod);
  assert(replType, `zodSchemas: policyCondition mesti memetakan @referredType <- item.policyConditionReferredType — tiada`);

  /* ── 1c. edit payload TANPA @type (PATCH _MVO): payload literal edit di file TIDAK memuat "@type" ── */
  const editPayloadBlock = /editPayloadSpec[\s\S]*?= \{([\s\S]*?)\};/.exec(zod);
  assert(editPayloadBlock, 'zodSchemas: editPayloadSpec Wajib ada (PATCH)');
  if (editPayloadBlock) {
    const hasAtType = /"@type"/.test(editPayloadBlock[1]);
    assert(!hasAtType, `editPayloadSpec (PATCH) TIDAK BOLEH mengirim "@type" — assertion gagal (ditemukan "@type")`);
  }
  /* ── 1d. add payload MEMUAT @type: fields.atType ── */
  const addAtType = /addPayloadSpec[\s\S]*?= \{[\s\S]*?"@type":"fields\.atType"/.exec(zod);
  assert(addAtType, `addPayloadSpec (POST) WAJIB memetakan "@type" <- fields.atType — tiada`);
  assert(!/editPayloadSpec: \{[\s\S]*?"@type"/.exec(zod), `addPayloadSpec "@type" bocor ke editPayloadSpec — FAIL`);

  /* ── EditForm: prefill retrieve + PATCH path {id}, payload dari editPayloadSpec (tanpa @type — di-assert 1c) ── */
  const prefill = /getPartyRevSharingAlgorithm\(id\)/.exec(editForm);
  assert(prefill, 'EditForm Wajib GET retrieve utk prefillFrom');
  const patch = /updatePartyRevSharingAlgorithm\(id, values\)/.exec(editForm);
  assert(patch, 'EditForm Wajib PATCH update(id, values)');
  assert(/payloadSpec=\{editPayloadSpec\}/.exec(editForm), 'EditForm Wajib memakai editPayloadSpec (PATCH tanpa @type) sbg payload');

  /* ── AddForm: POST create ── */
  assert(/createPartyRevSharingAlgorithm\(values\)/.exec(addForm), 'AddForm Wajib POST create(values)');

  /* ── 2. RUNTIME asserts pada builder (email/min/max/pattern — tmf736 tak punya email field,
         dibuktikan via fungsi EMBER yang nyata, bukan mirror) ── */
  const { zodFieldExpr } = await import(pathToFileURL(path.join(here, '..', 'src', 'fe', 'emit', 'form.mjs')).href);
  const emailExpr = zodFieldExpr({ type: 'email-input', required: true, zodRules: [{ rule: 'email' }] });
  assert(emailExpr.includes('.email()'), `builder email: zodFieldExpr email Wajib menghasilkan .email() — dapat "${emailExpr}"`);
  const numExpr = zodFieldExpr({ type: 'number-input', zodRules: [{ rule: 'min', value: 8 }, { rule: 'max', value: 10 }] });
  assert(numExpr.includes('.min(8,') && numExpr.includes('.max(10,'), `builder number min/max — dapat "${numExpr}"`);
  const repReq = zodFieldExpr({ type: 'repeatable-group', required: true, zodRules: [{ rule: 'minItems', value: 1, message: 'Wajib minimal 1' }], itemFields: [{ name: 'id', type: 'text-input', required: true }] });
  assert(repReq.includes('z.array(') && repReq.includes('.min(1,'), `builder repeatable minItems — dapat "${repReq}"`);
  const reqStr = zodFieldExpr({ type: 'text-input', required: true, zodRules: [{ rule: 'required', message: 'Wajib diisi' }] });
  assert(reqStr.includes('.min(1,') && reqStr.includes('.optional()') === false, `builder required string — dapat "${reqStr}"`);

  if (fails.length) {
    console.error(`fe-payload-check FAIL (${fails.length}):`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('fe-payload-check PASS:');
  console.log('  [text] zodSchemas.ts: name .min(1), policy z.array().min(1) [minItems], "Wajib diisi", name minLength 3');
  console.log('  [text] itemPayload nested: policyCondition.id<-item.policyConditionId, policyAction.id<-item.policyActionId, @referredType mapping');
  console.log('  [text] editPayloadSpec tanpa "@type" (PATCH partial); addPayloadSpec berisi "@type":fields.atType');
  console.log('  [text] EditForm: GET retrieve prefill + PATCH update(id); AddForm: POST create');
  console.log('  [runtime builder] email->.email(), number min/max, repeatable minItems->z.array().min(1), required->.min(1)');
}

main().catch((err) => {
  console.error('fe-payload-check crash:', err);
  process.exit(1);
});